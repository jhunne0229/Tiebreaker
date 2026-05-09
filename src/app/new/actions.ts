"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshOptionLabels } from "@/lib/option-labels";
import { applyTendencyUpdate } from "@/lib/tendency/ewma";
import type { DecisionType } from "@/types/database";

const DECISION_TYPES: readonly DecisionType[] = [
  "daily",
  "career",
  "purchase",
  "relationship",
  "other",
];

interface ParsedOption {
  name: string;
  description: string | null;
}

export interface CreateDecisionState {
  error?: string;
}

function parseOptions(json: string): ParsedOption[] | null {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return null;
    const out: ParsedOption[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") return null;
      const name =
        typeof item.name === "string" ? item.name.trim().slice(0, 200) : "";
      if (!name) continue;
      const description =
        typeof item.description === "string" && item.description.trim()
          ? item.description.trim().slice(0, 500)
          : null;
      out.push({ name, description });
    }
    return out;
  } catch {
    return null;
  }
}

export async function createDecisionAction(
  _prev: CreateDecisionState,
  formData: FormData,
): Promise<CreateDecisionState> {
  const title = (formData.get("title")?.toString() ?? "").trim().slice(0, 200);
  const context =
    (formData.get("context")?.toString() ?? "").trim().slice(0, 4000) || null;
  const typeRaw = formData.get("type")?.toString() ?? "other";
  const type = (DECISION_TYPES as string[]).includes(typeRaw)
    ? (typeRaw as DecisionType)
    : "other";

  if (!title) {
    return { error: "제목을 입력해주세요" };
  }

  const options = parseOptions(formData.get("options")?.toString() ?? "[]");
  if (!options || options.length === 0) {
    return { error: "옵션을 1개 이상 입력해주세요" };
  }
  if (options.length > 8) {
    return { error: "옵션은 최대 8개까지 입력할 수 있어요" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다" };

  const { data: decision, error: decErr } = await supabase
    .from("decisions")
    .insert({
      user_id: user.id,
      title,
      context,
      type,
      tone: "logical",
      status: "open",
    })
    .select("id")
    .single();

  if (decErr || !decision) {
    console.error("[createDecisionAction] decisions insert failed:", decErr);
    return { error: "결정을 저장하지 못했어요. 잠시 후 다시 시도해주세요." };
  }

  const { error: optErr } = await supabase.from("options").insert(
    options.map((o, idx) => ({
      decision_id: decision.id,
      name: o.name,
      description: o.description,
      position: idx,
    })),
  );

  if (optErr) {
    await supabase.from("decisions").delete().eq("id", decision.id);
    return {
      error: "옵션 저장에 실패했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  // 라벨링 + EWMA 경향성 갱신은 응답 후 비동기 실행 (06_PHASE2_PRD.md §5.3, §2.3.3, §8 lazy throttle).
  // 실패해도 결정 자체는 유지. 누락된 라벨은 다음 결정 갱신 사이클에 lazy 보충.
  after(async () => {
    try {
      const bg = await createClient();
      await refreshOptionLabels(bg, decision.id, context);
      await applyTendencyUpdate(bg, user.id, decision.id, {
        decisionInserted: true,
      });
    } catch (e) {
      console.error("[createDecisionAction] after() background failed", e);
    }
  });

  redirect(`/decisions/${decision.id}`);
}
