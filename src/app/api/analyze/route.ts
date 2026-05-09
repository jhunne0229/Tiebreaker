import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CLAUDE_MODEL } from "@/lib/claude";
import {
  ANALYSIS_TOOL_NAME,
  ANALYSIS_TOOL_INPUT_SCHEMA,
  buildSystemPrompt,
} from "@/lib/prompts/analysis";
import { sanitizeForAI, wrapUserContent } from "@/lib/sanitize";
import { sha256Hex } from "@/lib/hash";
import type { AnalysisToolInput } from "@/types/domain";
import type { DecisionTone } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_TONES: DecisionTone[] = ["logical", "emotional", "blunt"];
const DAILY_LIMIT = Number(process.env.DAILY_ANALYSIS_LIMIT ?? "20") || 20;
const CACHE_TTL_HOURS = 24;

interface RequestBody {
  decision_id?: string;
  tone?: string;
  force_refresh?: boolean;
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const decisionId = body.decision_id;
  const tone = body.tone as DecisionTone | undefined;
  const forceRefresh = Boolean(body.force_refresh);

  if (!decisionId || typeof decisionId !== "string") {
    return NextResponse.json({ error: "decision_id가 필요합니다." }, { status: 400 });
  }
  if (!tone || !VALID_TONES.includes(tone)) {
    return NextResponse.json({ error: "지원되지 않는 톤입니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 결정 조회 (RLS로 본인 것만)
  const { data: decision } = await supabase
    .from("decisions")
    .select("id, title, context, type, user_id")
    .eq("id", decisionId)
    .maybeSingle();
  if (!decision) {
    return NextResponse.json(
      { error: "결정을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const { data: options } = await supabase
    .from("options")
    .select("id, name, description, position")
    .eq("decision_id", decisionId)
    .order("position", { ascending: true });
  if (!options || options.length === 0) {
    return NextResponse.json(
      { error: "옵션을 1개 이상 입력해주세요." },
      { status: 400 },
    );
  }

  const { data: existingCriteria } = await supabase
    .from("criteria")
    .select("id, name, weight, position")
    .eq("decision_id", decisionId)
    .order("position", { ascending: true });

  // 일일 한도 체크
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: dailyCount } = await supabase
    .from("analysis_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "success")
    .gte("created_at", since);
  if ((dailyCount ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: `오늘의 AI 분석 한도(${DAILY_LIMIT}회)를 다 썼어요. 내일 다시 시도해주세요.`,
      },
      { status: 429 },
    );
  }

  // 입력 핑거프린트
  const fingerprint = JSON.stringify({
    title: decision.title,
    context: decision.context ?? "",
    options: options.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description ?? "",
    })),
    criteria: (existingCriteria ?? []).map((c) => ({
      name: c.name,
      weight: c.weight,
    })),
    tone,
  });
  const inputHash = sha256Hex(fingerprint);

  // 캐시 hit (24h, force_refresh=false)
  if (!forceRefresh) {
    const cacheSince = new Date(
      Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const { data: cached } = await supabase
      .from("analysis_logs")
      .select("result_json")
      .eq("decision_id", decisionId)
      .eq("tone", tone)
      .eq("input_hash", inputHash)
      .eq("status", "success")
      .gte("created_at", cacheSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached?.result_json) {
      // 캐시는 이미 DB에도 저장된 상태이므로 새 row를 추가하지 않고
      // 즉시 done 이벤트만 보냄 (탭 화면이 다시 fetch하면 결과 표시)
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(sse("start", { cached: true })));
          controller.enqueue(
            encoder.encode(
              sse("done", {
                cached: true,
                analysis: cached.result_json,
              }),
            ),
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  }

  // 사용자 입력 PII 마스킹 + 인젝션 방어
  const safeTitle = sanitizeForAI(decision.title);
  const safeContext = sanitizeForAI(decision.context ?? "");
  const safeOptions = options.map((o) => ({
    id: o.id,
    name: sanitizeForAI(o.name),
    description: sanitizeForAI(o.description ?? ""),
  }));
  const safeCriteria = (existingCriteria ?? []).map((c) => ({
    name: c.name,
    weight: c.weight,
  }));

  const userPayload = {
    decision: {
      title: safeTitle,
      context: safeContext,
      type: decision.type,
    },
    options: safeOptions,
    prefilled_criteria: safeCriteria.length > 0 ? safeCriteria : null,
  };

  const userMessage = `다음 결정을 분석해주세요.\n\n${wrapUserContent(JSON.stringify(userPayload, null, 2))}\n\n반드시 ${ANALYSIS_TOOL_NAME} 도구를 호출해 결과를 제출하세요.`;

  const anthropic = getAnthropic();
  const abortController = new AbortController();
  // 클라이언트 끊김 → 업스트림 끊기
  request.signal.addEventListener("abort", () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          // 연결이 이미 닫힘
        }
      };

      let aborted = false;
      let finalInput: AnalysisToolInput | null = null;
      let errorMsg: string | null = null;

      try {
        enqueue("start", { cached: false });

        const response = anthropic.messages.stream(
          {
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: buildSystemPrompt(tone),
            tools: [
              {
                name: ANALYSIS_TOOL_NAME,
                description:
                  "의사결정에 대한 장단점·비교표·SWOT 분석을 한 번에 제출합니다.",
                input_schema: ANALYSIS_TOOL_INPUT_SCHEMA,
              },
            ],
            tool_choice: { type: "tool", name: ANALYSIS_TOOL_NAME },
            messages: [{ role: "user", content: userMessage }],
          },
          { signal: abortController.signal },
        );

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "input_json_delta"
          ) {
            enqueue("partial", { json: event.delta.partial_json });
          }
        }

        const finalMessage = await response.finalMessage();
        for (const block of finalMessage.content) {
          if (block.type === "tool_use" && block.name === ANALYSIS_TOOL_NAME) {
            finalInput = block.input as AnalysisToolInput;
            break;
          }
        }

        if (!finalInput) {
          throw new Error("AI 응답에서 분석 결과를 찾을 수 없습니다.");
        }
      } catch (err: unknown) {
        if (
          (err instanceof Error && err.name === "AbortError") ||
          abortController.signal.aborted
        ) {
          aborted = true;
        } else if (err instanceof APIError) {
          if (err.status === 429) {
            errorMsg =
              "AI 요청이 잠시 몰렸어요. 30초 뒤 다시 시도해주세요.";
          } else if (err.status && err.status >= 500) {
            errorMsg = "AI 서버에 문제가 있어요. 잠시 후 다시 시도해주세요.";
          } else {
            errorMsg = "AI 요청 중 문제가 발생했어요.";
          }
        } else {
          errorMsg =
            err instanceof Error
              ? err.message
              : "알 수 없는 오류가 발생했어요.";
        }
      }

      if (aborted) {
        await supabase.from("analysis_logs").insert({
          user_id: user.id,
          decision_id: decisionId,
          tone,
          input_hash: inputHash,
          status: "aborted",
        });
        enqueue("aborted", {});
        controller.close();
        return;
      }

      if (errorMsg || !finalInput) {
        await supabase.from("analysis_logs").insert({
          user_id: user.id,
          decision_id: decisionId,
          tone,
          input_hash: inputHash,
          status: "error",
          error_message: errorMsg ?? "unknown",
        });
        enqueue("error", { message: errorMsg ?? "분석에 실패했어요." });
        controller.close();
        return;
      }

      // ── 결과 저장 ────────────────────────────────────
      // 같은 (decision, tone)으로 재분석할 때 항목이 중복으로 쌓이는 것을 막기 위해
      // 같은 톤의 AI 생성 항목만 먼저 비우고 새로 INSERT 한다. 사용자가 직접 추가한
      // 항목(ai_generated=false)은 유지된다.
      const validOptionIds = new Set(options.map((o) => o.id));

      // pros_cons
      const pcRows = (finalInput.pros_cons ?? [])
        .filter(
          (p) =>
            (p.option_id === null || validOptionIds.has(p.option_id)) &&
            (p.kind === "pro" || p.kind === "con") &&
            typeof p.text === "string" &&
            p.text.trim().length > 0,
        )
        .map((p) => ({
          decision_id: decisionId,
          option_id: p.option_id,
          kind: p.kind,
          text: p.text.trim().slice(0, 500),
          ai_generated: true,
          tone,
        }));
      await supabase
        .from("pros_cons_items")
        .delete()
        .eq("decision_id", decisionId)
        .eq("tone", tone)
        .eq("ai_generated", true);
      if (pcRows.length > 0) {
        await supabase.from("pros_cons_items").insert(pcRows);
      }

      // swot
      const swotRows = (finalInput.swot ?? [])
        .filter(
          (s) =>
            (s.option_id === null || validOptionIds.has(s.option_id)) &&
            ["S", "W", "O", "T"].includes(s.quadrant) &&
            typeof s.text === "string" &&
            s.text.trim().length > 0,
        )
        .map((s) => ({
          decision_id: decisionId,
          option_id: s.option_id,
          quadrant: s.quadrant,
          text: s.text.trim().slice(0, 500),
          ai_generated: true,
          tone,
        }));
      await supabase
        .from("swot_items")
        .delete()
        .eq("decision_id", decisionId)
        .eq("tone", tone)
        .eq("ai_generated", true);
      if (swotRows.length > 0) {
        await supabase.from("swot_items").insert(swotRows);
      }

      // criteria + scores
      // 사용자가 미리 만든 기준이 있으면 재사용, 없으면 AI가 제안한 기준을 새로 생성
      const criteriaByName = new Map<string, string>(); // name -> id
      for (const c of existingCriteria ?? []) {
        criteriaByName.set(c.name, c.id);
      }

      const aiCriteria = (finalInput.comparison?.criteria ?? []).filter(
        (c) =>
          typeof c.name === "string" &&
          c.name.trim().length > 0 &&
          typeof c.weight === "number",
      );

      const newCriteriaRows = aiCriteria
        .filter((c) => !criteriaByName.has(c.name.trim().slice(0, 100)))
        .map((c, idx) => ({
          decision_id: decisionId,
          name: c.name.trim().slice(0, 100),
          weight: Math.min(5, Math.max(1, Math.round(c.weight))),
          position: (existingCriteria?.length ?? 0) + idx,
        }));

      if (newCriteriaRows.length > 0) {
        const { data: inserted } = await supabase
          .from("criteria")
          .insert(newCriteriaRows)
          .select("id, name");
        for (const c of inserted ?? []) {
          criteriaByName.set(c.name, c.id);
        }
      }

      const scoreRows: Array<{
        option_id: string;
        criteria_id: string;
        value: number;
        reasoning: string | null;
        ai_generated: boolean;
      }> = [];
      for (const s of finalInput.comparison?.scores ?? []) {
        if (!validOptionIds.has(s.option_id)) continue;
        const criteriaId = criteriaByName.get(
          (s.criteria_name ?? "").trim().slice(0, 100),
        );
        if (!criteriaId) continue;
        const value = Math.min(10, Math.max(1, Math.round(s.value)));
        scoreRows.push({
          option_id: s.option_id,
          criteria_id: criteriaId,
          value,
          reasoning:
            typeof s.reasoning === "string"
              ? s.reasoning.trim().slice(0, 300)
              : null,
          ai_generated: true,
        });
      }
      if (scoreRows.length > 0) {
        // upsert (option_id, criteria_id) — 같은 셀에 새 점수가 오면 갱신
        await supabase
          .from("scores")
          .upsert(scoreRows, { onConflict: "option_id,criteria_id" });
      }

      // 톤 업데이트 (가장 최근 분석 톤으로)
      await supabase
        .from("decisions")
        .update({ tone })
        .eq("id", decisionId);

      // 로그 (캐싱용)
      await supabase.from("analysis_logs").insert({
        user_id: user.id,
        decision_id: decisionId,
        tone,
        input_hash: inputHash,
        result_json: finalInput as unknown as Record<string, unknown>,
        status: "success",
      });

      enqueue("done", { cached: false, analysis: finalInput });
      controller.close();
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
