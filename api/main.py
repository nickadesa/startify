from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from api.seed_demo import build_full_arena_payload, seed_arena_database
from data.price_provider import PriceProvider
from data.quality_check import DataQualityChecker
from db.database import BASE_DIR, get_db_path, init_db
from indicators.snapshot import SnapshotBuilder

app = FastAPI(
    title="Startify — XAUUSD Multi-AI Paper Trader API",
    version="2.0.0",
    description="Deterministic XAUUSD Indicator Engine, $1,000 Paper Trading Arena, 8 Free AI Providers, and USD-Only Macro Filter.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_seeded():
    db_file = get_db_path()
    conn = init_db()
    cur = conn.execute("SELECT COUNT(*) as c FROM agents")
    row = cur.fetchone()
    if not row or int(row["c"]) == 0:
        json_path = BASE_DIR / "web" / "src" / "data" / "arenaSnapshot.json"
        seed_arena_database(json_path)
    return conn


@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    conn = ensure_seeded()
    cur = conn.execute("SELECT COUNT(*) as c FROM trades")
    trades_count = int(cur.fetchone()["c"])
    return {
        "status": "healthy",
        "brand": "Startify",
        "symbol": "XAUUSD",
        "initial_equity": 1000.0,
        "news_filter": "USD_ONLY",
        "total_trades_logged": trades_count,
    }


@app.get("/api/arena")
def get_arena_data() -> Dict[str, Any]:
    conn = ensure_seeded()
    return build_full_arena_payload(conn)


@app.get("/api/snapshot/live")
def get_live_market_snapshot(as_of_time: Optional[str] = Query(default="2026-11-15T15:00:00Z")) -> Dict[str, Any]:
    provider = PriceProvider("XAUUSD")
    candles_h1 = provider.get_closed_candles("H1", as_of_time=as_of_time, limit=72)
    candles_h4 = provider.get_closed_candles("H4", as_of_time=as_of_time, limit=40)
    qc = DataQualityChecker().check(candles_h1, as_of_time=as_of_time or "2026-11-15T15:00:00Z")
    snapshot = SnapshotBuilder().build(
        as_of_time=as_of_time or "2026-11-15T15:00:00Z",
        candles_h1=candles_h1,
        candles_h4=candles_h4,
    )
    return {
        "quality_check": qc,
        "snapshot": snapshot,
        "recent_candles_h1": candles_h1[-48:],
    }


@app.post("/api/reseed")
def trigger_reseed() -> Dict[str, Any]:
    json_path = BASE_DIR / "web" / "src" / "data" / "arenaSnapshot.json"
    payload = seed_arena_database(json_path)
    return {"status": "ok", "accounts": len(payload["leaderboard"]), "trades": len(payload["trades"])}
