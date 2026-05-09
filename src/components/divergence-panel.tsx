"use client";

// 냉철 갭 분석 패널 (06_PHASE2_PRD.md §2.2.0, §4.1, §5.5)
// tone === "blunt" 일 때 분석 탭 위에 노출.
// 결정의 divergence_cache 가 있으면 그대로 표시, 없으면 lazy fetch.
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DecisionOption } from "@/types/domain";
import type { DivergenceCache } from "@/types/database";

interface Props {
  decisionId: string;
  options: DecisionOption[];
  initialCache: DivergenceCache | null;
}

export function DivergencePanel({ decisionId, options, initialCache }: Props) {
  const [cache, setCache] = useState<DivergenceCache | null>(initialCache);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggeredRef = useRef(false);

  // 캐시 비어 있으면 1회 자동 호출
  useEffect(() => {
    if (triggeredRef.current) return;
    if (cache) return;
    triggeredRef.current = true;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(force: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/divergence`, {
        method: force ? "POST" : "GET",
        headers: force ? { "Content-Type": "application/json" } : undefined,
        body: force ? JSON.stringify({ force: true }) : undefined,
      });
      const j = (await res.json()) as {
        cache?: DivergenceCache;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "갭 분석에 실패했어요.");
      if (j.cache) setCache(j.cache);
    } catch (e) {
      setError(e instanceof Error ? e.message : "갭 분석에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  const optionNames = new Map(options.map((o) => [o.id, o.name]));

  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Eye className="h-4 w-4 text-slate-700" />
            냉철 — 객관 vs 성향 갭
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            점수 카드의 객관(논리)과 성향 반영(감성) 점수가 갈리는 이유를
            짚어드려요. 판단을 바꾸라는 게 아니라 자기 점검용이에요.
          </p>
        </div>
        {cache && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => run(true)}
            disabled={busy}
          >
            {busy ? (
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            다시 분석
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
          <button
            type="button"
            onClick={() => run(false)}
            className="ml-2 underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {!cache && busy && (
        <div className="rounded-md border bg-white/60 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            갭 원인 분석 중…
          </span>
        </div>
      )}

      {!cache && !busy && !error && (
        <p className="text-xs text-muted-foreground">
          갭 분석을 시작하지 못했어요. 잠시 후 다시 시도해주세요.
        </p>
      )}

      {cache && (
        <div className="space-y-3">
          {cache.summary && (
            <p className="text-sm leading-relaxed text-slate-800">
              {cache.summary}
            </p>
          )}

          {cache.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              현재 갭이 큰 옵션이 없어요. 점수가 갈리지 않은 결정이에요.
            </p>
          ) : (
            <ul className="space-y-2">
              {cache.items.map((it) => (
                <li
                  key={it.option_id}
                  className="rounded-md border bg-white p-3"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {optionNames.get(it.option_id) ?? "옵션"}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-800">
                    {it.cause}
                  </p>
                  <p className="mt-2 border-l-2 border-slate-300 pl-2 text-xs italic text-slate-600">
                    {it.self_check}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
