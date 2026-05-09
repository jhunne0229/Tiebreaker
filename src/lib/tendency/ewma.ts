import "server-only";

// 사용자 경향성 EWMA 갱신 (06_PHASE2_PRD.md §2.3)
// α = 0.2, new = α × signal + (1 − α) × old
// 데이터가 없는 시그널은 해당 차원만 건너뛰고 다른 차원은 갱신.
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbClient = SupabaseClient<Database>;

const ALPHA = 0.2;

interface OptionLabels {
  risk_label?: "predictable" | "uncertain";
  change_label?: "status_quo" | "change";
  time_label?: "short" | "long";
}

interface UpdateOptions {
  /** 결정 신규 저장 → decision_count++ + 분석/직관, 자기/타인, (가능하면) risk/time/change */
  decisionInserted?: boolean;
  /** final_choice 변경 → 최종 옵션 라벨 기준 risk/time/change 보정 */
  finalChoiceChanged?: boolean;
  /** 회고 저장 → review_count++, satisfaction_bias EWMA */
  reviewInserted?: boolean;
  /** 회고 만족도 (1–5). reviewInserted=true일 때 사용 */
  reviewRating?: number;
}

const SELF_KEYWORDS = ["나", "내가", "스스로", "제가", "본인", "자신", "혼자"];
const OTHER_KEYWORDS = [
  "가족",
  "부모",
  "엄마",
  "아빠",
  "아버지",
  "어머니",
  "남편",
  "아내",
  "배우자",
  "자녀",
  "아이",
  "친구",
  "동료",
  "팀원",
  "상사",
  "후배",
  "선배",
  "고객",
  "사용자",
  "사람들",
  "타인",
  "다른 사람",
];

function ewma(prev: number, signal: number): number {
  const next = ALPHA * signal + (1 - ALPHA) * prev;
  return Math.max(-1, Math.min(1, Number(next.toFixed(4))));
}

function ewmaScale05(prev: number, signal: number): number {
  const next = ALPHA * signal + (1 - ALPHA) * prev;
  return Math.max(0, Math.min(5, Number(next.toFixed(4))));
}

