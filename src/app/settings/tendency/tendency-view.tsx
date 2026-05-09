"use client";

// 결정 성향 시각화 (06_PHASE2_PRD.md §2.3.6)
// - 5축 SVG 레이더: 자가 평가값(점선) vs 현재값(채움)
// - 축별 한 줄 해석
// - 점수 반영 방식 토글
// - 자가 평가 다시 하기 링크
// - 만족 보정값 카드 (점수 산식과 별개, review_count 기반 신뢰도 표기)
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CONFIDENCE_LABELS,
  confidenceFromCount,
} from "@/lib/recommendation/calculate";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Tendency = Database["public"]["Tables"]["user_tendencies"]["Row"];

type AxisKey =
  | "risk_tolerance"
  | "time_orientation"
  | "change_openness"
  | "analytical_intuitive"
  | "self_others";

interface AxisDef {
  key: AxisKey;
  label: string;
  positive: string; // +1 쪽 한 단어
  negative: string; // -1 쪽 한 단어
  describe: (v: number) => string;
}

function magnitudeLabel(v: number): "neutral" | "slight" | "clear" | "strong" {
  const a = Math.abs(v);
  if (a < 0.15) return "neutral";
  if (a < 0.45) return "slight";
  if (a < 0.75) return "clear";
  return "strong";
}

function describe(
  v: number,
  pos: string,
  neg: string,
  centerCopy = "균형 잡힌 편이에요",
): string {
  const m = magnitudeLabel(v);
  if (m === "neutral") return centerCopy;
  const word = v > 0 ? pos : neg;
  if (m === "slight") return `약간 ${word} 편이에요`;
  if (m === "clear") return `뚜렷하게 ${word} 편이에요`;
  return `매우 ${word} 편이에요`;
}

const AXES: AxisDef[] = [
  {
    key: "risk_tolerance",
    label: "위험 감수도",
    positive: "도전적",
    negative: "안정 추구",
    describe: (v) =>
      describe(v, "도전을 즐기는", "안정을 우선하는", "도전과 안정 사이"),
  },
  {
    key: "time_orientation",
    label: "시간 지향성",
    positive: "장기",
    negative: "단기",
    describe: (v) =>
      describe(v, "장기 가치를 보는", "단기 보상을 챙기는", "단·장기 균형"),
  },
  {
    key: "change_openness",
    label: "변화 수용도",
    positive: "진취",
    negative: "보수",
    describe: (v) =>
      describe(v, "변화에 적극적인", "익숙한 길을 좋아하는", "변화에 중립적"),
  },
  {
    key: "analytical_intuitive",
    label: "분석 vs 직관",
    positive: "분석",
    negative: "직관",
    describe: (v) =>
      describe(v, "데이터·이유를 따지는", "직관·느낌을 따르는", "분석과 직관 균형"),
  },
  {
    key: "self_others",
    label: "자기 vs 타인",
    positive: "타인",
    negative: "자기",
    describe: (v) =>
      describe(
        v,
        "타인의 영향을 함께 보는",
        "자기 중심으로 판단하는",
        "자기·타인 균형",
      ),
  },
];

// -1~+1 → 0~1 (반지름 비율)
function toFraction(v: number): number {
  const clamped = Math.max(-1, Math.min(1, v));
  return (clamped + 1) / 2;
}

