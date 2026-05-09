// 공유 페이지 본문 — 읽기 전용 (06_PHASE2_PRD.md §2.6)
// 인터랙션 없음 — 서버 렌더 결과를 그대로 보여준다.
import { CheckCircle2 } from "lucide-react";
import { rankOptions } from "@/lib/scoring";
import {
  CONFIDENCE_LABELS,
  TIER_TONE,
} from "@/lib/recommendation/calculate";
import { DECISION_TYPE_LABELS } from "@/types/domain";
import { formatDate, cn } from "@/lib/utils";
import type {
  CartesianItem,
  Criteria,
  DecisionOption,
  ProsConItem,
  RecommendationScore,
  Score,
  SwotItem,
} from "@/types/domain";
import type { DecisionShareViewRow } from "@/types/database";

interface Props {
  decision: DecisionShareViewRow;
  options: Array<Omit<DecisionOption, "ai_labels">>;
  criteria: Criteria[];
  scores: Score[];
  prosCons: ProsConItem[];
  swot: SwotItem[];
  cartesian: CartesianItem[];
  recommendationScores: RecommendationScore[];
  authorName: string | null;
}

const QUADRANT_LABELS: Record<"Q1" | "Q2" | "Q3" | "Q4", string> = {
  Q1: "일어나면 / 일어날까",
  Q2: "안 일어나면 / 일어날까",
  Q3: "안 일어나면 / 안 일어날까",
  Q4: "일어나면 / 안 일어날까",
};

export function ShareView({
  decision,
  options,
  criteria,
  scores,
  prosCons,
  swot,
  cartesian,
  recommendationScores,
  authorName,
}: Props) {
  const finalOption =
    decision.final_choice_id != null
      ? options.find((o) => o.id === decision.final_choice_id) ?? null
      : null;
  const ranked = rankOptions(
    options as DecisionOption[],
    criteria,
    scores,
  );
  const scoreByOption = new Map(
    recommendationScores.map((r) => [r.option_id, r]),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-background p-5 sm:p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">
            {DECISION_TYPE_LABELS[decision.type]}
          </span>
          <span>·</span>
          <span>{formatDate(decision.created_at)}</span>
          {decision.status === "decided" && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
              결정 완료
            </span>
          )}
          {authorName && (
            <>
              <span>·</span>
              <span>{authorName} 님</span>
            </>
          )}
        </div>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">
          {decision.title}
        </h1>
        {decision.context && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {decision.context}
          </p>
        )}
      </section>

      {finalOption && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="text-xs font-medium text-emerald-700">최종 선택</p>
              <p className="mt-1 text-base font-semibold text-emerald-900">
                {finalOption.name}
              </p>
              {finalOption.description && (
                <p className="mt-1 text-sm text-emerald-800/80">
                  {finalOption.description}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {options.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">옵션</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => {
              const rec = scoreByOption.get(option.id);
              const tone = rec ? TIER_TONE[rec.tier] : null;
              return (
                <div
                  key={option.id}
                  className={cn(
                    "rounded-lg border bg-background p-4",
                    tone?.ring && `ring-1 ${tone.ring}`,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">{option.name}</h3>
                    {rec && tone && (
                      <div
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-medium",
                          tone.bg,
                          tone.color,
                        )}
                      >
                        {rec.score}
                        {rec.tier === "close" && (
                          <span className="ml-1">·박빙</span>
                        )}
                      </div>
                    )}
                  </div>
                  {option.description && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  )}
                  {rec && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {CONFIDENCE_LABELS[rec.confidence_label]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {recommendationScores.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              이 점수는 작성자의 성향이 반영된 결과예요.
            </p>
          )}
        </section>
      )}

      {criteria.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">비교표</h2>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">기준</th>
                  <th className="px-3 py-2 text-center font-medium">가중치</th>
                  {options.map((o) => (
                    <th
                      key={o.id}
                      className="px-3 py-2 text-center font-medium"
                    >
                      {o.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {criteria.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {c.weight}
                    </td>
                    {options.map((o) => {
                      const s = scores.find(
                        (x) => x.option_id === o.id && x.criteria_id === c.id,
                      );
                      return (
                        <td
                          key={o.id}
                          className="px-3 py-2 text-center tabular-nums"
                        >
                          {s ? s.value : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t bg-muted/20 font-medium">
                  <td className="px-3 py-2">합계</td>
                  <td className="px-3 py-2"></td>
                  {options.map((o) => {
                    const r = ranked.find((x) => x.option.id === o.id);
                    return (
                      <td
                        key={o.id}
                        className="px-3 py-2 text-center tabular-nums"
                      >
                        {r ? r.total : 0}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {prosCons.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">장단점</h2>
          {options.map((o) => {
            const optionItems = prosCons.filter((p) => p.option_id === o.id);
            if (optionItems.length === 0) return null;
            const pros = optionItems.filter((p) => p.kind === "pro");
            const cons = optionItems.filter((p) => p.kind === "con");
            return (
              <div
                key={o.id}
                className="rounded-lg border bg-background p-4"
              >
                <h3 className="mb-2 text-sm font-medium">{o.name}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-emerald-700">
                      장점
                    </p>
                    <ul className="space-y-1 text-xs">
                      {pros.length === 0 && (
                        <li className="text-muted-foreground">—</li>
                      )}
                      {pros.map((p) => (
                        <li key={p.id}>• {p.text}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-rose-700">
                      단점
                    </p>
                    <ul className="space-y-1 text-xs">
                      {cons.length === 0 && (
                        <li className="text-muted-foreground">—</li>
                      )}
                      {cons.map((p) => (
                        <li key={p.id}>• {p.text}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {swot.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">SWOT</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["S", "W", "O", "T"] as const).map((q) => {
              const items = swot.filter((s) => s.quadrant === q);
              const labels = {
                S: { name: "강점", color: "text-emerald-700" },
                W: { name: "약점", color: "text-rose-700" },
                O: { name: "기회", color: "text-sky-700" },
                T: { name: "위협", color: "text-amber-700" },
              };
              return (
                <div
                  key={q}
                  className="rounded-lg border bg-background p-3"
                >
                  <p className={cn("mb-1.5 text-xs font-medium", labels[q].color)}>
                    {labels[q].name}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {items.length === 0 && (
                      <li className="text-muted-foreground">—</li>
                    )}
                    {items.map((s) => (
                      <li key={s.id}>• {s.text}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {cartesian.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">데카르트 4분면</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
              const items = cartesian.filter((c) => c.quadrant === q);
              return (
                <div
                  key={q}
                  className="rounded-lg border bg-background p-3"
                >
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    {QUADRANT_LABELS[q]}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {items.length === 0 && (
                      <li className="text-muted-foreground">—</li>
                    )}
                    {items.map((c) => (
                      <li key={c.id}>
                        <span className="font-medium">{c.keyword}</span>
                        {c.description && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {c.description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
