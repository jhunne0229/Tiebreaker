"use client";

// 회고 섹션 (06_PHASE2_PRD.md §2.4)
// 결정 status === "decided" 일 때만 노출.
// 1~5 별점 + 자유 메모(최대 2000자) → POST /api/decisions/[id]/reviews
// 회고 1개당 EWMA satisfaction_bias 갱신은 서버 after()에서.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";
import type { Review } from "@/types/domain";

interface Props {
  decisionId: string;
  initialReviews: Review[];
}

const TRIGGER_LABELS: Record<Review["trigger"], string> = {
  manual: "수동",
  week_1: "1주차",
  month_1: "1개월차",
};

export function ReviewSection({ decisionId, initialReviews }: Props) {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display = hover || rating;

  async function submit() {
    if (rating < 1) {
      setError("별점을 먼저 선택해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          reflection: reflection.trim() || null,
        }),
      });
      const j = (await res.json()) as { review?: Review; error?: string };
      if (!res.ok || !j.review)
        throw new Error(j.error ?? "회고 저장에 실패했어요.");
      setReviews((prev) => [j.review!, ...prev]);
      setRating(0);
      setHover(0);
      setReflection("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "회고 저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">회고</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        결정 후 결과가 어땠는지 짧게 남겨주세요. 다음 결정의 가중치에
        반영돼요.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            만족도 (1~5)
          </label>
          <div
            className="flex items-center gap-1"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}점`}
                disabled={busy}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                className="rounded p-1 text-amber-500 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Star
                  className={cn(
                    "h-6 w-6 transition-colors",
                    n <= display ? "fill-current" : "fill-transparent",
                  )}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                {rating} / 5
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            메모 (선택, 최대 2000자)
          </label>
          <Textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            maxLength={2000}
            rows={3}
            disabled={busy}
            placeholder="예: 통근 시간 줄이는 건 진짜 효과 있었음. 다만 연봉이 생각보다 발목 잡음."
          />
          <p className="text-right text-xs text-muted-foreground">
            {reflection.length} / 2000
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={submit} disabled={busy || rating < 1}>
          {busy ? "저장 중…" : "회고 저장"}
        </Button>
      </div>

      {reviews.length > 0 && (
        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-semibold">지난 회고 ({reviews.length})</h3>
          <ul className="mt-3 space-y-3">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-md border bg-muted/30 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-amber-500">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn(
                          "h-4 w-4",
                          n <= r.rating ? "fill-current" : "fill-transparent",
                        )}
                      />
                    ))}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {r.rating} / 5
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="rounded-full bg-background px-2 py-0.5">
                      {TRIGGER_LABELS[r.trigger]}
                    </span>
                    <span className="ml-2">{formatDate(r.reviewed_at)}</span>
                  </div>
                </div>
                {r.reflection && (
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {r.reflection}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
