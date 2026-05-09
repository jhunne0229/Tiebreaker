// 추천 점수 5개 시그널 산식 (06_PHASE2_PRD.md §2.2)
// - 0–100 정규화 후 가중 합산
// - 데이터 0건 시그널은 50(중립)로 처리
// - tier (top/bottom/middle/close) — 박빙 룰: 최고점과 차이 ≤10인 옵션이 ≥2개일 때
// - confidence_label — UserTendency.decision_count 기준
import type {
  CartesianItem,
  Criteria,
  ProsConItem,
  Score,
  SwotItem,
} from "@/types/domain";
import type {
  ConfidenceLabel,
  ScoreMode,
  ScoreReasoning,
  ScoreTier,
} from "@/types/database";

// 기본 가중치 (논리 모드 / UserTendency 미반영). PRD §2.2.
export const BASE_WEIGHTS = {
  pros_cons: 0.35,
  comparison: 0.3,
  swot: 0.15,
  cartesian: 0.1,
  drucker: 0.1,
} as const;

export type SignalWeights = {
  pros_cons: number;
  comparison: number;
  swot: number;
  cartesian: number;
  drucker: number;
};

// PRD §2.2 emotional 모드 가중치 조정.
// - 분석적(analytical_intuitive>0) → 비교표 ↑ (최대 0.40)
// - 직관적(<0) → SWOT/4분면 ↑
// - 자기 지향(self_others<0) → 미션 부합도 ↑ (최대 0.15)
// - 위험 보정은 시그널 단계(calcProsCons/calcSwot)에서 처리.
export function adjustEmotionalWeights(tendency: {
  analytical_intuitive: number;
  self_others: number;
}): SignalWeights {
  let prosCons = BASE_WEIGHTS.pros_cons; // 0.35
  let comparison = BASE_WEIGHTS.comparison; // 0.30
  let swot = BASE_WEIGHTS.swot; // 0.15
  let cartesian = BASE_WEIGHTS.cartesian; // 0.10
  let drucker = BASE_WEIGHTS.drucker; // 0.10

  const analytical = Math.max(-1, Math.min(1, tendency.analytical_intuitive));
  if (analytical > 0) {
    comparison = 0.3 + 0.1 * analytical; // 0.30 ~ 0.40
  } else if (analytical < 0) {
    const t = -analytical;
    swot = 0.15 + 0.05 * t; // 0.15 ~ 0.20
    cartesian = 0.1 + 0.05 * t; // 0.10 ~ 0.15
  }

  const self = Math.max(-1, Math.min(1, tendency.self_others));
  if (self < 0) {
    drucker = 0.1 + 0.05 * -self; // 0.10 ~ 0.15
  }

  // 합 1.0으로 정규화
  const sum = prosCons + comparison + swot + cartesian + drucker;
  const k = 1 / sum;
  return {
    pros_cons: prosCons * k,
    comparison: comparison * k,
    swot: swot * k,
    cartesian: cartesian * k,
    drucker: drucker * k,
  };
}

const NEUTRAL = 50;

// 1) 장단점 균형 — pro/con 개수 비율 (강도 필드는 Phase 2 시점 미도입)
// riskTolerance: -1(위험 회피)~+1(위험 감수). 위험 회피일수록 단점에, 위험 감수일수록 장점에 ×1.2 가중.
// PRD §2.2 emotional 모드 가중치 조정.
export function calcProsConsSignal(
  optionId: string,
  prosCons: ProsConItem[],
  riskTolerance = 0,
): number {
  const own = prosCons.filter(
    (p) => p.option_id === optionId || p.option_id === null,
  );
  const pros = own.filter((p) => p.kind === "pro").length;
  const cons = own.filter((p) => p.kind === "con").length;
  if (pros + cons === 0) return NEUTRAL;

  const t = Math.max(-1, Math.min(1, riskTolerance));
  // 강도: |t| 만큼 1 → 1.2 로 lerp
  const proW = t > 0 ? 1 + 0.2 * t : 1;
  const conW = t < 0 ? 1 + 0.2 * -t : 1;
  const wPros = pros * proW;
  const wCons = cons * conW;
  return (wPros / (wPros + wCons)) * 100;
}

// 2) 비교표 가중 점수 — 옵션 간 min-max 정규화
export function calcComparisonSignals(
  optionIds: string[],
  criteria: Pick<Criteria, "id" | "weight">[],
  scores: Pick<Score, "option_id" | "criteria_id" | "value">[],
): Record<string, number> {
  const result: Record<string, number> = {};
  if (optionIds.length === 0 || criteria.length === 0) {
    optionIds.forEach((id) => (result[id] = NEUTRAL));
    return result;
  }

  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) {
    optionIds.forEach((id) => (result[id] = NEUTRAL));
    return result;
  }

  const weighted: Record<string, number> = {};
  for (const id of optionIds) {
    let sum = 0;
    for (const c of criteria) {
      const s = scores.find((x) => x.option_id === id && x.criteria_id === c.id);
      sum += (s?.value ?? 0) * c.weight;
    }
    weighted[id] = sum / totalWeight; // 0-10 (스코어가 1-10이라 가정)
  }

  const values = Object.values(weighted);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) {
    optionIds.forEach((id) => (result[id] = NEUTRAL));
    return result;
  }
  for (const id of optionIds) {
    result[id] = ((weighted[id] - min) / (max - min)) * 100;
  }
  return result;
}

