"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DECISION_TYPE_LABELS } from "@/types/domain";
import { createDecisionAction, type CreateDecisionState } from "./actions";

interface OptionDraft {
  name: string;
  description: string;
}

const initialState: CreateDecisionState = {};
const initialOptions: OptionDraft[] = [
  { name: "", description: "" },
  { name: "", description: "" },
];

export function NewDecisionForm() {
  const [state, formAction, pending] = useActionState(
    createDecisionAction,
    initialState,
  );
  const [options, setOptions] = useState<OptionDraft[]>(initialOptions);

  function update(idx: number, patch: Partial<OptionDraft>) {
    setOptions((arr) => arr.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }

  function add() {
    if (options.length >= 8) return;
    setOptions((arr) => [...arr, { name: "", description: "" }]);
  }

  function remove(idx: number) {
    if (options.length <= 1) return;
    setOptions((arr) => arr.filter((_, i) => i !== idx));
  }

  const filtered = options
    .map((o) => ({ name: o.name.trim(), description: o.description.trim() }))
    .filter((o) => o.name.length > 0);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">결정 제목 *</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="예) 이직할까 말까"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">결정 유형</Label>
        <Select id="type" name="type" defaultValue="other">
          {Object.entries(DECISION_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="context">맥락 (선택)</Label>
        <Textarea
          id="context"
          name="context"
          maxLength={4000}
          rows={5}
          placeholder="예) 현재 연봉 5천, 새 회사 6천이지만 출퇴근 1시간 늘어남. 새 분야 도전이라 성장은 더 클 것 같음…"
        />
        <p className="text-xs text-muted-foreground">
          상세할수록 분석이 정확해져요. 이메일·전화번호는 자동으로 마스킹됩니다.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>옵션 (선택지) *</Label>
          <span className="text-xs text-muted-foreground">{options.length} / 8</span>
        </div>
        <div className="space-y-3">
          {options.map((opt, idx) => (
            <div
              key={idx}
              className="rounded-md border bg-card p-3 sm:p-4"
            >
              <div className="flex items-start gap-2">
                <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {idx + 1}
                </div>
                <div className="grid flex-1 gap-2">
                  <Input
                    value={opt.name}
                    maxLength={200}
                    onChange={(e) => update(idx, { name: e.target.value })}
                    placeholder="옵션 이름 (예: 새 회사 이직)"
                  />
                  <Input
                    value={opt.description}
                    maxLength={500}
                    onChange={(e) =>
                      update(idx, { description: e.target.value })
                    }
                    placeholder="간단한 설명 (선택)"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(idx)}
                  disabled={options.length <= 1}
                  aria-label="옵션 삭제"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={options.length >= 8}
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          옵션 추가
        </Button>
      </div>

      <input type="hidden" name="options" value={JSON.stringify(filtered)} />

      {state.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={pending || filtered.length === 0}
        >
          {pending ? "저장 중…" : "결정 만들고 분석하기"}
        </Button>
      </div>
    </form>
  );
}