// 5각형 정점 좌표 (top부터 시계방향). cx/cy 중심, R=반지름.
function vertex(i: number, fraction: number, cx: number, cy: number, R: number) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  const r = R * fraction;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function polygonPoints(values: number[], cx: number, cy: number, R: number) {
  return values
    .map((v, i) => {
      const p = vertex(i, toFraction(v), cx, cy, R);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
}

function RadarChart({
  current,
  onboarding,
}: {
  current: number[];
  onboarding: number[] | null;
}) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const R = 100;
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto h-64 w-64 sm:h-72 sm:w-72"
      role="img"
      aria-label="결정 성향 레이더 차트"
    >
      {rings.map((f) => (
        <polygon
          key={f}
          points={polygonPoints([2 * f - 1, 2 * f - 1, 2 * f - 1, 2 * f - 1, 2 * f - 1], cx, cy, R)}
          fill="none"
          stroke="currentColor"
          strokeWidth={f === 0.5 ? 1 : 0.5}
          className="text-muted-foreground/30"
        />
      ))}
      {AXES.map((_, i) => {
        const p = vertex(i, 1, cx, cy, R);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-muted-foreground/30"
          />
        );
      })}

      {onboarding && (
        <polygon
          points={polygonPoints(onboarding, cx, cy, R)}
          className="fill-muted-foreground/10 stroke-muted-foreground/60"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
      <polygon
        points={polygonPoints(current, cx, cy, R)}
        className="fill-primary/20 stroke-primary"
        strokeWidth={1.5}
      />
      {AXES.map((a, i) => {
        const p = vertex(i, 1.18, cx, cy, R);
        return (
          <text
            key={a.key}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground text-[10px]"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

function SatisfactionBiasCard({ tendency }: { tendency: Tendency | null }) {
  const reviewCount = tendency?.review_count ?? 0;
  const bias = tendency?.satisfaction_bias ?? 2.5;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">만족 보정값</CardTitle>
      </CardHeader>
      <CardContent>
        {reviewCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 회고가 없어요. 결정 후 회고를 남기면 만족도 패턴이 쌓여요.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {bias.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">/ 5.00</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              회고 {reviewCount}건 평균 (EWMA). 점수 산식에는 반영되지 않고
              회고 추이를 참고할 때 보세요.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreImpactPanel({ tendency }: { tendency: Tendency | null }) {
  const [open, setOpen] = useState(false);
  const ai = tendency?.analytical_intuitive ?? 0;
  const so = tendency?.self_others ?? 0;
  const rt = tendency?.risk_tolerance ?? 0;

  const items: { label: string; detail: string }[] = [];
  if (ai > 0.15) {
    items.push({
      label: "비교표 가중치 ↑",
      detail: `분석형이라 비교표 영향력이 평소보다 커져요 (최대 0.40).`,
    });
  } else if (ai < -0.15) {
    items.push({
      label: "SWOT·4분면 가중치 ↑",
      detail: `직관형이라 SWOT·4분면을 더 비중 있게 봐요.`,
    });
  }
  if (so < -0.15) {
    items.push({
      label: "미션 부합도 가중치 ↑",
      detail: `자기 중심 성향이라 본인의 가치·미션 부합도를 더 봐요 (최대 0.15).`,
    });
  }
  if (rt > 0.15) {
    items.push({
      label: "장점·기회 가중 ×1.2까지",
      detail: `위험 감수형이라 장점/Strength·Opportunity를 더 비중 있게 봐요.`,
    });
  } else if (rt < -0.15) {
    items.push({
      label: "단점·위협 가중 ×1.2까지",
      detail: `위험 회피형이라 단점/Weakness·Threat를 더 비중 있게 봐요.`,
    });
  }
  if (items.length === 0) {
    items.push({
      label: "기본 가중치 유지",
      detail: "5개 축이 모두 중립이라 객관 모드와 같은 가중치로 계산돼요.",
    });
  }

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium hover:bg-muted/50"
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />이 분석이 점수에 어떻게
          반영되는지
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-2 border-t p-3 text-sm">
          <p className="text-xs text-muted-foreground">
            성향 반영(감성) 모드 점수에만 적용돼요. 객관(논리) 모드는 항상 기본
            가중치를 써요.
          </p>
          <ul className="space-y-1.5">
            {items.map((it) => (
              <li key={it.label} className="rounded-sm bg-background p-2">
                <div className="text-xs font-semibold">{it.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {it.detail}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TendencyView({ tendency }: { tendency: Tendency | null }) {
  const current = AXES.map((a) => tendency?.[a.key] ?? 0);
  const hasOnboarding = !!tendency?.onboarding_completed_at;
  const onboarding = hasOnboarding
    ? AXES.map((a) => {
        const v = tendency?.[`onboarding_${a.key}` as const];
        return typeof v === "number" ? v : 0;
      })
    : null;

  const decisionCount = tendency?.decision_count ?? 0;
  const confidence = confidenceFromCount(decisionCount);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-2">
          <CardTitle className="text-base">5축 레이더</CardTitle>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {CONFIDENCE_LABELS[confidence]} · 결정 {decisionCount}건
          </span>
        </CardHeader>
        <CardContent>
          <RadarChart current={current} onboarding={onboarding} />
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-primary/70" />
              현재 패턴
            </span>
            {hasOnboarding && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm border border-dashed border-muted-foreground/70" />
                초기 자가 평가
              </span>
            )}
          </div>

          <ul className="mt-5 space-y-2">
            {AXES.map((a, i) => {
              const v = current[i];
              return (
                <li
                  key={a.key}
                  className="flex items-baseline justify-between gap-3 rounded-sm border-b pb-2 last:border-b-0"
                >
                  <div>
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.describe(v)}
                    </div>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {v >= 0 ? "+" : ""}
                    {v.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5">
            <ScoreImpactPanel tendency={tendency} />
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              결정이 쌓일수록 자가 평가값이 실제 패턴으로 자연스럽게 보정돼요.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/onboarding/tendency?from=/settings/tendency">
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                자가 평가 다시 하기
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <SatisfactionBiasCard tendency={tendency} />
    </div>
  );
}
