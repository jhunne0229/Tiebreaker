"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToneSelector } from "@/components/tone-selector";
import { ProsConsList } from "@/components/pros-cons-list";
import { ComparisonTable } from "@/components/comparison-table";
import { SwotGrid } from "@/components/swot-grid";
import { CartesianQuadrants } from "@/components/cartesian-quadrants";
import { DruckerQuestionsForm } from "@/components/drucker-questions";
import { OptionScoreCards } from "@/components/option-score-cards";
import { DivergenceBanner } from "@/components/divergence-banner";
import { DivergencePanel } from "@/components/divergence-panel";
import { FinalDecision } from "@/components/final-decision";
import { ReviewSection } from "@/components/review-section";
import type {
  CartesianItem,
  Criteria,
  Decision,
  DecisionOption,
  DruckerAnswer,
  ProsConItem,
  RecommendationScore,
  Review,
  Score,
  SwotItem,
} from "@/types/domain";
import type { DecisionTone } from "@/types/database";

interface Props {
  decision: Decision;
  options: DecisionOption[];
  criteria: Criteria[];
  scores: Score[];
  prosCons: ProsConItem[];
  swot: SwotItem[];
  cartesian: CartesianItem[];
  drucker: DruckerAnswer[];
  recommendationScores: RecommendationScore[];
  reviews: Review[];
}

type Status =
  | { kind: "idle" }
  | { kind: "streaming"; partialChars: number; cached: boolean }
  | { kind: "error"; message: string };

