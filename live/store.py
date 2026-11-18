"""Persistent store (Turso libSQL Cloud or local SQLite/WAL). Everything the arena
does is written here, so a restart never loses state: accounts, trades, journal, chat."""
from __future__ import annotations
import json, os, sqlite3, threading, time, urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

BASE = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("LIVE_DB_PATH", str(BASE / "data" / "live.sqlite")))
_lock = threading.RLock()
_conn: Any = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS accounts(agent_id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS trades(
  id TEXT PRIMARY KEY, agent_id TEXT, status TEXT, opened_at TEXT, closed_at TEXT, data TEXT);
CREATE INDEX IF NOT EXISTS ix_trades_agent ON trades(agent_id, status);
CREATE TABLE IF NOT EXISTS journal(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, agent_id TEXT, trade_id TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS chat(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, agent_id TEXT, kind TEXT, reply_to INTEGER, text TEXT, tokens INTEGER, media TEXT);
CREATE TABLE IF NOT EXISTS equity(ts TEXT, agent_id TEXT, equity REAL);
CREATE INDEX IF NOT EXISTS ix_equity ON equity(agent_id, ts);
"""


def _turso_arg(v: Any) -> Dict[str, Any]:
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": "1" if v else "0"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    return {"type": "text", "value": str(v)}


def _turso_val(cell: Dict[str, Any]) -> Any:
    t = cell.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(cell["value"])
    if t == "float":
        return float(cell["value"])
    return cell.get("value")


class _TursoCursor:
    def __init__(self, rows: List[Dict[str, Any]], lastrowid: Optional[int] = None):
        self._rows = rows
        self.lastrowid = lastrowid

    def fetchone(self) -> Optional[Dict[str, Any]]:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> List[Dict[str, Any]]:
        return self._rows

    def __iter__(self):
        return iter(self._rows)


class _TursoConn:
    """Synchronous SQLite-compatible wrapper over Turso HTTP Hrana v2 (/v2/pipeline)."""
    def __init__(self, url: str, token: str):
        base = url.strip().rstrip("/")
        if base.startswith("libsql://"):
            base = "https://" + base[len("libsql://"):]
        self.endpoint = base + "/v2/pipeline"
        self.token = token.strip()

    def _pipeline(self, stmts: Sequence[tuple[str, Sequence[Any]]]) -> List[_TursoCursor]:
        reqs: List[Dict[str, Any]] = [
            {"type": "execute", "stmt": {"sql": sql, "args": [_turso_arg(a) for a in params]}}
            for sql, params in stmts
        ]
        reqs.append({"type": "close"})
        body = json.dumps({"requests": reqs}).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=body,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        out: List[_TursoCursor] = []
        for r in data.get("results", []):
            if r.get("type") == "error":
                raise RuntimeError(f"Turso error: {r.get('error')}")
            res = (r.get("response") or {}).get("result")
            if not res:
                continue
            cols = [c["name"] for c in res.get("cols", [])]
            rows = [
                {cols[i]: _turso_val(row[i]) for i in range(len(cols))}
                for row in res.get("rows", [])
            ]
            lrid = res.get("last_insert_rowid")
            out.append(_TursoCursor(rows, int(lrid) if lrid is not None else None))
        return out

    def execute(self, sql: str, params: Sequence[Any] = ()) -> _TursoCursor:
        res = self._pipeline([(sql, params)])
        return res[0] if res else _TursoCursor([])

    def executescript(self, script: str) -> None:
        stmts = [(s.strip(), ()) for s in script.split(";") if s.strip()]
        if stmts:
            self._pipeline(stmts)

    def close(self) -> None:
        pass


def conn() -> Any:
    global _conn, DB_PATH
    with _lock:
        if _conn is None:
            t_url = os.getenv("TURSO_DATABASE_URL", "").strip()
            t_tok = os.getenv("TURSO_AUTH_TOKEN", "").strip()
            if t_url and t_tok:
                _conn = _TursoConn(t_url, t_tok)
                _conn.executescript(SCHEMA)
                cols = {r["name"] for r in _conn.execute("PRAGMA table_info(chat)").fetchall()}
                if "media" not in cols:
                    _conn.execute("ALTER TABLE chat ADD COLUMN media TEXT")
                if "src" not in cols:   # 'llm' = written by the model, 'template' = canned fallback line
                    _conn.execute("ALTER TABLE chat ADD COLUMN src TEXT")
                print("Store connected to Turso Cloud", flush=True)
                return _conn
            try:
                DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                print(f"DB_PATH {DB_PATH} not writable ({e}); falling back to /tmp/live.sqlite", flush=True)
                DB_PATH = Path("/tmp/live.sqlite")
                DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, isolation_level=None)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.executescript(SCHEMA)
            cols = {r["name"] for r in _conn.execute("PRAGMA table_info(chat)").fetchall()}
            if "media" not in cols:
                _conn.execute("ALTER TABLE chat ADD COLUMN media TEXT")
            if "src" not in cols:   # 'llm' = written by the model, 'template' = canned fallback line
                _conn.execute("ALTER TABLE chat ADD COLUMN src TEXT")
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

def chat_add(ts: str, agent_id: str, kind: str, text: str, tokens: int = 0, reply_to: Optional[int] = None, media: Optional[str] = None, src: Optional[str] = None) -> int:
    with _lock:
        c = conn().execute("INSERT INTO chat(ts,agent_id,kind,reply_to,text,tokens,media,src) VALUES(?,?,?,?,?,?,?,?)", (ts, agent_id, kind, reply_to, text, tokens, media, src))
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
