import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  const buildRedirect = (pathname: string, search = "") => {
    const u = new URL(url.toString());
    u.pathname = pathname;
    u.search = search;
    return u;
  };

  if (!code) {
    return NextResponse.redirect(buildRedirect("/login", "?error=missing_code"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      buildRedirect("/login", "?error=exchange_failed"),
    );
  }

  // 절대 경로 보장 (오픈 리다이렉트 방어)
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(buildRedirect(safeNext, ""));
}
