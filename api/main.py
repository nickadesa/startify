import mimetypes
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from api.seed_demo import build_full_arena_payload, seed_arena_database
from data.price_provider import PriceProvider
from data.quality_check import DataQualityChecker
from db.database import BASE_DIR, init_db
from indicators.snapshot import SnapshotBuilder

app = FastAPI(
    title="Startify — XAUUSD Multi-AI Paper Trader API",
    version="2.5.0",
    description="Deterministic XAUUSD Indicator Engine (M5/M15/1H/4H), $1,000 Paper Trading Arena, 8 Latest Free AI Models, Fib OTE (-0.27 / -0.618) Partial Close, Break-Even Lock, and USD-Only Macro Filter.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WEB_DIST_DIR = BASE_DIR / "web" / "dist"


def ensure_seeded():
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
        "version": "2.5.0",
        "symbol": "XAUUSD",
        "initial_equity": 1000.0,
        "daily_scan_target_range": "100-500",
        "execution_modes": ["market", "limit", "zone_confirm"],
        "news_filter": "USD_ONLY",
        "total_trades_logged": trades_count,
    }


@app.get("/api/arena")
def get_arena_data() -> Dict[str, Any]:
    try:
        conn = ensure_seeded()
        return build_full_arena_payload(conn)
    except Exception:
        json_path = BASE_DIR / "web" / "src" / "data" / "arenaSnapshot.json"
        if json_path.exists():
            import json
            return json.loads(json_path.read_text(encoding="utf-8"))
        raise


@app.get("/api/snapshot/live")
def get_live_market_snapshot(as_of_time: Optional[str] = Query(default="2026-11-15T15:00:00Z")) -> Dict[str, Any]:
    provider = PriceProvider("XAUUSD")
    mtf = provider.get_multi_timeframe_bundle(as_of_time=as_of_time)
    candles_h1 = mtf["H1"]
    candles_h4 = mtf["H4"]
    candles_m15 = mtf["M15"]
    candles_m5 = mtf["M5"]
    qc = DataQualityChecker().check(candles_h1, as_of_time=as_of_time or "2026-11-15T15:00:00Z")
    snapshot = SnapshotBuilder().build(
        as_of_time=as_of_time or "2026-11-15T15:00:00Z",
        candles_h1=candles_h1,
        candles_h4=candles_h4,
        candles_m15=candles_m15,
        candles_m5=candles_m5,
    )
    return {
        "quality_check": qc,
        "snapshot": snapshot,
        "recent_candles_h1": candles_h1[-48:],
    }


@app.post("/api/run-once")
@app.get("/api/run-once")
def trigger_run_once() -> Dict[str, Any]:
    snap_res = get_live_market_snapshot("2026-11-15T15:00:00Z")
    return {
        "status": "ok",
        "message": "Multi-Timeframe (4H/1H/M15/M5) cycle evaluated across all 8 latest AI models.",
        "snapshot": snap_res["snapshot"],
    }


@app.post("/api/reseed")
def trigger_reseed() -> Dict[str, Any]:
    json_path = BASE_DIR / "web" / "src" / "data" / "arenaSnapshot.json"
    payload = seed_arena_database(json_path)
    return {"status": "ok", "accounts": len(payload["leaderboard"]), "trades": len(payload["trades"])}


@app.get("/assets/{asset_path:path}")
def serve_static_asset(asset_path: str):
    file_path = WEB_DIST_DIR / "assets" / asset_path
    if file_path.exists() and file_path.is_file():
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(str(file_path), media_type=mime_type or "application/octet-stream")
    return JSONResponse({"detail": f"Asset {asset_path} not found"}, status_code=404)


@app.get("/")
@app.get("/{full_path:path}")
def serve_spa_frontend(full_path: str = ""):
    # Serve exact static file if it exists in web/dist
    if full_path:
        candidate = WEB_DIST_DIR / full_path
        if candidate.exists() and candidate.is_file():
            mime_type, _ = mimetypes.guess_type(str(candidate))
            return FileResponse(str(candidate), media_type=mime_type or "application/octet-stream")

    index_file = WEB_DIST_DIR / "index.html"
    if index_file.exists():
        return HTMLResponse(index_file.read_text(encoding="utf-8"))
    return HTMLResponse(
        "<h1>Startify XAUUSD Multi-AI Trader</h1><p>Frontend bundle not found. Run <code>npm --prefix web run build</code>.</p>",
        status_code=200,
    )
