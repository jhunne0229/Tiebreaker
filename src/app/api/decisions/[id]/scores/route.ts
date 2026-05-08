import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface PatchBody {
  option_id?: string;
  criteria_id?: string;
  value?: number;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body || !body.option_id || !body.criteria_id || typeof body.value !== "number") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const value = Math.min(10, Math.max(1, Math.round(body.value)));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 결정 소유 검증
  const { data: decision } = await supabase
    .from("decisions")
    .select("id")
    .eq("id", decisionId)
    .maybeSingle();
  if (!decision) return NextResponse.json({ error: "찾을 수 없어요." }, { status: 404 });

  const { error } = await supabase
    .from("scores")
    .upsert(
      {
        option_id: body.option_id,
        criteria_id: body.criteria_id,
        value,
        ai_generated: false,
      },
      { onConflict: "option_id,criteria_id" },
    );

  if (error) {
    return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, value });
}
