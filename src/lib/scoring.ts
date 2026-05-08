import type { Criteria, DecisionOption, Score } from "@/types/domain";

// 가중 합산: 옵션의 최종 점수 = Σ (Score.value × Criteria.weight)
export function calculateOptionTotal(
  optionId: string,
  criteria: Criteria[],
  scores: Score[],
): { total: number; max: number; percent: number } {
  if (criteria.length === 0) return { total: 0, max: 0, percent: 0 };

  let total = 0;
  let max = 0;

  for (const c of criteria) {
    max += c.weight * 10;
    const s = scores.find(
      (s) => s.option_id === optionId && s.criteria_id === c.id,
    );
    if (s) total += s.value * c.weight;
  }

  return {
    total,
    max,
    percent: max === 0 ? 0 : Math.round((total / max) * 100),
  };
}

export function rankOptions(
  options: DecisionOption[],
  criteria: Criteria[],
  scores: Score[],
): Array<{ option: DecisionOption; total: number; max: number; percent: number }> {
  return options
    .map((option) => ({
      option,
      ...calculateOptionTotal(option.id, criteria, scores),
    }))
    .sort((a, b) => b.total - a.total);
}