function meanOrUndefined(arr: number[]): number | undefined {
  if (arr.length === 0) return undefined;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function selfOthersFromText(text: string): number | undefined {
  if (!text || text.trim().length === 0) return undefined;
  let self = 0;
  let other = 0;
  for (const k of SELF_KEYWORDS) {
    if (text.includes(k)) self += 1;
  }
  for (const k of OTHER_KEYWORDS) {
    if (text.includes(k)) other += 1;
  }
  if (self + other === 0) return undefined;
  // -1: 자기 / +1: 타인
  return (other - self) / (other + self);
}

interface DecisionSignalSources {
  finalOption?: { ai_labels: OptionLabels | null };
  allOptions: { ai_labels: OptionLabels | null }[];
  criteriaCount: number;
  prosConCount: number;
  contextText: string;
  druckerCustomerAnswer: string;
}

function riskSignal(src: DecisionSignalSources): number | undefined {
  const final = src.finalOption?.ai_labels?.risk_label;
  if (final) return final === "uncertain" ? 1 : -1;
  const vals = src.allOptions
    .map((o) => o.ai_labels?.risk_label)
    .filter((l): l is "predictable" | "uncertain" => Boolean(l))
    .map((l) => (l === "uncertain" ? 1 : -1));
  return meanOrUndefined(vals);
}

function timeSignal(src: DecisionSignalSources): number | undefined {
  const final = src.finalOption?.ai_labels?.time_label;
  if (final) return final === "long" ? 1 : -1;
  const vals = src.allOptions
    .map((o) => o.ai_labels?.time_label)
    .filter((l): l is "short" | "long" => Boolean(l))
    .map((l) => (l === "long" ? 1 : -1));
  return meanOrUndefined(vals);
}

function changeSignal(src: DecisionSignalSources): number | undefined {
  const final = src.finalOption?.ai_labels?.change_label;
  if (final) return final === "change" ? 1 : -1;
  const vals = src.allOptions
    .map((o) => o.ai_labels?.change_label)
    .filter((l): l is "status_quo" | "change" => Boolean(l))
    .map((l) => (l === "change" ? 1 : -1));
  return meanOrUndefined(vals);
}

function analyticalSignal(src: DecisionSignalSources): number | undefined {
  // Criteria 4개 이상 + 장단점 8개 이상이면 분석형(+1), 둘 다 적으면 직관(-1)
  // 단순 heuristic — 데이터 충분하지 않으면 skip
  if (src.criteriaCount === 0 && src.prosConCount === 0) return undefined;
  const c = src.criteriaCount / 5; // 5개 = 1.0
  const p = src.prosConCount / 12; // 12개 = 1.0
  const raw = c + p - 1; // 둘 다 평균이면 0, 충분히 많으면 +
  return Math.max(-1, Math.min(1, raw));
}

function selfOthersSignal(src: DecisionSignalSources): number | undefined {
  // 드러커 Q2 답변 우선, 없으면 결정 context.
  const fromDrucker = selfOthersFromText(src.druckerCustomerAnswer);
  if (fromDrucker !== undefined) return fromDrucker;
  return selfOthersFromText(src.contextText);
}

async function loadDecisionSources(
  supabase: DbClient,
  decisionId: string,
): Promise<DecisionSignalSources | null> {
  const [
    { data: decision },
    { data: options },
    { data: criteria },
    { data: prosCons },
    { data: drucker },
  ] = await Promise.all([
    supabase
      .from("decisions")
      .select("context, final_choice_id")
      .eq("id", decisionId)
      .maybeSingle(),
    supabase
      .from("options")
      .select("id, ai_labels")
      .eq("decision_id", decisionId),
    supabase.from("criteria").select("id").eq("decision_id", decisionId),
    supabase
      .from("pros_cons_items")
      .select("id")
      .eq("decision_id", decisionId),
    supabase
      .from("drucker_answers")
      .select("question, ai_draft, user_answer")
      .eq("decision_id", decisionId),
  ]);

  if (!decision) return null;

  const optionRows = (options ?? []).map((o) => ({
    id: o.id,
    ai_labels: (o.ai_labels ?? null) as OptionLabels | null,
  }));
  const finalOption = decision.final_choice_id
    ? optionRows.find((o) => o.id === decision.final_choice_id) ?? undefined
    : undefined;

  const customer = (drucker ?? []).find((d) => d.question === "customer");
  const druckerCustomerAnswer =
    customer?.user_answer ?? customer?.ai_draft ?? "";

  return {
    finalOption,
    allOptions: optionRows,
    criteriaCount: (criteria ?? []).length,
    prosConCount: (prosCons ?? []).length,
    contextText: decision.context ?? "",
    druckerCustomerAnswer,
  };
}

export async function applyTendencyUpdate(
  supabase: DbClient,
  userId: string,
  decisionId: string,
  opts: UpdateOptions,
): Promise<void> {
  const { data: row } = await supabase
    .from("user_tendencies")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) {
    console.warn("[ewma] user_tendencies row missing for", userId);
    return;
  }

  const update: Database["public"]["Tables"]["user_tendencies"]["Update"] = {};

  if (opts.decisionInserted || opts.finalChoiceChanged) {
    const src = await loadDecisionSources(supabase, decisionId);
    if (src) {
      const risk = riskSignal(src);
      if (risk !== undefined) {
        update.risk_tolerance = ewma(row.risk_tolerance, risk);
      }
      const time = timeSignal(src);
      if (time !== undefined) {
        update.time_orientation = ewma(row.time_orientation, time);
      }
      const change = changeSignal(src);
      if (change !== undefined) {
        update.change_openness = ewma(row.change_openness, change);
      }
      // 분석/직관, 자기/타인은 결정 신규 저장 시점에서만 시그널 신선도가 큼
      if (opts.decisionInserted) {
        const an = analyticalSignal(src);
        if (an !== undefined) {
          update.analytical_intuitive = ewma(row.analytical_intuitive, an);
        }
        const so = selfOthersSignal(src);
        if (so !== undefined) {
          update.self_others = ewma(row.self_others, so);
        }
      }
    }
    if (opts.decisionInserted) {
      update.decision_count = (row.decision_count ?? 0) + 1;
    }
  }

  if (opts.reviewInserted) {
    update.review_count = (row.review_count ?? 0) + 1;
    if (typeof opts.reviewRating === "number") {
      update.satisfaction_bias = ewmaScale05(
        row.satisfaction_bias,
        opts.reviewRating,
      );
    }
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("user_tendencies")
    .update(update)
    .eq("user_id", userId);

  if (error) {
    console.error("[ewma] user_tendencies update failed", error);
  }
}
