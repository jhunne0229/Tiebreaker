// Supabase 테이블 타입 (수동 정의 — `npx supabase gen types`로 자동화 가능하지만 Phase 1은 수동)
// 마이그레이션 (supabase/migrations/0001_init.sql)과 1:1 대응

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
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
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
        };
        Insert: {
          id?: string;
          decision_id: string;
          name: string;
          description?: string | null;
          position?: number;
          created_at?: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      decision_type: DecisionType;
      decision_tone: DecisionTone;
      decision_status: DecisionStatus;
      pros_con_kind: ProsConKind;
      swot_quadrant: SwotQuadrant;
    };
    CompositeTypes: Record<string, never>;
  };
}
