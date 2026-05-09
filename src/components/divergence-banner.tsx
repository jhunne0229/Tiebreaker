"use client";

// 갭 배너 (06_PHASE2_PRD.md §2.2.0, §4.1)
// 감성 모드 화면에서 다음 중 하나라도 만족하면 옵션 카드 위에 배너:
//  - logical 1위 ≠ emotional 1위
//  - 어떤 옵션의 |logical_score − emotional_score| > 15
// 클릭 → tone을 blunt로 전환해 갭 분석 패널로 유도.
import { AlertCircle, ArrowRight } from "lucide-react";
import type { DecisionTone } from "@/types/database";
import type { DecisionOption, RecommendationScore } from "@/types/domain";

interface ScorePair {
  optionId: string;
  optionName: string;
  logical: number;
  emotional: number;
  gap: number;
}

export interface DivergenceSummary {
  pairs: ScorePair[]; // gap > 15 인 옵션들
  rankDiffers: boolean; // 1위 다름
  // 배너 강조 대상 (rank 1위 옵션이 다르면 emotional 1위 옵션, 아니면 gap 최대 옵션)
  highlight: ScorePair | null;
  logicalTopId: string | null;
  emotionalTopId: string | null;
}

const GAP_THRESHOLD = 15;

export function summarizeDivergence(
  options: DecisionOption[],
  scores: RecommendationScore[],
): DivergenceSummary {
  const map = new Map<
    string,
    { name: string; logical?: number; emotional?: number }
  >();
  for (const o of options) map.set(o.id, { name: o.name });
  for (const s of scores) {
    const m = map.get(s.option_id);
    if (!m) continue;
    if (s.mode === "logical") m.logical = s.score;
    else if (s.mode === "emotional") m.emotional = s.score;
  }

  const pairs: ScorePair[] = [];
  let logicalTopId: string | null = null;
  let emotionalTopId: string | null = null;
  let logicalMax = -1;
  let emotionalMax = -1;

  for (const [id, m] of map) {
    if (m.logical == null || m.emotional == null) continue;
    if (m.logical > logicalMax) {
      logicalMax = m.logical;
      logicalTopId = id;
    }
    if (m.emotional > emotionalMax) {
      emotionalMax = m.emotional;
      emotionalTopId = id;
    }
    const gap = Math.abs(m.logical - m.emotional);
    if (gap > GAP_THRESHOLD) {
      pairs.push({
        optionId: id,
        optionName: m.name,
        logical: m.logical,
        emotional: m.emotional,
        gap,
      });
    }
  }

  pairs.sort((a, b) => b.gap - a.gap);
  const rankDiffers =
    logicalTopId !== null &&
    emotionalTopId !== null &&
    logicalTopId !== emotionalTopId;

  let highlight: ScorePair | null = null;
  if (rankDiffers) {
    // 감성 1위 옵션의 logical/emotional 페어를 우선 강조 (없으면 logical 1위)
    const pickId = emotionalTopId ?? logicalTopId;
    highlight =
      pairs.find((p) => p.optionId === pickId) ??
      (pickId
        ? (() => {
            const m = map.get(pickId);
            if (!m || m.logical == null || m.emotional == null) return null;
            return {
              optionId: pickId,
              optionName: m.name,
              logical: m.logical,
              emotional: m.emotional,
              gap: Math.abs(m.logical - m.emotional),
            };
          })()
        : null);
  }
  if (!highlight && pairs.length > 0) highlight = pairs[0];

  return {
    pairs,
    rankDiffers,
    highlight,
    logicalTopId,
    emotionalTopId,
  };
}

export function DivergenceBanner({
  options,
  scores,
  tone,
  onShowBlunt,
}: {
  options: DecisionOption[];
  scores: RecommendationScore[];
  tone: DecisionTone;
  onShowBlunt: () => void;
}) {
  if (tone !== "emotional") return null;
  if (options.length < 2) return null;

  const summary = summarizeDivergence(options, scores);
  if (!summary.rankDiffers && summary.pairs.length === 0) return null;
  if (!summary.highlight) return null;

  const h = summary.highlight;
  const sentence = summary.rankDiffers
    ? `객관 1위와 성향 반영 1위 옵션이 달라요. ${h.optionName}은(는) 객관 ${h.logical}, 성향 반영 ${h.emotional}점.`
    : `${h.optionName}은(는) 객관 ${h.logical}, 성향 반영 ${h.emotional}점이에요.`;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm sm:p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-900">{sentence}</p>
          <p className="mt-0.5 text-xs text-amber-800">
            왜 차이 나는지 [냉철] 모드에서 짚어드릴게요.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowBlunt}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-amber-50 transition hover:bg-amber-800"
        >
          냉철로 보기
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
