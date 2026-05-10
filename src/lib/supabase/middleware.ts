import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/signout"];

// 온보딩 미완료여도 통과하는 경로 (자기 자신 + API + 인증 + 정적 자산)
function shouldSkipOnboardingGate(pathname: string): boolean {
  return (
    pathname.startsWith("/onboarding/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname === "/login" ||
    pathname.startsWith("/share/") // 공유 링크는 비로그인도 진입 가능 — 온보딩 게이트도 면제
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 토큰 갱신 — 반드시 호출해야 세션이 살아 있음
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 온보딩 자가 평가 게이트 — 로그인 사용자만, 면제 경로 외에서 적용 (06_PHASE2_PRD.md §2.3.1)
  if (user && !shouldSkipOnboardingGate(pathname)) {
    const { data: tendency } = await supabase
      .from("user_tendencies")
      .select("onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!tendency?.onboarding_completed_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/tendency";
      url.search = "";
      if (pathname !== "/") {
        url.searchParams.set("from", pathname);
      }
      return NextResponse.redirect(url);
    }
  }

  return response;
}
