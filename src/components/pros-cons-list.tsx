"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { DecisionOption, ProsConItem } from "@/types/domain";
import { cn } from "@/lib/utils";

export function ProsConsList({
  items,
  options,
}: {
  items: ProsConItem[];
  options: DecisionOption[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        아직 분석 결과가 없어요. 위에서 “분석하기”를 눌러주세요.
      </p>
    );
  }

  // 그룹: 결정 전체(null) → 옵션별
  const groups: Array<{ key: string; label: string; items: ProsConItem[] }> = [];
  const overall = items.filter((i) => !i.option_id);
  if (overall.length > 0) groups.push({ key: "overall", label: "결정 전체", items: overall });
  for (const o of options) {
    const list = items.filter((i) => i.option_id === o.id);
    if (list.length > 0) groups.push({ key: o.id, label: o.name, items: list });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="text-sm font-semibold">{g.label}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Column
              kind="pro"
              title="장점"
              items={g.items.filter((i) => i.kind === "pro")}
            />
            <Column
              kind="con"
              title="단점"
              items={g.items.filter((i) => i.kind === "con")}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function Column({
  kind,
  title,
  items,
}: {
  kind: "pro" | "con";
  title: string;
  items: ProsConItem[];
}) {
  const Icon = kind === "pro" ? CheckCircle2 : XCircle;
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        kind === "pro" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40",
      )}
    >
      <div
        className={cn(
          "mb-2 flex items-center gap-1.5 text-xs font-semibold",
          kind === "pro" ? "text-emerald-700" : "text-rose-700",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">없음</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="text-sm leading-snug text-foreground">
              {it.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
