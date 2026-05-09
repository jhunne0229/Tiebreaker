// 비교 기준 템플릿 관리 페이지 (06_PHASE2_PRD.md §2.7)
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { TemplatesView } from "./templates-view";
import type { CriteriaTemplateItem } from "@/types/database";

export const dynamic = "force-dynamic";

export interface TemplateRow {
  id: string;
  user_id: string | null;
  name: string;
  criteria: CriteriaTemplateItem[];
  is_system: boolean;
  created_at: string;
}

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings/templates`);

  const [{ data: profile }, { data: templates }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("criteria_templates")
      .select("id, user_id, name, criteria, is_system, created_at")
      .order("is_system", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const rows = (templates ?? []) as TemplateRow[];

  return (
    <AppShell
      user={profile ?? { name: null, email: user.email ?? "", avatar_url: null }}
    >
      <div className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          설정으로
        </Link>
      </div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
          비교 기준 템플릿
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          자주 쓰는 비교 기준 묶음을 저장하고 다음 결정에서 한 번에 불러올 수
          있어요. 시스템 기본 4종은 삭제할 수 없어요.
        </p>
      </header>
      <TemplatesView initial={rows} />
    </AppShell>
  );
}
