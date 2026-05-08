import Link from "next/link";
import { Plus, LogOut } from "lucide-react";

interface AppShellProps {
  user?: { name: string | null; email: string; avatar_url: string | null };
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span aria-hidden>🎯</span>
            <span>타이브레이커</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/new"
              className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">새 결정</span>
            </Link>
            {user && (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  aria-label="로그아웃"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
