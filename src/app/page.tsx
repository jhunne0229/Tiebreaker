import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus, Search, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DECISION_TYPE_LABELS } from "@/types/domain";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  let query = supabase
    .from("decisions")
    .select(
      "id, title, context, type, status, final_choice_id, created_at, decided_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    // title 또는 context에 검색어 포함 — 간단한 ILIKE 매칭
    const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(`title.ilike.%${escaped}%,context.ilike.%${escaped}%`);
  }

  const { data: decisions } = await query;

  // 최종 선택된 옵션 이름 한 번에 가져오기
  const finalIds = (decisions ?? [])
    .map((d) => d.final_choice_id)
    .filter((x): x is string => Boolean(x));
  const finalNameMap = new Map<string, string>();
  if (finalIds.length > 0) {
    const { data: opts } = await supabase
      .from("options")
      .select("id, name")
      .in("id", finalIds);
    for (const o of opts ?? []) finalNameMap.set(o.id, o.name);
  }

  return (
    <AppShell user={profile ?? { name: null, email: user.email ?? "", avatar_url: null }}>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            결정 히스토리
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            지금까지 고민한 결정들이에요. 새로 시작하려면 우측 상단의 “새 결정”을 눌러주세요.
          </p>
        </div>
      </div>

      <form
        method="get"
        action="/"
        className="mb-4 flex items-center gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="제목·메모로 검색"
            className="pl-8"
            maxLength={100}
            aria-label="검색"
          />
        </div>
        {q && (
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            지우기
          </Link>
        )}
      </form>

      {!decisions || decisions.length === 0 ? (
        q ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              “{q}”에 해당하는 결정이 없어요.
            </CardContent>
          </Card>
        ) : (
          <EmptyState />
        )
      ) : (
        <ul className="space-y-2">
          {decisions.map((d) => (
            <li key={d.id}>
              <Link
                href={`/decisions/${d.id}`}
                className="group block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {DECISION_TYPE_LABELS[d.type]}
                      </span>
                      <span>·</span>
                      <span>{formatDate(d.created_at)}</span>
                      {d.status === "decided" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                          결정 완료
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                          진행 중
                        </span>
                      )}
                    </div>
                    <h2 className="truncate text-base font-semibold sm:text-lg">
                      {d.title}
                    </h2>
                    {d.final_choice_id && finalNameMap.has(d.final_choice_id) ? (
                      <p className="mt-1 text-sm text-emerald-700">
                        🏆 {finalNameMap.get(d.final_choice_id)}
                      </p>
                    ) : d.context ? (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {d.context}
                      </p>
                    ) : null}
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold">아직 결정이 없어요</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            고민 중인 선택지를 적어두면 AI가 장단점·비교표·SWOT을 한 번에 분석해드려요.
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />첫 결정 시작하기
        </Link>
      </CardContent>
    </Card>
  );
}
