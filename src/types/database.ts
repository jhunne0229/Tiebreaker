// Supabase 테이블 타입 (수동 정의 — `npx supabase gen types`로 자동화 가능하지만 Phase 1/2는 수동)
// 마이그레이션 0001/0002/0003과 1:1 대응

export type DecisionType =
  | "daily"
  | "career"
  | "purchase"
  | "relationship"
  | "other";

export type DecisionTone = "logical" | "emotional" | "blunt";
export type DecisionStatus = "open" | "decided";
export type ProsConKind = "pro" | "con";
export type SwotQuadrant = "S" | "W" | "O" | "T";

// Phase 2 enums (0003)
export type ReviewTrigger = "week_1" | "month_1" | "manual";
export type CartesianQuadrant = "Q1" | "Q2" | "Q3" | "Q4";
export type DruckerQuestion =
  | "mission"
  | "customer"
  | "customer_value"
  | "result"
  | "plan";
export type ScoreMode = "logical" | "emotional";
export type ScoreTier = "top" | "bottom" | "middle" | "close";
export type ConfidenceLabel = "onboarding" | "learning" | "personalized";
export type NotificationChannel = "email" | "push" | "both" | "off";

// JSONB 페이로드 형태 (마이그레이션 0003 §3.1, §3.2 참조)

// Option.ai_labels — 옵션 라벨링 결과 캐시 (5.3 프롬프트 출력)
// text_hash, labeled_at 은 캐시 무효화용 (option-labels.ts).
export interface OptionAiLabels {
  risk_label: "predictable" | "uncertain";
  change_label: "status_quo" | "change";
  time_label: "short" | "long";
  text_hash?: string;
  labeled_at?: string;
}

// RecommendationScore.reasoning — 5개 시그널의 raw score (산정 근거)
export interface ScoreReasoning {
  pros_cons: number;
  comparison: number;
  swot: number;
  cartesian: number;
  drucker: number;
}

// Decision.divergence_cache — 냉철 갭 설명 캐시 (5.5 프롬프트 출력)
// items 는 갭이 큰 옵션별 1세트. 갭이 없으면 items 빈 배열, summary 만 채워짐.
export interface DivergenceCache {
  summary: string;
  items: Array<{
    option_id: string;
    cause: string;
    self_check: string;
  }>;
  diverging_option_ids: string[];
  generated_at: string;
}

// CriteriaTemplate.criteria — 기준 템플릿 항목
export interface CriteriaTemplateItem {
  name: string;
  weight: number;
}

