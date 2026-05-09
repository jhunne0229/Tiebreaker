// 공유 페이지 — 비로그인 접근 가능, 읽기 전용 (06_PHASE2_PRD.md §2.6)
// 노출: 결정 제목/맥락/옵션/비교표/추천 점수(emotional)/최종 선택
// 숨김: 회고, 사용자 경향성, 드러커 답변, 옵션 ai_labels, divergence_cache
//
// 접근 제어: share_token IS NOT NULL 인 결정만 노출 (decision_share_view 가 보장).
// 데이터 페치는 service-role 클라이언트로 직접 — 화이트리스트 컬럼만 SELECT 하여 회고/경향성/드러커는 절대 가져오지 않음.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { ShareView } from "./share-view";
import type {
  CartesianItem,
  Criteria,
  DecisionOption,
  ProsConItem,
  RecommendationScore,
  Score,
  SwotItem,
} from "@/types/domain";
import type { DecisionShareViewRow } from "@/types/database";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function loadShareData(token: string) {
  const supabase = createServiceClient();
  // decision_share_view 는 share_token IS NOT NULL 인 row 만 노출 (view body 의 where 가 보장).
  const { data: decisionRow } = await supabase
    .from("decision_share_view" as never)
    .select(
      "id, user_id, title, context, type, status, final_choice_id, share_token, share_og_enabled, created_at, decided_at",
    )
    .eq("share_token", token)
    .maybeSingle();

  const decision = decisionRow as unknown as DecisionShareViewRow | null;
  if (!decision) return null;

  const [
    { data: options },
    { data: criteria },
    { data: scores },
    { data: prosCons },
    { data: swot },
    { data: cartesian },
    { data: recommendationScores },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("options")
      .select("id, decision_id, name, description, position, created_at")
      .eq("decision_id", decision.id)
      .order("position", { ascending: true }),
    supabase
      .from("criteria")
      .select("*")
      .eq("decision_id", decision.id)
      .order("position", { ascending: true }),
    supabase.from("scores").select("*"),
    supabase
      .from("pros_cons_items")
      .select("*")
      .eq("decision_id", decision.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("swot_items")
      .select("*")
      .eq("decision_id", decision.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("cartesian_items")
      .select("*")
      .eq("decision_id", decision.id)
      .order("created_at", { ascending: true }),
    supabase.from("recommendation_scores").select("*"),
    supabase
      .from("profiles")
      .select("name")
      .eq("id", decision.user_id)
      .maybeSingle(),
  ]);

  const optionsTyped = (options ?? []) as Array<
    Omit<DecisionOption, "ai_labels">
  >;
  const optionIds = new Set(optionsTyped.map((o) => o.id));
  const currentTone = decision.tone;

  return {
    decision,
    options: optionsTyped,
    criteria: (criteria ?? []) as Criteria[],
    scores: ((scores ?? []) as Score[]).filter((s) => optionIds.has(s.option_id)),
    prosCons: ((prosCons ?? []) as ProsConItem[]).filter(
      (p) => !p.ai_generated || p.tone === currentTone,
    ),
    swot: ((swot ?? []) as SwotItem[]).filter(
      (s) => !s.ai_generated || s.tone === currentTone,
    ),
    cartesian: (cartesian ?? []) as CartesianItem[],
    recommendationScores: ((recommendationScores ?? []) as RecommendationScore[])
      .filter((r) => optionIds.has(r.option_id))
      .filter((r) => r.mode === "emotional"),
    authorName: profile?.name ?? null,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const data = await loadShareData(token);
  if (!data) {
    return { title: "공유 링크를 찾을 수 없어요 — Tiebreaker" };
  }
  const { decision } = data;
  // OG 메타 — 기본 ON, 사용자가 OFF 시 제목만/제목 없는 일반 메타로 폴백 (PRD §2.6, §8 추가 결정)
  if (!decision.share_og_enabled) {
    return {
      title: "공유된 결정 — Tiebreaker",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${decision.title} — Tiebreaker`,
    description: "Tiebreaker로 정리한 의사결정 요약",
    openGraph: {
      title: decision.title,
      description: "Tiebreaker로 정리한 의사결정 요약",
      type: "article",
    },
    twitter: {
      card: "summary",
      title: decision.title,
    },
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;
  const data = await loadShareData(token);
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <Link href="/" className="text-sm font-bold">
            Tiebreaker
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            나도 결정 정리해보기 →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <ShareView {...data} />
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 text-center text-xs text-muted-foreground">
        Tiebreaker — AI 의사결정 도우미
      </footer>
    </div>
  );
}
