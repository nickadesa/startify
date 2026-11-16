import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from db.database import init_db, query_all, query_one

SECRET_KEY = os.environ.get("TOPTIER_SECRET", "toptierclub-competition-secret-2026").encode("utf-8")

RANK_TIERS = [
    ("Champion", "", 2200),
    ("Diamond", "I", 1900),
    ("Diamond", "II", 1750),
    ("Diamond", "III", 1600),
    ("Platinum", "I", 1450),
    ("Platinum", "II", 1320),
    ("Platinum", "III", 1200),
    ("Gold", "I", 1080),
    ("Gold", "II", 960),
    ("Gold", "III", 850),
    ("Silver", "I", 720),
    ("Silver", "II", 600),
    ("Silver", "III", 480),
    ("Bronze", "I", 320),
    ("Bronze", "II", 180),
    ("Bronze", "III", 0),
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    return utc_now().isoformat()


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    s = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), s.encode("utf-8"), 120_000)
    return dk.hex(), s


def verify_password(password: str, expected_hash: str, salt: str) -> bool:
    dk_hex, _ = hash_password(password, salt)
    return hmac.compare_digest(dk_hex, expected_hash)


def sign_token(user_id: str, username: str) -> str:
    exp = int((utc_now() + timedelta(days=14)).timestamp())
    payload = base64.urlsafe_b64encode(
        json.dumps({"uid": user_id, "u": username, "exp": exp}).encode("utf-8")
    ).decode("utf-8")
    sig = hmac.new(SECRET_KEY, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload, sig = token.split(".", 1)
        expected = hmac.new(SECRET_KEY, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8"))
        if int(data.get("exp", 0)) < int(utc_now().timestamp()):
            return None
        return data
    except Exception:
        return None


def compute_level(xp: int) -> int:
    # Level 1 at 0 XP, scaling smoothly
    lvl = 1
    rem = max(0, xp)
    while rem >= lvl * 200:
        rem -= lvl * 200
        lvl += 1
    return lvl


def compute_rank(rank_points: int) -> tuple[str, str]:
    for tier, div, threshold in RANK_TIERS:
        if rank_points >= threshold:
            return tier, div
    return "Bronze", "III"


def award_xp(conn: sqlite3.Connection, user_id: str, delta_xp: int, delta_rp: int = 0) -> None:
    user = query_one(conn, "SELECT xp, rank_points FROM users WHERE id = ?", (user_id,))
    if not user:
        return
    new_xp = max(0, int(user["xp"]) + delta_xp)
    new_rp = max(0, int(user["rank_points"]) + delta_rp)
    new_lvl = compute_level(new_xp)
    tier, div = compute_rank(new_rp)
    conn.execute(
        "UPDATE users SET xp = ?, level = ?, rank_points = ?, rank_tier = ?, rank_division = ? WHERE id = ?",
        (new_xp, new_lvl, new_rp, tier, div, user_id),
    )


def ensure_seeded(conn: Optional[sqlite3.Connection] = None) -> sqlite3.Connection:
    c = conn or init_db()
    row = query_one(c, "SELECT COUNT(*) as cnt FROM users")
    if row and int(row["cnt"]) > 0:
        return c

    now = utc_now()
    now_str = now.isoformat()

    seed_traders = [
        ("u_apex", "apex_kai", "kai@toptier.club", "#10B981", "Champion scalper | NAS100 & XAUUSD NY Open", 2480, 14800, 1920, 38, 9, 11842.50, 24, 18, 6, 3.1),
        ("u_gold", "gold_sniper", "gold@toptier.club", "#F59E0B", "Pure Gold Orderflow & Liquidity Sweeps", 2240, 11200, 1810, 29, 8, 11410.00, 19, 14, 5, 4.2),
        ("u_nas", "nasdaq_v", "nas@toptier.club", "#3B82F6", "Indices & Momentum | 3v3 Team Captain", 1960, 8900, 1695, 22, 11, 10985.40, 22, 15, 7, 5.8),
        ("u_lux", "lux_quant", "lux@toptier.club", "#8B5CF6", "Multi-asset Macro & Risk Parity", 1640, 6400, 1580, 16, 7, 10640.20, 14, 10, 4, 4.9),
        ("u_tokyo", "tokyo_flow", "tokyo@toptier.club", "#EC4899", "Asian Session Liquidity & BTC Perps", 1380, 4500, 1440, 14, 9, 10390.80, 16, 10, 6, 6.4),
        ("u_ny", "ny_sweep", "ny@toptier.club", "#06B6D4", "EURUSD & DXY Correlation Desk", 1120, 2900, 1310, 11, 8, 10185.00, 12, 7, 5, 7.1),
        ("u_siam", "siam_pro", "siam@toptier.club", "#14B8A6", "Thai Competitive Trader | 1v1 Blitz", 760, 1650, 1185, 8, 6, 9912.50, 9, 5, 4, 8.5),
        ("u_rookie", "delta_m", "delta@toptier.club", "#64748B", "Climbing from Bronze to Champion", 340, 520, 1040, 3, 5, 9680.00, 6, 2, 4, 11.2),
    ]

    pw_hash, salt = hash_password("TopTier2026!")

    for uid, uname, email, color, bio, rp, xp, elo, dw, dl, eq, trades, wins, losses, dd in seed_traders:
        tier, div = compute_rank(rp)
        lvl = compute_level(xp)
        c.execute(
            """INSERT INTO users (id, username, email, password_hash, salt, avatar_color, bio,
               rank_tier, rank_division, rank_points, xp, level, elo, duel_wins, duel_losses, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid, uname, email, pw_hash, salt, color, bio, tier, div, rp, xp, lvl, elo, dw, dl, now_str),
        )
        # Demo account
        c.execute(
            """INSERT INTO accounts (id, user_id, mode, room_id, starting_balance, balance, equity, peak_equity,
               max_drawdown_pct, trades_count, wins, losses, status, updated_at)
               VALUES (?, ?, 'demo', NULL, 10000.0, ?, ?, ?, ?, ?, ?, ?, 'active', ?)""",
            (f"acc_demo_{uid}", uid, eq, eq, max(10000.0, eq), dd, trades, wins, losses, now_str),
        )
        # Weekly Ranked $10K account
        c.execute(
            """INSERT INTO accounts (id, user_id, mode, room_id, starting_balance, balance, equity, peak_equity,
               max_drawdown_pct, trades_count, wins, losses, status, updated_at)
               VALUES (?, ?, 'weekly_ranked', NULL, 10000.0, ?, ?, ?, ?, ?, ?, ?, 'active', ?)""",
            (f"acc_wr_{uid}", uid, eq, eq, max(10000.0, eq), dd, trades, wins, losses, now_str),
        )

    # Sample follows
    for f1, f2 in [("u_siam", "u_apex"), ("u_siam", "u_gold"), ("u_nas", "u_apex"), ("u_lux", "u_nas")]:
        c.execute("INSERT OR IGNORE INTO follows VALUES (?, ?, ?)", (f1, f2, now_str))

    # Sample open competition rooms (1v1, 2v2, 3v3, 5v5)
    rooms_seed = [
        ("rm_1v1", "XAU1V1", "Gold & NASDAQ 1v1 Blitz", "1v1", "public", 30, 10000.0, "All Markets", 50, "majority", "waiting", "u_apex"),
        ("rm_2v2", "DUO2V2", "NY Open 2v2 Tag Team", "2v2", "public", 60, 10000.0, "Indices", 50, "majority", "live", "u_nas"),
        ("rm_3v3", "SQUAD3", "Apex 3v3 Shared Chart Arena", "3v3", "public", 120, 10000.0, "All Markets", 50, "majority", "waiting", "u_gold"),
        ("rm_5v5", "CLAN5V", "5v5 Pro Desk Championship", "5v5", "public", 240, 10000.0, "All Markets", 25, "unanimous", "waiting", "u_lux"),
    ]
    for rid, code, name, mode, vis, dur, bal, scope, lev, vrule, st, creator in rooms_seed:
        started = now_str if st == "live" else None
        ends = (now + timedelta(minutes=dur)).isoformat() if st == "live" else None
        c.execute(
            """INSERT INTO rooms (id, code, name, mode, visibility, duration_mins, starting_balance,
               market_scope, max_leverage, vote_rule, status, created_by, started_at, ends_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (rid, code, name, mode, vis, dur, bal, scope, lev, vrule, st, creator, started, ends, now_str),
        )
        uname = query_one(c, "SELECT username FROM users WHERE id = ?", (creator,))["username"]
        c.execute(
            "INSERT INTO room_members VALUES (?, ?, ?, 'A', 1, ?)",
            (rid, creator, uname, now_str),
        )
        c.execute(
            """INSERT INTO accounts (id, user_id, mode, room_id, starting_balance, balance, equity, peak_equity,
               max_drawdown_pct, trades_count, wins, losses, status, updated_at)
               VALUES (?, ?, 'room', ?, ?, ?, ?, ?, 0.0, 0, 0, 0, 'active', ?)""",
            (f"acc_{rid}_A", creator, rid, bal, bal, bal, bal, now_str),
        )
        if rid == "rm_2v2":
            c.execute("INSERT INTO room_members VALUES (?, 'u_tokyo', 'tokyo_flow', 'A', 0, ?)", (rid, now_str))
            c.execute("INSERT INTO room_members VALUES (?, 'u_ny', 'ny_sweep', 'B', 1, ?)", (rid, now_str))
            c.execute(
                """INSERT INTO accounts (id, user_id, mode, room_id, starting_balance, balance, equity, peak_equity,
                   max_drawdown_pct, trades_count, wins, losses, status, updated_at)
                   VALUES (?, 'u_ny', 'room', ?, ?, ?, ?, ?, 0.0, 0, 0, 0, 'active', ?)""",
                (f"acc_{rid}_B", rid, bal, bal, bal, bal, now_str),
            )
            c.execute(
                "INSERT INTO room_messages VALUES (?, ?, 'A', 'u_nas', 'nasdaq_v', 'chat', 'Watching 21700 sweep on NAS100 — drop your levels on chart!', ?)",
                (f"msg_{secrets.token_hex(4)}", rid, now_str),
            )

    # Sample Weekly Tournaments
    tourneys = [
        ("trn_wk1", "TOPTIER Weekly $10K Championship — Season 1", "Global 1-week real-time market competition. Top 20% promote to next Rank Tier.", "live", 10000.0, "All Markets", 5, 25.0, "Season 1 Champion Trophy", (now - timedelta(days=2)).isoformat(), (now + timedelta(days=5)).isoformat()),
        ("trn_nas", "NASDAQ & Gold NY Open Cup", "48-hour high-precision sprint on XAUUSD & NAS100 only.", "live", 10000.0, "XAUUSD & NAS100", 3, 15.0, "NY Open Gold Medal", (now - timedelta(hours=8)).isoformat(), (now + timedelta(hours=40)).isoformat()),
        ("trn_crypto", "Weekend Crypto Perp Blitz", "BTCUSDT, ETHUSDT & SOLUSDT 50x maximum leverage showdown.", "upcoming", 10000.0, "Crypto", 5, 25.0, "Crypto Apex Badge", (now + timedelta(days=4)).isoformat(), (now + timedelta(days=6)).isoformat()),
    ]
    for tid, title, desc, st, bal, scope, mtr, mdd, badge, sa, ea in tourneys:
        c.execute("INSERT INTO tournaments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (tid, title, desc, st, bal, scope, mtr, mdd, badge, sa, ea))

    c.commit()
    return c


def get_user_by_token(conn: sqlite3.Connection, auth_header: Optional[str]) -> Optional[Dict[str, Any]]:
    if not auth_header:
        return None
    token = auth_header.replace("Bearer ", "").strip()
    data = verify_token(token)
    if not data:
        return None
    return query_one(
        conn,
        "SELECT id, username, email, avatar_color, bio, rank_tier, rank_division, rank_points, xp, level, elo, duel_wins, duel_losses, created_at FROM users WHERE id = ?",
        (data["uid"],),
    )


def register_user(conn: sqlite3.Connection, username: str, email: str, password: str) -> Dict[str, Any]:
    uname = username.strip().lstrip("@").lower()
    mail = email.strip().lower()
    if len(uname) < 3 or len(password) < 6:
        raise ValueError("Username must be >= 3 chars and password >= 6 chars")
    existing = query_one(conn, "SELECT id FROM users WHERE username = ? OR email = ?", (uname, mail))
    if existing:
        raise ValueError("Username or email already exists")

    uid = f"u_{secrets.token_hex(6)}"
    pw_hash, salt = hash_password(password)
    now_str = utc_iso()
    colors = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4"]
    color = colors[int(hashlib.md5(uname.encode()).hexdigest(), 16) % len(colors)]

    conn.execute(
        """INSERT INTO users (id, username, email, password_hash, salt, avatar_color, bio,
           rank_tier, rank_division, rank_points, xp, level, elo, duel_wins, duel_losses, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Competitive Trader at TOPTIERclub', 'Bronze', 'III', 100, 0, 1, 1000, 0, 0, ?)""",
        (uid, uname, mail, pw_hash, salt, color, now_str),
    )
    # Create default Demo & Weekly Ranked $10,000 accounts
    for mode in ("demo", "weekly_ranked"):
        conn.execute(
            """INSERT INTO accounts (id, user_id, mode, room_id, starting_balance, balance, equity, peak_equity,
               max_drawdown_pct, trades_count, wins, losses, status, updated_at)
               VALUES (?, ?, ?, NULL, 10000.0, 10000.0, 10000.0, 10000.0, 0.0, 0, 0, 0, 'active', ?)""",
            (f"acc_{mode}_{uid}", uid, mode, now_str),
        )
    conn.commit()
    token = sign_token(uid, uname)
    user = query_one(conn, "SELECT id, username, email, avatar_color, bio, rank_tier, rank_division, rank_points, xp, level, elo, duel_wins, duel_losses, created_at FROM users WHERE id = ?", (uid,))
    return {"token": token, "user": user}


def login_user(conn: sqlite3.Connection, identifier: str, password: str) -> Dict[str, Any]:
    ident = identifier.strip().lstrip("@").lower()
    row = query_one(conn, "SELECT * FROM users WHERE username = ? OR email = ?", (ident, ident))
    if not row or not verify_password(password, row["password_hash"], row["salt"]):
        raise ValueError("Invalid username/email or password")
    token = sign_token(row["id"], row["username"])
    user = {k: v for k, v in row.items() if k not in ("password_hash", "salt")}
    return {"token": token, "user": user}


def get_profile(conn: sqlite3.Connection, username: str, viewer_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    uname = username.strip().lstrip("@").lower()
    user = query_one(
        conn,
        "SELECT id, username, avatar_color, bio, rank_tier, rank_division, rank_points, xp, level, elo, duel_wins, duel_losses, created_at FROM users WHERE username = ?",
        (uname,),
    )
    if not user:
        return None
    uid = user["id"]
    followers = query_one(conn, "SELECT COUNT(*) as c FROM follows WHERE following_id = ?", (uid,))["c"]
    following = query_one(conn, "SELECT COUNT(*) as c FROM follows WHERE follower_id = ?", (uid,))["c"]
    is_following = False
    if viewer_id:
        f = query_one(conn, "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?", (viewer_id, uid))
        is_following = bool(f)
    accounts = query_all(conn, "SELECT * FROM accounts WHERE user_id = ?", (uid,))
    recent_trades = query_all(
        conn,
        "SELECT * FROM positions WHERE user_id = ? ORDER BY opened_at DESC LIMIT 20",
        (uid,),
    )
    return {
        "user": user,
        "followers_count": followers,
        "following_count": following,
        "is_following": is_following,
        "accounts": accounts,
        "recent_trades": recent_trades,
    }


def toggle_follow(conn: sqlite3.Connection, follower_id: str, target_username: str) -> Dict[str, Any]:
    target = query_one(conn, "SELECT id FROM users WHERE username = ?", (target_username.strip().lstrip("@").lower(),))
    if not target:
        raise ValueError("Trader not found")
    tid = target["id"]
    if tid == follower_id:
        raise ValueError("Cannot follow yourself")
    exists = query_one(conn, "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?", (follower_id, tid))
    if exists:
        conn.execute("DELETE FROM follows WHERE follower_id = ? AND following_id = ?", (follower_id, tid))
        following = False
    else:
        conn.execute("INSERT INTO follows VALUES (?, ?, ?)", (follower_id, tid, utc_iso()))
        following = True
    conn.commit()
    cnt = query_one(conn, "SELECT COUNT(*) as c FROM follows WHERE following_id = ?", (tid,))["c"]
    return {"following": following, "followers_count": cnt}


def place_order(
    conn: sqlite3.Connection,
    user_id: str,
    account_id: str,
    symbol: str,
    side: str,
    order_type: str,
    entry_price: float,
    notional_usd: float,
    leverage: int = 25,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
) -> Dict[str, Any]:
    acc = query_one(conn, "SELECT * FROM accounts WHERE id = ?", (account_id,))
    if not acc:
        raise ValueError("Account not found")
    if acc["status"] == "busted":
        raise ValueError("Account busted (Max Drawdown exceeded)")
    if entry_price <= 0 or notional_usd <= 0:
        raise ValueError("Invalid price or order size")
    max_buying_power = float(acc["balance"]) * max(1, leverage)
    if notional_usd > max_buying_power:
        raise ValueError(f"Insufficient margin (max ${max_buying_power:,.2f} at {leverage}x)")

    pid = f"pos_{secrets.token_hex(6)}"
    qty = notional_usd / entry_price
    status = "PENDING" if order_type.lower() == "limit" else "OPEN"
    conn.execute(
        """INSERT INTO positions (id, account_id, user_id, symbol, side, order_type, entry_price, qty,
           notional_usd, leverage, stop_loss, take_profit, status, pnl_usd, opened_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?)""",
        (pid, account_id, user_id, symbol.upper(), side.upper(), order_type.lower(), entry_price, qty, notional_usd, leverage, stop_loss, take_profit, status, utc_iso()),
    )
    conn.commit()
    return query_one(conn, "SELECT * FROM positions WHERE id = ?", (pid,))


def close_position(conn: sqlite3.Connection, user_id: str, position_id: str, exit_price: float) -> Dict[str, Any]:
    pos = query_one(conn, "SELECT * FROM positions WHERE id = ?", (position_id,))
    if not pos:
        raise ValueError("Position not found")
    if pos["status"] == "CLOSED":
        return pos
    acc = query_one(conn, "SELECT * FROM accounts WHERE id = ?", (pos["account_id"],))
    if not acc:
        raise ValueError("Account not found")

    if pos["status"] == "PENDING":
        conn.execute("UPDATE positions SET status = 'CLOSED', exit_price = ?, pnl_usd = 0.0, closed_at = ? WHERE id = ?", (exit_price, utc_iso(), position_id))
        conn.commit()
        return query_one(conn, "SELECT * FROM positions WHERE id = ?", (position_id,))

    entry = float(pos["entry_price"])
    qty = float(pos["qty"])
    raw_pnl = (exit_price - entry) * qty if pos["side"] == "LONG" else (entry - exit_price) * qty
    fee = float(pos["notional_usd"]) * 0.0002  # 0.02% standard competition fee
    net_pnl = round(raw_pnl - fee, 2)

    new_bal = round(float(acc["balance"]) + net_pnl, 2)
    peak = max(float(acc["peak_equity"]), new_bal)
    dd_pct = round(max(float(acc["max_drawdown_pct"]), ((peak - new_bal) / peak) * 100.0 if peak > 0 else 0.0), 2)
    wins = int(acc["wins"]) + (1 if net_pnl > 0 else 0)
    losses = int(acc["losses"]) + (1 if net_pnl <= 0 else 0)
    trades = int(acc["trades_count"]) + 1
    acc_status = "busted" if (acc["mode"] == "weekly_ranked" and new_bal <= float(acc["starting_balance"]) * 0.75) else "active"

    conn.execute(
        "UPDATE positions SET status = 'CLOSED', exit_price = ?, pnl_usd = ?, closed_at = ? WHERE id = ?",
        (exit_price, net_pnl, utc_iso(), position_id),
    )
    conn.execute(
        """UPDATE accounts SET balance = ?, equity = ?, peak_equity = ?, max_drawdown_pct = ?,
           trades_count = ?, wins = ?, losses = ?, status = ?, updated_at = ? WHERE id = ?""",
        (new_bal, new_bal, peak, dd_pct, trades, wins, losses, acc_status, utc_iso(), acc["id"]),
    )
    award_xp(conn, user_id, 25 if net_pnl > 0 else 10, 12 if net_pnl > 0 else -5)
    conn.commit()
    return query_one(conn, "SELECT * FROM positions WHERE id = ?", (position_id,))


def update_position_sl_tp(
    conn: sqlite3.Connection, position_id: str, stop_loss: Optional[float], take_profit: Optional[float]
) -> Dict[str, Any]:
    conn.execute("UPDATE positions SET stop_loss = ?, take_profit = ? WHERE id = ?", (stop_loss, take_profit, position_id))
    conn.commit()
    return query_one(conn, "SELECT * FROM positions WHERE id = ?", (position_id,))


def get_weekly_leaderboard(conn: sqlite3.Connection, tier_filter: str = "ALL") -> List[Dict[str, Any]]:
    rows = query_all(
        conn,
        """SELECT u.id, u.username, u.avatar_color, u.rank_tier, u.rank_division, u.rank_points, u.level, u.xp, u.elo,
                  a.starting_balance, a.equity, a.max_drawdown_pct, a.trades_count, a.wins, a.losses, a.status,
                  ROUND(((a.equity - a.starting_balance) / a.starting_balance) * 100.0, 2) as roi_pct
           FROM accounts a
           JOIN users u ON a.user_id = u.id
           WHERE a.mode = 'weekly_ranked'
           ORDER BY roi_pct DESC, a.max_drawdown_pct ASC""",
    )
    if tier_filter and tier_filter.upper() != "ALL":
        rows = [r for r in rows if r["rank_tier"].upper() == tier_filter.upper()]
    for idx, r in enumerate(rows):
        r["position"] = idx + 1
        r["qualified"] = int(r["trades_count"]) >= 5 and r["status"] != "busted"
    return rows


def create_room(
    conn: sqlite3.Connection,
    user: Dict[str, Any],
    name: str,
    mode: str,
    visibility: str,
    duration_mins: int,
    starting_balance: float,
    market_scope: str,
    max_leverage: int,
    vote_rule: str,
) -> Dict[str, Any]:
    rid = f"rm_{secrets.token_hex(5)}"
    code = secrets.token_hex(3).upper()
    now_str = utc_iso()
    conn.execute(
        """INSERT INTO rooms (id, code, name, mode, visibility, duration_mins, starting_balance,
           market_scope, max_leverage, vote_rule, status, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)""",
        (rid, code, name.strip() or f"{mode} Arena", mode, visibility, duration_mins, starting_balance, market_scope, max_leverage, vote_rule, user["id"], now_str),
    )
    conn.execute("INSERT INTO room_members VALUES (?, ?, ?, 'A', 1, ?)", (rid, user["id"], user["username"], now_str))
    conn.execute(
        """INSERT INTO accounts (id, user_id, mode, room_id, starting_balance, balance, equity, peak_equity,
           max_drawdown_pct, trades_count, wins, losses, status, updated_at)
           VALUES (?, ?, 'room', ?, ?, ?, ?, ?, 0.0, 0, 0, 0, 'active', ?)""",
        (f"acc_{rid}_A", user["id"], rid, starting_balance, starting_balance, starting_balance, starting_balance, now_str),
    )
    conn.execute(
        "INSERT INTO room_messages VALUES (?, ?, 'A', ?, ?, 'system', ?, ?)",
        (f"msg_{secrets.token_hex(4)}", rid, user["id"], user["username"], f"Room {code} created ({mode} · {vote_rule} vote)", now_str),
    )
    conn.commit()
    return get_room_detail(conn, code)


def join_room(conn: sqlite3.Connection, user: Dict[str, Any], code: str, preferred_team: Optional[str] = None) -> Dict[str, Any]:
    room = query_one(conn, "SELECT * FROM rooms WHERE UPPER(code) = ?", (code.strip().upper(),))
    if not room:
        raise ValueError("Room code not found")
    rid = room["id"]
    existing = query_one(conn, "SELECT * FROM room_members WHERE room_id = ? AND user_id = ?", (rid, user["id"]))
    if existing:
        return get_room_detail(conn, room["code"])

    members = query_all(conn, "SELECT * FROM room_members WHERE room_id = ?", (rid,))
    team_size = int(room["mode"][0])
    a_count = sum(1 for m in members if m["team"] == "A")
    b_count = sum(1 for m in members if m["team"] == "B")

    team = preferred_team if preferred_team in ("A", "B") else ("B" if b_count < a_count else "A")
    if team == "A" and a_count >= team_size:
        team = "B"
    if (team == "A" and a_count >= team_size) or (team == "B" and b_count >= team_size):
        raise ValueError("Room is already full")

    now_str = utc_iso()
    is_cap = 1 if (team == "A" and a_count == 0) or (team == "B" and b_count == 0) else 0
    conn.execute("INSERT INTO room_members VALUES (?, ?, ?, ?, ?, ?)", (rid, user["id"], user["username"], team, is_cap, now_str))
    acc_id = f"acc_{rid}_{team}"
    if not query_one(conn, "SELECT id FROM accounts WHERE id = ?", (acc_id,)):
        bal = float(room["starting_balance"])
        conn.execute(
            """INSERT INTO accounts (id, user_id, mode, room_id, starting_balance, balance, equity, peak_equity,
               max_drawdown_pct, trades_count, wins, losses, status, updated_at)
               VALUES (?, ?, 'room', ?, ?, ?, ?, ?, 0.0, 0, 0, 0, 'active', ?)""",
            (acc_id, user["id"], rid, bal, bal, bal, bal, now_str),
        )
    conn.execute(
        "INSERT INTO room_messages VALUES (?, ?, ?, ?, ?, 'system', ?, ?)",
        (f"msg_{secrets.token_hex(4)}", rid, team, user["id"], user["username"], f"@{user['username']} joined Team {team}", now_str),
    )
    if room["status"] == "waiting" and a_count + b_count + 1 >= 2:
        ends = (utc_now() + timedelta(minutes=int(room["duration_mins"]))).isoformat()
        conn.execute("UPDATE rooms SET status = 'live', started_at = ?, ends_at = ? WHERE id = ?", (now_str, ends, rid))
    conn.commit()
    return get_room_detail(conn, room["code"])


def get_room_detail(conn: sqlite3.Connection, code: str) -> Optional[Dict[str, Any]]:
    room = query_one(conn, "SELECT * FROM rooms WHERE UPPER(code) = ?", (code.strip().upper(),))
    if not room:
        return None
    rid = room["id"]
    members = query_all(
        conn,
        """SELECT rm.*, u.avatar_color, u.rank_tier, u.rank_division, u.level
           FROM room_members rm LEFT JOIN users u ON rm.user_id = u.id
           WHERE rm.room_id = ?""",
        (rid,),
    )
    acc_a = query_one(conn, "SELECT * FROM accounts WHERE id = ?", (f"acc_{rid}_A",))
    acc_b = query_one(conn, "SELECT * FROM accounts WHERE id = ?", (f"acc_{rid}_B",))
    drawings = query_all(conn, "SELECT * FROM room_drawings WHERE room_id = ? ORDER BY created_at ASC", (rid,))
    proposals = query_all(conn, "SELECT * FROM room_proposals WHERE room_id = ? ORDER BY created_at DESC LIMIT 15", (rid,))
    messages = query_all(conn, "SELECT * FROM room_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 60", (rid,))
    return {
        "room": room,
        "members": members,
        "account_a": acc_a,
        "account_b": acc_b,
        "drawings": drawings,
        "proposals": proposals,
        "messages": messages,
    }


def propose_team_trade(
    conn: sqlite3.Connection,
    user: Dict[str, Any],
    code: str,
    symbol: str,
    side: str,
    order_type: str,
    entry_price: float,
    notional_usd: float,
    leverage: int,
    stop_loss: Optional[float],
    take_profit: Optional[float],
) -> Dict[str, Any]:
    room = query_one(conn, "SELECT * FROM rooms WHERE UPPER(code) = ?", (code.strip().upper(),))
    if not room:
        raise ValueError("Room not found")
    rid = room["id"]
    member = query_one(conn, "SELECT * FROM room_members WHERE room_id = ? AND user_id = ?", (rid, user["id"]))
    if not member:
        raise ValueError("You are not in this room")
    team = member["team"]
    teammates = query_all(conn, "SELECT * FROM room_members WHERE room_id = ? AND team = ?", (rid, team))

    # In 1v1 or solo team, execute immediately!
    if len(teammates) <= 1 or room["mode"] == "1v1":
        pos = place_order(conn, user["id"], f"acc_{rid}_{team}", symbol, side, order_type, entry_price, notional_usd, leverage, stop_loss, take_profit)
        conn.execute(
            "INSERT INTO room_messages VALUES (?, ?, ?, ?, ?, 'system', ?, ?)",
            (f"msg_{secrets.token_hex(4)}", rid, team, user["id"], user["username"], f"@{user['username']} executed {side.upper()} {symbol} @ {entry_price}", utc_iso()),
        )
        conn.commit()
        return {"executed": True, "position": pos, "proposal": None}

    pid = f"prop_{secrets.token_hex(5)}"
    voters = {user["id"]: "approve"}
    now = utc_now()
    expires = (now + timedelta(seconds=30)).isoformat()
    conn.execute(
        """INSERT INTO room_proposals (id, room_id, team, proposer_id, proposer_name, symbol, side, order_type,
           entry_price, notional_usd, leverage, stop_loss, take_profit, status, voters_json, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)""",
        (pid, rid, team, user["id"], user["username"], symbol.upper(), side.upper(), order_type.lower(), entry_price, notional_usd, leverage, stop_loss, take_profit, json.dumps(voters), expires, now.isoformat()),
    )
    conn.execute(
        "INSERT INTO room_messages VALUES (?, ?, ?, ?, ?, 'setup', ?, ?)",
        (f"msg_{secrets.token_hex(4)}", rid, team, user["id"], user["username"], f"VOTE NEEDED: {side.upper()} {symbol} @ {entry_price} (${notional_usd:,.0f})", now.isoformat()),
    )
    conn.commit()
    return {"executed": False, "proposal": query_one(conn, "SELECT * FROM room_proposals WHERE id = ?", (pid,))}


def vote_team_proposal(conn: sqlite3.Connection, user: Dict[str, Any], proposal_id: str, vote: str) -> Dict[str, Any]:
    prop = query_one(conn, "SELECT * FROM room_proposals WHERE id = ?", (proposal_id,))
    if not prop:
        raise ValueError("Proposal not found")
    if prop["status"] != "pending":
        return {"proposal": prop, "executed": False}
    room = query_one(conn, "SELECT * FROM rooms WHERE id = ?", (prop["room_id"],))
    teammates = query_all(conn, "SELECT * FROM room_members WHERE room_id = ? AND team = ?", (prop["room_id"], prop["team"]))
    voters = json.loads(prop["voters_json"] or "{}")
    voters[user["id"]] = "approve" if vote == "approve" else "reject"

    approvals = sum(1 for v in voters.values() if v == "approve")
    rejects = sum(1 for v in voters.values() if v == "reject")
    total_team = max(1, len(teammates))
    needed = total_team if room["vote_rule"] == "unanimous" else (total_team // 2) + 1

    executed_pos = None
    new_status = "pending"
    if approvals >= needed:
        new_status = "approved"
        executed_pos = place_order(
            conn,
            prop["proposer_id"],
            f"acc_{prop['room_id']}_{prop['team']}",
            prop["symbol"],
            prop["side"],
            prop["order_type"],
            float(prop["entry_price"]),
            float(prop["notional_usd"]),
            int(prop["leverage"]),
            prop["stop_loss"],
            prop["take_profit"],
        )
        conn.execute(
            "INSERT INTO room_messages VALUES (?, ?, ?, ?, ?, 'system', ?, ?)",
            (f"msg_{secrets.token_hex(4)}", prop["room_id"], prop["team"], user["id"], user["username"], f"VOTE PASSED ({approvals}/{total_team}): {prop['side']} {prop['symbol']} executed!", utc_iso()),
        )
    elif rejects > (total_team - needed):
        new_status = "rejected"
        conn.execute(
            "INSERT INTO room_messages VALUES (?, ?, ?, ?, ?, 'system', ?, ?)",
            (f"msg_{secrets.token_hex(4)}", prop["room_id"], prop["team"], user["id"], user["username"], f"VOTE REJECTED ({approvals}/{total_team})", utc_iso()),
        )

    conn.execute("UPDATE room_proposals SET status = ?, voters_json = ? WHERE id = ?", (new_status, json.dumps(voters), proposal_id))
    conn.commit()
    return {"proposal": query_one(conn, "SELECT * FROM room_proposals WHERE id = ?", (proposal_id,)), "executed": bool(executed_pos), "position": executed_pos}
