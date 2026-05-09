import "server-only";

// Option.ai_labels 갱신 서버 유틸 (06_PHASE2_PRD.md §5.3, §3.2)
// - 옵션 텍스트(name + description) 해시를 함께 저장해, 변경 시에만 재호출.
// - 결정 저장 시 백그라운드 호출. 실패해도 결정 자체는 유지 (silent log).
import { getAnthropic, CLAUDE_MODEL } from "@/lib/claude";
import {
  OPTION_LABELS_TOOL_NAME,
  OPTION_LABELS_TOOL_INPUT_SCHEMA,
  buildOptionLabelsSystemPrompt,
  type OptionLabel,
} from "@/lib/prompts/option-labels";
import { sanitizeForAI, wrapUserContent } from "@/lib/sanitize";
import { sha256Hex } from "@/lib/hash";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbClient = SupabaseClient<Database>;

interface OptionRow {
  id: string;
  name: string;
  description: string | null;
  ai_labels: unknown;
}

interface CachedLabels {
  risk_label?: string;
  change_label?: string;
  time_label?: string;
  text_hash?: string;
}

function textHash(name: string, description: string | null): string {
  return sha256Hex(JSON.stringify({ n: name, d: description ?? "" }));
}

interface RawLabel {
  option_id?: string;
  risk_label?: string;
  change_label?: string;
  time_label?: string;
}

const RISK = new Set(["predictable", "uncertain"]);
const CHANGE = new Set(["status_quo", "change"]);
const TIME = new Set(["short", "long"]);

function isValidLabel(it: RawLabel): it is Required<RawLabel> {
  return (
    typeof it.option_id === "string" &&
    typeof it.risk_label === "string" &&
    RISK.has(it.risk_label) &&
    typeof it.change_label === "string" &&
    CHANGE.has(it.change_label) &&
    typeof it.time_label === "string" &&
    TIME.has(it.time_label)
  );
}

/**
 * 결정의 옵션 중 ai_labels가 비어있거나 텍스트 해시가 다른 옵션만 다시 라벨링.
 * 실패 시 console.error만 남기고 throw하지 않음 (호출 측에서 결정 저장은 유지).
 */
export async function refreshOptionLabels(
  supabase: DbClient,
  decisionId: string,
  context: string | null,
): Promise<void> {
  const { data: options } = await supabase
    .from("options")
    .select("id, name, description, ai_labels")
    .eq("decision_id", decisionId);

  const optionList = (options ?? []) as OptionRow[];
  if (optionList.length === 0) return;

  const stale = optionList.filter((o) => {
    const cached = (o.ai_labels ?? null) as CachedLabels | null;
    if (!cached || !cached.risk_label) return true;
    return cached.text_hash !== textHash(o.name, o.description);
  });
  if (stale.length === 0) return;

  const safeOptions = stale.map((o) => ({
    id: o.id,
    name: sanitizeForAI(o.name),
    description: sanitizeForAI(o.description ?? ""),
  }));

  const userMessage = `다음 결정의 옵션들을 라벨링해주세요.\n\n${wrapUserContent(
    JSON.stringify(
      {
        decision_context: sanitizeForAI(context ?? ""),
        options: safeOptions,
      },
      null,
      2,
    ),
  )}\n\n반드시 ${OPTION_LABELS_TOOL_NAME} 도구로 모든 옵션을 한 번에 라벨링하세요.`;

  let labelsByOption: Record<string, OptionLabel> = {};
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: buildOptionLabelsSystemPrompt(),
      tools: [
        {
          name: OPTION_LABELS_TOOL_NAME,
          description: "옵션별 risk/change/time 라벨을 제출합니다.",
          input_schema: OPTION_LABELS_TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: OPTION_LABELS_TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });

    let items: RawLabel[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === OPTION_LABELS_TOOL_NAME) {
        const input = block.input as { labels?: unknown };
        items = Array.isArray(input.labels) ? (input.labels as RawLabel[]) : [];
        break;
      }
    }

    for (const it of items) {
      if (!isValidLabel(it)) continue;
      labelsByOption[it.option_id] = {
        risk_label: it.risk_label as OptionLabel["risk_label"],
        change_label: it.change_label as OptionLabel["change_label"],
        time_label: it.time_label as OptionLabel["time_label"],
      };
    }
  } catch (err) {
    console.error("[option-labels] anthropic call failed", err);
    return;
  }

  // 옵션별 UPDATE — Supabase는 다중 행 upsert가 가능하지만 옵션마다 ai_labels JSONB만 갱신하면 되므로 개별 update.
  await Promise.all(
    stale.map(async (o) => {
      const lab = labelsByOption[o.id];
      if (!lab) return;
      const payload = {
        ...lab,
        text_hash: textHash(o.name, o.description),
        labeled_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("options")
        .update({ ai_labels: payload })
        .eq("id", o.id);
      if (error) {
        console.error("[option-labels] update failed for", o.id, error);
      }
    }),
  );
}
