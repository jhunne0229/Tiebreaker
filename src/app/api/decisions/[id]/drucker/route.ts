// 피터 드러커 5질문 AI 초안 생성 + 답변 저장 (06_PHASE2_PRD.md §2.1.2, §5.2, §8 lazy throttle)
import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/claude";
import {
  DRUCKER_TOOL_NAME,
  DRUCKER_TOOL_INPUT_SCHEMA,
  DRUCKER_QUESTIONS,
  buildDruckerSystemPrompt,
} from "@/lib/prompts/drucker";
import { sanitizeForAI, wrapUserContent } from "@/lib/sanitize";
import { sha256Hex } from "@/lib/hash";
import {
  DAILY_LIMIT_MESSAGE,
  isDailyLimitReached,
} from "@/lib/daily-limit";
import type { DruckerQuestion } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 30;

interface AiDraft {
  question?: string;
  draft?: string;
}

const VALID_QUESTIONS = new Set<DruckerQuestion>(
  DRUCKER_QUESTIONS.map((q) => q.key),
);

// AI 초안 생성: 어떤 질문에도 ai_draft가 비어있을 때만 호출. force=true면 모든 ai_draft 갱신.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

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

  const force = Boolean(body.force);

  const { data: existing } = await supabase
    .from("drucker_answers")
    .select("question, ai_draft")
    .eq("decision_id", decisionId);

  const hasAnyDraft = (existing ?? []).some((r) => r.ai_draft);
  if (hasAnyDraft && !force) {
    return NextResponse.json({ ok: true, generated: false, reason: "exists" });
  }

  if (await isDailyLimitReached(supabase, user.id)) {
    return NextResponse.json({ error: DAILY_LIMIT_MESSAGE }, { status: 429 });
  }

  const safeTitle = sanitizeForAI(decision.title);
  const safeContext = sanitizeForAI(decision.context ?? "");
  const userPayload = { decision: { title: safeTitle, context: safeContext } };
  const userMessage = `다음 결정에 대해 드러커 5질문 초안을 작성해주세요.\n\n${wrapUserContent(JSON.stringify(userPayload, null, 2))}\n\n반드시 ${DRUCKER_TOOL_NAME} 도구를 호출해 결과를 제출하세요.`;
  const inputHash = sha256Hex(JSON.stringify(userPayload) + "|drucker");

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: buildDruckerSystemPrompt(),
      tools: [
        {
          name: DRUCKER_TOOL_NAME,
          description: "드러커 5질문 초안을 제출합니다.",
          input_schema: DRUCKER_TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: DRUCKER_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    let aiDrafts: AiDraft[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === DRUCKER_TOOL_NAME) {
        const input = block.input as { drafts?: unknown };
        aiDrafts = Array.isArray(input.drafts) ? (input.drafts as AiDraft[]) : [];
        break;
      }
    }

    if (aiDrafts.length === 0) {
      console.error(
        "drucker: empty drafts (stop_reason=%s)",
        response.stop_reason,
      );
    }

    // upsert ai_draft (UNIQUE(decision_id, question))
    const rows = aiDrafts
      .filter(
        (d): d is { question: string; draft: string } =>
          typeof d.question === "string" &&
          VALID_QUESTIONS.has(d.question as DruckerQuestion) &&
          typeof d.draft === "string" &&
          d.draft.trim().length > 0,
      )
      .map((d) => ({
        decision_id: decisionId,
        question: d.question as DruckerQuestion,
        ai_draft: d.draft.trim().slice(0, 500),
      }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("drucker_answers")
        .upsert(rows, { onConflict: "decision_id,question" });
      if (upsertError) console.error("drucker upsert error", upsertError);
    }

    await supabase.from("analysis_logs").insert({
      user_id: user.id,
      decision_id: decisionId,
      tone: "logical",
      input_hash: inputHash,
      result_json: { drafts: rows } as unknown as Record<string, unknown>,
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

// 사용자 답변 저장 (UPSERT)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as {
    question?: string;
    user_answer?: string | null;
  } | null;

  if (!body?.question || !VALID_QUESTIONS.has(body.question as DruckerQuestion)) {
    return NextResponse.json(
      { error: "질문 종류가 잘못되었어요." },
      { status: 400 },
    );
  }

  const userAnswer =
    typeof body.user_answer === "string"
      ? body.user_answer.trim().slice(0, 2000) || null
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 결정 소유권 확인 (RLS도 막지만 명시적으로 한 번 더)
  const { data: decision } = await supabase
    .from("decisions")
    .select("id")
    .eq("id", decisionId)
    .maybeSingle();
  if (!decision)
    return NextResponse.json(
      { error: "결정을 찾을 수 없습니다." },
      { status: 404 },
    );

  const { error } = await supabase
    .from("drucker_answers")
    .upsert(
      {
        decision_id: decisionId,
        question: body.question as DruckerQuestion,
        user_answer: userAnswer,
      },
      { onConflict: "decision_id,question" },
    );
  if (error)
    return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
