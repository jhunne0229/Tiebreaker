// Service-role Supabase 클라이언트 — RLS를 우회하므로 cron / 시스템 작업에서만 사용.
// 절대 사용자 요청 흐름에 노출하지 말 것.
import { createClient as createBaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다.",
    );
  }
  return createBaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
