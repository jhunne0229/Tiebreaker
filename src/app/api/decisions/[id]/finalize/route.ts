import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  final_choice_id?: string | null;
  final_note?: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const finalChoiceId = body?.final_choice_id ?? null;
  const finalNote = (body?.final_note ?? "").trim().slice(0, 500) || null;

  // final_choice_id가 들어왔다면 이 결정의 옵션인지 확인
  if (finalChoiceId) {
    const { data: opt } = await supabase
      .from("options")
      .select("id")
      .eq("id", finalChoiceId)
      .eq("decision_id", decisionId)
      .maybeSingle();
    if (!opt) {
      return NextResponse.json({ error: "옵션을 찾을 수 없어요." }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from("decisions")
    .update({
      final_choice_id: finalChoiceId,
      final_note: finalNote,
      status: finalChoiceId ? "decided" : "open",
      decided_at: finalChoiceId ? new Date().toISOString() : null,
    })
    .eq("id", decisionId);

  if (error) {
    return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase
    .from("decisions")
    .delete()
    .eq("id", decisionId);
  if (error) {
    return NextResponse.json({ error: "삭제하지 못했어요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
