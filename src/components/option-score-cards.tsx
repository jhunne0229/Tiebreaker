"use client";

// 옵션별 추천 점수 카드 (06_PHASE2_PRD.md §2.2)
// 결정 상세 화면에서 분석 탭 위에 가로 스택으로 표시.
// - 점수 0–100, tier 색상 (top/bottom/middle/close)
// - 신뢰도 라벨 (초기 설정 기반 / 학습 중 / 경향성 반영)
// - 박빙 뱃지
// - 상세 펼치기 (5개 시그널 raw)
import { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CONFIDENCE_LABELS,
  TIER_TONE,
} from "@/lib/recommendation/calculate";
import type { DecisionOption, RecommendationScore } from "@/types/domain";
import type { DecisionTone, ScoreMode } from "@/types/database";

interface Props {
  decisionId: string;
  options: DecisionOption[];
  initialScores: RecommendationScore[];
  tone: DecisionTone;
  onScoresChange?: (scores: RecommendationScore[]) => void;
}

export function OptionScoreCards({
  decisionId,
  options,
  initialScores,
  tone,
  onScoresChange,
}: Props) {
  const [scores, setScores] = useState<RecommendationScore[]>(initialScores);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggeredRef = useRef(false);

  function applyScores(next: RecommendationScore[]) {
    setScores(next);
    onScoresChange?.(next);
  }

  // 모드: 톤이 logical이면 logical, 그 외(emotional/blunt)는 emotional 표시
  // 냉철(blunt) 톤은 별도 갭 패널에서 다루지만 점수 카드는 emotional 기준 (PRD §4.1)
  const mode: ScoreMode = tone === "logical" ? "logical" : "emotional";

  const visible = scores.filter((s) => s.mode === mode);

  // 옵션 ID → score row
  const byOption = new Map(visible.map((s) => [s.option_id, s]));

  // 캐시 비어 있으면 1회 계산 트리거 (lazy)
  useEffect(() => {
    if (triggeredRef.current) return;
    if (options.length === 0) return;
    if (visible.length === options.length) return;
    triggeredRef.current = true;
    void runCompute(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCompute(force: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/recommendation`, {
        method: force ? "POST" : "GET",
        headers: force ? { "Content-Type": "application/json" } : undefined,
        body: force ? JSON.stringify({ force: true }) : undefined,
      });
      const j = (await res.json()) as {
        scores?: RecommendationScore[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "점수 계산에 실패했어요.");
      if (j.scores) applyScores(j.scores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "점수 계산에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">추천 점수</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            5개 시그널을 합산한 0–100 점수예요. {tone === "logical"
              ? "성향을 반영하지 않은 객관 점수입니다."
              : "성향이 반영된 점수입니다 (현재는 객관 점수와 동일 — 경향성 추적이 켜지면 분기됩니다)."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runCompute(true)}
          disabled={busy}
        >
          {busy ? (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {visible.length === 0 ? "점수 계산" : "다시 계산"}
        </Button>
      </div>

      {error && (
        <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {busy && visible.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            5개 시그널 합산 중…
          </span>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          아직 점수가 없어요. 위의 [점수 계산]을 눌러주세요.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((o) => {
            const row = byOption.get(o.id);
            if (!row) return null;
            return <OptionCard key={o.id} option={o} score={row} />;
          })}
        </div>
      )}
    </div>
  );
}

function OptionCard({
  option,
  score,
}: {
  option: DecisionOption;
  score: RecommendationScore;
}) {
  const [open, setOpen] = useState(false);
  const tone = TIER_TONE[score.tier];

  return (
    <div
      className={cn(
        "rounded-md border p-3 ring-1 ring-inset",
        tone.bg,
        tone.ring,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{option.name}</div>
          {option.description && (
            <div className="truncate text-[11px] text-muted-foreground">
              {option.description}
            </div>
          )}
        </div>
        <div className={cn("text-right", tone.color)}>
          <div className="text-2xl font-bold leading-none">{score.score}</div>
          <div className="text-[10px] font-medium uppercase tracking-wide">
            {tone.label}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="rounded-full bg-white/70 px-2 py-0.5">
          {CONFIDENCE_LABELS[score.confidence_label]}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-0.5 hover:text-foreground"
        >
          시그널
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open && score.reasoning && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          <SignalRow label="장단점" value={score.reasoning.pros_cons} />
          <SignalRow label="비교표" value={score.reasoning.comparison} />
          <SignalRow label="SWOT" value={score.reasoning.swot} />
          <SignalRow label="4분면" value={score.reasoning.cartesian} />
          <SignalRow label="미션 부합도" value={score.reasoning.drucker} />
        </ul>
      )}
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-mono text-foreground">{Math.round(value)}</span>
    </li>
  );
}
