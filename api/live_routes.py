"""Live arena API. Mounted BEFORE the SPA catch-all in api/main.py."""
import os
from typing import Optional
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path
from live import engine, store

router = APIRouter()
PAGE = Path(__file__).resolve().parent.parent / "web_live" / "index.html"

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
        a = ids.get(r["agent_id"]); r["name"] = a["short_name"] if a else r["agent_id"]; r["color"] = a["color"] if a else "#888"
    return {"messages": rows}

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

@router.post("/api/live/agent/{agent_id}/toggle")
def toggle_agent(agent_id: str, body: dict, x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); return engine.set_agent_enabled(agent_id, bool(body.get("enabled", True)))

@router.post("/api/live/reset-season")
def reset(x_admin_token: Optional[str] = Header(default=None)):
    _admin(x_admin_token); engine.reset_season(); return {"ok": True}

@router.get("/", response_class=HTMLResponse)
def home(): return PAGE.read_text(encoding="utf-8")
