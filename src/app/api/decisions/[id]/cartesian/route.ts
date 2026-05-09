// 데카르트 4분면 AI 생성 + CRUD (06_PHASE2_PRD.md §2.1.1, §5.1, §8 lazy throttle)
import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/claude";
import {
  CARTESIAN_TOOL_NAME,
  CARTESIAN_TOOL_INPUT_SCHEMA,
  buildCartesianSystemPrompt,
} from "@/lib/prompts/cartesian";
import { sanitizeForAI, wrapUserContent } from "@/lib/sanitize";
import { sha256Hex } from "@/lib/hash";
import {
  DAILY_LIMIT_MESSAGE,
  isDailyLimitReached,
} from "@/lib/daily-limit";
import type { CartesianQuadrant } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 30;

interface AiItem {
  quadrant?: string;
  keyword?: string;
  description?: string;
}

const VALID_QUADRANTS: CartesianQuadrant[] = ["Q1", "Q2", "Q3", "Q4"];

// AI 생성: 기존 항목이 0개일 때만 호출. force=true면 ai_generated rows 삭제 후 재생성.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    force?: boolean;
    keyword?: string;
    description?: string;
    quadrant?: string;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 결정 소유권 검증 (RLS 통과해도 명시적 체크)
  const { data: decision } = await supabase
    .from("decisions")
    .select("id, title, context, user_id")
    .eq("id", decisionId)
    .maybeSingle();
  if (!decision)
    return NextResponse.json(
      { error: "결정을 찾을 수 없습니다." },
      { status: 404 },
    );

  // 사용자 수동 추가 분기 (action: keyword/quadrant 제공된 경우)
  if (typeof body.keyword === "string" && body.quadrant) {
    if (!VALID_QUADRANTS.includes(body.quadrant as CartesianQuadrant)) {
      return NextResponse.json(
        { error: "잘못된 사분면입니다." },
        { status: 400 },
      );
    }
    const keyword = body.keyword.trim().slice(0, 30);
    if (!keyword)
      return NextResponse.json(
        { error: "키워드를 입력해주세요." },
        { status: 400 },
      );
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 200) || null
        : null;

    // 사분면당 5개 cap 검증
    const quadrant = body.quadrant as CartesianQuadrant;
    const { count } = await supabase
      .from("cartesian_items")
      .select("*", { count: "exact", head: true })
      .eq("decision_id", decisionId)
      .eq("quadrant", quadrant);
    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        { error: "한 사분면에 최대 5개까지만 추가할 수 있어요." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("cartesian_items")
      .insert({
        decision_id: decisionId,
        quadrant,
        keyword,
        description,
        ai_generated: false,
      })
      .select("*")
      .single();
    if (error || !data)
      return NextResponse.json(
        { error: "추가하지 못했어요." },
        { status: 500 },
      );
    return NextResponse.json({ item: data });
  }

  // AI 생성 분기
  const force = Boolean(body.force);

  const { data: existing } = await supabase
    .from("cartesian_items")
    .select("id, ai_generated")
    .eq("decision_id", decisionId);

  if ((existing?.length ?? 0) > 0 && !force) {
    return NextResponse.json({ ok: true, generated: false, reason: "exists" });
  }

  if (await isDailyLimitReached(supabase, user.id)) {
    return NextResponse.json({ error: DAILY_LIMIT_MESSAGE }, { status: 429 });
  }

  // force=true면 AI 생성 항목만 정리 (사용자 수동 항목은 보존)
  if (force) {
    await supabase
      .from("cartesian_items")
      .delete()
      .eq("decision_id", decisionId)
      .eq("ai_generated", true);
  }

  const safeTitle = sanitizeForAI(decision.title);
  const safeContext = sanitizeForAI(decision.context ?? "");

  const { data: options } = await supabase
    .from("options")
    .select("name, description")
    .eq("decision_id", decisionId)
    .order("position", { ascending: true });

  const safeOptions = (options ?? []).map((o) => ({
    name: sanitizeForAI(o.name),
    description: sanitizeForAI(o.description ?? ""),
  }));

  const userPayload = {
    decision: { title: safeTitle, context: safeContext },
    options: safeOptions,
  };

  const userMessage = `다음 결정을 데카르트 4분면으로 분석해주세요.\n\n${wrapUserContent(JSON.stringify(userPayload, null, 2))}\n\n반드시 ${CARTESIAN_TOOL_NAME} 도구를 호출해 결과를 제출하세요.`;

  const inputHash = sha256Hex(JSON.stringify(userPayload) + "|cartesian");

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: buildCartesianSystemPrompt(),
      tools: [
        {
          name: CARTESIAN_TOOL_NAME,
          description: "데카르트 4분면 키워드와 설명을 제출합니다.",
          input_schema: CARTESIAN_TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: CARTESIAN_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    let aiItems: AiItem[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === CARTESIAN_TOOL_NAME) {
        const input = block.input as { items?: unknown };
        aiItems = Array.isArray(input.items) ? (input.items as AiItem[]) : [];
        break;
      }
    }

    const allRows = aiItems
      .filter(
        (i): i is { quadrant: string; keyword: string; description?: string } =>
          typeof i.quadrant === "string" &&
          VALID_QUADRANTS.includes(i.quadrant as CartesianQuadrant) &&
          typeof i.keyword === "string" &&
          i.keyword.trim().length > 0,
      )
      .map((i) => ({
        decision_id: decisionId,
        quadrant: i.quadrant as CartesianQuadrant,
        keyword: i.keyword.trim().slice(0, 30),
        description:
          typeof i.description === "string"
            ? i.description.trim().slice(0, 200) || null
            : null,
        ai_generated: true,
      }));

    // PRD §2.1.1: 사분면당 최대 5개. AI가 더 만들어 보내면 앞에서 5개만 채택.
    const perQuadrant: Record<CartesianQuadrant, typeof allRows> = {
      Q1: [],
      Q2: [],
      Q3: [],
      Q4: [],
    };
    for (const r of allRows) {
      if (perQuadrant[r.quadrant].length < 5) perQuadrant[r.quadrant].push(r);
    }
    const rows = (Object.values(perQuadrant) as (typeof allRows)[]).flat();

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("cartesian_items")
        .insert(rows);
      if (insertError) {
        console.error("cartesian insert error", insertError);
      }
    }

    await supabase.from("analysis_logs").insert({
      user_id: user.id,
      decision_id: decisionId,
      tone: "logical",
      input_hash: inputHash,
      result_json: { items: rows } as unknown as Record<string, unknown>,
      status: "success",
    });

    return NextResponse.json({ ok: true, generated: true, count: rows.length });
  } catch (err: unknown) {
    let message = "AI 호출에 실패했어요.";
    if (err instanceof APIError) {
      if (err.status === 429)
        message = "AI 요청이 잠시 몰렸어요. 30초 뒤 다시 시도해주세요.";
      else if (err.status && err.status >= 500)
        message = "AI 서버에 문제가 있어요. 잠시 후 다시 시도해주세요.";
    } else if (err instanceof Error) {
      message = err.message;
    }
    await supabase.from("analysis_logs").insert({
      user_id: user.id,
      decision_id: decisionId,
      tone: "logical",
      input_hash: inputHash,
      status: "error",
      error_message: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    keyword?: string;
    description?: string | null;
  } | null;
  if (!body?.id)
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const update: { keyword?: string; description?: string | null } = {};
  if (typeof body.keyword === "string") {
    const k = body.keyword.trim().slice(0, 30);
    if (!k)
      return NextResponse.json(
        { error: "키워드를 입력해주세요." },
        { status: 400 },
      );
    update.keyword = k;
  }
  if (body.description !== undefined) {
    update.description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 200) || null
        : null;
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "변경 내용이 없어요." }, { status: 400 });

  const { error } = await supabase
    .from("cartesian_items")
    .update(update)
    .eq("id", body.id)
    .eq("decision_id", decisionId);
  if (error)
    return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const itemId = new URL(request.url).searchParams.get("item_id");
  if (!itemId)
    return NextResponse.json(
      { error: "item_id가 필요합니다." },
      { status: 400 },
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase
    .from("cartesian_items")
    .delete()
    .eq("id", itemId)
    .eq("decision_id", decisionId);
  if (error)
    return NextResponse.json({ error: "삭제하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
