import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingTendencyForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingTendencyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const next = (from ?? "/").startsWith("/") ? from ?? "/" : "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/onboarding/tendency`);

  const { data: tendency } = await supabase
    .from("user_tendencies")
    .select("onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // 이미 완료한 사용자가 직접 URL 진입하면 다시 평가하기 흐름으로 사용 — 차단하지 않음
  const alreadyCompleted = Boolean(tendency?.onboarding_completed_at);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-xl rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <header className="mb-6">
          <h1 className="text-xl font-bold sm:text-2xl">
            잠깐, 당신의 결정 성향을 알려주세요
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            다섯 가지 축으로 자가 평가해주시면, 처음부터 당신 성향에 맞춘 추천
            점수를 보여드려요. 결정이 쌓일수록 실제 패턴으로 자연스럽게 보정됩니다.
          </p>
          {alreadyCompleted && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              이미 한 번 답하셨어요. 다시 답하시면 기존 누적 학습은 보존되고
              자가 평가값만 갱신됩니다.
            </p>
          )}
        </header>

        <OnboardingTendencyForm next={next} />
      </div>
    </main>
  );
}
