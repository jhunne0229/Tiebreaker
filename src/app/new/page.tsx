import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewDecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

export default async function NewDecisionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/new");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell user={profile ?? { name: null, email: user.email ?? "", avatar_url: null }}>
      <Card>
        <CardHeader>
          <CardTitle>새 결정 만들기</CardTitle>
          <CardDescription>
            결정 제목과 옵션만 적으면 AI가 장단점·비교표·SWOT을 한 번에 분석해드려요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewDecisionForm />
        </CardContent>
      </Card>
    </AppShell>
  );
}
