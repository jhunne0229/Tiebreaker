// 비교 기준 일괄 추가 (06_PHASE2_PRD.md §2.7)
// 결정 작성 직후 "템플릿에서 불러오기"가 호출. 기존 기준이 있으면 뒤에 append.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CriteriaTemplateItem } from "@/types/database";

export const runtime = "nodejs";

interface Body {
  template_id?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.template_id) {
    return NextResponse.json(
      { error: "template_id가 필요해요." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: decision } = await supabase
    .from("decisions")
    .select("id, user_id")
    .eq("id", decisionId)
    .maybeSingle();
  if (!decision)
    return NextResponse.json(
      { error: "결정을 찾을 수 없어요." },
      { status: 404 },
    );
  if (decision.user_id !== user.id)
    return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });

  // 템플릿 조회 (RLS가 시스템 + 본인 것만 허용)
  const { data: tpl } = await supabase
    .from("criteria_templates")
    .select("id, name, criteria")
    .eq("id", body.template_id)
    .maybeSingle();
  if (!tpl) {
    return NextResponse.json(
      { error: "템플릿을 찾을 수 없어요." },
      { status: 404 },
    );
  }

  const items = (tpl.criteria as unknown as CriteriaTemplateItem[]) ?? [];
  if (items.length === 0) {
    return NextResponse.json({ criteria: [] });
  }

  // 기존 마지막 position 확인 (append)
  const { data: existing } = await supabase
    .from("criteria")
    .select("position")
    .eq("decision_id", decisionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startPos = (existing?.position ?? -1) + 1;

  const rows = items.map((item, i) => ({
    decision_id: decisionId,
    name: item.name.slice(0, 100),
    weight: Math.min(5, Math.max(1, Math.round(item.weight))),
    position: startPos + i,
  }));

  const { data, error } = await supabase
    .from("criteria")
    .insert(rows)
    .select("id, decision_id, name, weight, position, created_at");

  if (error || !data) {
    return NextResponse.json(
      { error: "기준 추가에 실패했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ criteria: data });
}
