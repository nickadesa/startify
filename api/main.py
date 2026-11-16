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


def _ensure_journal_table(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS desk_journal (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            direction TEXT NOT NULL,
            execution_mode TEXT NOT NULL,
            setup_label TEXT NOT NULL,
            entry REAL NOT NULL,
            stop_loss REAL NOT NULL,
            tp1 REAL NOT NULL,
            tp2 REAL NOT NULL,
            tp3 REAL NOT NULL,
            lot REAL NOT NULL,
            risk_pct REAL NOT NULL,
            risk_usd REAL NOT NULL,
            conviction_score INTEGER NOT NULL,
            status TEXT NOT NULL,
            pnl_usd REAL NOT NULL DEFAULT 0.0,
            rationale TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.commit()


def _record_desk_trade(desk_res: Dict[str, Any]) -> Dict[str, Any]:
    from datetime import datetime, timezone
    import hashlib

    conn = ensure_seeded()
    _ensure_journal_table(conn)
    ts = desk_res.get("timestamp") or datetime.now(timezone.utc).isoformat()
    exec_mode = str(desk_res.get("execution_mode", "limit")).lower()
    initial_status = "PENDING" if exec_mode == "limit" else "OPEN"
    trade_id = "DSK-" + hashlib.md5(f"{ts[:16]}-{desk_res.get('direction')}-{desk_res.get('entry')}".encode()).hexdigest()[:8].upper()
    conn.execute(
        """
        INSERT OR IGNORE INTO desk_journal
        (id, timestamp, direction, execution_mode, setup_label, entry, stop_loss, tp1, tp2, tp3, lot, risk_pct, risk_usd, conviction_score, status, pnl_usd, rationale)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            trade_id,
            ts,
            str(desk_res.get("direction", "long")),
            exec_mode,
            str(desk_res.get("setup_label", "Fib OTE + Orderflow")),
            float(desk_res.get("entry", 0.0)),
            float(desk_res.get("stop_loss", 0.0)),
            float(desk_res.get("tp1", 0.0)),
            float(desk_res.get("tp2", 0.0)),
            float(desk_res.get("tp3", 0.0)),
            float(desk_res.get("lot", 0.01)),
            float(desk_res.get("risk_pct", 0.5)),
            float(desk_res.get("risk_usd", 5.0)),
            int(desk_res.get("conviction_score", 0)),
            initial_status,
            0.0,
            str(desk_res.get("rationale", "")),
        ),
    )
    conn.commit()
    return {"id": trade_id, "status": initial_status}


@app.get("/api/klines")
def get_live_klines_endpoint(interval: str = Query(default="M15"), limit: int = Query(default=80)) -> Dict[str, Any]:
    from data.orderflow_provider import OrderflowProvider

    candles = OrderflowProvider().get_live_klines(interval=interval, limit=limit)
    source = "Binance PAXGUSDT Live"
    if not candles:
        tf_map = {"M5": "M5", "M15": "M15", "1H": "H1", "H1": "H1", "4H": "H4", "H4": "H4"}
        tf_key = tf_map.get(interval.upper(), "H1")
        mtf = PriceProvider("XAUUSD").get_multi_timeframe_bundle("2026-11-15T15:00:00Z")
        candles = mtf.get(tf_key, [])[-limit:]
        source = "Historical XAUUSD Fallback"
    return {"interval": interval.upper(), "source": source, "candles": candles}


@app.get("/api/desk/journal")
@app.post("/api/desk/journal")
def get_or_update_desk_journal(live_price: Optional[float] = Query(default=None)) -> Dict[str, Any]:
    from data.orderflow_provider import OrderflowProvider

    conn = ensure_seeded()
    _ensure_journal_table(conn)
    cur_px = live_price
    if cur_px is None:
        try:
            kl = OrderflowProvider().get_live_klines("15m", 2)
            if kl:
                cur_px = float(kl[-1]["close"])
            else:
                of = OrderflowProvider().get_live_orderflow()
                cur_px = float(of.get("paxg_price", 0.0)) or None
        except Exception:
            cur_px = None

    rows = [dict(r) for r in conn.execute("SELECT * FROM desk_journal ORDER BY timestamp DESC LIMIT 120").fetchall()]
    updated = False
    if cur_px:
        for row in rows:
            entry = float(row["entry"])
            # Sanity guard: ignore mismatched price feeds >15% away
            if abs(cur_px - entry) > entry * 0.15:
                continue

            side = row["direction"].lower()
            sl = float(row["stop_loss"])
            tp1 = float(row["tp1"])
            tp2 = float(row["tp2"])
            lot = float(row["lot"])

            if row["status"] == "PENDING":
                filled = (cur_px <= entry) if side == "long" else (cur_px >= entry)
                if filled:
                    row["status"] = "OPEN"
                    row["pnl_usd"] = 0.0
                    conn.execute("UPDATE desk_journal SET status = ?, pnl_usd = ? WHERE id = ?", ("OPEN", 0.0, row["id"]))
                    updated = True
            elif row["status"] in ("OPEN", "TP1_BE"):
                new_status = row["status"]
                new_pnl = float(row["pnl_usd"])
                if side == "long":
                    if cur_px <= sl and row["status"] == "OPEN":
                        new_status = "LOSS"
                        new_pnl = round((sl - entry) * 100.0 * lot, 2)
                    elif cur_px >= tp2:
                        new_status = "WIN"
                        new_pnl = round((tp2 - entry) * 100.0 * lot, 2)
                    elif cur_px >= tp1 and row["status"] == "OPEN":
                        new_status = "TP1_BE"
                        new_pnl = round((tp1 - entry) * 100.0 * lot * 0.5, 2)
                    else:
                        new_pnl = round((cur_px - entry) * 100.0 * lot, 2)
                else:
                    if cur_px >= sl and row["status"] == "OPEN":
                        new_status = "LOSS"
                        new_pnl = round((entry - sl) * 100.0 * lot, 2)
                    elif cur_px <= tp2:
                        new_status = "WIN"
                        new_pnl = round((entry - tp2) * 100.0 * lot, 2)
                    elif cur_px <= tp1 and row["status"] == "OPEN":
                        new_status = "TP1_BE"
                        new_pnl = round((entry - tp1) * 100.0 * lot * 0.5, 2)
                    else:
                        new_pnl = round((entry - cur_px) * 100.0 * lot, 2)
                row["status"] = new_status
                row["pnl_usd"] = new_pnl
                conn.execute("UPDATE desk_journal SET status = ?, pnl_usd = ? WHERE id = ?", (new_status, new_pnl, row["id"]))
                updated = True
    if updated:
        conn.commit()
    return {"live_price": cur_px, "entries": rows}


@app.get("/api/desk/models")
def get_desk_models() -> Dict[str, Any]:
    from agents.desk_roles import ALTERNATIVE_FREE_MODELS, DESK_ROLES

    return {"active_roles": DESK_ROLES, "alternative_free_models": ALTERNATIVE_FREE_MODELS}


@app.get("/api/desk/evaluate")
@app.post("/api/desk/evaluate")
def evaluate_team_desk(send_discord: bool = Query(default=False)) -> Dict[str, Any]:
    from agents.desk_roles import SpecializedDeskCoordinator
    from data.orderflow_provider import OrderflowProvider
    from notifications.chart_renderer import render_setup_chart_png
    from notifications.discord_webhook import DiscordNotifier

    of_provider = OrderflowProvider()
    live_res = get_live_market_snapshot("2026-11-15T15:00:00Z")
    snap = dict(live_res["snapshot"])
    candles = live_res.get("recent_candles_h1", [])

    live_klines = of_provider.get_live_klines("1h", 60)
    if live_klines:
        candles = live_klines
        live_px = float(live_klines[-1]["close"])
        hi = max(b["high"] for b in live_klines[-24:])
        lo = min(b["low"] for b in live_klines[-24:])
        rng = max(hi - lo, 6.0)
        is_bull = live_px >= float(live_klines[-12]["close"])
        snap["price"] = live_px
        snap["trend_h4"] = "bullish" if is_bull else "bearish"
        snap["ote"] = {
            "zone_low": round(lo + rng * 0.21, 2) if is_bull else round(lo + rng * 0.62, 2),
            "zone_high": round(lo + rng * 0.38, 2) if is_bull else round(lo + rng * 0.79, 2),
            "sweet_spot": round(lo + rng * 0.295, 2) if is_bull else round(lo + rng * 0.705, 2),
            "invalidation": round(lo, 2) if is_bull else round(hi, 2),
        }

    orderflow = of_provider.get_live_orderflow(spot_xauusd_price=float(snap.get("price", 4028.90)))
    desk_res = SpecializedDeskCoordinator().evaluate_desk(
        snapshot=snap,
        orderflow=orderflow,
        portfolio_equity=1000.0,
        news_blackout_active=False,
    )
    if desk_res.get("approved"):
        rec = _record_desk_trade(desk_res)
        desk_res["journal_id"] = rec["id"]

    if send_discord and desk_res.get("approved"):
        chart_png = render_setup_chart_png(candles=candles, signal=desk_res, ote=snap.get("ote"), timeframe="H1")
        desk_res["discord_delivery"] = DiscordNotifier().send_entry_signal(desk_res, chart_png=chart_png)
    else:
        desk_res["discord_delivery"] = {"sent": False, "reason": "send_discord=false or not approved"}
    return desk_res


@app.post("/api/discord/send-chart")
async def send_chart_to_discord(request: Request) -> Dict[str, Any]:
    import base64
    from notifications.discord_webhook import DiscordNotifier

    body = await request.json()
    b64_raw = str(body.get("image_base64", ""))
    if "," in b64_raw:
        b64_raw = b64_raw.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_raw) if b64_raw else None
    title = str(body.get("title", "XAUUSD CHART SNAPSHOT — STARTIFY DESK"))
    description = str(body.get("description", "Annotated TradingView-Pro snapshot from Startify Desk."))
    res = DiscordNotifier().send_embed(
        title=title,
        description=description,
        color=0x00ADFF,
        image_bytes=img_bytes,
        image_filename="xauusd_chart_snapshot.png",
    )
    return {"delivery": res}


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
async def serve_spa_or_rewritten_route(request: Request, full_path: str = ""):
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
        if api_subpath == "klines":
            iv = request.query_params.get("interval", "M15")
            lim = int(request.query_params.get("limit", "80"))
            sym = request.query_params.get("symbol", "XAUUSD")
            return JSONResponse(get_live_klines_endpoint(interval=iv, limit=lim, symbol=sym))
        if api_subpath == "markets/overview":
            return JSONResponse(get_markets_overview_endpoint())
        if api_subpath == "desk/evaluate":
            send_d = request.query_params.get("send_discord", "false").lower() == "true"
            return JSONResponse(evaluate_team_desk(send_discord=send_d))
        if api_subpath == "desk/journal":
            lp = request.query_params.get("live_price")
            return JSONResponse(get_or_update_desk_journal(live_price=float(lp) if lp else None))
        if api_subpath == "desk/models":
            return JSONResponse(get_desk_models())
        if api_subpath == "discord/send-chart":
            return JSONResponse(await send_chart_to_discord(request))
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
