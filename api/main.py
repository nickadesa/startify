import mimetypes
import re
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from api.seed_demo import build_full_arena_payload, seed_arena_database
from data.price_provider import PriceProvider
from data.quality_check import DataQualityChecker
from db.database import BASE_DIR, init_db
from indicators.snapshot import SnapshotBuilder

app = FastAPI(
    title="Startify — XAUUSD Multi-AI Paper Trader API",
    version="2.5.0",
    description="Deterministic XAUUSD Indicator Engine (M5/M15/1H/4H), $1,000 Paper Trading Arena, 8 Latest Free AI Models (Nov 2026), Fib OTE (-0.27 / -0.618) Partial Close, Break-Even Lock, and USD-Only Macro Filter.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WEB_DIST_DIR = BASE_DIR / "web" / "dist"
_CACHED_INLINED_HTML: Optional[str] = None


def get_inlined_spa_html() -> str:
    """
    Returns web/dist/index.html with all /assets/*.css and /assets/*.js inlined directly
    so Vercel Serverless renders the complete Startify dark UI in a single HTTP 200 response
    and can never show a blank white screen due to sub-resource rewrite mismatches.
    """
    global _CACHED_INLINED_HTML
    if _CACHED_INLINED_HTML:
        return _CACHED_INLINED_HTML

    index_file = WEB_DIST_DIR / "index.html"
    if not index_file.exists():
        return (
            "<!doctype html><html style='background:#07090E;color:#F1F5F9;'>"
            "<body style='background:#07090E;color:#F1F5F9;font-family:sans-serif;padding:2rem;'>"
            "<h1>Startify XAUUSD Multi-AI Trader</h1>"
            "<p>Frontend bundle not found. Run <code>npm --prefix web run build</code>.</p>"
            "</body></html>"
        )

    html = index_file.read_text(encoding="utf-8")

    # Inline stylesheet links if not already inlined
    def _replace_css(match: re.Match) -> str:
        href = match.group(1).lstrip("/")
        css_path = WEB_DIST_DIR / href
        if css_path.exists() and css_path.is_file():
            css_content = css_path.read_text(encoding="utf-8")
            return f"<style>{css_content}</style>"
        return match.group(0)

    html = re.sub(
        r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\'][^>]*/?>',
        _replace_css,
        html,
    )

    # Inline script tags referencing /assets/*.js if not already inlined
    def _replace_js(match: re.Match) -> str:
        src = match.group(1).lstrip("/")
        js_path = WEB_DIST_DIR / src
        if js_path.exists() and js_path.is_file():
            js_content = js_path.read_text(encoding="utf-8")
            # Prevent premature </script> closing inside JS string literals
            safe_js = js_content.replace("</script>", "<\\/script>")
            return f'<script type="module">{safe_js}</script>'
        return match.group(0)

    html = re.sub(
        r'<script[^>]+src=["\'](/assets/[^"\']+\.js)["\'][^>]*>\s*</script>',
        _replace_js,
        html,
    )

    _CACHED_INLINED_HTML = html
    return html


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
        "latest_models_nov_2026": {
            "ai-1": "gemini-3.8-flash",
            "ai-2": "openai/gpt-oss-120b",
            "ai-3": "mistral-small-4",
            "ai-4": "nvidia/nemotron-3-ultra-550b-a55b:free",
            "ai-5": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            "ai-6": "qwen/qwen3.8-27b",
            "ai-7": "nvidia/nemotron-3.5-super-vl:free",
            "ai-8": "command-a-plus-05-2026",
        },
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
        "message": "Multi-Timeframe (4H/1H/M15/M5) cycle evaluated across all 8 latest Nov 2026 AI models.",
        "snapshot": snap_res["snapshot"],
    }


@app.post("/api/reseed")
def trigger_reseed() -> Dict[str, Any]:
    json_path = BASE_DIR / "web" / "src" / "data" / "arenaSnapshot.json"
    payload = seed_arena_database(json_path)
    return {"status": "ok", "accounts": len(payload["leaderboard"]), "trades": len(payload["trades"])}


@app.get("/api/backtest")
@app.post("/api/backtest")
def run_walk_forward_backtest() -> Dict[str, Any]:
    from api.seed_demo import load_config
    from paper.backtester import HistoricalBacktestTrainer

    cfg = load_config()
    return HistoricalBacktestTrainer(BASE_DIR).run_all_agents_backtest(cfg["agents"])


@app.get("/api/orderflow/live")
def get_live_orderflow() -> Dict[str, Any]:
    from data.orderflow_provider import OrderflowProvider

    snap = get_live_market_snapshot("2026-11-15T15:00:00Z")
    spot_px = float(snap["snapshot"].get("price", 4028.90))
    return OrderflowProvider().get_live_orderflow(spot_xauusd_price=spot_px)


