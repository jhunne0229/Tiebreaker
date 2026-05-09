// 추천 점수 계산 + 캐시 (06_PHASE2_PRD.md §2.2, §5.4, §8 lazy throttle)
// GET: 옵션별 RecommendationScore 캐시 반환. 캐시 비어있으면 계산 후 upsert.
// POST { force: true } : 캐시 무시 후 양 모드 재계산.
import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/claude";
import {
  MISSION_FIT_TOOL_NAME,
  MISSION_FIT_TOOL_INPUT_SCHEMA,
  buildMissionFitSystemPrompt,
} from "@/lib/prompts/mission-fit";
import { sanitizeForAI, wrapUserContent } from "@/lib/sanitize";
import { sha256Hex } from "@/lib/hash";
import {
  DAILY_LIMIT_MESSAGE,
  isDailyLimitReached,
} from "@/lib/daily-limit";
import {
  BASE_WEIGHTS,
  adjustEmotionalWeights,
  assignTiers,
  calcCartesianSignal,
  calcComparisonSignals,
  calcProsConsSignal,
  calcSwotSignal,
  confidenceFromCount,
  weightedScore,
} from "@/lib/recommendation/calculate";
import type { Database, ScoreMode, ScoreReasoning } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface MissionFitItem {
  option_id?: string;
  score?: number;
  rationale?: string;
}

type DbClient = SupabaseClient<Database>;

async function fetchAll(supabase: DbClient, decisionId: string) {
  const [
    { data: decision },
    { data: options },
    { data: criteria },
    { data: scores },
    { data: prosCons },
    { data: swot },
    { data: cartesian },
    { data: drucker },
  ] = await Promise.all([
    supabase
      .from("decisions")
      .select("id, title, context, user_id, tone")
      .eq("id", decisionId)
      .maybeSingle(),
    supabase
      .from("options")
      .select("id, name, description, position")
      .eq("decision_id", decisionId)
      .order("position", { ascending: true }),
    supabase
      .from("criteria")
      .select("id, name, weight, position")
      .eq("decision_id", decisionId),
    supabase.from("scores").select("*"),
    supabase
      .from("pros_cons_items")
      .select("*")
      .eq("decision_id", decisionId),
    supabase.from("swot_items").select("*").eq("decision_id", decisionId),
    supabase
      .from("cartesian_items")
      .select("*")
      .eq("decision_id", decisionId),
    supabase
      .from("drucker_answers")
      .select("question, ai_draft, user_answer")
      .eq("decision_id", decisionId),
  ]);
  // pros_cons / swot은 톤별로 누적되므로 현재 톤의 항목만 사용 (사용자 추가분은 보존)
  const currentTone = decision?.tone ?? null;
  const filteredProsCons = (prosCons ?? []).filter(
    (p) => !p.ai_generated || p.tone === currentTone,
  );
  const filteredSwot = (swot ?? []).filter(
    (s) => !s.ai_generated || s.tone === currentTone,
  );

  return {
    decision,
    options,
    criteria,
    scores,
    prosCons: filteredProsCons,
    swot: filteredSwot,
    cartesian,
    drucker,
  };
}

