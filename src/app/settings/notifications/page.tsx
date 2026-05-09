import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { NotificationsView } from "./notifications-view";

export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings/notifications`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, avatar_url, notification_channel, notification_channel_locked")
    .eq("id", user.id)
    .maybeSingle();

  const channel = profile?.notification_channel ?? "email";
  const locked = profile?.notification_channel_locked ?? false;

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
          알림 설정
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          결정 후 1주 / 1개월 회고 알림을 어디로 받을지 선택하세요.
        </p>
      </header>

      <NotificationsView
        initialChannel={channel}
        initialLocked={locked}
        email={user.email ?? null}
      />
    </AppShell>
  );
}
