"use client";

import type { DecisionTone } from "@/types/database";
import { TONE_LABELS } from "@/types/domain";
import { cn } from "@/lib/utils";

const TONE_DESC: Record<DecisionTone, string> = {
  logical: "사실 위주, 중립적",
  emotional: "공감, 따뜻한 시선",
  blunt: "직설적인 친구",
};

export function ToneSelector({
  value,
  onChange,
  disabled,
}: {
  value: DecisionTone;
  onChange: (tone: DecisionTone) => void;
  disabled?: boolean;
}) {
  const tones: DecisionTone[] = ["logical", "emotional", "blunt"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tones.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t)}
            className={cn(
              "flex flex-col items-start rounded-md border px-3 py-2 text-left transition disabled:opacity-50",
              active
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:border-primary/30 hover:bg-muted",
            )}
          >
            <span className="text-sm font-medium">{TONE_LABELS[t]}</span>
            <span className="text-[11px] text-muted-foreground">
              {TONE_DESC[t]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
