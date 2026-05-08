import Link from "next/link";
import { LoginButton } from "./login-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-3xl font-bold tracking-tight">
            🎯 타이브레이커
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            결정 못 내릴 때, AI가 장단점·비교표·SWOT을 한 번에.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            로그인 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.
          </div>
        )}

        <LoginButton next={next} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Google 계정으로 1초 로그인. 가입 절차는 따로 없습니다.
        </p>
      </div>
    </main>
  );
}
