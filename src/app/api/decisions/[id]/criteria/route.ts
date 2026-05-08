import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface PostBody {
  name?: string;
  weight?: number;
}

interface PatchBody {
  id?: string;
  weight?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as PostBody | null;
  const name = body?.name?.trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: "기준 이름이 필요합니다." }, { status: 400 });
  const weight = Math.min(5, Math.max(1, Math.round(body?.weight ?? 3)));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: existing } = await supabase
    .from("criteria")
    .select("position")
    .eq("decision_id", decisionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (existing?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("criteria")
    .insert({ decision_id: decisionId, name, weight, position: nextPos })
    .select("id, name, weight, position, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "추가하지 못했어요." }, { status: 500 });
  }

  return NextResponse.json({ criteria: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body?.id || typeof body.weight !== "number") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const weight = Math.min(5, Math.max(1, Math.round(body.weight)));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase
    .from("criteria")
    .update({ weight })
    .eq("id", body.id)
    .eq("decision_id", decisionId);

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
  const url = new URL(request.url);
  const criteriaId = url.searchParams.get("criteria_id");
  if (!criteriaId)
    return NextResponse.json({ error: "criteria_id가 필요합니다." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await supabase
    .from("criteria")
    .delete()
    .eq("id", criteriaId)
    .eq("decision_id", decisionId);
  if (error) {
    return NextResponse.json({ error: "삭제하지 못했어요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
