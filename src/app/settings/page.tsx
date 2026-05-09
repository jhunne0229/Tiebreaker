import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bell, Compass, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

const ITEMS = [
  {
    href: "/settings/tendency",
    icon: Compass,
    title: "나의 결정 성향",
    desc: "5개 축으로 본 결정 패턴 (레이더 차트)",
  },
  {
    href: "/settings/notifications",
    icon: Bell,
    title: "알림 설정",
    desc: "회고 리마인더 채널 (이메일 / 푸시 / 둘 다 / 끄기)",
  },
  {
    href: "/settings/templates",
    icon: Layers,
    title: "비교 기준 템플릿",
    desc: "자주 쓰는 비교 기준 묶음 관리",
  },
];

export default async function SettingsIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settings`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell
      user={profile ?? { name: null, email: user.email ?? "", avatar_url: null }}
    >
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
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">설정</h1>
      </header>

      <ul className="space-y-2">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 sm:p-5"
              >
                <Icon className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1">
                  <h2 className="text-base font-semibold">{it.title}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {it.desc}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
