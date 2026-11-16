-- TOPTIERclub Trading Competition Platform Schema

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#10B981',
    bio TEXT NOT NULL DEFAULT 'Competitive Trader at TOPTIERclub',
    rank_tier TEXT NOT NULL DEFAULT 'Bronze',
    rank_division TEXT NOT NULL DEFAULT 'I',
    rank_points INTEGER NOT NULL DEFAULT 100,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    elo INTEGER NOT NULL DEFAULT 1000,
    duel_wins INTEGER NOT NULL DEFAULT 0,
    duel_losses INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL, -- 'demo', 'weekly_ranked', 'room'
    room_id TEXT,
    starting_balance REAL NOT NULL DEFAULT 10000.0,
    balance REAL NOT NULL DEFAULT 10000.0,
    equity REAL NOT NULL DEFAULT 10000.0,
    peak_equity REAL NOT NULL DEFAULT 10000.0,
    max_drawdown_pct REAL NOT NULL DEFAULT 0.0,
    trades_count INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'busted'
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL, -- 'LONG', 'SHORT'
    order_type TEXT NOT NULL DEFAULT 'market', -- 'market', 'limit'
    entry_price REAL NOT NULL,
    qty REAL NOT NULL,
    notional_usd REAL NOT NULL,
    leverage INTEGER NOT NULL DEFAULT 25,
    stop_loss REAL,
    take_profit REAL,
    status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'PENDING', 'CLOSED'
    exit_price REAL,
    pnl_usd REAL NOT NULL DEFAULT 0.0,
    opened_at TEXT NOT NULL,
    closed_at TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    mode TEXT NOT NULL, -- '1v1', '2v2', '3v3', '4v4', '5v5'
    visibility TEXT NOT NULL DEFAULT 'public', -- 'public', 'private'
    duration_mins INTEGER NOT NULL DEFAULT 60,
    starting_balance REAL NOT NULL DEFAULT 10000.0,
    market_scope TEXT NOT NULL DEFAULT 'All Markets',
    max_leverage INTEGER NOT NULL DEFAULT 50,
    vote_rule TEXT NOT NULL DEFAULT 'majority', -- 'majority', 'unanimous'
    status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'live', 'finished'
    created_by TEXT NOT NULL,
    started_at TEXT,
    ends_at TEXT,
    winner_team TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    team TEXT NOT NULL DEFAULT 'A', -- 'A', 'B'
    is_captain INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_drawings (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    team TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    symbol TEXT NOT NULL,
    tool TEXT NOT NULL, -- 'hline', 'trend', 'fib', 'text'
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_proposals (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    team TEXT NOT NULL,
    proposer_id TEXT NOT NULL,
    proposer_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'market',
    entry_price REAL NOT NULL,
    notional_usd REAL NOT NULL,
    leverage INTEGER NOT NULL DEFAULT 25,
    stop_loss REAL,
    take_profit REAL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
    voters_json TEXT NOT NULL DEFAULT '{}',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    team TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    msg_type TEXT NOT NULL DEFAULT 'chat', -- 'chat', 'system', 'setup'
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_rtc_signals (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    team TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'live', -- 'upcoming', 'live', 'ended'
    starting_balance REAL NOT NULL DEFAULT 10000.0,
    market_scope TEXT NOT NULL DEFAULT 'All Markets',
    min_trades INTEGER NOT NULL DEFAULT 5,
    max_dd_pct REAL NOT NULL DEFAULT 25.0,
    prize_badge TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_entries (
    tournament_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    account_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (tournament_id, user_id)
);
