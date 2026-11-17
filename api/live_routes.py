"""Live arena API. Mounted BEFORE the SPA catch-all in api/main.py."""
import os
from typing import Optional
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path
from live import engine, store, market, presets

router = APIRouter()
PAGE = Path(__file__).resolve().parent.parent / "web_live" / "index.html"
DEFAULT_ACTIVE_ASSETS = ["XAUUSD", "NQ", "ES", "EURUSD", "BTCUSD", "OIL", "SILVER"]

def _admin(x_admin_token: Optional[str]):
    want = os.getenv("ADMIN_TOKEN", "").strip()
    if want and x_admin_token != want:
        raise HTTPException(401, "bad admin token")

@router.get("/api/live/state")
def state(): return engine.snapshot()

@router.get("/api/live/journal")
def journal(agent_id: Optional[str] = None, limit: int = 100):
    return {"entries": store.journal(limit, agent_id)}

@router.get("/api/live/chat")
def chat(after_id: int = 0, limit: int = 80):
    rows = store.chat(limit, after_id)
    ids = {a["agent_id"]: a for a in engine.agents()}
    for r in rows:
        if r["agent_id"] == "user":
            r["name"] = "You"
            r["color"] = "#2f5bff"
        else:
            a = ids.get(r["agent_id"])
            r["name"] = a["short_name"] if a else r["agent_id"]
            r["color"] = a["color"] if a else "#888"
    return {"messages": rows}

@router.post("/api/live/chat/send")
def chat_send(body: dict):
    return engine.user_chat(body.get("message", ""), body.get("image"), body.get("mentions"))

@router.get("/api/live/assets")
def assets():
    active = store.kv_get("active_assets")
    if active is None:
        active = list(DEFAULT_ACTIVE_ASSETS)
    favs = store.kv_get("fav_assets")
    if favs is None:
        favs = [a["symbol"] for a in market.ASSETS if a.get("fav")]
    return {"assets": market.ASSETS, "active": active, "favs": favs}

@router.get("/api/live/quote")
def quote(symbol: str = "XAUUSD"):
    q = market.quote(symbol)
    return {"ok": bool(q), "quote": q}

@router.post("/api/live/assets/toggle")
def toggle_asset(body: dict):
    sym = str(body.get("symbol", "")).upper().strip()
    if not any(a["symbol"] == sym for a in market.ASSETS):
        raise HTTPException(404, "unknown symbol")
    kind = body.get("kind", "active")
    if kind == "fav":
        favs = store.kv_get("fav_assets")
        if favs is None:
            favs = [a["symbol"] for a in market.ASSETS if a.get("fav")]
        enabled = bool(body.get("enabled", sym not in favs))
        if enabled and sym not in favs:
            favs.append(sym)
        elif not enabled and sym in favs:
            favs = [s for s in favs if s != sym]
        store.kv_set("fav_assets", favs)
        return {"ok": True, "favs": favs}
    active = store.kv_get("active_assets")
    if active is None:
        active = list(DEFAULT_ACTIVE_ASSETS)
    enabled = bool(body.get("enabled", sym not in active))
    if enabled and sym not in active:
        active.append(sym)
    elif not enabled and sym in active and len(active) > 1:
        active = [s for s in active if s != sym]
    store.kv_set("active_assets", active)
    return {"ok": True, "active": active}

@router.get("/api/live/calendar")
def calendar(agent_id: Optional[str] = None, month: Optional[str] = None):
    return {"days": engine.calendar(agent_id, month)}

@router.get("/api/live/equity/{agent_id}")
def equity(agent_id: str): return {"series": store.equity_series(agent_id)}

# Cron / external pinger fallback if you stay on serverless (one call = one full cycle)
@router.api_route("/api/live/cycle", methods=["GET", "POST"])
def cycle(x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token)
    return {"tick": engine.tick(), "opened": engine.decide(), "chat": engine.converse()}

@router.post("/api/live/pause")
def pause(x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); store.kv_set("paused", True); return {"paused": True}

@router.post("/api/live/resume")
def resume(x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); store.kv_set("paused", False); return {"paused": False}

@router.post("/api/live/flatten")
def flatten(x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); return engine.flatten()

@router.get("/api/live/presets")
def list_presets():
    return {"presets": presets.PRESETS}

@router.post("/api/live/agent/{agent_id}/toggle")
def toggle_agent(agent_id: str, body: dict, x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); return engine.set_agent_enabled(agent_id, bool(body.get("enabled", True)))

@router.post("/api/live/agent/{agent_id}/config")
def config_agent(agent_id: str, body: dict, x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); return engine.set_agent_prefs(agent_id, body)

@router.post("/api/live/agent/{agent_id}/reset")
def reset_single_agent(agent_id: str, x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); return engine.reset_agent(agent_id)

@router.post("/api/live/leader")
def set_leader(body: dict, x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token)
    return engine.set_leader_config(body.get("leader_id"), body.get("consult_mode"))

@router.get("/api/live/candles")
def get_candles(symbol: str = "XAUUSD", interval: str = "15m", rng: str = "5d"):
    bars = market.candles(interval, rng, symbol)
    return {"symbol": symbol, "interval": interval, "bars": bars, "vp": market.volume_profile(bars[-60:]), "news": market.news_events()[:20]}

@router.get("/api/live/news")
def get_news():
    return {"events": market.news_events()}

@router.get("/api/live/agent/{agent_id}/dna")
def get_dna(agent_id: str):
    return engine.strategy_dna(agent_id)

@router.get("/api/live/leaderboard")
def get_leaderboard(period: str = "all"):
    return engine.leaderboard(period)

@router.get("/api/live/equity-all")
def equity_all():
    return {a["agent_id"]: store.equity_series(a["agent_id"], 120) for a in engine.agents()}

@router.post("/api/live/weekly-review")
def trigger_weekly_review(x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token)
    return engine.weekly_mentor_review(force=True)

@router.post("/api/live/reset-season")
def reset(x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); engine.reset_season(); return {"ok": True}

@router.get("/", response_class=HTMLResponse)
def home(): return PAGE.read_text(encoding="utf-8")
