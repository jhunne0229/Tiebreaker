// 본인 템플릿 삭제 (시스템 템플릿은 RLS로 차단).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase
    .from("criteria_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_system", false);

  if (error) {
    return NextResponse.json(
      { error: "삭제하지 못했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
