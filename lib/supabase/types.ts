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
  /** Mirrored from auth.users by trigger. Null = signed up, never confirmed. */
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyGainer = {
  id: number;
  date: string; // YYYY-MM-DD
  ticker: string;
  // Listing venue ("NASDAQ" | "NYSE") — qualifies the ticker for external
  // lookups (chart embeds etc.); a bare ticker is ambiguous across venues.
  // Null on rows persisted before the column existed.
  exchange: string | null;
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

// Per-user starred tickers (free-account feature; pinned to the top of the
// screener). Owner-scoped read via RLS; writes go through /api/favorites.
export type Favorite = {
  user_id: string;
  ticker: string;
  created_at: string;
};

export type AIAnalysis = {
  id: number;
  date: string;
  ticker: string;
  short_thesis: string;
  catalyst: string | null;
  catalyst_url: string | null;
  catalyst_type: string | null;
  short_score: number | null;
  percent_win_estimate: number | null;
  invalidation: string | null;
  key_catalysts: string[];
  recommendation: string;
  // Deprecated: no longer written or shown. Kept nullable for reversibility.
  risk_level: RiskLevel | null;
  model: string | null;
  rank: number | null;
  company_name: string | null;
  // Denormalized listing venue (like rank/company_name) so the Pro analysis
  // chart embeds can qualify the symbol without joining daily_gainers.
  exchange: string | null;
  // Realized next-session outcome, filled by the following day's EOD run
  // (lib/quant/outcomes.ts). Null until recorded; stays null for rows whose
  // next session passed before the recorder existed.
  next_date: string | null;
  next_close: number | null;
  next_change_percent: number | null;
  outcome_win: boolean | null;
  // Candidate-signal snapshot captured at scoring time (lib/quant/features.ts);
  // stored for the September re-fit, not scored yet.
  features: Record<string, unknown> | null;
  expected_move_percent: number | null;
  created_at: string;
};

// ~1yr of prototype top-gainer scrapes with next-day price (Phase 2 base rates).
export type HistoricalGainer = {
  id: number;
  spike_date: string;
  ticker: string;
  spike_close: number | null;
  day_range_pct: number | null;
  next_date: string | null;
  next_close: number | null;
  next_day_return: number | null;
  next_day_down: boolean | null;
  market_cap: number | null;
  relative_volume: number | null;
  sector: string | null;
  industry: string | null;
  created_at: string;
};

// Precomputed "closed lower next day" base rates by feature bucket.
export type GainerBaseRate = {
  cap_band: string;
  relvol_band: string;
  range_band: string;
  n: number;
  down_rate: number;
  median_next_day_return: number | null;
  // Conditional medians (fractions) for the expected-move dimension.
  median_down_move: number | null;
  median_up_move: number | null;
  updated_at: string;
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
      historical_gainers: Table<HistoricalGainer>;
      gainer_base_rates: Table<GainerBaseRate>;
      fetch_locks: Table<{ key: string; locked_at: string }>;
      system_alerts: Table<{
        id: number;
        date: string;
        alert_type: string;
        detail: string | null;
        created_at: string;
      }>;
      feedback: Table<{
        id: number;
        user_id: string | null;
        email: string | null;
        type: "bug" | "feature";
        message: string;
        created_at: string;
      }>;
      favorites: Table<Favorite>;
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_fetch: {
        Args: { p_key: string; p_ttl_seconds: number };
        Returns: boolean;
      };
      list_prunable_unconfirmed: {
        Args: { p_hours: number };
        Returns: { id: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
