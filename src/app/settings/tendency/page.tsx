import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { TendencyView } from "./tendency-view";

export const dynamic = "force-dynamic";

export default async function SettingsTendencyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings/tendency`);

  const [{ data: profile }, { data: tendency }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_tendencies")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

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
          나의 결정 성향
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          5개 축으로 본 당신의 결정 패턴이에요. 결정이 쌓일수록 자가 평가값이
          실제 패턴으로 자연스럽게 보정됩니다.
        </p>
      </header>

      <TendencyView tendency={tendency ?? null} />
    </AppShell>
  );
}
