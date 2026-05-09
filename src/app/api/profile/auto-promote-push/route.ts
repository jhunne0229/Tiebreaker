// 첫 결정 후 자동 push 승격 (06_PHASE2_PRD.md §2.5)
// 조건: 사용자 notification_channel='email' && !notification_channel_locked
//       && 푸시 권한 이미 허용 + 구독 객체 전달.
// 결과: push_subscriptions 업서트 + profile.notification_channel='push' (locked=false 유지).
// locked 플래그는 사용자가 직접 변경한 적이 있을 때만 true. 자동 승격은 false 유지하여,
// 다음 사이클에 다시 자동 평가 가능하게 둠.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "유효한 구독 정보가 아니에요." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_channel, notification_channel_locked")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "프로필 없음." }, { status: 404 });
  }
  if (profile.notification_channel_locked) {
    return NextResponse.json({ promoted: false, reason: "locked" });
  }
  if (profile.notification_channel !== "email") {
    return NextResponse.json({
      promoted: false,
      reason: "already_promoted_or_off",
    });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { error: subErr } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
    },
    { onConflict: "user_id,endpoint" },
  );
  if (subErr) {
    return NextResponse.json(
      { error: "구독 저장 실패." },
      { status: 500 },
    );
  }

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ notification_channel: "push" })
    .eq("id", user.id);
  if (profErr) {
    return NextResponse.json(
      { error: "프로필 업데이트 실패." },
      { status: 500 },
    );
  }

  return NextResponse.json({ promoted: true });
}
