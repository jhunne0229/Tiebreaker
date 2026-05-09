// AI 호출 일일 한도 체크 (06_PHASE2_PRD.md §8: 사용자별 일 30회 cap, 자정 리셋 X — rolling 24h)
// Phase 1은 20회였으나 Phase 2부터 30회로 상향. 환경변수 DAILY_ANALYSIS_LIMIT로 override 가능.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const DAILY_LIMIT =
  Number(process.env.DAILY_ANALYSIS_LIMIT ?? "30") || 30;

export async function isDailyLimitReached(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("analysis_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "success")
    .gte("created_at", since);
  return (count ?? 0) >= DAILY_LIMIT;
}

export const DAILY_LIMIT_MESSAGE = `오늘의 AI 분석 한도(${DAILY_LIMIT}회)를 다 썼어요. 잠시 후 다시 시도해주세요.`;
