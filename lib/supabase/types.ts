// Domain types + a hand-written Database type for the typed Supabase clients.

export type SubscriptionTier = "free" | "pro";
export type RiskLevel = "low" | "medium" | "high" | "extreme";

// NOTE: these are `type` aliases (not `interface`) on purpose — interfaces have
// no implicit index signature and so don't satisfy supabase-js's
// `Record<string, unknown>` GenericTable constraint, which silently degrades the
// whole typed client to `never`.
export type Profile = {
  id: string;
  email: string | null;
  subscription_tier: SubscriptionTier;
  stripe_customer_id: string | null;
  notify_preclose: boolean;
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
};

export type DailyGainer = {
  id: number;
  date: string; // YYYY-MM-DD
  ticker: string;
  company_name: string | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  relative_volume: number | null;
  market_cap: number | null;
  sector: string | null;
  rank: number | null;
  is_final: boolean;
  scraped_at: string;
};

export type TickerStreak = {
  ticker: string;
  streak_count: number;
  last_seen_date: string;
  updated_at: string;
};

export type AIAnalysis = {
  id: number;
  date: string;
  ticker: string;
  short_thesis: string;
  risk_level: RiskLevel;
  key_catalysts: string[];
  recommendation: string;
  model: string | null;
  rank: number | null;
  company_name: string | null;
  created_at: string;
};

// Generic table-shape helper matching supabase-js's GenericTable shape.
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

// Mirrors the shape `supabase gen types` produces so Database['public'] satisfies
// supabase-js's GenericSchema constraint (otherwise queries degrade to `never`).
export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: Table<Profile>;
      daily_gainers: Table<DailyGainer>;
      ticker_streaks: Table<TickerStreak>;
      ai_analyses: Table<AIAnalysis>;
      fetch_locks: Table<{ key: string; locked_at: string }>;
      system_alerts: Table<{
        id: number;
        date: string;
        alert_type: string;
        detail: string | null;
        created_at: string;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_fetch: {
        Args: { p_key: string; p_ttl_seconds: number };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
