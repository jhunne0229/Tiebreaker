"use client";

// 비교 기준 템플릿 불러오기 / 저장 (06_PHASE2_PRD.md §2.7)
// ComparisonTable 위에 마운트.
//   - 기준이 1개 이상이면 "이 기준 세트 저장" 활성
//   - 시스템 + 본인 템플릿 드롭다운 → 선택 시 일괄 추가
import { useEffect, useState } from "react";
import { BookmarkPlus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Criteria } from "@/types/domain";
import type { CriteriaTemplateItem } from "@/types/database";

interface Template {
  id: string;
  user_id: string | null;
  name: string;
  criteria: CriteriaTemplateItem[];
  is_system: boolean;
  created_at: string;
}

interface Props {
  decisionId: string;
  currentCriteria: Criteria[];
  onLoaded: (added: Criteria[]) => void;
}

export function TemplateLoader({ decisionId, currentCriteria, onLoaded }: Props) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [open, setOpen] = useState<"none" | "load" | "save">("none");
  const [busy, setBusy] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (templates !== null) return;
    if (open === "none") return;
    void fetch("/api/criteria-templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => setTemplates([]));
  }, [open, templates]);

  async function applyTemplate(templateId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/decisions/${decisionId}/criteria/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id: templateId }),
        },
      );
      const j = (await res.json()) as { criteria?: Criteria[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
      onLoaded(j.criteria ?? []);
      setOpen("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    const name = saveName.trim();
    if (!name) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (currentCriteria.length === 0) {
      setError("저장할 기준이 없어요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/criteria-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          criteria: currentCriteria.map((c) => ({
            name: c.name,
            weight: c.weight,
          })),
        }),
      });
      const j = (await res.json()) as { template?: Template; error?: string };
      if (!res.ok || !j.template) throw new Error(j.error ?? "저장 실패");
      setTemplates((t) => (t ? [j.template!, ...t] : [j.template!]));
      setSaveName("");
      setOpen("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setOpen((o) => (o === "load" ? "none" : "load"))
          }
        >
          <Layers className="h-4 w-4" />
          템플릿에서 불러오기
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentCriteria.length === 0}
          onClick={() =>
            setOpen((o) => (o === "save" ? "none" : "save"))
          }
        >
          <BookmarkPlus className="h-4 w-4" />이 기준 세트 저장
        </Button>
      </div>

      {open === "load" && (
        <div className="rounded-md border bg-muted/30 p-3">
          {templates === null ? (
            <p className="text-xs text-muted-foreground">불러오는 중…</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              아직 템플릿이 없어요. 옆 버튼으로 현재 기준을 저장해보세요.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                선택하면 현재 기준 뒤에 일괄 추가돼요.
              </p>
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyTemplate(t.id)}
                      className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                    >
                      <span>
                        <span className="font-medium">{t.name}</span>
                        {t.is_system && (
                          <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">
                            기본
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {Array.isArray(t.criteria) ? t.criteria.length : 0}개
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {open === "save" && (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="템플릿 이름 (예: 이직 기준 세트)"
              maxLength={100}
              className="flex-1 min-w-[200px]"
            />
            <Button
              type="button"
              size="sm"
              onClick={saveTemplate}
              disabled={busy || !saveName.trim()}
            >
              저장
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            현재 비교 기준 {currentCriteria.length}개가 저장돼요. 다음 결정에서
            바로 불러올 수 있어요.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
