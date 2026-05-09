// 서버 측 Web Push 발송 (06_PHASE2_PRD.md §2.5)
// VAPID 환경변수 누락 시 graceful skip — 빌드/배포가 깨지지 않게 한다.
// 호출자: cron 라우트.
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushSendResult {
  sent: number;
  removed: number;
  failed: number;
}

// userId 의 모든 구독에 푸시 발송. 410/404 응답 구독은 DB에서 제거.
export async function sendPushToUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, removed: 0, failed: 0 };
  if (!configure()) return result;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  const list = subs ?? [];
  if (list.length === 0) return result;

  const json = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    list.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          json,
        );
        result.sent++;
      } catch (err: unknown) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (status === 404 || status === 410) {
          stale.push(s.endpoint);
        } else {
          result.failed++;
          console.error("[push] send failed", err);
        }
      }
    }),
  );

  if (stale.length > 0) {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", stale);
    if (!error) result.removed = stale.length;
  }

  return result;
}
