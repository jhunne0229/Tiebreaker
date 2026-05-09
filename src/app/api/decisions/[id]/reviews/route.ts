// 회고 API (06_PHASE2_PRD.md §2.4)
// POST: 별점 + 자유 메모 저장 → 응답 후 EWMA(reviewInserted, reviewRating) 갱신
// GET: 결정의 회고 목록 (최신순)
// trigger 기본 'manual'. week_1/month_1 은 추후 cron job에서 호출.
import { NextResponse, type NextRequest, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyTendencyUpdate } from "@/lib/tendency/ewma";
import type { ReviewTrigger } from "@/types/database";

export const runtime = "nodejs";

interface PostBody {
  rating?: number;
  reflection?: string | null;
  trigger?: ReviewTrigger;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const body = (await request.json().catch(() => null)) as PostBody | null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "별점은 1~5 사이 정수여야 해요." },
      { status: 400 },
    );
  }
  const reflection = (body?.reflection ?? "").trim().slice(0, 2000) || null;
  const trigger: ReviewTrigger = body?.trigger ?? "manual";

  // 결정이 본인 것인지 + decided 상태인지 확인.
  const { data: decision } = await supabase
    .from("decisions")
    .select("id, user_id, status")
    .eq("id", decisionId)
    .maybeSingle();

  if (!decision)
    return NextResponse.json(
      { error: "결정을 찾을 수 없어요." },
      { status: 404 },
    );
  if (decision.user_id !== user.id)
    return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
  if (decision.status !== "decided")
    return NextResponse.json(
      { error: "최종 선택 후에 회고를 작성할 수 있어요." },
      { status: 400 },
    );

  const { data: review, error } = await supabase
    .from("reviews")
    .insert({
      decision_id: decisionId,
      rating,
      reflection,
      trigger,
    })
    .select("id, decision_id, reviewed_at, rating, reflection, trigger, created_at")
    .single();

  if (error || !review) {
    return NextResponse.json(
      { error: "회고를 저장하지 못했어요." },
      { status: 500 },
    );
  }

  // EWMA 갱신 — review_count++, satisfaction_bias 보정. 응답 후 비동기.
  after(async () => {
    try {
      const bg = await createClient();
      await applyTendencyUpdate(bg, user.id, decisionId, {
        reviewInserted: true,
        reviewRating: rating,
      });
    } catch (e) {
      console.error("[reviews] after() ewma failed", e);
    }
  });

  return NextResponse.json({ review });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: decisionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await supabase
    .from("reviews")
    .select("id, decision_id, reviewed_at, rating, reflection, trigger, created_at")
    .eq("decision_id", decisionId)
    .order("reviewed_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "회고를 불러오지 못했어요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ reviews: data ?? [] });
}