export function DecisionView(initial: Props) {
  const router = useRouter();
  const [tone, setTone] = useState<DecisionTone>(initial.decision.tone);
  const [criteria, setCriteria] = useState(initial.criteria);
  const [scores, setScores] = useState(initial.scores);
  const [recommendationScores, setRecommendationScores] = useState(
    initial.recommendationScores,
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const [_, startTransition] = useTransition();

  // 톤별로 누적 저장된 분석 중 현재 선택된 톤 항목만 표시
  const visibleProsCons = initial.prosCons.filter((p) => p.tone === tone);
  const visibleSwot = initial.swot.filter((s) => s.tone === tone);

  const hasAnyAnalysisForTone =
    visibleProsCons.length > 0 ||
    visibleSwot.length > 0 ||
    initial.criteria.length > 0;

  async function runAnalyze(forceRefresh = false) {
    if (status.kind === "streaming") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "streaming", partialChars: 0, cached: false });

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision_id: initial.decision.id,
          tone,
          force_refresh: forceRefresh,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "분석 요청이 거부되었습니다.");
      }
      if (!res.body) throw new Error("스트림 응답을 받지 못했습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let totalPartial = 0;
      let cached = false;
      let succeeded = false;

      const handleEvent = (event: string, dataRaw: string) => {
        if (!event) return;
        let data: { json?: string; cached?: boolean; message?: string } = {};
        try {
          data = JSON.parse(dataRaw);
        } catch {
          return;
        }
        if (event === "start") {
          cached = Boolean(data.cached);
          setStatus({ kind: "streaming", partialChars: 0, cached });
        } else if (event === "partial") {
          totalPartial += (data.json ?? "").length;
          setStatus({ kind: "streaming", partialChars: totalPartial, cached });
        } else if (event === "done") {
          succeeded = true;
        } else if (event === "aborted") {
          // 사용자가 중단
        } else if (event === "error") {
          throw new Error(data.message ?? "분석에 실패했어요.");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE 메시지 단위 분리: \n\n
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let evt = "";
          let payload = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) evt = line.slice(7).trim();
            else if (line.startsWith("data: ")) payload += line.slice(6);
          }
          handleEvent(evt, payload);
        }
      }

      if (succeeded) {
        // 서버가 DB에 저장 완료 — 페이지 새로고침으로 결과 표시
        startTransition(() => {
          router.refresh();
          setStatus({ kind: "idle" });
        });
      } else {
        setStatus({ kind: "idle" });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "분석에 실패했어요.",
      });
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: "idle" });
  }

  return (
    <div className="space-y-6">
      {/* 분석 컨트롤 */}
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">분석 톤</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              같은 결정도 톤에 따라 다른 관점이 나옵니다.
            </p>
            <div className="mt-3">
              <ToneSelector
                value={tone}
                onChange={setTone}
                disabled={status.kind === "streaming"}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {status.kind === "streaming" ? (
              <Button variant="destructive" onClick={cancel}>
                <X className="h-4 w-4" />
                중단
              </Button>
            ) : (
              <>
                <Button onClick={() => runAnalyze(false)}>
                  <Sparkles className="h-4 w-4" />
                  {hasAnyAnalysisForTone ? "이 톤으로 다시 분석" : "AI 분석하기"}
                </Button>
                {hasAnyAnalysisForTone && (
                  <Button variant="outline" onClick={() => runAnalyze(true)}>
                    <RefreshCw className="h-4 w-4" />
                    캐시 무시하고 새로
                  </Button>
                )}
              </>
            )}
          </div>

          {status.kind === "streaming" && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span>
                  {status.cached
                    ? "캐시된 분석을 불러오는 중…"
                    : "AI가 분석 중이에요…"}
                </span>
              </div>
              {!status.cached && status.partialChars > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  생성된 글자 수: {status.partialChars}
                </p>
              )}
            </div>
          )}

          {status.kind === "error" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {status.message}
              <button
                type="button"
                onClick={() => runAnalyze(false)}
                className="ml-2 underline"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 갭 배너 — 감성 모드에서 logical/emotional 차이 큰 옵션 알림 (PRD §2.2.0) */}
      <DivergenceBanner
        options={initial.options}
        scores={recommendationScores}
        tone={tone}
        onShowBlunt={() => setTone("blunt")}
      />

      {/* 옵션별 추천 점수 카드 (Phase 2 §2.2) */}
      <OptionScoreCards
        decisionId={initial.decision.id}
        options={initial.options}
        initialScores={recommendationScores}
        tone={tone}
        onScoresChange={setRecommendationScores}
      />

      {/* 냉철 갭 분석 패널 — tone=blunt 일 때 lazy 로드 (PRD §5.5) */}
      {tone === "blunt" && (
        <DivergencePanel
          decisionId={initial.decision.id}
          options={initial.options}
          initialCache={initial.decision.divergence_cache}
        />
      )}

      {/* 분석 결과 탭 (Phase 2: 5종) */}
      <Tabs defaultValue="pros-cons" className="w-full">
        <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-5">
          <TabsTrigger value="pros-cons" className="flex-1">
            장단점
          </TabsTrigger>
          <TabsTrigger value="comparison" className="flex-1">
            비교표
          </TabsTrigger>
          <TabsTrigger value="swot" className="flex-1">
            SWOT
          </TabsTrigger>
          <TabsTrigger value="cartesian" className="flex-1">
            4분면
          </TabsTrigger>
          <TabsTrigger value="drucker" className="flex-1">
            드러커 5질문
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pros-cons">
          <ProsConsList items={visibleProsCons} options={initial.options} />
        </TabsContent>
        <TabsContent value="comparison">
          <ComparisonTable
            decisionId={initial.decision.id}
            options={initial.options}
            criteria={criteria}
            scores={scores}
            onLocalUpdate={({ criteria: c, scores: s }) => {
              if (c) setCriteria(c);
              if (s) setScores(s);
            }}
          />
        </TabsContent>
        <TabsContent value="swot">
          <SwotGrid items={visibleSwot} options={initial.options} />
        </TabsContent>
        <TabsContent value="cartesian">
          <CartesianQuadrants
            decisionId={initial.decision.id}
            initialItems={initial.cartesian}
          />
        </TabsContent>
        <TabsContent value="drucker">
          <DruckerQuestionsForm
            decisionId={initial.decision.id}
            initialAnswers={initial.drucker}
          />
        </TabsContent>
      </Tabs>

      {/* 최종 결정 */}
      <FinalDecision
        decisionId={initial.decision.id}
        options={initial.options}
        initialChoiceId={initial.decision.final_choice_id}
        initialNote={initial.decision.final_note}
        decided={initial.decision.status === "decided"}
      />

      {/* 회고 — 결정 완료 후 노출 (PRD §2.4) */}
      {initial.decision.status === "decided" && (
        <ReviewSection
          decisionId={initial.decision.id}
          initialReviews={initial.reviews}
        />
      )}
    </div>
  );
}
