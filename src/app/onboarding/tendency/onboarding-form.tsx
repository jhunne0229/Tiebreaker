"use client";

// 온보딩 자가 평가 — 5개 슬라이더 (06_PHASE2_PRD.md §2.3.1)
// 0–5 정수값, 저장 시 (v - 2.5) / 2.5 변환해 -1~+1로 매핑.
// 건너뛰기 = 모두 2.5(중립) → 0.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface Axis {
  key:
    | "risk_tolerance"
    | "time_orientation"
    | "change_openness"
    | "analytical_intuitive"
    | "self_others";
  title: string;
  description: string;
  leftLabel: string; // 0
  rightLabel: string; // 5
}

const AXES: Axis[] = [
  {
    key: "risk_tolerance",
    title: "위험 감수도",
    description: "결정할 때 안정과 도전 중 어디에 가까운가요?",
    leftLabel: "매우 안전 추구",
    rightLabel: "매우 도전적",
  },
  {
    key: "time_orientation",
    title: "시간 지향성",
    description: "지금의 보상과 먼 미래의 가치 중 무엇을 더 보세요?",
    leftLabel: "단기 보상 우선",
    rightLabel: "장기 가치 우선",
  },
  {
    key: "change_openness",
    title: "변화 수용도",
    description: "익숙한 길과 새로운 길 중 어느 쪽이 편한가요?",
    leftLabel: "보수적",
    rightLabel: "진취적",
  },
  {
    key: "analytical_intuitive",
    title: "분석 vs 직관",
    description: "결정을 내릴 때 데이터/이유를 따지는 편인가요, 느낌을 따르는 편인가요?",
    leftLabel: "직관형",
    rightLabel: "분석형",
  },
  {
    key: "self_others",
    title: "자기 vs 타인",
    description: "이 결정의 결과를 누가 받는지 평소 어디까지 고려하세요?",
    leftLabel: "자기 중심",
    rightLabel: "타인 고려",
  },
];

const DEFAULT: Record<Axis["key"], number> = {
  risk_tolerance: 2.5,
  time_orientation: 2.5,
  change_openness: 2.5,
  analytical_intuitive: 2.5,
  self_others: 2.5,
};

export function OnboardingTendencyForm({ next }: { next: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<Axis["key"], number>>(DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function update(key: Axis["key"], v: number) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function submit(skip: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = skip
        ? Object.fromEntries(AXES.map((a) => [a.key, 2.5]))
        : values;
      const res = await fetch("/api/onboarding/tendency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, skip }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "저장에 실패했어요.");
      }
      startTransition(() => {
        router.replace(next);
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했어요.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {AXES.map((a) => (
        <div key={a.key} className="rounded-md border bg-background p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{a.title}</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {values[a.key].toFixed(1)} / 5
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
          <div className="mt-3">
            <Slider
              min={0}
              max={5}
              step={0.5}
              value={[values[a.key]]}
              onValueChange={(v) => update(a.key, v[0] ?? 2.5)}
              disabled={busy || pending}
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{a.leftLabel}</span>
              <span>{a.rightLabel}</span>
            </div>
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        잘 모르겠으면 중간(2.5)에 두세요. 설정에서 언제든 다시 바꿀 수 있어요.
      </p>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          onClick={() => submit(true)}
          disabled={busy || pending}
        >
          건너뛰기 (모두 중립)
        </Button>
        <Button onClick={() => submit(false)} disabled={busy || pending}>
          {busy || pending ? "저장 중…" : "저장하고 시작"}
        </Button>
      </div>
    </div>
  );
}
