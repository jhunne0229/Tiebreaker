"use client";

import type { DecisionOption, SwotItem } from "@/types/domain";
import type { SwotQuadrant } from "@/types/database";
import { cn } from "@/lib/utils";

const QUADRANT_META: Record<
  SwotQuadrant,
  { title: string; subtitle: string; color: string }
> = {
  S: {
    title: "Strengths",
    subtitle: "강점",
    color: "border-emerald-200 bg-emerald-50/40",
  },
  W: {
    title: "Weaknesses",
    subtitle: "약점",
    color: "border-rose-200 bg-rose-50/40",
  },
  O: {
    title: "Opportunities",
    subtitle: "기회",
    color: "border-sky-200 bg-sky-50/40",
  },
  T: {
    title: "Threats",
    subtitle: "위협",
    color: "border-amber-200 bg-amber-50/40",
  },
};

export function SwotGrid({
  items,
  options,
}: {
  items: SwotItem[];
  options: DecisionOption[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        아직 분석 결과가 없어요. 위에서 “분석하기”를 눌러주세요.
      </p>
    );
  }

  const groups: Array<{ key: string; label: string; items: SwotItem[] }> = [];
  const overall = items.filter((i) => !i.option_id);
  if (overall.length > 0)
    groups.push({ key: "overall", label: "결정 전체", items: overall });
  for (const o of options) {
    const list = items.filter((i) => i.option_id === o.id);
    if (list.length > 0)
      groups.push({ key: o.id, label: o.name, items: list });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="mb-2 text-sm font-semibold">{g.label}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["S", "W", "O", "T"] as SwotQuadrant[]).map((q) => {
              const meta = QUADRANT_META[q];
              const list = g.items.filter((i) => i.quadrant === q);
              return (
                <div
                  key={q}
                  className={cn("rounded-md border p-3", meta.color)}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase">
                    <span>{meta.title}</span>
                    <span className="text-muted-foreground">· {meta.subtitle}</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">없음</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((it) => (
                        <li
                          key={it.id}
                          className="text-sm leading-snug text-foreground"
                        >
                          {it.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
