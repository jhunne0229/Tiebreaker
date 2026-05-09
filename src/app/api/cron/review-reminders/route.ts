// 회고 알림 cron (06_PHASE2_PRD.md §2.5)
// Vercel Cron 으로 매일 1회 호출. service role 로 실행.
// 발송 대상:
//   - decisions.status = 'decided'
//   - 회고 알림이 아직 발송되지 않았거나 (week_1) 또는 1차 알림 후 30일 분량 지남 (month_1)
//   - decided_at 이후 reviews 행이 없음 (이미 회고가 있으면 skip)
//   - profile.notification_channel ≠ 'off'
// 보호: Authorization: Bearer <CRON_SECRET> 헤더 검사. Vercel Cron 이 자동 주입.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToUser } from "@/lib/push";
import { sendEmail, buildReviewReminderEmail } from "@/lib/email";
import type { NotificationChannel } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

// 1차(week_1): decided_at + 7일 ~ + 14일 사이에 last_alert 없음
// 2차(month_1): decided_at + 30일 ~ + 60일 사이에 last_alert가 1차 발송 시점
const DAY = 24 * 60 * 60 * 1000;

interface CandidateRow {
  id: string;
  user_id: string;
  title: string;
  decided_at: string;
  final_choice_id: string | null;
  last_review_alert_at: string | null;
}

interface ResultSummary {
  considered: number;
  sent: number;
  skipped_no_channel: number;
  skipped_has_review: number;
  errors: number;
}

export async function GET(request: NextRequest) {
  const authz = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET 미설정" },
      { status: 500 },
    );
  }
  if (authz !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://tiebreaker-weld.vercel.app";
  const now = Date.now();

  const summary: ResultSummary = {
    considered: 0,
    sent: 0,
    skipped_no_channel: 0,
    skipped_has_review: 0,
    errors: 0,
  };

  // week_1 후보: decided 7~14일 전 + last_review_alert_at IS NULL
  const week1FromIso = new Date(now - 14 * DAY).toISOString();
  const week1ToIso = new Date(now - 7 * DAY).toISOString();
  // month_1 후보: decided 30~60일 전 + last_review_alert_at NOT NULL (즉 week_1 발송됨)
  const month1FromIso = new Date(now - 60 * DAY).toISOString();
  const month1ToIso = new Date(now - 30 * DAY).toISOString();

  const [week1, month1] = await Promise.all([
    supabase
      .from("decisions")
      .select("id, user_id, title, decided_at, final_choice_id, last_review_alert_at")
      .eq("status", "decided")
      .is("last_review_alert_at", null)
      .gte("decided_at", week1FromIso)
      .lte("decided_at", week1ToIso),
    supabase
      .from("decisions")
      .select("id, user_id, title, decided_at, final_choice_id, last_review_alert_at")
      .eq("status", "decided")
      .not("last_review_alert_at", "is", null)
      .gte("decided_at", month1FromIso)
      .lte("decided_at", month1ToIso),
  ]);

  const week1Rows = ((week1.data ?? []) as CandidateRow[]).filter(
    (r) => r.decided_at,
  );
  const month1Raw = (month1.data ?? []) as CandidateRow[];
  // month_1 은 last_review_alert_at 이 1차(week_1) 시점으로 박힌 것만 — 이미 month_1 발송된 것은 제외.
  // 1차 발송 시점은 보통 decided_at + 7~14d 안. month_1 발송 시점은 decided_at + 30d 이후.
  // 같은 행을 두 번 보내지 않으려면 last_review_alert_at < decided_at + 21d 인지 확인.
  const month1Rows = month1Raw.filter((r) => {
    if (!r.last_review_alert_at || !r.decided_at) return false;
    const decided = new Date(r.decided_at).getTime();
    const alert = new Date(r.last_review_alert_at).getTime();
    return alert < decided + 21 * DAY;
  });

  const candidates: Array<{ row: CandidateRow; trigger: "week_1" | "month_1" }> =
    [
      ...week1Rows.map((row) => ({ row, trigger: "week_1" as const })),
      ...month1Rows.map((row) => ({ row, trigger: "month_1" as const })),
    ];

  summary.considered = candidates.length;
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, summary });
  }

  // 회고 존재 여부 일괄 확인
  const decisionIds = candidates.map((c) => c.row.id);
  const { data: existingReviews } = await supabase
    .from("reviews")
    .select("decision_id")
    .in("decision_id", decisionIds);
  const reviewedSet = new Set(
    (existingReviews ?? []).map((r) => r.decision_id),
  );

  // 사용자별 프로필 + 옵션 이름 묶음
  const userIds = Array.from(new Set(candidates.map((c) => c.row.user_id)));
  const finalChoiceIds = candidates
    .map((c) => c.row.final_choice_id)
    .filter((x): x is string => Boolean(x));

  const [profilesRes, optionsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email, notification_channel")
      .in("id", userIds),
    finalChoiceIds.length > 0
      ? supabase.from("options").select("id, name").in("id", finalChoiceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const profileMap = new Map<
    string,
    {
      name: string | null;
      email: string;
      notification_channel: NotificationChannel;
    }
  >();
  for (const p of profilesRes.data ?? []) {
    profileMap.set(p.id, {
      name: p.name,
      email: p.email,
      notification_channel: p.notification_channel,
    });
  }
  const optionNameMap = new Map<string, string>();
  for (const o of optionsRes.data ?? []) optionNameMap.set(o.id, o.name);

  // 발송
  for (const { row, trigger } of candidates) {
    if (reviewedSet.has(row.id)) {
      summary.skipped_has_review++;
      continue;
    }
    const profile = profileMap.get(row.user_id);
    if (!profile || profile.notification_channel === "off") {
      summary.skipped_no_channel++;
      continue;
    }
    const channel = profile.notification_channel;
    const decisionUrl = `${baseUrl}/decisions/${row.id}`;
    const finalChoiceName = row.final_choice_id
      ? optionNameMap.get(row.final_choice_id) ?? null
      : null;

    let any = false;

    try {
      if (channel === "push" || channel === "both") {
        const r = await sendPushToUser(supabase, row.user_id, {
          title:
            trigger === "week_1"
              ? "그 결정 어땠나요?"
              : "한 달이 지났어요",
          body: `"${row.title}" 회고를 남겨주세요.`,
          url: `/decisions/${row.id}`,
          tag: `review-${row.id}-${trigger}`,
        });
        if (r.sent > 0) any = true;
      }
      if (channel === "email" || channel === "both") {
        const mail = buildReviewReminderEmail({
          userName: profile.name,
          decisionTitle: row.title,
          finalChoiceName,
          trigger,
          decisionUrl,
        });
        const ok = await sendEmail({
          to: profile.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        if (ok) any = true;
      }
    } catch (e) {
      console.error("[cron] send failed", row.id, e);
      summary.errors++;
      continue;
    }

    if (any) {
      summary.sent++;
      // 발송 성공 시 last_review_alert_at 갱신.
      await supabase
        .from("decisions")
        .update({ last_review_alert_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({ ok: true, summary });
}