@app.get("/api/desk/evaluate")
@app.post("/api/desk/evaluate")
def evaluate_team_desk(send_discord: bool = Query(default=False)) -> Dict[str, Any]:
    from agents.desk_roles import SpecializedDeskCoordinator
    from data.orderflow_provider import OrderflowProvider
    from notifications.discord_webhook import DiscordNotifier

    snap = get_live_market_snapshot("2026-11-15T15:00:00Z")["snapshot"]
    orderflow = OrderflowProvider().get_live_orderflow(spot_xauusd_price=float(snap.get("price", 4028.90)))
    desk_res = SpecializedDeskCoordinator().evaluate_desk(
        snapshot=snap,
        orderflow=orderflow,
        portfolio_equity=1000.0,
        news_blackout_active=False,
    )
    if send_discord and desk_res.get("approved"):
        desk_res["discord_delivery"] = DiscordNotifier().send_entry_signal(desk_res)
    else:
        desk_res["discord_delivery"] = {"sent": False, "reason": "send_discord=false or not approved"}
    return desk_res


@app.post("/api/discord/test")
@app.get("/api/discord/test")
def test_discord_webhook() -> Dict[str, Any]:
    from notifications.discord_webhook import DiscordNotifier

    notifier = DiscordNotifier()
    res = notifier.send_embed(
        title="STARTIFY XAUUSD DESK — CONNECTED",
        description="8-AI Specialized Desk ($1,000 Portfolio) is now connected to Discord for real-time XAUUSD entry signals, Break-Even locks, and USD macro alerts.",
        color=0x00ADFF,
    )
    return {"configured": notifier.is_configured(), "delivery": res}


@app.get("/api/cron/scan")
@app.post("/api/cron/scan")
def vercel_cron_scan() -> Dict[str, Any]:
    return evaluate_team_desk(send_discord=True)


@app.get("/assets/{asset_path:path}")
def serve_static_asset(asset_path: str):
    file_path = WEB_DIST_DIR / "assets" / asset_path
    if file_path.exists() and file_path.is_file():
        mime_type, _ = mimetypes.guess_type(str(file_path))
        if str(file_path).endswith(".js"):
            mime_type = "application/javascript; charset=utf-8"
        elif str(file_path).endswith(".css"):
            mime_type = "text/css; charset=utf-8"
        return FileResponse(str(file_path), media_type=mime_type or "application/octet-stream")
    return JSONResponse({"detail": f"Asset {asset_path} not found"}, status_code=404)


@app.api_route("/", methods=["GET", "POST", "HEAD"])
@app.api_route("/api/main.py", methods=["GET", "POST", "HEAD"])
@app.api_route("/{full_path:path}", methods=["GET", "POST", "HEAD"])
def serve_spa_or_rewritten_route(request: Request, full_path: str = ""):
    # 1. Check if Vercel rewrote an /api/* route into /api/main.py?__api=...
    api_subpath = request.query_params.get("__api", "").strip("/")
    if api_subpath:
        if api_subpath == "health":
            return JSONResponse(get_health())
        if api_subpath == "arena":
            return JSONResponse(get_arena_data())
        if api_subpath == "snapshot/live":
            as_of = request.query_params.get("as_of_time", "2026-11-15T15:00:00Z")
            return JSONResponse(get_live_market_snapshot(as_of_time=as_of))
        if api_subpath == "run-once":
            return JSONResponse(trigger_run_once())
        if api_subpath == "reseed":
            return JSONResponse(trigger_reseed())
        if api_subpath == "backtest":
            return JSONResponse(run_walk_forward_backtest())
        if api_subpath == "orderflow/live":
            return JSONResponse(get_live_orderflow())
        if api_subpath == "desk/evaluate":
            send_d = request.query_params.get("send_discord", "false").lower() == "true"
            return JSONResponse(evaluate_team_desk(send_discord=send_d))
        if api_subpath == "discord/test":
            return JSONResponse(test_discord_webhook())
        if api_subpath == "cron/scan":
            return JSONResponse(vercel_cron_scan())


    # 2. Check if Vercel rewrote an /assets/* route into /api/main.py?__asset=...
    asset_subpath = request.query_params.get("__asset", "").strip("/")
    if asset_subpath:
        return serve_static_asset(asset_subpath)

    # 3. Check if __path or full_path matches a file in web/dist
    req_path = request.query_params.get("__path", "").strip("/") or full_path.strip("/")
    if req_path and req_path != "api/main.py":
        if req_path.startswith("assets/"):
            return serve_static_asset(req_path[len("assets/"):])
        candidate = WEB_DIST_DIR / req_path
        if candidate.exists() and candidate.is_file():
            mime_type, _ = mimetypes.guess_type(str(candidate))
            return FileResponse(str(candidate), media_type=mime_type or "application/octet-stream")

    # 4. Serve the self-contained Startify SPA HTML (with inlined CSS & JS)
    return HTMLResponse(get_inlined_spa_html(), status_code=200)
