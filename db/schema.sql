PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL DEFAULT 'v2.0',
    playbook_version TEXT NOT NULL DEFAULT 'v1',
    style_archetype TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#00adff',
    active INTEGER NOT NULL DEFAULT 1,
    blowup_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_runs (
    run_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    run_number INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    start_equity REAL NOT NULL DEFAULT 1000.0,
    end_equity REAL NOT NULL DEFAULT 1000.0,
    peak_equity REAL NOT NULL DEFAULT 1000.0,
    max_drawdown_pct REAL NOT NULL DEFAULT 0.0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    win_rate REAL NOT NULL DEFAULT 0.0,
    end_reason TEXT NOT NULL DEFAULT 'active',
    playbook_version_start TEXT NOT NULL DEFAULT 'v1',
    playbook_version_end TEXT NOT NULL DEFAULT 'v1',
    survival_days INTEGER NOT NULL DEFAULT 0,
    blowup_postmortem TEXT DEFAULT '',
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS trades (
    trade_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    action TEXT NOT NULL,
    order_type TEXT NOT NULL,
    entry REAL NOT NULL,
    stop_loss REAL NOT NULL,
    tp_json TEXT NOT NULL,
    lot REAL NOT NULL,
    risk_pct REAL NOT NULL,
    risk_usd REAL NOT NULL,
    exit_price REAL,
    pnl_usd REAL DEFAULT 0.0,
    pnl_pct REAL DEFAULT 0.0,
    r_multiple REAL DEFAULT 0.0,
    duration_hours REAL DEFAULT 0.0,
    session TEXT NOT NULL,
    style_tag TEXT NOT NULL,
    trigger_type TEXT DEFAULT 'ote_zone',
    market_regime TEXT DEFAULT 'bullish_impulse',
    confidence REAL NOT NULL DEFAULT 0.7,
    snapshot_json TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    invalid_if TEXT NOT NULL,
    playbook_version TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed',
    news_refs_json TEXT DEFAULT '[]',
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
    FOREIGN KEY (run_id) REFERENCES account_runs(run_id)
);

CREATE TABLE IF NOT EXISTS decisions (
    decision_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    time TEXT NOT NULL,
    trigger_type TEXT NOT NULL DEFAULT 'hourly_scan',
    action TEXT NOT NULL,
    rejected_reason TEXT DEFAULT '',
    raw_response TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'accepted',
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS shadow_trades (
    shadow_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    time TEXT NOT NULL,
    shadow_type TEXT NOT NULL,
    rejected_reason TEXT DEFAULT '',
    action TEXT NOT NULL,
    hypothetical_entry REAL NOT NULL,
    hypothetical_sl REAL NOT NULL,
    hypothetical_tp REAL NOT NULL,
    simulated_exit REAL NOT NULL,
    simulated_pnl_usd REAL NOT NULL,
    simulated_r REAL NOT NULL,
    outcome TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS postmortems (
    trade_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    followed_plan INTEGER NOT NULL DEFAULT 1,
    what_happened TEXT NOT NULL,
    mistake_tags TEXT NOT NULL DEFAULT '["none"]',
    what_worked TEXT NOT NULL DEFAULT '',
    lesson TEXT NOT NULL,
    playbook_suggestion TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (trade_id) REFERENCES trades(trade_id)
);

CREATE TABLE IF NOT EXISTS playbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    version TEXT NOT NULL,
    content_md TEXT NOT NULL,
    created_at TEXT NOT NULL,
    change_reason TEXT NOT NULL,
    win_rate_before REAL DEFAULT 0.0,
    win_rate_after REAL DEFAULT 0.0,
    pf_before REAL DEFAULT 0.0,
    pf_after REAL DEFAULT 0.0,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS consensus_events (
    event_id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    direction TEXT NOT NULL,
    agreeing_count INTEGER NOT NULL,
    total_active_agents INTEGER NOT NULL,
    agents_json TEXT NOT NULL,
    entry_range TEXT NOT NULL,
    sl_range TEXT NOT NULL,
    tp_range TEXT NOT NULL,
    avg_confidence REAL NOT NULL,
    result_r REAL DEFAULT 0.0,
    result_pnl_usd REAL DEFAULT 0.0,
    outcome TEXT DEFAULT 'win'
);

CREATE TABLE IF NOT EXISTS daily_stats (
    agent_id TEXT NOT NULL,
    date TEXT NOT NULL,
    pnl_usd REAL NOT NULL DEFAULT 0.0,
    pnl_pct REAL NOT NULL DEFAULT 0.0,
    r_total REAL NOT NULL DEFAULT 0.0,
    equity_close REAL NOT NULL DEFAULT 1000.0,
    drawdown_pct REAL NOT NULL DEFAULT 0.0,
    trades INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    style_tags_json TEXT DEFAULT '[]',
    blowup_occurred INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, date),
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS news_events (
    event_id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    date TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    impact TEXT NOT NULL DEFAULT 'high',
    actual TEXT DEFAULT '',
    forecast TEXT DEFAULT '',
    prior TEXT DEFAULT '',
    surprise_delta TEXT DEFAULT '',
    gold_15m_move_usd REAL DEFAULT 0.0,
    gold_60m_move_usd REAL DEFAULT 0.0,
    neutral_summary TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS weekly_champions (
    week_id TEXT PRIMARY KEY,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    champion_agent_id TEXT NOT NULL,
    runner_up_agent_id TEXT NOT NULL,
    net_pnl_usd REAL NOT NULL,
    net_return_pct REAL NOT NULL,
    win_rate REAL NOT NULL,
    profit_factor REAL NOT NULL,
    total_trades INTEGER NOT NULL,
    cot_bias_next_week TEXT NOT NULL,
    summary_markdown TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_health_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    component TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    details_json TEXT DEFAULT '{}'
);
