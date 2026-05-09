// 일회성 정리 스크립트: pros_cons_items / swot_items 의 누적 중복 제거.
// 같은 (decision_id, tone) 그룹에서 가장 최근 batch만 남기고 이전 run의 AI 항목 삭제.
// 사용자 추가 항목(ai_generated=false)은 보존.
//
// 기본은 DRY-RUN — 무엇을 지울지 출력만 하고 실제 삭제하지 않음.
// 실제 실행: node scripts/dedupe-pros-cons-swot.mjs --apply
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");

function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // ignore
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const BUFFER_MS = 10_000; // 같은 batch 안 row 간 created_at 차이 흡수용

async function analyze(table, label) {
  const { data, error } = await supabase
    .from(table)
    .select("id, decision_id, tone, ai_generated, text, created_at")
    .eq("ai_generated", true);
  if (error) {
    console.error(`[${label}] select 실패:`, error.message);
    return { keep: [], drop: [] };
  }
  if (!data || data.length === 0) {
    console.log(`[${label}] AI row 없음 — 스킵`);
    return { keep: [], drop: [] };
  }

  // (decision_id, tone) 별 max(created_at) 계산
  const maxByGroup = new Map();
  for (const row of data) {
    const k = `${row.decision_id}::${row.tone}`;
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t)) continue;
    const cur = maxByGroup.get(k);
    if (cur === undefined || t > cur) maxByGroup.set(k, t);
  }

  const drop = [];
  const keep = [];
  for (const row of data) {
    const k = `${row.decision_id}::${row.tone}`;
    const max = maxByGroup.get(k);
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t) || max === undefined) {
      keep.push(row);
      continue;
    }
    if (t < max - BUFFER_MS) drop.push(row);
    else keep.push(row);
  }

  console.log(
    `[${label}] 그룹 ${maxByGroup.size}개 / 전체 AI row ${data.length}개 / 삭제대상 ${drop.length}개 / 유지 ${keep.length}개`,
  );

  // 그룹별 요약 (decision_id, tone, kept count, dropped count)
  const groupSummary = new Map();
  for (const r of keep) {
    const k = `${r.decision_id}::${r.tone}`;
    const v = groupSummary.get(k) ?? { keep: 0, drop: 0 };
    v.keep++;
    groupSummary.set(k, v);
  }
  for (const r of drop) {
    const k = `${r.decision_id}::${r.tone}`;
    const v = groupSummary.get(k) ?? { keep: 0, drop: 0 };
    v.drop++;
    groupSummary.set(k, v);
  }
  // 삭제대상이 있는 그룹만 표시 (상위 20개)
  const groups = [...groupSummary.entries()]
    .filter(([, v]) => v.drop > 0)
    .sort((a, b) => b[1].drop - a[1].drop)
    .slice(0, 20);
  if (groups.length > 0) {
    console.log(`  [${label}] 삭제대상 있는 그룹 (상위 ${groups.length}개):`);
    for (const [k, v] of groups) {
      const [did, tone] = k.split("::");
      console.log(`    decision=${did.slice(0, 8)}… tone=${tone}  → 유지 ${v.keep} / 삭제 ${v.drop}`);
    }
  }

  // 삭제될 row 샘플 (최대 5개) — text 미리보기로 확인
  if (drop.length > 0) {
    console.log(`  [${label}] 삭제될 row 샘플 (최대 5개):`);
    for (const r of drop.slice(0, 5)) {
      const preview = (r.text ?? "").replace(/\s+/g, " ").slice(0, 60);
      console.log(`    - ${r.created_at}  ${preview}`);
    }
  }

  return { keep, drop };
}

async function applyDelete(table, label, drop) {
  if (drop.length === 0) return 0;
  const ids = drop.map((r) => r.id);
  const CHUNK = 500;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    const { error: dErr } = await supabase.from(table).delete().in("id", batch);
    if (dErr) {
      console.error(`[${label}] delete 실패 (offset ${i}):`, dErr.message);
      break;
    }
    deleted += batch.length;
  }
  return deleted;
}

console.log(`== Dedupe ${APPLY ? "APPLY" : "DRY-RUN"} ==`);
console.log(`URL: ${url}`);
console.log("");

const a = await analyze("pros_cons_items", "pros_cons_items");
console.log("");
const b = await analyze("swot_items", "swot_items");
console.log("");

if (!APPLY) {
  console.log("== DRY-RUN — 실제로 지우려면 --apply 플래그를 붙여 다시 실행 ==");
  console.log("   node scripts/dedupe-pros-cons-swot.mjs --apply");
} else {
  console.log("== APPLY — 실제 삭제 실행 ==");
  const da = await applyDelete("pros_cons_items", "pros_cons_items", a.drop);
  const db = await applyDelete("swot_items", "swot_items", b.drop);
  console.log(`pros_cons_items: ${da}개 삭제`);
  console.log(`swot_items: ${db}개 삭제`);
}
