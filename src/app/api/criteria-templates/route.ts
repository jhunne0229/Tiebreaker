// 비교 기준 템플릿 CRUD (06_PHASE2_PRD.md §2.7)
// GET: 시스템 기본 + 본인 템플릿 (RLS가 자연스럽게 처리).
// POST: 본인 템플릿 생성. 기준 배열 + 이름.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CriteriaTemplateItem } from "@/types/database";

export const runtime = "nodejs";

interface PostBody {
  name?: string;
  criteria?: Array<{ name?: unknown; weight?: unknown }>;
}

function sanitizeCriteria(input: PostBody["criteria"]): CriteriaTemplateItem[] | null {
  if (!Array.isArray(input)) return null;
  const out: CriteriaTemplateItem[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 100) : "";
    if (!name) continue;
    const weightNum = Number(item.weight);
    const weight = Number.isFinite(weightNum)
      ? Math.min(5, Math.max(1, Math.round(weightNum)))
      : 3;
    out.push({ name, weight });
  }
  return out.length > 0 ? out : null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await supabase
    .from("criteria_templates")
    .select("id, user_id, name, criteria, is_system, created_at")
    .order("is_system", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "템플릿을 불러오지 못했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as PostBody | null;
  const name = body?.name?.trim().slice(0, 100);
  if (!name) {
    return NextResponse.json(
      { error: "템플릿 이름을 입력해주세요." },
      { status: 400 },
    );
  }
  const criteria = sanitizeCriteria(body?.criteria);
  if (!criteria) {
    return NextResponse.json(
      { error: "기준 1개 이상을 입력해주세요." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await supabase
    .from("criteria_templates")
    .insert({
      user_id: user.id,
      name,
      criteria,
      is_system: false,
    })
    .select("id, user_id, name, criteria, is_system, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "템플릿을 저장하지 못했어요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ template: data });
}
