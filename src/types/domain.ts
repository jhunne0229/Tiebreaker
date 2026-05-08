import type {
  Database,
  DecisionTone,
  ProsConKind,
  SwotQuadrant,
} from "./database";

export type Decision = Database["public"]["Tables"]["decisions"]["Row"];
export type DecisionOption = Database["public"]["Tables"]["options"]["Row"];
export type Criteria = Database["public"]["Tables"]["criteria"]["Row"];
export type Score = Database["public"]["Tables"]["scores"]["Row"];
export type ProsConItem = Database["public"]["Tables"]["pros_cons_items"]["Row"];
export type SwotItem = Database["public"]["Tables"]["swot_items"]["Row"];

export interface DecisionWithDetails extends Decision {
  options: DecisionOption[];
  criteria: Criteria[];
  scores: Score[];
  pros_cons_items: ProsConItem[];
  swot_items: SwotItem[];
}

// AI 분석 요청/응답 (tool_use input_schema와 1:1 대응)
export interface AnalysisToolInput {
  pros_cons: Array<{
    option_id: string | null; // null = 결정 전체
    kind: ProsConKind;
    text: string;
  }>;
  comparison: {
    criteria: Array<{
      name: string;
      weight: number; // 1-5
    }>;
    scores: Array<{
      option_id: string;
      criteria_name: string;
      value: number; // 1-10
      reasoning: string;
    }>;
  };
  swot: Array<{
    option_id: string | null;
    quadrant: SwotQuadrant;
    text: string;
  }>;
}

export interface AnalysisRequest {
  decision_id: string;
  tone: DecisionTone;
  // 사용자가 미리 만들어둔 비교 기준 (있으면 AI는 새로 만들지 않고 점수만 매김)
  prefilled_criteria?: Array<{ id: string; name: string; weight: number }>;
  // "다시 분석" — 캐시 무시
  force_refresh?: boolean;
}

export const TONE_LABELS: Record<DecisionTone, string> = {
  logical: "논리적",
  emotional: "감성적",
  blunt: "냉철한 친구",
};

export const DECISION_TYPE_LABELS = {
  daily: "일상",
  career: "커리어",
  purchase: "구매",
  relationship: "관계",
  other: "기타",
} as const;
