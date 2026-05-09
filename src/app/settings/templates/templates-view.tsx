"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { TemplateRow } from "./page";

export function TemplatesView({ initial }: { initial: TemplateRow[] }) {
  const [templates, setTemplates] = useState<TemplateRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("이 템플릿을 삭제할까요?")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/criteria-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "삭제 실패");
      }
      setTemplates((t) => t.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(null);
    }
  }

  const system = templates.filter((t) => t.is_system);
  const mine = templates.filter((t) => !t.is_system);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">내 템플릿 ({mine.length})</h2>
        {mine.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 저장된 템플릿이 없어요. 결정 작성 중 비교표에서 &quot;이 기준 세트
            저장&quot;을 눌러보세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {mine.map((t) => (
              <li
                key={t.id}
                className="rounded-md border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(t.created_at)} · 기준 {t.criteria?.length ?? 0}개
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {(t.criteria ?? []).map((c, i) => (
                        <li
                          key={i}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                        >
                          {c.name} · {c.weight}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(t.id)}
                    disabled={busy === t.id}
                    aria-label="템플릿 삭제"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          기본 템플릿 ({system.length})
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          시스템에서 제공하는 기본 세트예요. 결정 작성 중 자유롭게 불러올 수
          있어요.
        </p>
        <ul className="space-y-2">
          {system.map((t) => (
            <li
              key={t.id}
              className="rounded-md border bg-muted/20 p-4"
            >
              <p className="text-sm font-semibold">{t.name}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(t.criteria ?? []).map((c, i) => (
                  <li
                    key={i}
                    className="rounded-full bg-background px-2 py-0.5 text-[11px]"
                  >
                    {c.name} · {c.weight}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
