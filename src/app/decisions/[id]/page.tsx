import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DecisionView } from "./decision-view";
import { DECISION_TYPE_LABELS } from "@/types/domain";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/decisions/${id}`);

  const [
    { data: profile },
    { data: decision },
    { data: options },
    { data: criteria },
    { data: scores },
    { data: prosCons },
    { data: swot },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("decisions").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("options")
      .select("*")
      .eq("decision_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("criteria")
      .select("*")
      .eq("decision_id", id)
      .order("position", { ascending: true }),
    supabase.from("scores").select("*"),
    supabase
      .from("pros_cons_items")
      .select("*")
      .eq("decision_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("swot_items")
      .select("*")
      .eq("decision_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!decision) notFound();

  // scores RLS는 join이 없어 전체 fetch — 클라에서 옵션ID로 필터
  const optionIds = new Set((options ?? []).map((o) => o.id));
  const filteredScores = (scores ?? []).filter((s) => optionIds.has(s.option_id));

  return (
    <AppShell user={profile ?? { name: null, email: user.email ?? "", avatar_url: null }}>
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          히스토리로
        </Link>
      </div>

      <header className="mb-6">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">
            {DECISION_TYPE_LABELS[decision.type]}
          </span>
          <span>·</span>
          <span>{formatDate(decision.created_at)}</span>
          {decision.status === "decided" && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
              결정 완료
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
          {decision.title}
        </h1>
        {decision.context && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {decision.context}
          </p>
        )}
      </header>

      <DecisionView
        decision={decision}
        options={options ?? []}
        criteria={criteria ?? []}
        scores={filteredScores}
        prosCons={prosCons ?? []}
        swot={swot ?? []}
      />
    </AppShell>
  );
}
