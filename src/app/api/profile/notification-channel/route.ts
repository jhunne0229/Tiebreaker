// 알림 채널 설정 (06_PHASE2_PRD.md §2.5)
// PATCH: { channel } 저장. 사용자가 직접 변경하면 notification_channel_locked=true 로 잠금
// (이후 첫 결정 후 자동 push 승격 정지).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { NotificationChannel } from "@/types/database";

export const runtime = "nodejs";

const ALLOWED: NotificationChannel[] = ["email", "push", "both", "off"];

interface Body {
  channel?: NotificationChannel;
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const channel = body?.channel;
  if (!channel || !ALLOWED.includes(channel)) {
    return NextResponse.json(
      { error: "유효한 알림 채널이 아니에요." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase
    .from("profiles")
    .update({
      notification_channel: channel,
      notification_channel_locked: true,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "저장하지 못했어요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, channel });
}
