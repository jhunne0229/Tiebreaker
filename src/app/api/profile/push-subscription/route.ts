// 푸시 구독 등록/해제 (06_PHASE2_PRD.md §2.5)
// POST: 클라이언트가 PushManager.subscribe() 결과를 보내 등록.
// DELETE { endpoint }: 해당 endpoint 구독 제거.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface PostBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

interface DeleteBody {
  endpoint?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as PostBody | null;
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

  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    return NextResponse.json(
      { error: "구독을 저장하지 못했어요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as DeleteBody | null;
  const endpoint = body?.endpoint;
  if (!endpoint) {
    return NextResponse.json(
      { error: "endpoint가 필요해요." },
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
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json(
      { error: "구독을 해제하지 못했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