async function callMissionFit(
  decisionTitle: string,
  decisionContext: string,
  options: { id: string; name: string; description: string | null }[],
  drucker: {
    question: string;
    ai_draft: string | null;
    user_answer: string | null;
  }[],
): Promise<Record<string, number>> {
  // 미션 관련 답변(미션 / 고객 / 고객가치)만 추림. user_answer 우선, 없으면 ai_draft.
  const missionKeys = new Set(["mission", "customer", "customer_value"]);
  const missionPayload = drucker
    .filter((d) => missionKeys.has(d.question))
    .map((d) => ({
      question: d.question,
      answer: sanitizeForAI(d.user_answer ?? d.ai_draft ?? ""),
    }))
    .filter((d) => d.answer.length > 0);

  const result: Record<string, number> = {};
  for (const o of options) result[o.id] = 50;

  // 미션 답변이 비어있으면 LLM 호출 자체 스킵
  if (missionPayload.length === 0) return result;

  const safeOptions = options.map((o) => ({
    id: o.id,
    name: sanitizeForAI(o.name),
    description: sanitizeForAI(o.description ?? ""),
  }));

  const userMessage = `다음 결정의 미션 부합도를 옵션별로 평가해주세요.\n\n${wrapUserContent(
    JSON.stringify(
      {
        decision: {
          title: sanitizeForAI(decisionTitle),
          context: sanitizeForAI(decisionContext),
        },
        mission_answers: missionPayload,
        options: safeOptions,
      },
      null,
      2,
    ),
  )}\n\n반드시 ${MISSION_FIT_TOOL_NAME} 도구를 호출해 모든 옵션에 점수를 매기세요.`;

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: buildMissionFitSystemPrompt(),
    tools: [
      {
        name: MISSION_FIT_TOOL_NAME,
        description: "옵션별 미션 부합도 점수를 제출합니다.",
        input_schema: MISSION_FIT_TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: MISSION_FIT_TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  });

  let items: MissionFitItem[] = [];
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === MISSION_FIT_TOOL_NAME) {
      const input = block.input as { scores?: unknown };
      items = Array.isArray(input.scores)
        ? (input.scores as MissionFitItem[])
        : [];
      break;
    }
  }

  const validIds = new Set(options.map((o) => o.id));
  for (const it of items) {
    if (
      typeof it.option_id === "string" &&
      typeof it.score === "number" &&
      validIds.has(it.option_id)
    ) {
      result[it.option_id] = Math.max(0, Math.min(100, Math.round(it.score)));
    }
  }
  return result;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  return computeOrFetch(decisionId, false);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  return computeOrFetch(decisionId, Boolean(body.force));
}

