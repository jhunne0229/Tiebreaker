import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// PROJECT_SPEC: ANTHROPIC_API_KEY는 서버에서만, 클라이언트 노출 금지
let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export const CLAUDE_MODEL = "claude-sonnet-4-6";
