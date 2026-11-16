export interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  display_name: string;
  provider: string;
  model_name: string;
  model_version: string;
  prompt_version: string;
  playbook_version: string;
  style_archetype: string;
  color: string;
  active: number;
  blowup_count: number;
  current_run_number: number;
  initial_equity: number;
  current_equity: number;
  net_pnl_usd: number;
  net_pnl_pct: number;
  lifetime_pnl_usd: number;
  win_rate: number;
  profit_factor: number;
  avg_rr: number;
  expectancy_r: number;
  expectancy_usd: number;
  max_drawdown_pct: number;
  total_trades: number;
  wins_count: number;
  losses_count: number;
  survival_days: number;
  api_calls: number;
  avg_latency_ms: number;
  total_tokens: number;
}

export interface AccountRun {
  run_id: string;
  agent_id: string;
  run_number: number;
  start_time: string;
  end_time: string | null;
  start_equity: number;
  end_equity: number;
  peak_equity: number;
  max_drawdown_pct: number;
  total_trades: number;
  win_rate: number;
  end_reason: string;
  playbook_version_start: string;
  playbook_version_end: string;
  survival_days: number;
  blowup_postmortem: string;
}

export interface DailyStat {
  agent_id: string;
  date: string;
  pnl_usd: number;
  pnl_pct: number;
  r_total: number;
  equity_close: number;
  drawdown_pct: number;
  trades: number;
  wins: number;
  losses: number;
  style_tags: string[];
  blowup_occurred: number;
}

export interface PostMortem {
  trade_id: string;
  agent_id: string;
  outcome: string;
  followed_plan: number;
  what_happened: string;
  mistake_tags: string[];
  what_worked: string;
  lesson: string;
  playbook_suggestion: string;
  created_at: string;
}

export interface TradeRecord {
  trade_id: string;
  agent_id: string;
  run_id: string;
  opened_at: string;
  closed_at: string;
  action: 'long' | 'short';
  order_type: string;
  entry: number;
  stop_loss: number;
  tp_list: { price: number; close_pct: number }[];
  lot: number;
  risk_pct: number;
  risk_usd: number;
  exit_price: number;
  pnl_usd: number;
  pnl_pct: number;
  r_multiple: number;
  duration_hours: number;
  session: string;
  style_tag: string;
  trigger_type: string;
  market_regime: string;
  confidence: number;
  snapshot: {
    symbol: string;
    time: string;
    price: number;
    spread: number;
    trend_h4: string;
    last_swing: { low: number; high: number };
    ote: { zone_low: number; zone_high: number; sweet_spot: number; invalidation: number };
    oi_levels: { price: number; oi_rank: number; contracts_est?: number }[];
    oi_change_paxg_1h_pct: number;
    cot_bias: string;
  };
  reasoning: string;
  invalid_if: string;
  playbook_version: string;
  model_name: string;
  model_version: string;
  news_refs: string[];
  postmortem?: PostMortem;
}

export interface ShadowTrade {
  shadow_id: string;
  decision_id: string;
  agent_id: string;
  time: string;
  shadow_type: 'validator_rejected' | 'ai_no_trade';
  rejected_reason: string;
  action: string;
  hypothetical_entry: number;
  hypothetical_sl: number;
  hypothetical_tp: number;
  simulated_exit: number;
  simulated_pnl_usd: number;
  simulated_r: number;
  outcome: string;
}

export interface PlaybookVersion {
  id: number;
  agent_id: string;
  version: string;
  content_md: string;
  created_at: string;
  change_reason: string;
  win_rate_before: number;
  win_rate_after: number;
  pf_before: number;
  pf_after: number;
}

export interface ConsensusEvent {
  event_id: string;
  time: string;
  direction: string;
  agreeing_count: number;
  total_active_agents: number;
  agents: string[];
  entry_range: string;
  sl_range: string;
  tp_range: string;
  avg_confidence: number;
  result_r: number;
  result_pnl_usd: number;
  outcome: string;
}

export interface UsdNewsEvent {
  event_id: string;
  time: string;
  date: string;
  currency: string;
  name: string;
  category: string;
  impact: string;
  actual: string;
  forecast: string;
  prior: string;
  surprise_delta: string;
  gold_15m_move_usd: number;
  gold_60m_move_usd: number;
  neutral_summary: string;
}

export interface WeeklyChampion {
  week_id: string;
  week_start: string;
  week_end: string;
  champion_agent_id: string;
  runner_up_agent_id: string;
  net_pnl_usd: number;
  net_return_pct: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  cot_bias_next_week: string;
  summary_markdown: string;
}

export interface TrainedSkillItem {
  id: string;
  name: string;
  source: string;
  role: string;
  file: string;
}

export interface AgentBacktestResult {
  agent_id: string;
  display_name: string;
  model_name: string;
  provider: string;
  color: string;
  backtest_bars_total: number;
  trades_simulated: number;
  win_rate_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  net_pnl_usd: number;
  final_equity_usd: number;
  in_sample_pnl_usd: number;
  out_of_sample_pnl_usd: number;
  breakeven_saves: number;
  tp1_neg_027_hit_rate_pct: number;
  tp2_neg_0618_hit_rate_pct: number;
  execution_mix: {
    market: number;
    limit: number;
    zone_confirm: number;
  };
  primary_skills: string[];
  calibrated_note: string;
}

export interface BacktestSummary {
  status: string;
  as_of_time: string;
  dataset: {
    symbol: string;
    timeframes: {
      '4H': number;
      '1H': number;
      M15: number;
      M5: number;
    };
    total_candles: number;
    walk_forward_split: string;
  };
  skills_trained: TrainedSkillItem[];
  agent_backtests: AgentBacktestResult[];
}

export interface ArenaPayload {
  brand: {
    name: string;
    symbol: string;
    initial_equity: number;
    primary_color: string;
    currency_news_filter: string;
    last_updated: string;
  };
  leaderboard: LeaderboardEntry[];
  account_runs: AccountRun[];
  daily_stats: DailyStat[];
  trades: TradeRecord[];
  shadow_trades: ShadowTrade[];
  playbooks: PlaybookVersion[];
  consensus_events: ConsensusEvent[];
  news_events: UsdNewsEvent[];
  weekly_champions: WeeklyChampion[];
  health_logs: { log_id: number; time: string; component: string; severity: string; message: string }[];
  backtest_summary?: BacktestSummary;
}