async function computeOrFetch(decisionId: string, force: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const {
    decision,
    options,
    criteria,
    scores,
    prosCons,
    swot,
    cartesian,
    drucker,
  } = await fetchAll(supabase, decisionId);

  if (!decision)
    return NextResponse.json(
      { error: "결정을 찾을 수 없습니다." },
      { status: 404 },
    );

  const optionList = options ?? [];
  if (optionList.length === 0) {
    return NextResponse.json({ scores: [], fromCache: false });
  }

  const optionIds = optionList.map((o) => o.id);

  // 캐시 확인
  if (!force) {
    const { data: cached } = await supabase
      .from("recommendation_scores")
      .select("*")
      .in("option_id", optionIds);
    const counts = new Map<ScoreMode, number>();
    for (const row of cached ?? []) {
      counts.set(row.mode, (counts.get(row.mode) ?? 0) + 1);
    }
    if (
      (counts.get("logical") ?? 0) === optionIds.length &&
      (counts.get("emotional") ?? 0) === optionIds.length
    ) {
      return NextResponse.json({ scores: cached, fromCache: true });
    }
  }

  // 일 캡 (LLM 호출 1회)
  if (await isDailyLimitReached(supabase, user.id)) {
    return NextResponse.json({ error: DAILY_LIMIT_MESSAGE }, { status: 429 });
  }

  // 신뢰도 라벨 + 감성 모드 가중치 조정용 경향성 로드
  const { data: tendency } = await supabase
    .from("user_tendencies")
    .select(
      "decision_count, risk_tolerance, analytical_intuitive, self_others",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  const confidence = confidenceFromCount(tendency?.decision_count ?? 0);
  const emotionalWeights = adjustEmotionalWeights({
    analytical_intuitive: tendency?.analytical_intuitive ?? 0,
    self_others: tendency?.self_others ?? 0,
  });
  const riskTolerance = tendency?.risk_tolerance ?? 0;

  const optionScoresRecords = (scores ?? []).filter((s) =>
    optionIds.includes(s.option_id),
  );

  const comparisonByOption = calcComparisonSignals(
    optionIds,
    criteria ?? [],
    optionScoresRecords,
  );
  const cartesianSignal = calcCartesianSignal(cartesian ?? []);

  const inputHash = sha256Hex(
    JSON.stringify({
      title: decision.title,
      context: decision.context,
      options: optionList.map((o) => ({ id: o.id, name: o.name })),
      drucker: (drucker ?? []).map((d) => ({
        q: d.question,
        a: d.user_answer ?? d.ai_draft ?? "",
      })),
    }) + "|mission-fit",
  );

  let missionByOption: Record<string, number> = {};
  try {
    missionByOption = await callMissionFit(
      decision.title,
      decision.context ?? "",
      optionList,
      drucker ?? [],
    );
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

  // 모드별 시그널/점수 분리 산정.
  // - logical: 위험 보정 없음, BASE_WEIGHTS.
  // - emotional: 위험 보정(prosCons/swot 시그널 단계) + 가중치 재배분(weightedScore).
  const reasoningLogicalByOption: Record<string, ScoreReasoning> = {};
  const reasoningEmotionalByOption: Record<string, ScoreReasoning> = {};
  for (const o of optionList) {
    reasoningLogicalByOption[o.id] = {
      pros_cons: calcProsConsSignal(o.id, prosCons ?? [], 0),
      comparison: comparisonByOption[o.id] ?? 50,
      swot: calcSwotSignal(o.id, swot ?? [], 0),
      cartesian: cartesianSignal,
      drucker: missionByOption[o.id] ?? 50,
    };
    reasoningEmotionalByOption[o.id] = {
      pros_cons: calcProsConsSignal(o.id, prosCons ?? [], riskTolerance),
      comparison: comparisonByOption[o.id] ?? 50,
      swot: calcSwotSignal(o.id, swot ?? [], riskTolerance),
      cartesian: cartesianSignal,
      drucker: missionByOption[o.id] ?? 50,
    };
  }

  const logicalScoresByOption: Record<string, number> = {};
  const emotionalScoresByOption: Record<string, number> = {};
  for (const o of optionList) {
    logicalScoresByOption[o.id] = weightedScore(
      reasoningLogicalByOption[o.id],
      BASE_WEIGHTS,
    );
    emotionalScoresByOption[o.id] = weightedScore(
      reasoningEmotionalByOption[o.id],
      emotionalWeights,
    );
  }
  const logicalTiers = assignTiers(logicalScoresByOption);
  const emotionalTiers = assignTiers(emotionalScoresByOption);

  const rows: Database["public"]["Tables"]["recommendation_scores"]["Insert"][] =
    [];
  for (const o of optionList) {
    rows.push({
      option_id: o.id,
      mode: "logical",
      score: logicalScoresByOption[o.id],
      tier: logicalTiers[o.id],
      reasoning: reasoningLogicalByOption[o.id],
      confidence_label: confidence,
      computed_at: new Date().toISOString(),
    });
    rows.push({
      option_id: o.id,
      mode: "emotional",
      score: emotionalScoresByOption[o.id],
      tier: emotionalTiers[o.id],
      reasoning: reasoningEmotionalByOption[o.id],
      confidence_label: confidence,
      computed_at: new Date().toISOString(),
    });
  }

  if (force) {
    await supabase
      .from("recommendation_scores")
      .delete()
      .in("option_id", optionIds);
  }

  // 점수 재계산 시 divergence_cache 무효화 (PRD §3.2: RecommendationScore가 invalidate되면 같이 invalidate)
  await supabase
    .from("decisions")
    .update({ divergence_cache: null })
    .eq("id", decisionId);

  const { error: upsertError, data: inserted } = await supabase
    .from("recommendation_scores")
    .upsert(rows, { onConflict: "option_id,mode" })
    .select("*");

  if (upsertError) {
    console.error("recommendation_scores upsert error", upsertError);
    return NextResponse.json(
      { error: "점수 저장에 실패했어요." },
      { status: 500 },
    );
  }

  await supabase.from("analysis_logs").insert({
    user_id: user.id,
    decision_id: decisionId,
    tone: "logical",
    input_hash: inputHash,
    result_json: { scores: rows } as unknown as Record<string, unknown>,
    status: "success",
  });

  return NextResponse.json({ scores: inserted ?? rows, fromCache: false });
}
