// 이메일 발송 헬퍼 (06_PHASE2_PRD.md §2.5)
// RESEND_API_KEY / EMAIL_FROM 누락 시 graceful skip — 빌드 안 깨짐.
import { Resend } from "resend";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client = new Resend(key);
  return client;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  const from = process.env.EMAIL_FROM;
  if (!from) return false;
  try {
    const res = await c.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    if (res.error) {
      console.error("[email] resend error", res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed", e);
    return false;
  }
}

// 회고 알림 본문 생성기 — 1주차 / 1개월차 톤 분기.
export function buildReviewReminderEmail(args: {
  userName: string | null;
  decisionTitle: string;
  finalChoiceName: string | null;
  trigger: "week_1" | "month_1";
  decisionUrl: string;
}): { subject: string; html: string; text: string } {
  const greeting = args.userName ? `${args.userName}님,` : "안녕하세요,";
  const since = args.trigger === "week_1" ? "1주" : "1개월";
  const subject =
    args.trigger === "week_1"
      ? `'${args.decisionTitle}' — 그 결정 어땠나요?`
      : `'${args.decisionTitle}' — 한 달이 지났어요`;

  const choiceLine = args.finalChoiceName
    ? `선택: ${args.finalChoiceName}`
    : "";

  const text = [
    greeting,
    `${since} 전에 결정한 "${args.decisionTitle}" 기억나시죠?`,
    choiceLine,
    "",
    "지금 보면 어떤가요? 별점 1~5 + 한 줄 메모만 남겨주셔도 다음 결정 추천이 더 정확해집니다.",
    "",
    `회고 남기기: ${args.decisionUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;line-height:1.55;">
  <p>${greeting}</p>
  <p>${since} 전에 결정한 <strong>"${escapeHtml(args.decisionTitle)}"</strong> 기억나시죠?</p>
  ${args.finalChoiceName ? `<p style="color:#475569;">선택: <strong>${escapeHtml(args.finalChoiceName)}</strong></p>` : ""}
  <p>지금 보면 어떤가요? 별점 1~5 + 한 줄 메모만 남겨주셔도 다음 결정 추천이 더 정확해져요.</p>
  <p style="margin:24px 0;"><a href="${args.decisionUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">회고 남기러 가기</a></p>
  <p style="color:#94a3b8;font-size:12px;">알림이 부담스러우시면 설정 → 알림에서 끌 수 있어요.</p>
</body></html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
