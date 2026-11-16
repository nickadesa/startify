import os
import shutil
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BASE_DIR / "db" / "trades.sqlite"
SCHEMA_PATH = BASE_DIR / "db" / "schema.sql"


def get_db_path(custom_path: Optional[str] = None) -> Path:
    if custom_path:
        return Path(custom_path)
    env_path = os.environ.get("DATABASE_PATH")
    if env_path:
        p = Path(env_path)
        return p if p.is_absolute() else BASE_DIR / p

    # On Vercel Serverless (/var/task), the project directory is read-only.
    # Automatically copy the seeded SQLite DB to /tmp/trades.sqlite so read/write and WAL work seamlessly.
    if os.environ.get("VERCEL") or not os.access(str(BASE_DIR / "db"), os.W_OK):
        tmp_db = Path("/tmp/trades.sqlite")
        if not tmp_db.exists() and DEFAULT_DB_PATH.exists():
            try:
                shutil.copy2(DEFAULT_DB_PATH, tmp_db)
            except Exception:
                pass
        return tmp_db

    return DEFAULT_DB_PATH


def get_connection(custom_path: Optional[str] = None) -> sqlite3.Connection:
    db_path = get_db_path(custom_path)
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
    except Exception:
        pass
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(custom_path: Optional[str] = None) -> sqlite3.Connection:
    conn = get_connection(custom_path)
    if SCHEMA_PATH.exists():
        schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
        conn.executescript(schema_sql)
        conn.commit()
    return conn


def query_all(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    cur = conn.execute(sql, params)
    return [dict(row) for row in cur.fetchall()]


def query_one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    cur = conn.execute(sql, params)
    row = cur.fetchone()
    return dict(row) if row else None