// 3) SWOT 균형 — (S+O)/(S+W+O+T) — 위험 회피일수록 W/T ×1.2, 위험 감수일수록 S/O ×1.2
export function calcSwotSignal(
  optionId: string,
  swot: SwotItem[],
  riskTolerance = 0,
): number {
  const own = swot.filter(
    (s) => s.option_id === optionId || s.option_id === null,
  );
  if (own.length === 0) return NEUTRAL;
  const s = own.filter((q) => q.quadrant === "S").length;
  const o = own.filter((q) => q.quadrant === "O").length;
  const w = own.filter((q) => q.quadrant === "W").length;
  const t = own.filter((q) => q.quadrant === "T").length;

  const r = Math.max(-1, Math.min(1, riskTolerance));
  const posW = r > 0 ? 1 + 0.2 * r : 1;
  const negW = r < 0 ? 1 + 0.2 * -r : 1;
  const pos = (s + o) * posW;
  const neg = (w + t) * negW;
  if (pos + neg === 0) return NEUTRAL;
  return (pos / (pos + neg)) * 100;
}

// 4) 데카르트 4분면 부호 — (Q1+Q3)/(Q1+Q2+Q3+Q4) — 결정 단위(option_id 무관)
export function calcCartesianSignal(cartesian: CartesianItem[]): number {
  if (cartesian.length === 0) return NEUTRAL;
  const positive = cartesian.filter(
    (c) => c.quadrant === "Q1" || c.quadrant === "Q3",
  ).length;
  return (positive / cartesian.length) * 100;
}

// 5) 미션 부합도 — 외부에서 LLM이 산정한 0-100 값을 받음. 미션 답변 없으면 50.

// 가중합 → 0-100 정수
export function weightedScore(
  signals: ScoreReasoning,
  weights: SignalWeights = BASE_WEIGHTS,
): number {
  const raw =
    signals.pros_cons * weights.pros_cons +
    signals.comparison * weights.comparison +
    signals.swot * weights.swot +
    signals.cartesian * weights.cartesian +
    signals.drucker * weights.drucker;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// tier 판정 (옵션 N개 모두의 score를 받아서 각자에 부여)
export function assignTiers(
  scoresByOption: Record<string, number>,
): Record<string, ScoreTier> {
  const ids = Object.keys(scoresByOption);
  const result: Record<string, ScoreTier> = {};

  if (ids.length === 0) return result;
  if (ids.length === 1) {
    result[ids[0]] = "middle";
    return result;
  }

  const values = ids.map((id) => scoresByOption[id]);
  const max = Math.max(...values);
  const min = Math.min(...values);

  // 박빙 룰: 최고점 차이 ≤10인 옵션이 ≥2개
  const closeIds = ids.filter((id) => max - scoresByOption[id] <= 10);
  if (closeIds.length >= 2 && max !== min) {
    for (const id of ids) {
      if (closeIds.includes(id)) result[id] = "close";
      else if (scoresByOption[id] === min) result[id] = "bottom";
      else result[id] = "middle";
    }
    return result;
  }

  // 단일 1위가 명확
  for (const id of ids) {
    if (scoresByOption[id] === max) result[id] = "top";
    else if (scoresByOption[id] === min) result[id] = "bottom";
    else result[id] = "middle";
  }
  return result;
}

// 신뢰도 라벨 (PRD §2.3.5)
export function confidenceFromCount(count: number): ConfidenceLabel {
  if (count < 5) return "onboarding";
  if (count < 15) return "learning";
  return "personalized";
}

export const CONFIDENCE_LABELS: Record<ConfidenceLabel, string> = {
  onboarding: "초기 설정 기반",
  learning: "학습 중",
  personalized: "경향성 반영",
};

export const TIER_TONE: Record<
  ScoreTier,
  { color: string; bg: string; ring: string; label: string }
> = {
  top: {
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    ring: "ring-emerald-300",
    label: "최고점",
  },
  bottom: {
    color: "text-rose-700",
    bg: "bg-rose-50",
    ring: "ring-rose-300",
    label: "최저점",
  },
  middle: {
    color: "text-neutral-700",
    bg: "bg-neutral-50",
    ring: "ring-neutral-300",
    label: "중간",
  },
  close: {
    color: "text-amber-700",
    bg: "bg-amber-50",
    ring: "ring-amber-300",
    label: "박빙",
  },
};

// 모드 라벨
export const MODE_LABELS: Record<ScoreMode, string> = {
  logical: "객관 (논리)",
  emotional: "성향 반영 (감성)",
};
