export type BrandKey =
  | "anthropic"
  | "xai"
  | "deepseek"
  | "qwen"
  | "gemini"
  | "openai"
  | "mistral"
  | "meta";

export interface EquityPoint {
  date: string;
  equity: number;
  pnl: number;
}

export interface PnLCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  day_pnl: number;
}

export interface HeatmapCell {
  session: "Asian" | "London" | "NY Overlap";
  regime: "Trending" | "Ranging" | "High-Vol";
  winrate: number;
  pnl: number;
  trades: number;
}

export interface PlaybookMutation {
  date: string;
  mentor: string;
  change: string;
  impact_pct: string;
}

export interface ResearchEntry {
  ts: string;
  source: string;
  summary: string;
}

export interface AITrader {
  agent_id: string;
  display_name: string;
  short_name: string;
  provider: string;
  brand_key: BrandKey;
  avatar: string;
  model_name: string;
  color: string;
  style_archetype: string;
  rank: number;
  equity: number;
  initial_equity: number;
  total_pnl: number;
  roi_pct: number;
  day_pnl: number;
  open_pnl: number;
  winrate_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_dd_pct: number;
  expectancy_usd: number;
  avg_rr: number;
  kelly_pct: number;
  weekly_trades: number;
  status: "IN TRADE" | "SCANNING" | "COOLDOWN" | "PAUSED";
  consecutive_losses: number;
  is_leader: boolean;
  is_mirrored: boolean;
  mirror_multiplier: number;
  sparkline: number[];
  equity_curve: EquityPoint[];
  pnl_candles: PnLCandle[];
  session_regime_heatmap: HeatmapCell[];
  playbook: string[];
  mutations: PlaybookMutation[];
  research_log: ResearchEntry[];
  trained_skill?: string;
  nov17_ready?: boolean;
}

export interface BenchmarkItem {
  agent_id: string;
  display_name: string;
  provider: string;
  style_archetype: string;
  color: string;
  equity: number;
  roi_pct: number;
  sharpe_ratio: number;
  max_dd_pct: number;
}

export interface ArenaOrder {
  id: string;
  agent_id: string;
  agent_name: string;
  avatar: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  qty: number;
  entry_price: number;
  sl: number;
  tp: number;
  pnl: number;
  status: "Open" | "Filled" | "Canceled" | "Failed";
  session: string;
  regime: string;
  confidence: number;
  tag: string;
  lesson?: string;
  ts: string;
}

export interface ChatMessage {
  id: string;
  agent_id: string;
  agent_name: string;
  avatar: string;
  brand_key: BrandKey;
  event_type: "TRADE_OPEN" | "TRADE_CLOSE" | "DEBATE" | "HOURLY_PULSE" | "SUNDAY_SUMMIT";
  tokens_used: number;
  message: string;
  ts: string;
}

export interface SummitData {
  last_summit: string;
  mentors: string[];
  mentees: string[];
  summary: string;
  shared_rules: string[];
  transcript: { speaker: string; role: string; text: string }[];
}

export interface CockpitState {
  arena_status: "LIVE" | "PAUSED";
  symbol: string;
  xauusd_price: number;
  dxy: number;
  us10y: number;
  risk_shield_enabled: boolean;
  auto_mirror_enabled: boolean;
  daily_tokens_used: number;
  daily_token_cap: number;
  total_day_pnl: number;
  total_open_pnl: number;
  total_balance: number;
}

export interface KPITargets {
  winrate_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  weekly_trades: number;
}

export interface ArenaState {
  updated_at: string;
  cockpit: CockpitState;
  kpi_targets: KPITargets;
  ais: AITrader[];
  benchmarks: BenchmarkItem[];
  orders: ArenaOrder[];
  chat: ChatMessage[];
  summit: SummitData;
}
