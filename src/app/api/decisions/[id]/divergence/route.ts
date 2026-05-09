// 냉철 갭 분석 (06_PHASE2_PRD.md §5.5)
// GET: divergence_cache 캐시가 있으면 그대로, 없으면 LLM 호출 후 저장.
// POST { force: true }: 캐시 무시 후 재계산.
// 갭 산정은 클라이언트가 한 적이 있더라도 서버에서 다시 검증
// — recommendation_scores가 신뢰 원본.
import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/claude";
import {
  DIVERGENCE_TOOL_NAME,
  DIVERGENCE_TOOL_INPUT_SCHEMA,
  buildDivergenceSystemPrompt,
} from "@/lib/prompts/divergence";
import { sanitizeForAI, wrapUserContent } from "@/lib/sanitize";
import { sha256Hex } from "@/lib/hash";
import {
  DAILY_LIMIT_MESSAGE,
  isDailyLimitReached,
} from "@/lib/daily-limit";
import type { Database, DivergenceCache } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 30;

const GAP_THRESHOLD = 15;

interface DivergenceItemOut {
  option_id?: string;
  cause?: string;
  self_check?: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return computeOrFetch(id, false);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  return computeOrFetch(id, Boolean(body.force));
}

async function computeOrFetch(decisionId: string, force: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 결정 + 캐시 확인 + 권한 체크
  const { data: decision } = await supabase
    .from("decisions")
    .select("id, title, context, user_id, divergence_cache")
    .eq("id", decisionId)
    .maybeSingle();

  if (!decision)
    return NextResponse.json(
      { error: "결정을 찾을 수 없습니다." },
      { status: 404 },
    );
  // RLS가 막아주지만 명시적 가드.
  if (decision.user_id !== user.id)
    return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });

  if (!force && decision.divergence_cache) {
    return NextResponse.json({
      cache: decision.divergence_cache as DivergenceCache,
      fromCache: true,
    });
  }

  // 추천 점수 + 옵션 로드
  const [{ data: options }, { data: rec }, { data: tendency }] =
    await Promise.all([
      supabase
        .from("options")
        .select("id, name, description, ai_labels, position")
        .eq("decision_id", decisionId)
        .order("position", { ascending: true }),
      supabase
        .from("recommendation_scores")
        .select("option_id, mode, score, reasoning"),
      supabase
        .from("user_tendencies")
        .select(
          "risk_tolerance, time_orientation, change_openness, analytical_intuitive, self_others, decision_count",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const optionList = options ?? [];
  if (optionList.length < 2) {
    // 단일 옵션이면 갭 분석 의미 없음 — 빈 캐시 반환 (저장은 안 함).
    return NextResponse.json({
      cache: emptyCache("옵션이 1개라 갭 분석은 의미가 없어요."),
      fromCache: false,
    });
  }

  const optionIds = new Set(optionList.map((o) => o.id));
  const recForDecision = (rec ?? []).filter((r) => optionIds.has(r.option_id));

  // 모드별 점수/시그널 페어링
  const pairs = new Map<
    string,
    {
      logical?: number;
      emotional?: number;
      reasoningLogical?: unknown;
      reasoningEmotional?: unknown;
    }
  >();
  for (const o of optionList) pairs.set(o.id, {});
  for (const r of recForDecision) {
    const p = pairs.get(r.option_id);
    if (!p) continue;
    if (r.mode === "logical") {
      p.logical = r.score;
      p.reasoningLogical = r.reasoning;
    } else if (r.mode === "emotional") {
      p.emotional = r.score;
      p.reasoningEmotional = r.reasoning;
    }
  }

  // 갭 큰 옵션 + 1위 다름 검출
  let logicalTopId: string | null = null;
  let emotionalTopId: string | null = null;
  let logicalMax = -1;
  let emotionalMax = -1;
  const divergingIds: string[] = [];
  for (const o of optionList) {
    const p = pairs.get(o.id);
    if (!p) continue;
    if (p.logical != null && p.logical > logicalMax) {
      logicalMax = p.logical;
      logicalTopId = o.id;
    }
    if (p.emotional != null && p.emotional > emotionalMax) {
      emotionalMax = p.emotional;
      emotionalTopId = o.id;
    }
    if (
      p.logical != null &&
      p.emotional != null &&
      Math.abs(p.logical - p.emotional) > GAP_THRESHOLD
    ) {
      divergingIds.push(o.id);
    }
  }
  const rankDiffers =
    logicalTopId !== null &&
    emotionalTopId !== null &&
    logicalTopId !== emotionalTopId;

  if (rankDiffers && logicalTopId && !divergingIds.includes(logicalTopId))
    divergingIds.push(logicalTopId);
  if (rankDiffers && emotionalTopId && !divergingIds.includes(emotionalTopId))
    divergingIds.push(emotionalTopId);

  if (divergingIds.length === 0) {
    const empty = emptyCache(
      "객관 점수와 성향 반영 점수가 거의 같아요. 성향이 결과를 흔들지 않은 결정입니다.",
    );
    await supabase
      .from("decisions")
      .update({ divergence_cache: empty })
      .eq("id", decisionId);
    return NextResponse.json({ cache: empty, fromCache: false });
  }

  // 일 캡 (LLM 호출 1회)
  if (await isDailyLimitReached(supabase, user.id)) {
    return NextResponse.json({ error: DAILY_LIMIT_MESSAGE }, { status: 429 });
  }

  const safeOptions = optionList
    .filter((o) => divergingIds.includes(o.id))
    .map((o) => {
      const p = pairs.get(o.id) ?? {};
      return {
        id: o.id,
        name: sanitizeForAI(o.name),
        description: sanitizeForAI(o.description ?? ""),
        ai_labels: o.ai_labels ?? null,
        logical_score: p.logical ?? null,
        emotional_score: p.emotional ?? null,
        reasoning_logical: p.reasoningLogical ?? null,
        reasoning_emotional: p.reasoningEmotional ?? null,
      };
    });

  const inputHash = sha256Hex(
    JSON.stringify({
      diverging: safeOptions.map((o) => ({
        id: o.id,
        l: o.logical_score,
        e: o.emotional_score,
      })),
      tendency,
      decisionId,
    }) + "|divergence",
  );

  const userMessage = `다음 결정의 갭 큰 옵션들을 분석해주세요.\n\n${wrapUserContent(
    JSON.stringify(
      {
        decision: {
          title: sanitizeForAI(decision.title),
          context: sanitizeForAI(decision.context ?? ""),
        },
        user_tendency: tendency ?? {
          risk_tolerance: 0,
          time_orientation: 0,
          change_openness: 0,
          analytical_intuitive: 0,
          self_others: 0,
          decision_count: 0,
        },
        rank_differs: rankDiffers,
        logical_top_option_id: logicalTopId,
        emotional_top_option_id: emotionalTopId,
        diverging_options: safeOptions,
      },
      null,
      2,
    ),
  )}\n\n반드시 ${DIVERGENCE_TOOL_NAME} 도구를 호출하세요.`;

  let cacheOut: DivergenceCache;
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: buildDivergenceSystemPrompt(),
      tools: [
        {
          name: DIVERGENCE_TOOL_NAME,
          description: "갭 분석 결과를 제출합니다.",
          input_schema: DIVERGENCE_TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: DIVERGENCE_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    let summary = "";
    let items: DivergenceItemOut[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === DIVERGENCE_TOOL_NAME) {
        const input = block.input as {
          summary?: string;
          items?: DivergenceItemOut[];
        };
        summary = typeof input.summary === "string" ? input.summary : "";
        items = Array.isArray(input.items) ? input.items : [];
        break;
      }
    }

    const validIds = new Set(divergingIds);
    const cleanItems = items
      .filter(
        (it): it is Required<DivergenceItemOut> =>
          typeof it.option_id === "string" &&
          validIds.has(it.option_id) &&
          typeof it.cause === "string" &&
          typeof it.self_check === "string",
      )
      .map((it) => ({
        option_id: it.option_id,
        cause: it.cause.slice(0, 600),
        self_check: it.self_check.slice(0, 300),
      }));

    cacheOut = {
      summary: summary.slice(0, 400),
      items: cleanItems,
      diverging_option_ids: divergingIds,
      generated_at: new Date().toISOString(),
    };
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
      tone: "blunt",
      input_hash: inputHash,
      status: "error",
      error_message: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await supabase
    .from("decisions")
    .update({ divergence_cache: cacheOut })
    .eq("id", decisionId);

  await supabase.from("analysis_logs").insert({
    user_id: user.id,
    decision_id: decisionId,
    tone: "blunt",
    input_hash: inputHash,
    result_json: cacheOut as unknown as Record<string, unknown>,
    status: "success",
  });

  return NextResponse.json({ cache: cacheOut, fromCache: false });
}

function emptyCache(summary: string): DivergenceCache {
  return {
    summary,
    items: [],
    diverging_option_ids: [],
    generated_at: new Date().toISOString(),
  };
}
