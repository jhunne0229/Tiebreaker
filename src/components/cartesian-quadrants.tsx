"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Sparkles,
  Trash2,
  X,
  Check,
  RefreshCw,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CartesianItem } from "@/types/domain";
import type { CartesianQuadrant } from "@/types/database";

const QUADRANT_META: Record<
  CartesianQuadrant,
  { title: string; subtitle: string; color: string }
> = {
  Q1: {
    title: "일어나면 / 일어날 일",
    subtitle: "실행 시 얻는 것",
    color: "border-emerald-200 bg-emerald-50/40",
  },
  Q2: {
    title: "일어나지 않으면 / 일어날 일",
    subtitle: "안 했을 때 생기는 것",
    color: "border-amber-200 bg-amber-50/40",
  },
  Q3: {
    title: "일어나지 않으면 / 일어나지 않을 일",
    subtitle: "안 했을 때 못 얻는 것",
    color: "border-sky-200 bg-sky-50/40",
  },
  Q4: {
    title: "일어나면 / 일어나지 않을 일",
    subtitle: "실행 시 잃는 것",
    color: "border-rose-200 bg-rose-50/40",
  },
};

export function CartesianQuadrants({
  decisionId,
  initialItems,
}: {
  decisionId: string;
  initialItems: CartesianItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<CartesianItem[]>(initialItems);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (triggeredRef.current) return;
    if (items.length > 0) return;
    triggeredRef.current = true;
    void runGenerate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runGenerate(force: boolean) {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/cartesian`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const j = (await res.json()) as { error?: string; generated?: boolean };
      if (!res.ok) throw new Error(j.error ?? "생성 실패");
      if (j.generated) startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setGenerating(false);
    }
  }

  function reflectInsert(it: CartesianItem) {
    setItems((prev) => [...prev, it]);
  }
  function reflectUpdate(id: string, patch: Partial<CartesianItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function reflectDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {generating ? (
          <Button variant="outline" disabled>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
            AI가 생각 중…
          </Button>
        ) : items.length === 0 ? (
          <Button onClick={() => runGenerate(false)}>
            <Sparkles className="h-4 w-4" />
            AI로 4분면 채우기
          </Button>
        ) : (
          <Button variant="outline" onClick={() => runGenerate(true)}>
            <RefreshCw className="h-4 w-4" />
            AI 항목 다시 생성
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 축 라벨 (Y 위) */}
      <div className="text-center text-xs font-medium text-muted-foreground">
        ↑ 어떤 일이 일어날까
      </div>

      {/* 위 행: Q2 | Q1 */}
      <div className="grid grid-cols-2 gap-2">
        {(["Q2", "Q1"] as const).map((q) => {
          const meta = QUADRANT_META[q];
          const list = items.filter((i) => i.quadrant === q).slice(0, 5);
          return (
            <QuadrantCell
              key={q}
              decisionId={decisionId}
              quadrant={q}
              title={meta.title}
              subtitle={meta.subtitle}
              colorClass={meta.color}
              items={list}
              onInsert={reflectInsert}
              onUpdate={reflectUpdate}
              onDelete={reflectDelete}
            />
          );
        })}
      </div>

      {/* 축 라벨 (X 가로축) — 위/아래 사분면 사이 */}
      <div className="flex justify-between px-1 text-[11px] font-medium text-muted-foreground">
        <span>← 이 일이 일어나지 않으면</span>
        <span>이 일이 일어나면 →</span>
      </div>

      {/* 아래 행: Q3 | Q4 */}
      <div className="grid grid-cols-2 gap-2">
        {(["Q3", "Q4"] as const).map((q) => {
          const meta = QUADRANT_META[q];
          const list = items.filter((i) => i.quadrant === q).slice(0, 5);
          return (
            <QuadrantCell
              key={q}
              decisionId={decisionId}
              quadrant={q}
              title={meta.title}
              subtitle={meta.subtitle}
              colorClass={meta.color}
              items={list}
              onInsert={reflectInsert}
              onUpdate={reflectUpdate}
              onDelete={reflectDelete}
            />
          );
        })}
      </div>

      {/* 축 라벨 (Y 아래) */}
      <div className="text-center text-xs font-medium text-muted-foreground">
        ↓ 어떤 일이 일어나지 않을까
      </div>
    </div>
  );
}

function QuadrantCell({
  decisionId,
  quadrant,
  title,
  subtitle,
  colorClass,
  items,
  onInsert,
  onUpdate,
  onDelete,
}: {
  decisionId: string;
  quadrant: CartesianQuadrant;
  title: string;
  subtitle: string;
  colorClass: string;
  items: CartesianItem[];
  onInsert: (it: CartesianItem) => void;
  onUpdate: (id: string, patch: Partial<CartesianItem>) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "flex min-h-[14rem] flex-col rounded-md border p-3",
        colorClass,
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold leading-tight">
            {title}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            · {subtitle}
          </div>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {items.length}/5
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">없음</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              decisionId={decisionId}
              item={it}
              expanded={expandedId === it.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === it.id ? null : it.id))
              }
              onUpdate={onUpdate}
              onDelete={(id) => {
                onDelete(id);
                if (expandedId === id) setExpandedId(null);
              }}
            />
          ))}
        </ul>
      )}

      {items.length < 5 && (
        <div className="mt-auto pt-2">
          {adding ? (
            <AddItemForm
              decisionId={decisionId}
              quadrant={quadrant}
              onCancel={() => setAdding(false)}
              onAdded={(it) => {
                onInsert(it);
                setAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              항목 추가
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  decisionId,
  item,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  decisionId: string;
  item: CartesianItem;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<CartesianItem>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [keyword, setKeyword] = useState(item.keyword);
  const [description, setDescription] = useState(item.description ?? "");
  const [busy, setBusy] = useState(false);

  // 외부 변경(재생성 등) 반영
  useEffect(() => {
    setKeyword(item.keyword);
    setDescription(item.description ?? "");
  }, [item.keyword, item.description]);

  async function save() {
    if (busy) return;
    const k = keyword.trim();
    if (!k) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/cartesian`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          keyword: k,
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        onUpdate(item.id, {
          keyword: k.slice(0, 30),
          description: description.trim()
            ? description.trim().slice(0, 200)
            : null,
        });
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (!confirm(`'${item.keyword}' 항목을 삭제할까요?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/decisions/${decisionId}/cartesian?item_id=${item.id}`,
        { method: "DELETE" },
      );
      if (res.ok) onDelete(item.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded bg-white/70 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="text-xs font-semibold">{item.keyword}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="border-t border-black/5 px-2 py-2">
          {editing ? (
            <>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                maxLength={30}
                className="h-8 text-xs"
                placeholder="키워드"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                className="mt-1 min-h-[48px] text-xs"
                placeholder="(선택) 1–2문장 설명"
              />
              <div className="mt-1 flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setKeyword(item.keyword);
                    setDescription(item.description ?? "");
                    setEditing(false);
                  }}
                  disabled={busy}
                >
                  <X className="h-3 w-3" />
                </Button>
                <Button size="sm" onClick={save} disabled={busy}>
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {item.description ?? "설명이 없어요."}
              </p>
              <div className="mt-1.5 flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  disabled={busy}
                >
                  <Pencil className="h-3 w-3" />
                  편집
                </button>
                <button
                  type="button"
                  onClick={remove}
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-destructive"
                  disabled={busy}
                >
                  <Trash2 className="h-3 w-3" />
                  삭제
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function AddItemForm({
  decisionId,
  quadrant,
  onCancel,
  onAdded,
}: {
  decisionId: string;
  quadrant: CartesianQuadrant;
  onCancel: () => void;
  onAdded: (it: CartesianItem) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const k = keyword.trim();
    if (!k) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/cartesian`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quadrant,
          keyword: k,
          description: description.trim() || null,
        }),
      });
      const j = (await res.json()) as { item?: CartesianItem; error?: string };
      if (!res.ok || !j.item) throw new Error(j.error ?? "추가 실패");
      onAdded(j.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded bg-white/70 p-2">
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        maxLength={30}
        placeholder="키워드 (최대 30자)"
        className="h-8 text-xs"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        placeholder="(선택) 1–2문장 설명"
        className="mt-1 min-h-[48px] text-xs"
      />
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      <div className="mt-1 flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button size="sm" onClick={save} disabled={busy || !keyword.trim()}>
          추가
        </Button>
      </div>
    </div>
  );
}
