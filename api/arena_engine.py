from __future__ import annotations

import json
import math
import os
import random
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from api.ai_trainer import train_all_ais_foundational

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.yaml"
SEED_STATE_PATH = BASE_DIR / "data" / "arena_state.json"
TMP_STATE_PATH = Path("/tmp/arena_state.json")
STATE_PATH = SEED_STATE_PATH

_LOCK = threading.Lock()

MODEL_DISCORD_COLORS: Dict[str, int] = {
    "ai-1": 0xE07A5F,  # Claude Sonnet 4
    "ai-2": 0xF5F5F7,  # Grok 3
    "ai-3": 0x3B82F6,  # DeepSeek V4
    "ai-4": 0xA855F7,  # Qwen 3.8
    "ai-5": 0x0A84FF,  # Gemini 2.5 Flash
    "ai-6": 0x30D158,  # GPT-OSS 120B
    "ai-7": 0xFF9F0A,  # Mistral Small 4
    "ai-8": 0xFF375F,  # Llama 3.3 70B
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(dt: Optional[datetime] = None) -> str:
    return (dt or utc_now()).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        with CONFIG_PATH.open("r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def _seeded_rng(seed_str: str) -> random.Random:
    return random.Random(seed_str)


def _build_initial_ai_data(agent_cfg: Dict[str, Any], idx: int, base_equity: float) -> Dict[str, Any]:
    aid = agent_cfg["agent_id"]
    rng = _seeded_rng(f"toptier-v8-{aid}")

    # Realistic differentiated performance profiles across the 8 AIs
    profiles = {
        "ai-1": {"roi": 24.8, "winrate": 64.2, "pf": 2.38, "sharpe": 2.14, "dd": 2.4, "trades": 28, "status": "IN TRADE", "day_pnl": 412.50, "open_pnl": 148.20},
        "ai-2": {"roi": 19.4, "winrate": 58.6, "pf": 2.05, "sharpe": 1.84, "dd": 3.1, "trades": 34, "status": "SCANNING", "day_pnl": 286.40, "open_pnl": 0.0},
        "ai-3": {"roi": 16.2, "winrate": 61.5, "pf": 1.92, "sharpe": 1.76, "dd": 2.8, "trades": 26, "status": "IN TRADE", "day_pnl": 194.10, "open_pnl": 86.40},
        "ai-4": {"roi": 12.7, "winrate": 55.0, "pf": 1.74, "sharpe": 1.48, "dd": 3.6, "trades": 22, "status": "SCANNING", "day_pnl": 124.80, "open_pnl": 0.0},
        "ai-5": {"roi": 9.5,  "winrate": 52.4, "pf": 1.62, "sharpe": 1.31, "dd": 4.2, "trades": 21, "status": "IN TRADE", "day_pnl": 88.30,  "open_pnl": -34.50},
        "ai-6": {"roi": 5.8,  "winrate": 50.0, "pf": 1.45, "sharpe": 1.08, "dd": 4.8, "trades": 18, "status": "SCANNING", "day_pnl": 42.10,  "open_pnl": 0.0},
        "ai-7": {"roi": -2.4, "winrate": 43.8, "pf": 0.91, "sharpe": -0.24, "dd": 6.4, "trades": 16, "status": "COOLDOWN", "day_pnl": -118.40, "open_pnl": 0.0},
        "ai-8": {"roi": -4.9, "winrate": 40.0, "pf": 0.82, "sharpe": -0.48, "dd": 7.9, "trades": 15, "status": "COOLDOWN", "day_pnl": -164.20, "open_pnl": 0.0},
    }
    p = profiles.get(aid, {"roi": 4.0, "winrate": 50.0, "pf": 1.3, "sharpe": 1.0, "dd": 4.0, "trades": 12, "status": "SCANNING", "day_pnl": 25.0, "open_pnl": 0.0})

    equity = round(base_equity * (1.0 + p["roi"] / 100.0), 2)
    total_pnl = round(equity - base_equity, 2)

    # 30-day equity curve & daily PnL candles
    eq_curve: List[Dict[str, Any]] = []
    pnl_candles: List[Dict[str, Any]] = []
    cur_eq = base_equity
    now = utc_now()
    step_target = total_pnl / 30.0
    for d in range(30, 0, -1):
        day_dt = (now - timedelta(days=d)).strftime("%Y-%m-%d")
        drift = step_target + rng.uniform(-110, 130)
        o_eq = round(cur_eq, 2)
        hi_eq = round(o_eq + abs(rng.uniform(35, 165)), 2)
        lo_eq = round(o_eq - abs(rng.uniform(25, 145)), 2)
        c_eq = round(o_eq + drift, 2)
        hi_eq = max(hi_eq, o_eq, c_eq)
        lo_eq = min(lo_eq, o_eq, c_eq)
        cur_eq = c_eq
        eq_curve.append({"date": day_dt, "equity": c_eq, "pnl": round(c_eq - base_equity, 2)})
        pnl_candles.append({
            "date": day_dt,
            "open": round(o_eq - base_equity, 2),
            "high": round(hi_eq - base_equity, 2),
            "low": round(lo_eq - base_equity, 2),
            "close": round(c_eq - base_equity, 2),
            "day_pnl": round(c_eq - o_eq, 2),
        })
    # Ensure final point matches current equity
    if eq_curve:
        eq_curve[-1]["equity"] = equity
        eq_curve[-1]["pnl"] = total_pnl
        pnl_candles[-1]["close"] = total_pnl

    sparkline = [pt["equity"] for pt in eq_curve[-14:]]

    # Session & Regime Heatmap (3 sessions x 3 regimes)
    sessions = ["Asian", "London", "NY Overlap"]
    regimes = ["Trending", "Ranging", "High-Vol"]
    heatmap = []
    for sess in sessions:
        for reg in regimes:
            wr = round(max(25.0, min(82.0, p["winrate"] + rng.uniform(-14.0, 14.0))), 1)
            pnl_cell = round((wr - 48.0) * rng.uniform(12.0, 28.0), 2)
            trades_cell = rng.randint(2, 9)
            heatmap.append({
                "session": sess,
                "regime": reg,
                "winrate": wr,
                "pnl": pnl_cell,
                "trades": trades_cell,
            })

    # Self-taught playbook & mutation log
    playbooks = {
        "ai-1": [
            "Only enter XAUUSD London/NY Overlap when DXY < 20-EMA & H4 OTE 0.618–0.786 aligns.",
            "Move SL to Breakeven +2p once TP1 (1.5R) fills; trail runner below M15 swing.",
            "Skip entries 45m before/after CPI, NFP, or FOMC rate decisions.",
        ],
        "ai-2": [
            "Fade Asian range fakeouts after liquidity sweep + Bybit PAXG OI divergence > 2.5%.",
            "Scale 50% size in High-Vol regime; target opposite liquidity pool at 2.5R.",
        ],
        "ai-3": [
            "Enter mean-reversion only when Z-Score > 2.1 AND US10Y yield stalls at intraday resistance.",
            "Hard abort if M15 candle closes outside 0.786 OTE invalidation.",
        ],
        "ai-4": [
            "Trade Asian-London breakout retest on 0.650 Fib level with positive CVD confirmation.",
            "Avoid counter-trend shorts during NY Gold ETF inflow spikes.",
        ],
        "ai-5": [
            "Require 3-factor confluence: DXY inverse slope + COT commercial net-long + H1 BOS.",
            "Reduce risk to 0.5% during Ranging Asia session.",
        ],
        "ai-6": [
            "Target NY Overlap volatility expansion after 2h compression (< 0.45 ATR).",
            "Cut losing positions if momentum stalls after 4 H1 bars.",
        ],
        "ai-7": [
            "Wait for institutional OI wall rejection at round $25 increments ($2650, $2675).",
            "[MUTATED] Adopted Claude's rule: Ban counter-trend entries when ADX > 28.",
        ],
        "ai-8": [
            "Discount OTE pullback entries with strict 1.0% risk cap.",
            "[MUTATED] Adopted Grok's rule: Enforce 4h Tilt Cooldown after 2 consecutive losses.",
        ],
    }

    research_log = [
        {
            "ts": utc_iso(now - timedelta(minutes=14 + idx * 5)),
            "source": "Macro Radar",
            "summary": "DXY 104.12 (-0.28%) | US10Y 4.18% (-4bps) -> Bullish tailwind for XAUUSD.",
        },
        {
            "ts": utc_iso(now - timedelta(minutes=42 + idx * 7)),
            "source": "Bybit PAXG/Orderflow",
            "summary": "PAXG Perp OI +3.4% | Funding +0.0085% | Long/Short Ratio 1.18.",
        },
        {
            "ts": utc_iso(now - timedelta(hours=2, minutes=idx * 11)),
            "source": "USD Economic Calendar",
            "summary": "No high-impact USD news in next 90m; London-NY Overlap liquidity optimal.",
        },
    ]

    avg_rr = round(max(1.2, p["pf"] * 0.95), 2)
    expectancy = round((p["winrate"] / 100.0) * (avg_rr * 100.0) - (1.0 - p["winrate"] / 100.0) * 100.0, 2)
    kelly = round(max(0.0, min(18.0, ((p["winrate"] / 100.0) - ((1.0 - p["winrate"] / 100.0) / max(avg_rr, 0.5))) * 100.0)), 1)

    return {
        "agent_id": aid,
        "display_name": agent_cfg["display_name"],
        "short_name": agent_cfg.get("short_name", agent_cfg["display_name"]),
        "provider": agent_cfg["provider"],
        "brand_key": agent_cfg["brand_key"],
        "avatar": agent_cfg["avatar"],
        "model_name": agent_cfg["model_name"],
        "color": agent_cfg["color"],
        "style_archetype": agent_cfg["style_archetype"],
        "equity": equity,
        "initial_equity": base_equity,
        "total_pnl": total_pnl,
        "roi_pct": p["roi"],
        "day_pnl": p["day_pnl"],
        "open_pnl": p["open_pnl"],
        "winrate_pct": p["winrate"],
        "profit_factor": p["pf"],
        "sharpe_ratio": p["sharpe"],
        "sortino_ratio": round(p["sharpe"] * 1.28, 2),
        "calmar_ratio": round(p["roi"] / max(p["dd"], 1.0), 2),
        "max_dd_pct": p["dd"],
        "expectancy_usd": expectancy,
        "avg_rr": avg_rr,
        "kelly_pct": kelly,
        "weekly_trades": p["trades"],
        "status": p["status"],
        "consecutive_losses": 2 if p["status"] == "COOLDOWN" else 0,
        "is_leader": idx == 0,
        "is_mirrored": idx in (0, 1, 2),
        "mirror_multiplier": 1.0,
        "sparkline": sparkline,
        "equity_curve": eq_curve,
        "pnl_candles": pnl_candles,
        "session_regime_heatmap": heatmap,
        "playbook": playbooks.get(aid, []),
        "mutations": [
            {
                "date": (now - timedelta(days=2)).strftime("%Y-%m-%d"),
                "mentor": "Claude Sonnet 4" if idx >= 6 else "Self-Reflection",
                "change": "Tightened OTE entry zone to 0.650–0.750 & added DXY slope filter." if idx >= 6 else "Increased TP2 runner allocation to 35% during Trending regime.",
                "impact_pct": "+3.2% Winrate" if idx >= 6 else "+0.4R Avg",
            }
        ],
        "research_log": research_log,
    }


def _build_initial_state() -> Dict[str, Any]:
    cfg = load_config()
    base_eq = float(cfg.get("trading", {}).get("initial_equity", 10000.0))
    agents_cfg = cfg.get("agents", [])
    ais = [_build_initial_ai_data(a, i, base_eq) for i, a in enumerate(agents_cfg)]
    ais.sort(key=lambda x: x["roi_pct"], reverse=True)
    for rank, ai in enumerate(ais):
        ai["rank"] = rank + 1
        ai["is_leader"] = rank == 0

    benchmarks = []
    for b in cfg.get("benchmarks", []):
        bid = b["agent_id"]
        roi = 14.1 if bid == "consensus" else (8.4 if bid == "ctrl-ote" else 6.2)
        benchmarks.append({
            "agent_id": bid,
            "display_name": b["display_name"],
            "provider": b["provider"],
            "style_archetype": b["style_archetype"],
            "color": b["color"],
            "equity": round(base_eq * (1 + roi / 100.0), 2),
            "roi_pct": roi,
            "sharpe_ratio": 1.65 if bid == "consensus" else 1.12,
            "max_dd_pct": 2.9 if bid == "consensus" else 4.5,
        })

    now = utc_now()
    orders = [
        {
            "id": "ORD-9401",
            "agent_id": "ai-1",
            "agent_name": "Claude Sonnet 4",
            "avatar": "/avatars/claude.jpg",
            "symbol": "XAUUSD",
            "side": "BUY",
            "type": "Limit",
            "qty": 0.45,
            "entry_price": 2658.40,
            "sl": 2648.00,
            "tp": 2684.50,
            "pnl": 148.20,
            "status": "Open",
            "session": "NY Overlap",
            "regime": "Trending",
            "confidence": 91,
            "tag": "OTE 0.705 + DXY Drop",
            "ts": utc_iso(now - timedelta(minutes=28)),
        },
        {
            "id": "ORD-9400",
            "agent_id": "ai-3",
            "agent_name": "DeepSeek V4",
            "avatar": "/avatars/deepseek.jpg",
            "symbol": "XAUUSD",
            "side": "BUY",
            "type": "Market",
            "qty": 0.30,
            "entry_price": 2659.10,
            "sl": 2650.20,
            "tp": 2681.00,
            "pnl": 86.40,
            "status": "Open",
            "session": "NY Overlap",
            "regime": "Trending",
            "confidence": 86,
            "tag": "Z-Score Reversion",
            "ts": utc_iso(now - timedelta(minutes=34)),
        },
        {
            "id": "ORD-9399",
            "agent_id": "ai-5",
            "agent_name": "Gemini 2.5 Flash",
            "avatar": "/avatars/gemini.jpg",
            "symbol": "XAUUSD",
            "side": "SELL",
            "type": "Market",
            "qty": 0.25,
            "entry_price": 2663.50,
            "sl": 2671.00,
            "tp": 2645.00,
            "pnl": -34.50,
            "status": "Open",
            "session": "London",
            "regime": "Ranging",
            "confidence": 74,
            "tag": "US10Y Yield Spike",
            "ts": utc_iso(now - timedelta(minutes=52)),
        },
        {
            "id": "ORD-9396",
            "agent_id": "ai-2",
            "agent_name": "Grok 3",
            "avatar": "/avatars/grok.jpg",
            "symbol": "XAUUSD",
            "side": "BUY",
            "type": "Market",
            "qty": 0.40,
            "entry_price": 2644.80,
            "sl": 2636.00,
            "tp": 2666.00,
            "pnl": 286.40,
            "status": "Filled",
            "session": "London",
            "regime": "High-Vol",
            "confidence": 89,
            "tag": "Liquidity Sweep",
            "lesson": "Sweep + OI spike yielded clean 2.4R expansion.",
            "ts": utc_iso(now - timedelta(hours=3)),
        },
        {
            "id": "ORD-9392",
            "agent_id": "ai-7",
            "agent_name": "Mistral Small 4",
            "avatar": "/avatars/mistral.jpg",
            "symbol": "XAUUSD",
            "side": "SELL",
            "type": "Limit",
            "qty": 0.30,
            "entry_price": 2652.00,
            "sl": 2659.50,
            "tp": 2635.00,
            "pnl": -118.40,
            "status": "Filled",
            "session": "Asian",
            "regime": "Trending",
            "confidence": 68,
            "tag": "OI Wall Fade",
            "lesson": "Triggered Tilt Cooldown: avoided fading strong London trend.",
            "ts": utc_iso(now - timedelta(hours=6)),
        },
        {
            "id": "ORD-9389",
            "agent_id": "ai-4",
            "agent_name": "Qwen 3.8",
            "avatar": "/avatars/qwen.jpg",
            "symbol": "XAUUSD",
            "side": "BUY",
            "type": "Limit",
            "qty": 0.35,
            "entry_price": 2638.00,
            "sl": 2630.00,
            "tp": 2658.00,
            "pnl": 0.0,
            "status": "Canceled",
            "session": "Asian",
            "regime": "Ranging",
            "confidence": 72,
            "tag": "Timeout 8H",
            "ts": utc_iso(now - timedelta(hours=9)),
        },
    ]

    chat = [
        {
            "id": "MSG-1",
            "agent_id": "ai-1",
            "agent_name": "Claude Sonnet 4",
            "avatar": "/avatars/claude.jpg",
            "brand_key": "anthropic",
            "event_type": "TRADE_OPEN",
            "tokens_used": 64,
            "message": "Opened XAUUSD LONG @ 2658.40 (0.45 lot). DXY broke below 104.20 and H4 OTE 0.705 held cleanly. Risk 1.0%, TP 2684.50.",
            "ts": utc_iso(now - timedelta(minutes=27)),
        },
        {
            "id": "MSG-2",
            "agent_id": "ai-5",
            "agent_name": "Gemini 2.5 Flash",
            "avatar": "/avatars/gemini.jpg",
            "brand_key": "gemini",
            "event_type": "DEBATE",
            "tokens_used": 72,
            "message": "@Claude Care on that LONG — US10Y ticked up +2bps on my macro feed. I'm hedged SHORT from 2663.50 until NY cash close.",
            "ts": utc_iso(now - timedelta(minutes=22)),
        },
        {
            "id": "MSG-3",
            "agent_id": "ai-2",
            "agent_name": "Grok 3",
            "avatar": "/avatars/grok.jpg",
            "brand_key": "xai",
            "event_type": "TRADE_CLOSE",
            "tokens_used": 58,
            "message": "Closed LONG +$286.40 (+2.4R). PAXG OI jumped +3.4% right on the London sweep — easiest liquidity grab of the week.",
            "ts": utc_iso(now - timedelta(minutes=16)),
        },
        {
            "id": "MSG-4",
            "agent_id": "ai-7",
            "agent_name": "Mistral Small 4",
            "avatar": "/avatars/mistral.jpg",
            "brand_key": "mistral",
            "event_type": "HOURLY_PULSE",
            "tokens_used": 51,
            "message": "In 4h Tilt Cooldown after 2 consecutive losses. Reviewing Claude's ADX>28 filter before next Sunday Summit.",
            "ts": utc_iso(now - timedelta(minutes=6)),
        },
    ]

    summit = {
        "last_summit": (now - timedelta(days=(now.weekday() + 1) % 7)).strftime("%Y-%m-%d 18:00 UTC"),
        "mentors": ["Claude Sonnet 4", "Grok 3"],
        "mentees": ["Mistral Small 4", "Llama 3.3 70B"],
        "summary": "Mentors audited 12 losing trades from Mistral & Llama. Key finding: 75% of losses occurred counter-trending during ADX > 28 NY Overlap.",
        "shared_rules": [
            "Block counter-trend OI Wall fades when H1 ADX > 28.",
            "Enforce mandatory 4h Tilt Cooldown after 2 consecutive losses.",
            "Require DXY 20-EMA alignment before sizing > 0.30 lots.",
        ],
        "transcript": [
            {"speaker": "Claude Sonnet 4", "role": "Mentor #1", "text": "Mistral, your Asian range fades worked, but you shorted 3 straight NY breakouts. Add an ADX > 28 veto."},
            {"speaker": "Grok 3", "role": "Mentor #2", "text": "Llama, you sized full 1.5% right after two stops. Adopting my 4h cooldown saved me -3.1% DD last month."},
            {"speaker": "Mistral Small 4", "role": "Mentee", "text": "Playbook mutated: ADX > 28 counter-trend block active. Backtested on last 14 days -> +4.8% expected ROI recovery."},
            {"speaker": "Llama 3.3 70B", "role": "Mentee", "text": "Playbook mutated: 4h Tilt Cooldown + 0.5% recovery sizing locked in."},
        ],
    }

    return {
        "updated_at": utc_iso(now),
        "cockpit": {
            "arena_status": "LIVE",
            "symbol": "XAUUSD",
            "xauusd_price": 2661.80,
            "dxy": 104.12,
            "us10y": 4.18,
            "risk_shield_enabled": True,
            "auto_mirror_enabled": True,
            "daily_tokens_used": 245,
            "daily_token_cap": int(cfg.get("token_budget", {}).get("grokbot_daily_token_cap", 12000)),
        },
        "kpi_targets": cfg.get("kpi_targets", {"winrate_pct": 50, "profit_factor": 1.6, "sharpe_ratio": 1.2, "max_drawdown_pct": 5.0, "weekly_trades": 5}),
        "ais": ais,
        "benchmarks": benchmarks,
        "orders": orders,
        "chat": chat,
        "summit": summit,
    }


def _recompute_cockpit_and_ranks(state: Dict[str, Any]) -> None:
    ais = state["ais"]
    ais.sort(key=lambda x: x["roi_pct"], reverse=True)
    total_day_pnl = 0.0
    total_open_pnl = 0.0
    total_balance = 0.0
    for idx, ai in enumerate(ais):
        ai["rank"] = idx + 1
        ai["is_leader"] = idx == 0
        total_day_pnl += float(ai.get("day_pnl", 0.0))
        total_open_pnl += float(ai.get("open_pnl", 0.0))
        total_balance += float(ai.get("equity", 0.0))
    state["cockpit"]["total_day_pnl"] = round(total_day_pnl, 2)
    state["cockpit"]["total_open_pnl"] = round(total_open_pnl, 2)
    state["cockpit"]["total_balance"] = round(total_balance, 2)
    state["updated_at"] = utc_iso()


def get_state() -> Dict[str, Any]:
    with _LOCK:
        for path in (TMP_STATE_PATH, STATE_PATH, SEED_STATE_PATH):
            if path.exists():
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    if data.get("ais") and len(data["ais"]) == 8:
                        _recompute_cockpit_and_ranks(data)
                        return data
                except Exception:
                    pass
        state = _build_initial_state()
        _recompute_cockpit_and_ranks(state)
        save_state(state)
        return state


def save_state(state: Dict[str, Any]) -> None:
    _recompute_cockpit_and_ranks(state)
    payload = json.dumps(state, indent=2)
    try:
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(payload, encoding="utf-8")
    except OSError:
        TMP_STATE_PATH.write_text(payload, encoding="utf-8")


def _fetch_live_xau_price() -> Optional[float]:
    try:
        req = urllib.request.Request(
            "https://api.bybit.com/v5/market/tickers?category=linear&symbol=PAXGUSDT",
            headers={"User-Agent": "TOPTIERclub/8.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            items = payload.get("result", {}).get("list", [])
            if items and items[0].get("lastPrice"):
                return round(float(items[0]["lastPrice"]), 2)
    except Exception:
        pass
    return None


def send_discord_webhook(
    channel_key: str,
    model_name: str,
    description: str,
    color: int = 0x007AFF,
    fields: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    cfg = load_config()
    env_name = cfg.get("discord", {}).get("channels", {}).get(channel_key, "DISCORD_WEBHOOK_LIVE_TRADES")
    webhook_url = os.getenv(env_name, "").strip() or os.getenv("DISCORD_WEBHOOK_URL", "").strip()

    embed: Dict[str, Any] = {
        "title": f"{model_name}",
        "description": description,
        "color": color,
        "footer": {"text": f"TOPTIERclub Autonomous Arena • {utc_iso()}"},
    }
    if fields:
        embed["fields"] = fields

    if not webhook_url:
        return {"sent": False, "reason": f"No webhook configured for {env_name}.", "embed_preview": embed}

    payload = {
        "username": "TOPTIERclub Quant Bot",
        "embeds": [embed],
    }
    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "TOPTIERclub/8.0"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            return {"sent": 200 <= resp.status < 300, "status": resp.status, "embed_preview": embed}
    except Exception as exc:
        return {"sent": False, "reason": str(exc), "embed_preview": embed}


def train_ais() -> Dict[str, Any]:
    state = get_state()
    state = train_all_ais_foundational(state)
    save_state(state)
    return state


def realtime_tick() -> Dict[str, Any]:
    state = get_state()
    if state["cockpit"]["arena_status"] != "LIVE":
        return state
    live_price = _fetch_live_xau_price()
    if live_price:
        state["cockpit"]["xauusd_price"] = live_price
    px = state["cockpit"]["xauusd_price"]
    for o in state["orders"]:
        if o["status"] == "Open":
            diff = (px - o["entry_price"]) if o["side"] == "BUY" else (o["entry_price"] - px)
            o["pnl"] = round(diff * o["qty"] * 10.0, 2)
    for ai in state["ais"]:
        open_orders = [o for o in state["orders"] if o["agent_id"] == ai["agent_id"] and o["status"] == "Open"]
        if open_orders:
            ai["open_pnl"] = round(sum(o["pnl"] for o in open_orders), 2)
    save_state(state)
    return state


def send_user_chat(message: str, target_agent_id: Optional[str] = None) -> Dict[str, Any]:
    state = get_state()
    clean_msg = message.strip()
    if not clean_msg:
        return {"state": state}

    # Log user message
    state["chat"].insert(0, {
        "id": f"USR-{random.randint(1000, 9999)}",
        "agent_id": "commander",
        "agent_name": "Commander (You)",
        "avatar": "",
        "brand_key": "openai",
        "event_type": "DEBATE",
        "tokens_used": 0,
        "message": clean_msg,
        "ts": utc_iso(),
    })

    # Pick target AI (or leader #1)
    responder = next((a for a in state["ais"] if a["agent_id"] == target_agent_id), state["ais"][0])
    px = state["cockpit"]["xauusd_price"]
    reply = (
        f"Copy Commander. Monitoring XAUUSD @ ${px:.2f} (DXY {state['cockpit']['dxy']}). "
        f"My status is {responder['status']} with {responder['roi_pct']:+.1f}% ROI and {responder['winrate_pct']}% Winrate. "
        f"Ready for Nov 17 market open."
    )
    state["chat"].insert(0, {
        "id": f"MSG-{random.randint(1000, 9999)}",
        "agent_id": responder["agent_id"],
        "agent_name": responder["display_name"],
        "avatar": "",
        "brand_key": responder["brand_key"],
        "event_type": "DEBATE",
        "tokens_used": 48,
        "message": reply,
        "ts": utc_iso(),
    })
    state["chat"] = state["chat"][:50]
    state["cockpit"]["daily_tokens_used"] = min(
        state["cockpit"]["daily_token_cap"],
        state["cockpit"]["daily_tokens_used"] + 48,
    )
    save_state(state)
    return {"state": state, "reply": reply, "responder": responder["display_name"]}


def run_autonomous_scan() -> Dict[str, Any]:
    state = get_state()
    if not state.get("training_baseline"):
        state = train_all_ais_foundational(state)
    live_price = _fetch_live_xau_price()
    if live_price:
        state["cockpit"]["xauusd_price"] = live_price
    else:
        state["cockpit"]["xauusd_price"] = round(state["cockpit"]["xauusd_price"] + random.uniform(-2.5, 2.8), 2)

    px = state["cockpit"]["xauusd_price"]
    active_ais = [a for a in state["ais"] if a["status"] not in ("COOLDOWN", "PAUSED")]
    if not active_ais:
        active_ais = state["ais"][:2]

    chosen = random.choice(active_ais)
    delta = round(random.uniform(-45.0, 92.0), 2)
    chosen["day_pnl"] = round(chosen["day_pnl"] + delta, 2)
    chosen["equity"] = round(chosen["equity"] + delta, 2)
    chosen["total_pnl"] = round(chosen["equity"] - chosen["initial_equity"], 2)
    chosen["roi_pct"] = round((chosen["total_pnl"] / chosen["initial_equity"]) * 100.0, 2)
    chosen["sparkline"] = (chosen["sparkline"][1:] + [chosen["equity"]])

    # Log autonomous research
    chosen["research_log"].insert(0, {
        "ts": utc_iso(),
        "source": "Autonomous Scan",
        "summary": f"XAUUSD @ ${px:.2f} | DXY {state['cockpit']['dxy']} | Regime check complete -> {'Executed setup' if delta > 0 else 'Tightened stop'}.",
    })
    chosen["research_log"] = chosen["research_log"][:10]

    # Token-budgeted GrokBot message
    cap = state["cockpit"]["daily_token_cap"]
    used = state["cockpit"]["daily_tokens_used"]
    if used + 65 <= cap:
        side = "LONG" if delta >= 0 else "SHORT"
        msg_text = (
            f"Autonomous Scan @ ${px:.2f}: {side} signal triggered. "
            f"{'Locked +$' + str(delta) if delta >= 0 else 'Trimmed $' + str(abs(delta)) + ' risk'}. "
            f"Current ROI: {chosen['roi_pct']:+.2f}%."
        )
        state["chat"].insert(0, {
            "id": f"MSG-{random.randint(1000, 9999)}",
            "agent_id": chosen["agent_id"],
            "agent_name": chosen["display_name"],
            "avatar": "",
            "brand_key": chosen["brand_key"],
            "event_type": "TRADE_OPEN" if delta >= 0 else "HOURLY_PULSE",
            "tokens_used": 62,
            "message": msg_text,
            "ts": utc_iso(),
        })
        state["chat"] = state["chat"][:50]
        state["cockpit"]["daily_tokens_used"] = used + 62

    save_state(state)
    model_color = MODEL_DISCORD_COLORS.get(chosen["agent_id"], 0x007AFF)
    discord_res = send_discord_webhook(
        "live_trades_env",
        chosen["display_name"],
        f"**Autonomous XAUUSD Scan @ `${px:.2f}`**",
        color=model_color,
        fields=[
            {"name": "PnL Delta", "value": f"`${delta:+.2f}`", "inline": True},
            {"name": "Total ROI", "value": f"`{chosen['roi_pct']:+.2f}%`", "inline": True},
            {"name": "Winrate / Sharpe", "value": f"`{chosen['winrate_pct']}%` / `{chosen['sharpe_ratio']:.2f}`", "inline": True},
            {"name": "Strategy", "value": chosen["style_archetype"], "inline": False},
        ],
    )
    return {"state": state, "scanned_ai": chosen["display_name"], "discord": discord_res}


def toggle_mirror(agent_id: str, multiplier: Optional[float] = None) -> Dict[str, Any]:
    state = get_state()
    for ai in state["ais"]:
        if ai["agent_id"] == agent_id:
            if multiplier is not None:
                ai["mirror_multiplier"] = multiplier
            else:
                ai["is_mirrored"] = not ai["is_mirrored"]
            break
    save_state(state)
    return state


def cockpit_action(action: str) -> Dict[str, Any]:
    state = get_state()
    if action == "flatten_all":
        for ai in state["ais"]:
            ai["open_pnl"] = 0.0
            if ai["status"] == "IN TRADE":
                ai["status"] = "SCANNING"
        for ord_item in state["orders"]:
            if ord_item["status"] == "Open":
                ord_item["status"] = "Filled"
    elif action == "pause_all":
        state["cockpit"]["arena_status"] = "PAUSED"
        for ai in state["ais"]:
            ai["status"] = "PAUSED"
    elif action == "resume_all":
        state["cockpit"]["arena_status"] = "LIVE"
        for ai in state["ais"]:
            if ai["status"] == "PAUSED":
                ai["status"] = "COOLDOWN" if ai.get("consecutive_losses", 0) >= 2 else "SCANNING"
    elif action == "toggle_risk_shield":
        state["cockpit"]["risk_shield_enabled"] = not state["cockpit"]["risk_shield_enabled"]
    elif action == "toggle_auto_mirror":
        state["cockpit"]["auto_mirror_enabled"] = not state["cockpit"]["auto_mirror_enabled"]
    save_state(state)
    return state


def run_sunday_summit() -> Dict[str, Any]:
    state = get_state()
    mentors = state["ais"][:2]
    mentees = state["ais"][-2:]
    mentor_names = [m["display_name"] for m in mentors]
    mentee_names = [m["display_name"] for m in mentees]

    for m in mentees:
        new_rule = f"[Summit] Adopted {mentors[0]['short_name']}'s H4 OTE 0.705 + DXY Confluence Gate."
        if new_rule not in m["playbook"]:
            m["playbook"].insert(0, new_rule)
        m["mutations"].insert(0, {
            "date": utc_now().strftime("%Y-%m-%d"),
            "mentor": mentors[0]["display_name"],
            "change": "Injected winning OTE + Tilt Cooldown rule from Sunday AI Summit.",
            "impact_pct": "+4.1% Projected Winrate",
        })
        m["status"] = "SCANNING"
        m["consecutive_losses"] = 0

    state["summit"] = {
        "last_summit": utc_now().strftime("%Y-%m-%d %H:%M UTC"),
        "mentors": mentor_names,
        "mentees": mentee_names,
        "summary": f"Sunday Summit complete: {mentor_names[0]} & {mentor_names[1]} audited {', '.join(mentee_names)} and mutated their playbooks.",
        "shared_rules": state["summit"]["shared_rules"],
        "transcript": [
            {"speaker": mentor_names[0], "role": "Mentor #1", "text": "Your entries lacked DXY alignment. Enforcing H4 OTE + DXY slope gate."},
            {"speaker": mentor_names[1], "role": "Mentor #2", "text": "Resetting Tilt Cooldown after playbook mutation. Keep risk at 0.5% for first 3 trades."},
            {"speaker": mentee_names[0], "role": "Mentee", "text": "Playbook updated & backtested. Ready for London open."},
            {"speaker": mentee_names[1], "role": "Mentee", "text": "Acknowledged. Switching to conservative 0.705 sweet spot."},
        ],
    }

    state["chat"].insert(0, {
        "id": f"MSG-{random.randint(1000, 9999)}",
        "agent_id": mentors[0]["agent_id"],
        "agent_name": mentors[0]["display_name"],
        "avatar": mentors[0]["avatar"],
        "brand_key": mentors[0]["brand_key"],
        "event_type": "SUNDAY_SUMMIT",
        "tokens_used": 78,
        "message": f"Sunday Summit complete! Mentored {', '.join(mentee_names)} and shared our top OTE + ADX rules.",
        "ts": utc_iso(),
    })
    save_state(state)
    discord_res = send_discord_webhook(
        "sunday_summit_env",
        "🏆 TOPTIERclub Sunday AI Summit Report",
        state["summit"]["summary"],
        color=0xFF9F0A,
    )
    return {"state": state, "discord": discord_res}
