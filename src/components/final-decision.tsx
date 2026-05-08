"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { DecisionOption } from "@/types/domain";

interface Props {
  decisionId: string;
  options: DecisionOption[];
  initialChoiceId: string | null;
  initialNote: string | null;
  decided: boolean;
}

export function FinalDecision({
  decisionId,
  options,
  initialChoiceId,
  initialNote,
  decided,
}: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState(initialChoiceId ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/decisions/${decisionId}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            final_choice_id: choice || null,
            final_note: note || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했어요.");
      }
    });
  }

  function reopen() {
    setChoice("");
    setNote("");
    startTransition(async () => {
      await fetch(`/api/decisions/${decisionId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_choice_id: null, final_note: null }),
      });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <h2 className="text-base font-semibold">최종 결정</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        분석 결과를 보고 본인이 고른 옵션을 저장하세요. 결정은 본인이 합니다.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            선택한 옵션
          </label>
          <Select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={pending}
          >
            <option value="">선택 안 함</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            한 줄 메모 (선택)
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            disabled={pending}
            placeholder="예: 결국 통근 부담 때문에 현재 회사 유지"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending || !choice}>
            <Check className="h-4 w-4" />
            {decided ? "결정 업데이트" : "결정 저장"}
          </Button>
          {decided && (
            <Button variant="outline" onClick={reopen} disabled={pending}>
              <RotateCcw className="h-4 w-4" />
              다시 열기
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
