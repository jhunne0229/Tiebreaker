// PROJECT_SPEC: 결정 데이터를 Anthropic에 보낼 때 사용자 PII를 마스킹
// 한국 휴대전화 / 일반 전화 / 이메일 / 주민번호(앞6+뒤7)

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}/g;
const RRN_RE = /\b\d{6}[- ]?\d{7}\b/g;
const CARD_RE = /\b(?:\d{4}[- ]?){3}\d{4}\b/g;

export function sanitizeForAI(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(RRN_RE, "[주민번호]")
    .replace(CARD_RE, "[카드번호]")
    .replace(EMAIL_RE, "[이메일]")
    .replace(PHONE_RE, (match) => {
      // 전화번호 룩처럼 보여도 짧은 숫자/연봉/금액은 통과시키기
      const digits = match.replace(/\D/g, "");
      if (digits.length < 9) return match;
      return "[전화번호]";
    });
}

// 시스템 프롬프트에서 사용자 입력을 명확히 격리 (프롬프트 인젝션 방어)
export function wrapUserContent(content: string): string {
  return `<user_input>\n${content}\n</user_input>`;
}
