"""Persistent store (SQLite/WAL). Everything the arena does is written here, so a
restart never loses state and nothing is faked: accounts, trades, journal, chat."""
from __future__ import annotations
import json, os, sqlite3, threading, time
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("LIVE_DB_PATH", str(BASE / "data" / "live.sqlite")))
_lock = threading.RLock()
_conn: Optional[sqlite3.Connection] = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS accounts(agent_id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS trades(
  id TEXT PRIMARY KEY, agent_id TEXT, status TEXT, opened_at TEXT, closed_at TEXT, data TEXT);
CREATE INDEX IF NOT EXISTS ix_trades_agent ON trades(agent_id, status);
CREATE TABLE IF NOT EXISTS journal(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, agent_id TEXT, trade_id TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS chat(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, agent_id TEXT, kind TEXT, reply_to INTEGER, text TEXT, tokens INTEGER);
CREATE TABLE IF NOT EXISTS equity(ts TEXT, agent_id TEXT, equity REAL);
CREATE INDEX IF NOT EXISTS ix_equity ON equity(agent_id, ts);
"""

def conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, isolation_level=None)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.executescript(SCHEMA)
        return _conn

def reset_for_tests(path: str) -> None:
    global _conn, DB_PATH
    with _lock:
        if _conn: _conn.close()
        _conn = None
        DB_PATH = Path(path)

def kv_get(k: str, default: Any = None) -> Any:
    with _lock:
        r = conn().execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
        return json.loads(r["v"]) if r else default

def kv_set(k: str, v: Any) -> None:
    with _lock:
        conn().execute("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, json.dumps(v)))

def acct_get(agent_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        r = conn().execute("SELECT data FROM accounts WHERE agent_id=?", (agent_id,)).fetchone()
        return json.loads(r["data"]) if r else None

def acct_all() -> List[Dict[str, Any]]:
    with _lock:
        return [json.loads(r["data"]) for r in conn().execute("SELECT data FROM accounts")]

def acct_put(a: Dict[str, Any]) -> None:
    with _lock:
        conn().execute("INSERT INTO accounts(agent_id,data) VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET data=excluded.data",
                       (a["agent_id"], json.dumps(a)))

def trade_put(t: Dict[str, Any]) -> None:
    with _lock:
        conn().execute(
            "INSERT INTO trades(id,agent_id,status,opened_at,closed_at,data) VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET status=excluded.status, closed_at=excluded.closed_at, data=excluded.data",
            (t["id"], t["agent_id"], t["status"], t["opened_at"], t.get("closed_at"), json.dumps(t)))

def trades(status: Optional[str] = None, agent_id: Optional[str] = None, limit: int = 200, since: Optional[str] = None) -> List[Dict[str, Any]]:
    q, a = "SELECT data FROM trades WHERE 1=1", []
    if status: q += " AND status=?"; a.append(status)
    if agent_id: q += " AND agent_id=?"; a.append(agent_id)
    if since: q += " AND opened_at>=?"; a.append(since)
    q += " ORDER BY opened_at DESC LIMIT ?"; a.append(limit)
    with _lock:
        return [json.loads(r["data"]) for r in conn().execute(q, a)]

def journal_add(ts: str, agent_id: str, trade_id: str, data: Dict[str, Any]) -> None:
    with _lock:
        conn().execute("INSERT INTO journal(ts,agent_id,trade_id,data) VALUES(?,?,?,?)", (ts, agent_id, trade_id, json.dumps(data)))

def journal(limit: int = 200, agent_id: Optional[str] = None) -> List[Dict[str, Any]]:
    q, a = "SELECT id,ts,agent_id,trade_id,data FROM journal", []
    if agent_id: q += " WHERE agent_id=?"; a.append(agent_id)
    q += " ORDER BY id DESC LIMIT ?"; a.append(limit)
    with _lock:
        return [{"id": r["id"], "ts": r["ts"], "agent_id": r["agent_id"], "trade_id": r["trade_id"], **json.loads(r["data"])}
                for r in conn().execute(q, a)]

def chat_add(ts: str, agent_id: str, kind: str, text: str, tokens: int = 0, reply_to: Optional[int] = None) -> int:
    with _lock:
        c = conn().execute("INSERT INTO chat(ts,agent_id,kind,reply_to,text,tokens) VALUES(?,?,?,?,?,?)", (ts, agent_id, kind, reply_to, text, tokens))
        return int(c.lastrowid)

def chat(limit: int = 80, after_id: int = 0) -> List[Dict[str, Any]]:
    with _lock:
        rows = conn().execute("SELECT * FROM chat WHERE id>? ORDER BY id DESC LIMIT ?", (after_id, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]

def equity_add(ts: str, agent_id: str, eq: float) -> None:
    with _lock:
        conn().execute("INSERT INTO equity(ts,agent_id,equity) VALUES(?,?,?)", (ts, agent_id, round(eq, 2)))

def equity_series(agent_id: str, limit: int = 500) -> List[Dict[str, Any]]:
    with _lock:
        rows = conn().execute("SELECT ts,equity FROM equity WHERE agent_id=? ORDER BY ts DESC LIMIT ?", (agent_id, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]