// 공유 페이지용 뷰 (decision_share_view) — 익명 SELECT 가능, 회고/경향성 컬럼 노출 안 됨.
// Database["public"]["Views"]에 넣으면 Supabase 타입 추론이 깨지므로 standalone으로 분리.
// 사용 시: createClient().from("decision_share_view") 호출하고 결과를 이 타입으로 캐스팅.
export interface DecisionShareViewRow {
  id: string;
  user_id: string;
  title: string;
  context: string | null;
  type: DecisionType;
  status: DecisionStatus;
  tone: DecisionTone;
  final_choice_id: string | null;
  share_token: string;
  share_og_enabled: boolean;
  created_at: string;
  decided_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          created_at: string;
          notification_channel: NotificationChannel;
          notification_channel_locked: boolean;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          notification_channel?: NotificationChannel;
          notification_channel_locked?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      decisions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          context: string | null;
          type: DecisionType;
          tone: DecisionTone;
          status: DecisionStatus;
          final_choice_id: string | null;
          final_note: string | null;
          created_at: string;
          decided_at: string | null;
          share_token: string | null;
          share_og_enabled: boolean;
          divergence_cache: DivergenceCache | null;
          last_review_alert_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          context?: string | null;
          type?: DecisionType;
          tone?: DecisionTone;
          status?: DecisionStatus;
          final_choice_id?: string | null;
          final_note?: string | null;
          created_at?: string;
          decided_at?: string | null;
          share_token?: string | null;
          share_og_enabled?: boolean;
          divergence_cache?: DivergenceCache | null;
          last_review_alert_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["decisions"]["Insert"]>;
        Relationships: [];
      };
      options: {
        Row: {
          id: string;
          decision_id: string;
          name: string;
          description: string | null;
          position: number;
          created_at: string;
          ai_labels: OptionAiLabels | null;
        };
        Insert: {
          id?: string;
          decision_id: string;
          name: string;
          description?: string | null;
          position?: number;
          created_at?: string;
          ai_labels?: OptionAiLabels | null;
        };
        Update: Partial<Database["public"]["Tables"]["options"]["Insert"]>;
        Relationships: [];
      };
      criteria: {
        Row: {
          id: string;
          decision_id: string;
          name: string;
          weight: number;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          decision_id: string;
          name: string;
          weight?: number;
          position?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["criteria"]["Insert"]>;
        Relationships: [];
      };
      scores: {
        Row: {
          id: string;
          option_id: string;
          criteria_id: string;
          value: number;
          reasoning: string | null;
          ai_generated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          option_id: string;
          criteria_id: string;
          value: number;
          reasoning?: string | null;
          ai_generated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scores"]["Insert"]>;
        Relationships: [];
      };
      pros_cons_items: {
        Row: {
          id: string;
          decision_id: string;
          option_id: string | null;
          kind: ProsConKind;
          text: string;
          ai_generated: boolean;
          tone: DecisionTone;
          created_at: string;
        };
        Insert: {
          id?: string;
          decision_id: string;
          option_id?: string | null;
          kind: ProsConKind;
          text: string;
          ai_generated?: boolean;
          tone?: DecisionTone;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pros_cons_items"]["Insert"]>;
        Relationships: [];
      };
      swot_items: {
        Row: {
          id: string;
          decision_id: string;
          option_id: string | null;
          quadrant: SwotQuadrant;
          text: string;
          ai_generated: boolean;
          tone: DecisionTone;
          created_at: string;
        };
        Insert: {
          id?: string;
          decision_id: string;
          option_id?: string | null;
          quadrant: SwotQuadrant;
          text: string;
          ai_generated?: boolean;
          tone?: DecisionTone;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["swot_items"]["Insert"]>;
        Relationships: [];
      };
      analysis_logs: {
        Row: {
          id: string;
          user_id: string;
          decision_id: string;
          tone: DecisionTone;
          input_hash: string;
          result_json: unknown | null;
          status: "success" | "aborted" | "error";
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          decision_id: string;
          tone: DecisionTone;
          input_hash: string;
          result_json?: unknown | null;
          status?: "success" | "aborted" | "error";
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_logs"]["Insert"]>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          decision_id: string;
          reviewed_at: string;
          rating: number;
          reflection: string | null;
          trigger: ReviewTrigger;
          created_at: string;
        };
        Insert: {
          id?: string;
          decision_id: string;
          reviewed_at?: string;
          rating: number;
          reflection?: string | null;
          trigger?: ReviewTrigger;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [];
      };
      cartesian_items: {
        Row: {
          id: string;
          decision_id: string;
          option_id: string | null;
          quadrant: CartesianQuadrant;
          keyword: string;
          description: string | null;
          ai_generated: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          decision_id: string;
          option_id?: string | null;
          quadrant: CartesianQuadrant;
          keyword: string;
          description?: string | null;
          ai_generated?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cartesian_items"]["Insert"]>;
        Relationships: [];
      };
      drucker_answers: {
        Row: {
          id: string;
          decision_id: string;
          question: DruckerQuestion;
          ai_draft: string | null;
          user_answer: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          decision_id: string;
          question: DruckerQuestion;
          ai_draft?: string | null;
          user_answer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["drucker_answers"]["Insert"]>;
        Relationships: [];
      };
      user_tendencies: {
        Row: {
          user_id: string;
          risk_tolerance: number;
          time_orientation: number;
          change_openness: number;
          analytical_intuitive: number;
          self_others: number;
          onboarding_risk_tolerance: number | null;
          onboarding_time_orientation: number | null;
          onboarding_change_openness: number | null;
          onboarding_analytical_intuitive: number | null;
          onboarding_self_others: number | null;
          onboarding_completed_at: string | null;
          satisfaction_bias: number;
          decision_count: number;
          review_count: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          risk_tolerance?: number;
          time_orientation?: number;
          change_openness?: number;
          analytical_intuitive?: number;
          self_others?: number;
          onboarding_risk_tolerance?: number | null;
          onboarding_time_orientation?: number | null;
          onboarding_change_openness?: number | null;
          onboarding_analytical_intuitive?: number | null;
          onboarding_self_others?: number | null;
          onboarding_completed_at?: string | null;
          satisfaction_bias?: number;
          decision_count?: number;
          review_count?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_tendencies"]["Insert"]>;
        Relationships: [];
      };
      recommendation_scores: {
        Row: {
          id: string;
          option_id: string;
          mode: ScoreMode;
          score: number;
          tier: ScoreTier;
          reasoning: ScoreReasoning | null;
          confidence_label: ConfidenceLabel;
          computed_at: string;
        };
        Insert: {
          id?: string;
          option_id: string;
          mode: ScoreMode;
          score: number;
          tier: ScoreTier;
          reasoning?: ScoreReasoning | null;
          confidence_label: ConfidenceLabel;
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recommendation_scores"]["Insert"]>;
        Relationships: [];
      };
      criteria_templates: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          criteria: CriteriaTemplateItem[];
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          criteria: CriteriaTemplateItem[];
          is_system?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["criteria_templates"]["Insert"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      decision_type: DecisionType;
      decision_tone: DecisionTone;
      decision_status: DecisionStatus;
      pros_con_kind: ProsConKind;
      swot_quadrant: SwotQuadrant;
      review_trigger: ReviewTrigger;
      cartesian_quadrant: CartesianQuadrant;
      drucker_question: DruckerQuestion;
      score_mode: ScoreMode;
      score_tier: ScoreTier;
      confidence_label: ConfidenceLabel;
      notification_channel: NotificationChannel;
    };
    CompositeTypes: Record<string, never>;
  };
}
