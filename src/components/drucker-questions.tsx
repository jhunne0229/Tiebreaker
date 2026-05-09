"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DRUCKER_QUESTIONS } from "@/lib/prompts/drucker";
import type { DruckerAnswer } from "@/types/domain";
import type { DruckerQuestion } from "@/types/database";

const QUESTIONS_BY_KEY = Object.fromEntries(
  DRUCKER_QUESTIONS.map((q) => [q.key, q]),
) as Record<DruckerQuestion, (typeof DRUCKER_QUESTIONS)[number]>;

export function DruckerQuestionsForm({
  decisionId,
  initialAnswers,
}: {
  decisionId: string;
  initialAnswers: DruckerAnswer[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<
    Record<DruckerQuestion, { ai_draft: string; user_answer: string }>
  >(() => {
    const map: Record<string, { ai_draft: string; user_answer: string }> = {};
    for (const q of DRUCKER_QUESTIONS) {
      const existing = initialAnswers.find((a) => a.question === q.key);
      map[q.key] = {
        ai_draft: existing?.ai_draft ?? "",
        user_answer: existing?.user_answer ?? "",
      };
    }
    return map as Record<
      DruckerQuestion,
      { ai_draft: string; user_answer: string }
    >;
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const triggeredRef = useRef(false);

  const hasAnyDraft = Object.values(answers).some((a) => a.ai_draft);

  // 탭 진입 시 lazy 생성: 어떤 질문에도 ai_draft 없으면 1회 호출
  useEffect(() => {
    if (triggeredRef.current) return;
    if (hasAnyDraft) return;
    triggeredRef.current = true;
    void runGenerate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runGenerate(force: boolean) {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/drucker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const j = (await res.json()) as { error?: string; generated?: boolean };
      if (!res.ok) throw new Error(j.error ?? "생성 실패");
      if (j.generated) {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {generating ? (
          <Button variant="outline" disabled>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
            AI가 초안 작성 중…
          </Button>
        ) : !hasAnyDraft ? (
          <Button onClick={() => runGenerate(false)}>
            <Sparkles className="h-4 w-4" />
            AI로 초안 만들기
          </Button>
        ) : (
          <Button variant="outline" onClick={() => runGenerate(true)}>
            <RefreshCw className="h-4 w-4" />
            AI 초안 다시 만들기
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          AI 초안은 출발점일 뿐이에요. 본인 답변으로 다듬어주세요.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1 text-sm font-semibold text-foreground">
          왜 드러커 5질문인가요?
        </p>
        <p>
          경영학자 피터 드러커가 조직과 개인 모두에게 던진 자기 점검 질문입니다.
          장단점이나 SWOT처럼 선택지를 비교하는 게 아니라, <span className="font-medium text-foreground">결정 그 자체의 본질</span>—
          내가 왜 이걸 하려는지, 누구를 위한 것인지, 어떤 결과가 의미 있는지를 한 발 물러서서 묻습니다.
        </p>
        <p className="mt-1.5">
          표면적인 비교 너머의 진짜 동기와 가치를 짚어보는 데 도움이 돼요. AI 초안은 출발점일 뿐이니,
          본인 언어로 다시 써보면서 결정 근육을 키워보세요.
        </p>
      </div>

      <div className="space-y-3">
        {DRUCKER_QUESTIONS.map((q, i) => (
          <QuestionCard
            key={q.key}
            decisionId={decisionId}
            index={i + 1}
            question={q.key}
            label={QUESTIONS_BY_KEY[q.key].label}
            full={QUESTIONS_BY_KEY[q.key].full}
            aiDraft={answers[q.key].ai_draft}
            userAnswer={answers[q.key].user_answer}
            onUserAnswerChange={(v) =>
              setAnswers((prev) => ({
                ...prev,
                [q.key]: { ...prev[q.key], user_answer: v },
              }))
            }
          />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({
  decisionId,
  index,
  question,
  label,
  full,
  aiDraft,
  userAnswer,
  onUserAnswerChange,
}: {
  decisionId: string;
  index: number;
  question: DruckerQuestion;
  label: string;
  full: string;
  aiDraft: string;
  userAnswer: string;
  onUserAnswerChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(userAnswer);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 외부 변경 (재생성 등) 반영
  useEffect(() => {
    setDraft(userAnswer);
  }, [userAnswer]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/drucker`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          user_answer: draft,
        }),
      });
      if (res.ok) {
        onUserAnswerChange(draft);
        setSavedAt(Date.now());
      }
    } finally {
      setBusy(false);
    }
  }

  const dirty = draft !== userAnswer;

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-2">
        <div className="text-xs text-muted-foreground">질문 {index}</div>
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{full}</p>
      </div>

      {aiDraft && (
        <div className="mb-2 rounded-md border border-dashed bg-muted/40 p-2.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            AI 초안
          </div>
          <p className="whitespace-pre-wrap text-xs leading-snug text-foreground">
            {aiDraft}
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
          내 답변
        </label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          placeholder="AI 초안을 참고해서 본인 답변을 적어주세요."
          className="min-h-[80px] text-sm"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {draft.length}/2000
          </span>
          <div className="flex items-center gap-2">
            {savedAt && !dirty && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                <Check className="h-3 w-3" />
                저장됨
              </span>
            )}
            <Button
              size="sm"
              onClick={save}
              disabled={busy || !dirty}
              variant={dirty ? "default" : "outline"}
            >
              저장
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
