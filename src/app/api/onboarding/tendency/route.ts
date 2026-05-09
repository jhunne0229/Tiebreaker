// 온보딩 자가 평가 저장 (06_PHASE2_PRD.md §2.3.1)
// - 0–5 슬라이더 값을 (v - 2.5) / 2.5 로 -1~+1 매핑
// - onboarding_* 6개 필드 + 현재값 5개 동시 갱신
// - onboarding_completed_at = now()
// - decision_count는 보존 (다시 평가하기 흐름)
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const AXIS_KEYS = [
  "risk_tolerance",
  "time_orientation",
  "change_openness",
  "analytical_intuitive",
  "self_others",
] as const;

type AxisKey = (typeof AXIS_KEYS)[number];

interface Body {
  risk_tolerance?: number;
  time_orientation?: number;
  change_openness?: number;
  analytical_intuitive?: number;
  self_others?: number;
  skip?: boolean;
}

function mapToScaled(v: number): number {
  // 0–5 → -1~+1, clamp 안전망
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  const clamped = Math.max(0, Math.min(5, v));
  return Number(((clamped - 2.5) / 2.5).toFixed(4));
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const skip = Boolean(body.skip);

  const scaled: Record<AxisKey, number> = {
    risk_tolerance: 0,
    time_orientation: 0,
    change_openness: 0,
    analytical_intuitive: 0,
    self_others: 0,
  };
  for (const key of AXIS_KEYS) {
    scaled[key] = skip ? 0 : mapToScaled(body[key] ?? 2.5);
  }

  // user_tendencies는 트리거로 가입 시 1행 생성됨. 기존 사용자는 0003 백필로 보장.
  // 다시 평가하기 흐름이면 decision_count는 보존하고 onboarding_* + 현재값만 갱신.
  const { error } = await supabase
    .from("user_tendencies")
    .update({
      risk_tolerance: scaled.risk_tolerance,
      time_orientation: scaled.time_orientation,
      change_openness: scaled.change_openness,
      analytical_intuitive: scaled.analytical_intuitive,
      self_others: scaled.self_others,
      onboarding_risk_tolerance: scaled.risk_tolerance,
      onboarding_time_orientation: scaled.time_orientation,
      onboarding_change_openness: scaled.change_openness,
      onboarding_analytical_intuitive: scaled.analytical_intuitive,
      onboarding_self_others: scaled.self_others,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("user_tendencies update error", error);
    return NextResponse.json({ error: "저장에 실패했어요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
