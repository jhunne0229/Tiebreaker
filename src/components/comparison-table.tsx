"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { Criteria, DecisionOption, Score } from "@/types/domain";
import { rankOptions } from "@/lib/scoring";
import { cn } from "@/lib/utils";

interface Props {
  decisionId: string;
  options: DecisionOption[];
  criteria: Criteria[];
  scores: Score[];
  onLocalUpdate: (updater: {
    criteria?: Criteria[];
    scores?: Score[];
  }) => void;
}

export function ComparisonTable({
  decisionId,
  options,
  criteria,
  scores,
  onLocalUpdate,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  async function addCriteria() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/criteria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, weight: 3 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onLocalUpdate({ criteria: [...criteria, json.criteria] });
      setNewName("");
    } catch {
      alert("기준 추가에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setAdding(false);
    }
  }

  async function removeCriteria(criteriaId: string) {
    if (!confirm("이 기준을 삭제할까요?")) return;
    const prev = criteria;
    onLocalUpdate({ criteria: criteria.filter((c) => c.id !== criteriaId) });
    try {
      const res = await fetch(
        `/api/decisions/${decisionId}/criteria?criteria_id=${criteriaId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
    } catch {
      onLocalUpdate({ criteria: prev });
      alert("삭제에 실패했어요.");
    }
  }

  function updateWeight(criteriaId: string, weight: number) {
    const next = criteria.map((c) => (c.id === criteriaId ? { ...c, weight } : c));
    onLocalUpdate({ criteria: next });
    startTransition(async () => {
      await fetch(`/api/decisions/${decisionId}/criteria`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: criteriaId, weight }),
      }).catch(() => {});
    });
  }

  function updateScore(optionId: string, criteriaId: string, value: number) {
    const existing = scores.find(
      (s) => s.option_id === optionId && s.criteria_id === criteriaId,
    );
    let next: Score[];
    if (existing) {
      next = scores.map((s) =>
        s.option_id === optionId && s.criteria_id === criteriaId
          ? { ...s, value, ai_generated: false }
          : s,
      );
    } else {
      next = [
        ...scores,
        {
          id: `temp-${optionId}-${criteriaId}`,
          option_id: optionId,
          criteria_id: criteriaId,
          value,
          reasoning: null,
          ai_generated: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }
    onLocalUpdate({ scores: next });
    startTransition(async () => {
      await fetch(`/api/decisions/${decisionId}/scores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          option_id: optionId,
          criteria_id: criteriaId,
          value,
        }),
      }).catch(() => {});
    });
  }

  const ranking = rankOptions(options, criteria, scores);
  const top = ranking[0];

  if (criteria.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 비교 기준이 없어요. AI가 분석하면 자동으로 4-6개 기준이 생기거나,
          직접 추가해보세요.
        </p>
        <AddCriteriaInline
          value={newName}
          setValue={setNewName}
          onSubmit={addCriteria}
          disabled={adding}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 비교표 — 모바일 친화적 카드 + 데스크탑 그리드 */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="hidden grid-cols-[minmax(140px,1.5fr)_repeat(var(--cols),minmax(120px,1fr))] sm:grid"
          style={{ ["--cols" as never]: options.length }}
        >
          <div className="border-b border-r bg-muted/40 p-3 text-xs font-medium text-muted-foreground">
            기준 / 가중치
          </div>
          {options.map((o) => (
            <div
              key={o.id}
              className="border-b border-r bg-muted/40 p-3 text-center text-xs font-medium last:border-r-0"
            >
              {o.name}
            </div>
          ))}

          {criteria.map((c) => (
            <CriteriaRow
              key={c.id}
              criteria={c}
              options={options}
              scores={scores}
              onWeight={(v) => updateWeight(c.id, v)}
              onScore={(optionId, v) => updateScore(optionId, c.id, v)}
              onRemove={() => removeCriteria(c.id)}
            />
          ))}

          {/* 합계 */}
          <div className="border-t bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">
            가중 합산
          </div>
          {options.map((o) => {
            const r = ranking.find((x) => x.option.id === o.id)!;
            return (
              <div
                key={o.id}
                className={cn(
                  "border-l border-t bg-muted/30 p-3 text-center first:border-l-0",
                  top && r.option.id === top.option.id && "bg-emerald-50/60",
                )}
              >
                <div className="text-lg font-bold">{r.total}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.percent}% · /{r.max}
                </div>
              </div>
            );
          })}
        </div>

        {/* 모바일 — 카드 형태 */}
        <div className="space-y-3 p-3 sm:hidden">
          {criteria.map((c) => (
            <div key={c.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    가중치 {c.weight}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCriteria(c.id)}
                  aria-label="기준 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
              <div className="mb-3">
                <Slider
                  min={1}
                  max={5}
                  step={1}
                  value={[c.weight]}
                  onValueChange={(v) => updateWeight(c.id, v[0] ?? 1)}
                />
              </div>
              <div className="space-y-2">
                {options.map((o) => {
                  const s = scores.find(
                    (s) => s.option_id === o.id && s.criteria_id === c.id,
                  );
                  return (
                    <div key={o.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{o.name}</span>
                        <span className="text-muted-foreground">
                          {s?.value ?? "-"} / 10
                        </span>
                      </div>
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        value={[s?.value ?? 5]}
                        onValueChange={(v) =>
                          updateScore(o.id, c.id, v[0] ?? 5)
                        }
                      />
                      {s?.reasoning && (
                        <p className="text-[11px] text-muted-foreground">
                          {s.reasoning}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 모바일 합계 */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              가중 합산
            </div>
            <div className="space-y-1">
              {ranking.map((r, idx) => (
                <div
                  key={r.option.id}
                  className={cn(
                    "flex items-center justify-between rounded px-2 py-1.5 text-sm",
                    idx === 0 && "bg-emerald-50",
                  )}
                >
                  <span className="font-medium">
                    {idx === 0 && "🏆 "}
                    {r.option.name}
                  </span>
                  <span className="tabular-nums">
                    {r.total}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({r.percent}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AddCriteriaInline
        value={newName}
        setValue={setNewName}
        onSubmit={addCriteria}
        disabled={adding}
      />
      {pending && (
        <p className="text-xs text-muted-foreground">저장 중…</p>
      )}
    </div>
  );
}

function CriteriaRow({
  criteria,
  options,
  scores,
  onWeight,
  onScore,
  onRemove,
}: {
  criteria: Criteria;
  options: DecisionOption[];
  scores: Score[];
  onWeight: (v: number) => void;
  onScore: (optionId: string, v: number) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <div className="border-b border-r p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium">{criteria.name}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              가중치 {criteria.weight}
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="기준 삭제"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2">
          <Slider
            min={1}
            max={5}
            step={1}
            value={[criteria.weight]}
            onValueChange={(v) => onWeight(v[0] ?? 1)}
          />
        </div>
      </div>
      {options.map((o) => {
        const s = scores.find(
          (s) => s.option_id === o.id && s.criteria_id === criteria.id,
        );
        return (
          <div
            key={o.id}
            className="border-b border-r p-3 text-center last:border-r-0"
          >
            <div className="text-lg font-bold">{s?.value ?? "-"}</div>
            <div className="mt-1">
              <Slider
                min={1}
                max={10}
                step={1}
                value={[s?.value ?? 5]}
                onValueChange={(v) => onScore(o.id, v[0] ?? 5)}
              />
            </div>
            {s?.reasoning && (
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                {s.reasoning}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

function AddCriteriaInline({
  value,
  setValue,
  onSubmit,
  disabled,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Input
        placeholder="기준 추가 (예: 출퇴근 시간)"
        value={value}
        maxLength={100}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
      >
        <Plus className="h-4 w-4" />
        추가
      </Button>
    </div>
  );
}
