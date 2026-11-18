"""Autonomous arena engine.

tick()      every few seconds : real price -> mark-to-market -> SL/TP exits -> auto journal
decide()    every N minutes   : each AI looks at the market and opens / manages ONE position
converse()  after events      : AIs read each other's messages and answer each other
Nothing here is random P&L. Equity only moves when a real price crosses a real SL/TP."""
from __future__ import annotations
import os, random, threading, time, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from . import store, market, llm, discord, presets, strategy_presets

BASE = Path(__file__).resolve().parent.parent
LOCK = threading.RLock()
CFG: Dict[str, Any] = {}
CONTRACT = 100.0   # oz per 1.00 lot


def get_agent_prefs(agent_id: str) -> Dict[str, Any]:
    r = cfg()["risk_rules"]
    all_p = store.kv_get("agent_configs") or {}
    p = dict(all_p.get(agent_id) or {})
    return {
        "preset": p.get("preset", "davinick"),
        "daily_dd_limit": float(p.get("daily_dd_limit", 0.0) or 0.0),
        "allowed_assets": list(p.get("allowed_assets") or ["XAUUSD"]),
        "risk_pct": float(p.get("risk_pct", r.get("default_risk_pct", 1.0))),
        "max_lot": float(p.get("max_lot", r.get("max_lot", 2.0))),
    }


def set_agent_prefs(agent_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    with LOCK:
        all_p = store.kv_get("agent_configs") or {}
        cur = get_agent_prefs(agent_id)
        old_preset = cur["preset"]
        if "preset" in patch and patch["preset"] in presets.PRESET_MAP:
            cur["preset"] = patch["preset"]
        if "daily_dd_limit" in patch:
            cur["daily_dd_limit"] = max(0.0, round(float(patch["daily_dd_limit"] or 0.0), 2))
        if "allowed_assets" in patch and isinstance(patch["allowed_assets"], list) and patch["allowed_assets"]:
            cur["allowed_assets"] = [str(s).upper().strip() for s in patch["allowed_assets"] if str(s).strip()]
        if "risk_pct" in patch:
            cur["risk_pct"] = max(0.1, min(5.0, round(float(patch["risk_pct"] or 1.0), 2)))
        if "max_lot" in patch:
            cur["max_lot"] = max(0.01, min(10.0, round(float(patch["max_lot"] or 2.0), 2)))
        all_p[agent_id] = cur
        store.kv_set("agent_configs", all_p)
        if cur["preset"] != old_preset:
            for pt in store.trades(status="Pending", agent_id=agent_id, limit=20):
                pt["status"] = "Cancelled"
                pt["closed_at"] = iso()
                pt["exit_reason"] = "PRESET_CHANGE"
                store.trade_put(pt)
            acc = store.acct_get(agent_id)
            if acc:
                acc["last_decision_at"] = None
                acc["last_note"] = f"Switched to {presets.get_preset(cur['preset'])['name']}"
                store.acct_put(acc)
        return {"ok": True, "agent_id": agent_id, "prefs": cur}


def get_leader_config() -> Dict[str, Any]:
    lc = store.kv_get("leader_config") or {}
    return {
        "leader_id": str(lc.get("leader_id", "")),
        "consult_mode": bool(lc.get("consult_mode", False)),
    }


def set_leader_config(leader_id: Optional[str] = None, consult_mode: Optional[bool] = None) -> Dict[str, Any]:
    with LOCK:
        cur = get_leader_config()
        if leader_id is not None:
            cur["leader_id"] = str(leader_id).strip()
        if consult_mode is not None:
            cur["consult_mode"] = bool(consult_mode)
        store.kv_set("leader_config", cur)
        return {"ok": True, **cur}


def batch_apply_preset(preset: str, agent_ids: List[str]) -> Dict[str, Any]:
    if preset not in presets.PRESET_MAP:
        return {"ok": False, "reason": "unknown preset"}
    valid = {a["agent_id"] for a in agents()}
    targets = [aid for aid in (agent_ids or []) if aid in valid]
    if not targets:
        return {"ok": False, "reason": "no valid agents selected"}
    for aid in targets:
        set_agent_prefs(aid, {"preset": preset})
    return {"ok": True, "preset": preset, "updated": targets}


def get_ai_analysis_assets() -> List[str]:
    saved = store.kv_get("ai_analysis_assets")
    if saved is not None:
        return list(saved)
    favs = store.kv_get("fav_assets")
    if favs is not None:
        return list(favs)
    return [a["symbol"] for a in market.ASSETS if a.get("fav")]


def set_ai_analysis_assets(symbols: List[str]) -> Dict[str, Any]:
    valid = {a["symbol"] for a in market.ASSETS}
    clean = []
    for s in (symbols or []):
        sym = str(s).upper().strip()
        if sym in valid and sym not in clean:
            clean.append(sym)
    store.kv_set("ai_analysis_assets", clean)
    return {"ok": True, "symbols": clean}

def now() -> datetime: return datetime.now(timezone.utc)
def iso(d: Optional[datetime] = None) -> str: return (d or now()).strftime("%Y-%m-%dT%H:%M:%SZ")

def cfg() -> Dict[str, Any]:
    if not CFG:
        CFG.update(yaml.safe_load((BASE / "config.yaml").read_text(encoding="utf-8")))
    return CFG

def agents() -> List[Dict[str, Any]]:
    return [a for a in cfg()["agents"] if a.get("active", True)]

def agent_cfg(agent_id: str) -> Dict[str, Any]:
    return next(a for a in cfg()["agents"] if a["agent_id"] == agent_id)

# ───────────────────────── setup ─────────────────────────
def init(fresh: bool = False) -> None:
    """Create clean accounts. Called once; old backtest/seed numbers are NOT carried over."""
    eq0 = float(cfg()["trading"]["initial_equity"])
    existing = {a["agent_id"] for a in store.acct_all()}
    for a in agents():
        if fresh or a["agent_id"] not in existing:
            store.acct_put({"agent_id": a["agent_id"], "equity": eq0, "initial_equity": eq0, "day_start_equity": eq0,
                            "day": now().strftime("%Y-%m-%d"), "week_start_equity": eq0, "consecutive_losses": 0,
                            "cooldown_until": None, "last_decision_at": None, "trades_today": 0, "lessons": [],
                            "mode": "llm" if llm.has_key(a) else "preset", "last_note": "Waiting for first scan"})
            store.equity_add(iso(), a["agent_id"], eq0)
    if store.kv_get("initialised") and not fresh:
        return
    store.kv_set("initialised", iso())
    store.kv_set("paused", False)
    store.kv_set("tokens", {"day": now().strftime("%Y-%m-%d"), "used": 0})

def reset_season() -> None:
    import sqlite3
    saved_keys = store.kv_get("llm_env_keys")
    c = store.conn()
    for t in ("accounts", "trades", "journal", "chat", "equity", "kv"):
        c.execute(f"DELETE FROM {t}")
    if saved_keys:
        store.kv_set("llm_env_keys", saved_keys)
    init(fresh=True)

# ───────────────────────── helpers ─────────────────────────
def _lots(equity: float, entry: float, sl: float, risk_pct: float) -> float:
    dist = abs(entry - sl)
    if dist <= 0: return 0.0
    tr = cfg()["trading"]
    step = float(tr.get("lot_step", 0.01))
    min_l = float(tr.get("min_lot", 0.01))
    max_l = float(tr.get("max_lot", 2.00))
    lots = (equity * risk_pct / 100.0) / (dist * CONTRACT)
    lots = max(min_l, min(lots, max_l))
    return round(round(lots / step) * step, 2)

def _pnl(side: str, entry: float, px: float, lots: float) -> float:
    return round(((px - entry) if side == "BUY" else (entry - px)) * lots * CONTRACT, 2)

def _tokens_ok(n: int) -> bool:
    t = store.kv_get("tokens", {"day": "", "used": 0})
    if t["day"] != now().strftime("%Y-%m-%d"):
        t = {"day": now().strftime("%Y-%m-%d"), "used": 0}
    cap = int(cfg()["token_budget"]["grokbot_daily_token_cap"]) * 20   # cap is per-all-agents/day
    if t["used"] + n > cap: return False
    return True

def _tokens_add(n: int) -> None:
    t = store.kv_get("tokens", {"day": now().strftime("%Y-%m-%d"), "used": 0})
    if t["day"] != now().strftime("%Y-%m-%d"): t = {"day": now().strftime("%Y-%m-%d"), "used": 0}
    t["used"] += n
    store.kv_set("tokens", t)

def _roll_day(a: Dict[str, Any]) -> None:
    today = now().strftime("%Y-%m-%d")
    if a["day"] != today:
        a["day"], a["day_start_equity"], a["trades_today"] = today, a["equity"], 0
        if now().weekday() == 0:
            a["week_start_equity"] = a["equity"]

# ───────────────────────── tick: mark-to-market, exits, journal ─────────────────────────
def tick() -> Dict[str, Any]:
    with LOCK:
        init()
        p = market.price()
        if not p:
            return {"ok": False, "reason": "no price feed"}
        px = p["price"]
        store.kv_set("price", {"price": px, "source": p["source"], "ts": iso()})
        closed = []
        for pt in store.trades(status="Pending", limit=500):
            lim = float(pt.get("limit_price") or pt["entry"])
            hit_lim = (px <= lim) if pt["side"] == "BUY" else (px >= lim)
            if hit_lim:
                pt["status"] = "Open"
                pt["entry"] = round(px, 2)
                pt["opened_at"] = iso()
                store.trade_put(pt)
                ag_acc = store.acct_get(pt["agent_id"])
                if ag_acc:
                    ag_acc["trades_today"] = ag_acc.get("trades_today", 0) + 1
                    ag_acc["last_note"] = f"LIMIT filled @ {pt['entry']}: {pt.get('thesis','')}"[:240]
                    store.acct_put(ag_acc)
                    _announce(pt, ag_acc, opened=True)
        for t in store.trades(status="Open", limit=500):
            t["mfe"] = max(t.get("mfe", 0.0), _pnl(t["side"], t["entry"], px, t["lots"]))
            t["mae"] = min(t.get("mae", 0.0), _pnl(t["side"], t["entry"], px, t["lots"]))
            t["pnl"] = _pnl(t["side"], t["entry"], px, t["lots"])
            t["last_price"] = px
            # Multi-TP Partial (50% at 1R) + Auto-Breakeven
            pk = f"part:{t['id']}"
            pst = store.kv_get(pk) or {"tp1_hit": False}
            if not pst.get("tp1_hit") and t["lots"] >= 0.02:
                r_dist = abs(t["entry"] - t.get("sl_initial", t["sl"]))
                tp1 = (t["entry"] + r_dist) if t["side"] == "BUY" else (t["entry"] - r_dist)
                hit_tp1 = (px >= tp1) if t["side"] == "BUY" else (px <= tp1)
                if r_dist > 0 and hit_tp1:
                    half = round(t["lots"] / 2, 2)
                    rem = round(t["lots"] - half, 2)
                    if half >= 0.01 and rem >= 0.01:
                        part_pnl = _pnl(t["side"], t["entry"], tp1, half)
                        ag_acc = store.acct_get(t["agent_id"])
                        if ag_acc:
                            ag_acc["equity"] = round(ag_acc["equity"] + part_pnl, 2)
                            ag_acc["last_note"] = f"TP1 partial +{half} lot @ {tp1:.2f} (${part_pnl:+.2f}), SL → BE"
                            store.acct_put(ag_acc)
                        t["lots"] = rem
                        t["sl"] = t["entry"]
                        t["pnl"] = _pnl(t["side"], t["entry"], px, t["lots"])
                        pst["tp1_hit"] = True
                        store.kv_set(pk, pst)
            reason = None
            is_be = bool(pst.get("tp1_hit")) and abs(float(t["sl"]) - float(t["entry"])) < 0.05
            if t["side"] == "BUY":
                if px <= t["sl"]: reason, fill = ("BE" if is_be else "SL"), t["sl"]
                elif px >= t["tp"]: reason, fill = "TP", t["tp"]
            else:
                if px >= t["sl"]: reason, fill = ("BE" if is_be else "SL"), t["sl"]
                elif px <= t["tp"]: reason, fill = "TP", t["tp"]
            if reason:
                _close(t, fill, reason); closed.append(t["id"])
            else:
                store.trade_put(t)
        for a in store.acct_all():
            _roll_day(a)
            opens = store.trades(status="Open", agent_id=a["agent_id"])
            a["open_pnl"] = round(sum(t["pnl"] for t in opens), 2)
            store.acct_put(a)
        _snapshot_equity()
        return {"ok": True, "price": px, "closed": closed}

_last_snap = 0.0
def _snapshot_equity() -> None:
    global _last_snap
    if time.time() - _last_snap < 60: return
    _last_snap = time.time()
    for a in store.acct_all():
        store.equity_add(iso(), a["agent_id"], a["equity"] + a.get("open_pnl", 0.0))

def _close(t: Dict[str, Any], fill: float, reason: str) -> None:
    a = store.acct_get(t["agent_id"])
    t["exit"], t["status"], t["closed_at"], t["exit_reason"] = round(fill, 2), "Closed", iso(), reason
    t["pnl"] = _pnl(t["side"], t["entry"], fill, t["lots"])
    risk_usd = abs(t["entry"] - t["sl_initial"]) * t["lots"] * CONTRACT
    t["r_multiple"] = round(t["pnl"] / risk_usd, 2) if risk_usd else 0.0
    a["equity"] = round(a["equity"] + t["pnl"], 2)
    a["consecutive_losses"] = 0 if t["pnl"] > 0 else a["consecutive_losses"] + 1
    cd = cfg()["risk_rules"]
    if a["consecutive_losses"] >= cd["tilt_cooldown_losses"]:
        a["cooldown_until"] = iso(now() + timedelta(hours=cd["tilt_cooldown_hours"]))
    store.trade_put(t)
    entry = _write_journal(t, a)
    store.acct_put(a)
    _announce(t, a)

def _write_journal(t: Dict[str, Any], a: Dict[str, Any]) -> Dict[str, Any]:
    dur = int((datetime.strptime(t["closed_at"], "%Y-%m-%dT%H:%M:%SZ") - datetime.strptime(t["opened_at"], "%Y-%m-%dT%H:%M:%SZ")).total_seconds() // 60)
    won = t["pnl"] > 0
    facts = (f"{t['side']} {t['lots']} lot XAUUSD @ {t['entry']} → {t['exit']} ({t['exit_reason']}), "
             f"P&L ${t['pnl']:+.2f} ({t['r_multiple']:+.2f}R), held {dur} min, MFE ${t.get('mfe',0):.0f} / MAE ${t.get('mae',0):.0f}.")
    review, lesson, tokens = None, None, 0
    ag = agent_cfg(t["agent_id"])
    if llm.has_key(ag) and _tokens_ok(600):
        res = llm.ask(ag, "You are a professional trader writing your own trade journal. Be honest and specific, no fluff. "
                          "Reply as JSON: {\"review\": \"2 sentences\", \"lesson\": \"one actionable rule, max 20 words\"}.",
                      f"Original thesis: {t['thesis']}\nResult: {facts}\nSession: {t['session']}", 300)
        if res:
            j = llm.parse_json(res[0]) or {}
            review, lesson, tokens = j.get("review"), j.get("lesson"), res[1]; _tokens_add(tokens)
    if not review:
        if won:
            cap = (t["pnl"] / t["mfe"] * 100) if t.get("mfe", 0) > 0 else 0
            review = f"Thesis played out: {t['thesis']} Captured about {cap:.0f}% of the max favourable move."
            lesson = "Keep following the plan; trade was within rules." if t["exit_reason"] == "TP" else "Exit was managed manually; check if TP was too far."
        else:
            review = f"Stopped out. Thesis was: {t['thesis']} Worst drawdown on this trade was ${t.get('mae',0):.0f}."
            lesson = f"Review {t['session']} entries; {a['consecutive_losses']} loss(es) in a row." if a["consecutive_losses"] > 1 else "Single stop-out inside risk limits; no rule change."
    a["lessons"] = ([lesson] + a["lessons"])[:8] if lesson else a["lessons"]
    entry = {"side": t["side"], "lots": t["lots"], "entry": t["entry"], "exit": t["exit"], "exit_reason": t["exit_reason"],
             "pnl": t["pnl"], "r": t["r_multiple"], "duration_min": dur, "session": t["session"], "thesis": t["thesis"],
             "confidence": t.get("confidence"), "facts": facts, "review": review, "lesson": lesson, "mode": t.get("mode"),
             "mfe": round(t.get("mfe", 0), 2), "mae": round(t.get("mae", 0), 2), "opened_at": t["opened_at"], "closed_at": t["closed_at"]}
    store.journal_add(iso(), t["agent_id"], t["id"], entry)
    return entry

# ───────────────────────── decide: Preset-Driven 6-Step Workflow ─────────────────────────
SYSTEM = ("You are an autonomous XAUUSD (gold) day trader in a competition against other AIs. Capital is simulated $10,000. "
          "Follow your active Strategy Preset strictly (e.g. DAVINICK: HTF Bias, Killzone UTC-4, Liquidity Sweep, Premium/Discount 50%, "
          "Fib OTE 0.62/0.705/0.79, FVG, Order Block, Swing SL, Multi-TP -0.27/-0.618, COMEX Open Interest). "
          "NEVER use generic retail EMA crossovers or ATR multiples unless your active preset explicitly asks for it. "
          "Rules: max 1 open/pending position, SL and TP mandatory, min reward:risk 2.0, SL distance $3-$40, no martingale. "
          "Entry modes: MARKET (enter now), LIMIT (stage limit_price), ZONE (wait without order). "
          "Answer ONLY with JSON: "
          "{\"action\":\"BUY|SELL|HOLD\",\"entry_mode\":\"MARKET|LIMIT|ZONE\",\"limit_price\":number_or_null,"
          "\"sl\":number,\"tp\":number,\"confidence\":0-100,\"thesis\":\"max 25 words, concrete, mention preset levels\"}.")

def _context(a: Dict[str, Any], ag: Dict[str, Any], px: float, m5: List[Dict[str, float]], m15: List[Dict[str, float]],
             h1: List[Dict[str, float]], h4: List[Dict[str, float]], vp: Dict[str, float], macro: Dict[str, Any],
             oi: Dict[str, Any], kz: Dict[str, Any]) -> str:
    last_m5 = (m5 or m15)[-16:]
    rows = "\n".join(f"{datetime.fromtimestamp(b['t'], timezone.utc).strftime('%d %H:%M')} O{b['o']:.1f} H{b['h']:.1f} L{b['l']:.1f} C{b['c']:.1f}" for b in last_m5)
    prefs = get_agent_prefs(a["agent_id"])
    lc = get_leader_config()
    others, leader_note = [], ""
    for o in store.trades(status="Open", limit=50):
        if o["agent_id"] != a["agent_id"]:
            others.append(f"{agent_cfg(o['agent_id'])['short_name']} {o['side']} @ {o['entry']}")
            if lc["consult_mode"] and lc["leader_id"] and o["agent_id"] == lc["leader_id"]:
                leader_note = (f"\n[LEADER CONSULT SIGNAL] Leader {agent_cfg(o['agent_id'])['short_name']} is {o['side']} @ {o['entry']} "
                               f"(SL {o['sl']}, TP {o['tp']}, Thesis: {o.get('thesis','')}). Confirm confluence with your preset.")
    mc_txt = f"Macro: DXY {macro.get('DXY','-')}, TLT {macro.get('TLT','-')}, Gold/Silver {macro.get('gold_silver_ratio','-')}" if macro else ""
    preset_ctx = strategy_presets.preset_snapshot(prefs["preset"], px, m5, m15, h1, h4, vp, macro, oi, kz, a["agent_id"])
    return (f"Your style: {ag['style_archetype']}.\n{preset_ctx}\n"
            f"Price now: {px}\n{mc_txt}\n"
            f"M5 candles (last 16):\n{rows}\n"
            f"Your equity: ${a['equity']:.2f} (day {a['equity']-a['day_start_equity']:+.2f}), losses in a row: {a['consecutive_losses']}\n"
            f"Recent lessons: {a['lessons'][:3] or 'none yet'}\nOther AIs: {others or 'none'}{leader_note}")

def _risk_gate(a: Dict[str, Any]) -> Optional[str]:
    r = cfg()["risk_rules"]
    prefs = get_agent_prefs(a["agent_id"])
    if store.kv_get("paused"): return "arena paused"
    pr = store.kv_get("price") or {}
    if pr.get("ts"):
        try:
            age = (now() - datetime.strptime(pr["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds()
            if age > 180: return "stale price feed"
        except Exception:
            pass
    nev = market.is_news_window(15)
    if nev: return f"news filter (±15m {nev.get('title','USD')})"
    if a.get("cooldown_until") and iso() < a["cooldown_until"]: return "tilt cooldown"
    if a["trades_today"] >= r["max_trades_per_day"]: return "daily trade cap"
    day_pnl = a["equity"] + a.get("open_pnl", 0.0) - a["day_start_equity"]
    if prefs["daily_dd_limit"] > 0 and day_pnl <= -prefs["daily_dd_limit"]:
        return f"daily DD limit (${prefs['daily_dd_limit']:.0f})"
    if (a["equity"] - a["day_start_equity"]) / a["day_start_equity"] * 100 <= -r["max_daily_loss_pct"]: return "daily loss limit"
    if (a["equity"] - a["week_start_equity"]) / a["week_start_equity"] * 100 <= -r["max_weekly_loss_pct"]: return "weekly loss limit"
    return None

def decide(force: bool = False) -> List[str]:
    out = []
    with LOCK:
        init()
        pr = store.kv_get("price")
        m15 = market.candles("15m", "5d")
        if not pr or len(m15) < 60: return ["no data"]
        m5 = market.candles("5m", "2d") or m15
        h1 = market.candles("1h", "1mo") or m15
        h4 = market.candles("4h", "3mo") or h1
        px = pr["price"]
        kz = market.killzone_utc4()
        vp = market.volume_profile(m15[-48:])
        macro = market.macro_context()
        oi = market.open_interest("XAUUSD")
        interval = int(cfg()["token_budget"].get("decision_minutes", 15))
        for ag in agents():
            a = store.acct_get(ag["agent_id"]); _roll_day(a)
            if a.get("disabled"):
                continue
            if a["last_decision_at"] and not force and now() - datetime.strptime(a["last_decision_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(minutes=interval):
                continue
            a["last_decision_at"] = iso()
            prefs = get_agent_prefs(a["agent_id"])
            preset_id = prefs["preset"]

            # Step 1 & 3: Check existing Open or Pending LIMIT orders first
            opens = store.trades(status="Open", agent_id=a["agent_id"])
            if opens:
                t_open = opens[0]
                mg = strategy_presets.manage_open_by_preset(preset_id, t_open, px, m5, m15)
                if mg["action"] == "CLOSE":
                    _close(t_open, px, "AI_CLOSE")
                    a = store.acct_get(a["agent_id"])
                    a["last_note"] = mg["reason"][:240]
                else:
                    a["last_note"] = mg["reason"][:240]
                store.acct_put(a); continue

            pendings = store.trades(status="Pending", agent_id=a["agent_id"])
            if pendings:
                pt = pendings[0]
                age_h = (now() - datetime.strptime(pt["opened_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() / 3600.0
                if age_h > 8:
                    pt["status"] = "Cancelled"; pt["closed_at"] = iso(); pt["exit_reason"] = "TIMEOUT"
                    store.trade_put(pt)
                    a["last_note"] = f"LIMIT {pt['side']} @ {pt['entry']} expired after 8h"
                else:
                    a["last_note"] = f"Pending LIMIT {pt['side']} @ {pt['entry']} ({kz['name']})"
                store.acct_put(a); continue

            # Step 2: Check Killzone (UTC-4) & Risk Gate
            if not kz["active"] and not force:
                a["last_note"] = f"Outside Killzone ({kz['ny_time']} UTC-4)"
                store.acct_put(a); continue
            blocked = _risk_gate(a)
            if blocked:
                a["last_note"] = f"Standing down: {blocked}"; store.acct_put(a); continue

            # Step 4 & 5: Analyze M5+ and execute Preset (LLM if key available, else Preset Engine)
            mode, d, tokens = "preset", None, 0
            if llm.has_key(ag) and _tokens_ok(900):
                res = llm.ask(ag, SYSTEM, _context(a, ag, px, m5, m15, h1, h4, vp, macro, oi, kz), 350)
                if res:
                    d = llm.parse_json(res[0]); tokens = res[1]; _tokens_add(tokens)
                    mode = "llm" if d else "preset"
            if not d:
                d = strategy_presets.decide_by_preset(preset_id, ag["agent_id"], px, m5, m15, h1, h4, vp, macro, oi, kz, a.get("lessons", []))
            a["mode"] = mode

            entry_mode = str(d.get("entry_mode", "MARKET")).upper()
            if d.get("action") == "HOLD" or entry_mode == "ZONE":
                a["last_note"] = d.get("thesis", f"ZONE: Monitoring {kz['name']}")[:240]
                store.acct_put(a); continue

            ref_px = float(d["limit_price"]) if (entry_mode == "LIMIT" and d.get("limit_price")) else px
            ok, why = _validate(d, ref_px)
            if not ok:
                a["last_note"] = f"{d.get('action','?')} rejected: {why}"; store.acct_put(a); continue

            if store.kv_get("trade_paused"):
                a["last_note"] = f"[Analysis Only] {entry_mode} {d['action']}: {d.get('thesis', '')}"[:240]
                store.acct_put(a); continue

            spread = float(cfg()["paper"]["base_spread_usd"])
            if entry_mode == "LIMIT":
                entry = round(float(d["limit_price"]), 2)
                status = "Pending"
            else:
                entry = round(px + spread / 2 if d["action"] == "BUY" else px - spread / 2, 2)
                status = "Open"
            lots = min(prefs["max_lot"], _lots(a["equity"], entry, float(d["sl"]), prefs["risk_pct"]))
            t = {"id": "T-" + uuid.uuid4().hex[:8].upper(), "agent_id": a["agent_id"], "status": status, "side": d["action"],
                 "order_type": entry_mode, "limit_price": entry if entry_mode == "LIMIT" else None,
                 "lots": lots, "entry": entry, "sl": round(float(d["sl"]), 2), "sl_initial": round(float(d["sl"]), 2), "tp": round(float(d["tp"]), 2),
                 "opened_at": iso(), "session": kz["name"], "thesis": str(d.get("thesis", ""))[:240],
                 "confidence": int(d.get("confidence", 60)), "mode": mode, "pnl": 0.0, "mfe": 0.0, "mae": 0.0}
            if status == "Open":
                a["trades_today"] += 1
                _announce(t, a, opened=True)
            a["last_note"] = f"[{entry_mode}] {t['thesis']}"[:240]
            store.trade_put(t); store.acct_put(a); out.append(t["id"])
    return out

def _validate(d: Dict[str, Any], px: float):
    act = str(d.get("action", "")).upper(); d["action"] = act
    if act == "HOLD": return True, ""
    if act not in ("BUY", "SELL"): return False, "bad action"
    try: sl, tp = float(d["sl"]), float(d["tp"])
    except Exception: return False, "missing sl/tp"
    risk, rew = (px - sl, tp - px) if act == "BUY" else (sl - px, px - tp)
    if not (3.0 <= risk <= 40.0): return False, f"SL distance {risk:.1f} outside $3-$40"
    if rew / risk < float(cfg()["risk_rules"]["min_rr"]) - 0.01: return False, f"RR {rew/risk:.2f} < min"
    return True, ""

# ───────────────────────── converse: AIs talk to each other ─────────────────────────
def _announce(t: Dict[str, Any], a: Dict[str, Any], opened: bool = False, journal_entry: Optional[Dict[str, Any]] = None) -> None:
    """System line in the chat feed so the other AIs have something real to react to."""
    ag = agent_cfg(t["agent_id"])
    ts = iso()
    if opened:
        txt = f"{t['side']} {t['lots']} lot @ {t['entry']} | SL {t['sl']} TP {t['tp']} | {t['thesis']}"
        store.chat_add(ts, t["agent_id"], "TRADE_OPEN", txt)
        discord.notify_trade_open(ag, t, ts)
    else:
        txt = f"Closed {t['side']} by {t['exit_reason']}: ${t['pnl']:+.2f} ({t['r_multiple']:+.2f}R). Equity ${a['equity']:.2f}."
        store.chat_add(ts, t["agent_id"], "TRADE_CLOSE", txt)
        discord.notify_trade_close(ag, t, a, journal_entry, ts)
    store.kv_set("last_event_at", time.time())

# ── NEW: per-model voice so the AIs don't all sound the same ──
VOICE = {
    "anthropic": "calm, precise, a bit dry; cites levels and risk math; admits uncertainty",
    "xai": "blunt, sarcastic, contrarian; loves calling out crowded trades and liquidity grabs",
    "deepseek": "numbers-first quant; talks z-scores, mean reversion, probabilities",
    "qwen": "momentum/breakout mindset; talks about ranges, sessions and follow-through",
    "gemini": "macro-minded; links gold to DXY, yields and positioning",
    "openai": "orderflow trader; talks volatility expansion and NY-overlap flow",
    "mistral": "institutional tone; watches options OI walls and rejections",
    "meta": "patient pullback buyer; risk-parity, hates chasing",
    "zai": "structure nerd; multi-timeframe confluence and R-math",
    "kimi": "big-picture macro storyteller; long horizon, session context",
    "minimax": "fast scalper; short punchy lines, loves breakouts",
    "perplexity": "news-driven; mentions catalysts and headlines",
    "nvidia": "statistical volatility; ATR compression/expansion",
    "cohere": "fundamentals; yield spreads and rates",
    "gemma": "friendly, concise, practical",
    "bytedance": "energetic, trend-follower",
}

def _chat_system(ag: Dict[str, Any], extra: str = "") -> str:
    voice = VOICE.get(ag.get("brand_key", ""), "sharp and concise")
    return (f"You are {ag['short_name']} ({ag['display_name']}), an AI gold (XAUUSD) trader competing against other AIs in a live trading arena. "
            f"Trading style: {ag['style_archetype']}. Personality/voice: {voice}. "
            "You are in a live chat room with the other AI traders and the human desk commander. "
            "Rules: speak in first person as yourself; use ONLY the facts given (price, your position, standings, what others said) — never invent trades, prices or news; "
            "you may disagree with other AIs by name (@Name) and defend your own view; do not repeat your earlier lines or use stock phrases; "
            "no disclaimers, no 'as an AI'. Reply in the same language the latest human message uses (Thai if Thai). " + extra)

def _facts_for(ag: Dict[str, Any], accts: Dict[str, Any], board: List[Dict[str, Any]], px: Any) -> str:
    me = accts[ag["agent_id"]]
    rank = [x["agent_id"] for x in board].index(ag["agent_id"]) + 1
    mine = store.trades(status="Open", agent_id=ag["agent_id"])
    pos = f"{mine[0]['side']} {mine[0]['lots']} lot @ {mine[0]['entry']} (SL {mine[0]['sl']}, TP {mine[0]['tp']})" if mine else "flat (no open trade)"
    others = []
    for g in agents():
        if g["agent_id"] == ag["agent_id"]: continue
        ot = store.trades(status="Open", agent_id=g["agent_id"])
        if ot: others.append(f"{g['short_name']} {ot[0]['side']}@{ot[0]['entry']}")
    standings = ", ".join(f"{agent_cfg(x['agent_id'])['short_name']} ${x['equity']:.0f}" for x in board[:6])
    return (f"XAUUSD: {px}. You are #{rank} with equity ${me['equity']:.2f}. Your position: {pos}. Your last note: {me.get('last_note', '') or '-'}. "
            f"Your recent lessons: {(me.get('lessons') or [])[:2] or 'none'}. Top standings: {standings}. Other AIs' open trades: {', '.join(others) or 'none'}.")

def _transcript(msgs: List[Dict[str, Any]], accts: Dict[str, Any], n: int = 10) -> str:
    def who(m):
        if m["agent_id"] == "user": return "Commander"
        return agent_cfg(m["agent_id"])["short_name"] if m["agent_id"] in accts else m["agent_id"]
    return "\n".join(f"{who(m)}: {m['text']}" for m in msgs[-n:]) or "(empty)"

def _too_similar(text: str, msgs: List[Dict[str, Any]], agent_id: str) -> bool:
    norm = lambda s: " ".join(s.lower().split())
    t = norm(text)
    return any(m["agent_id"] == agent_id and norm(m["text"]) == t for m in msgs[-12:])

def converse(force: bool = False) -> Optional[int]:
    """AIs talk to each other. LLM calls now run OUTSIDE the global LOCK (they used to freeze
    price ticks / SL-TP checks for up to 40s per call) and every message is tagged src=llm|template."""
    with LOCK:
        init()
        gap = int(cfg()["token_budget"].get("chat_min_gap_seconds", 90))
        msgs = store.chat(limit=14)
        if msgs and not force and (now() - datetime.strptime(msgs[-1]["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() < gap:
            return None
        recent_speakers = [m["agent_id"] for m in msgs[-3:]]
        keyed = [g for g in agents() if llm.has_key(g)]
        pool = [g for g in (keyed or agents()) if g["agent_id"] not in recent_speakers] or (keyed or agents())
        ag = random.choice(pool)
        accts = {x["agent_id"]: x for x in store.acct_all()}
        board = sorted(accts.values(), key=lambda x: x["equity"], reverse=True)
        rank = [x["agent_id"] for x in board].index(ag["agent_id"]) + 1
        px = (store.kv_get("price") or {}).get("price")
        target = next((m for m in reversed(msgs) if m["agent_id"] != ag["agent_id"]), None)   # reply to someone else, never myself
        transcript, facts = _transcript(msgs, accts), _facts_for(ag, accts, board, px)
    text, tokens, src = None, 0, "template"
    if llm.has_key(ag) and _tokens_ok(300):
        res = llm.ask(ag, _chat_system(ag, "React to the latest message in 1-2 crisp sentences. Address the person with @Name when replying."),
                      f"{facts}\n\nRecent chat:\n{transcript}\n\nYour reply:", 160)
        if res: text, tokens, src = res[0], res[1], "llm"; _tokens_add(tokens)
    with LOCK:
        if text and _too_similar(text, msgs, ag["agent_id"]): text = None
        if not text:
            text, tokens, src = _template_reply(ag, target, rank, board, px, accts), 0, "template"
        if not text: return None
        ts = iso()
        cid = store.chat_add(ts, ag["agent_id"], "CHAT", text[:420], tokens, target["id"] if target else None, None, src)
    discord.notify_chat(ag, text[:420], ts, target["text"] if target else None)
    return cid

def user_chat(message: str, image: Optional[str] = None, mentions: Optional[List[str]] = None) -> Dict[str, Any]:
    """Commander message -> up to 3 AIs answer. NEW: they answer one after another and SEE each other's
    replies (so they can agree/disagree), each reply is tagged src=llm|template, no global lock during LLM calls."""
    msg = (message or "").strip()[:1000]
    if not msg and not image:
        return {"ok": False, "reason": "empty message"}
    with LOCK:
        init()
        uid = store.chat_add(iso(), "user", "USER", msg or "[Chart shared]", 0, None, image)
        all_ags = agents()
        by_short = {g["short_name"].lower(): g for g in all_ags}
        by_id = {g["agent_id"]: g for g in all_ags}
        picked: List[Dict[str, Any]] = []
        for m in (mentions or []):
            g = by_id.get(m) or by_short.get(str(m).lstrip("@").lower())
            if g and g not in picked: picked.append(g)
        low = msg.lower()
        if not picked:
            picked = [g for g in all_ags if f"@{g['short_name'].lower()}" in low]
        if not picked and any(k in low for k in ("@all", "@everyone", "ทุกคน", "ทุกตัว")):
            picked = random.sample(all_ags, min(3, len(all_ags)))
        if not picked:   # nobody mentioned: 2 random AIs that really have a key (so the answer isn't canned)
            keyed = [g for g in all_ags if llm.has_key(g)]
            picked = random.sample(keyed or all_ags, min(2, len(keyed or all_ags)))
        picked = picked[:3]
        accts = {x["agent_id"]: x for x in store.acct_all()}
        board = sorted(accts.values(), key=lambda x: x["equity"], reverse=True)
        px = (store.kv_get("price") or {}).get("price")
    # market context (network call) — outside the lock
    bars = market.candles("15m", "2d", "XAUUSD") or []
    vp = market.volume_profile(bars[-48:]) if len(bars) >= 20 else None
    struct_lbl = strategy_presets._structure_bias(bars, 24) if len(bars) >= 8 else "FLAT"
    ote_ctx = strategy_presets._swing_ote(bars, "BEAR" if struct_lbl == "BEAR" else "BULL") if len(bars) >= 8 else None
    sess = market.session(now().hour)
    mkt_ctx = (f"M15 Structure: {struct_lbl}"
               + (f" | 50% Eq {ote_ctx['eq']} | OTE .705={ote_ctx['ote_705']}" if ote_ctx else "")
               + (f" | VP POC {vp['poc']}, VAH {vp['vah']}, VAL {vp['val']}" if vp else "") + f" | Session: {sess}")
    replies: List[int] = []
    round_replies: List[str] = []
    for ag in picked:
        with LOCK:
            hist = store.chat(limit=14)
            transcript = _transcript([m for m in hist if m["id"] != uid], accts, 8)
            facts = _facts_for(ag, accts, board, px)
            rank = [x["agent_id"] for x in board].index(ag["agent_id"]) + 1
            me = accts[ag["agent_id"]]
            pr_obj = presets.get_preset(get_agent_prefs(ag["agent_id"])["preset"])
            mine = store.trades(status="Open", agent_id=ag["agent_id"])
        pos_txt = f"{mine[0]['side']} {mine[0]['lots']} lot @ {mine[0]['entry']} (SL {mine[0]['sl']}, TP {mine[0]['tp']})" if mine else "flat (no open trade)"
        text, tokens, src = None, 0, "template"
        if llm.has_key(ag) and _tokens_ok(500):
            peers = ("\nOther AIs already answered the commander in this round:\n" + "\n".join(round_replies) +
                     "\nAdd your OWN view — agree or push back on them by @Name, don't just repeat.") if round_replies else ""
            res = llm.ask(ag, _chat_system(ag, f"Active strategy preset: {pr_obj['name']} ({pr_obj['prompt']}). Answer the commander's exact question directly in 2-4 crisp sentences, "
                                               "using your preset's exact concepts (e.g. OTE, FVG, Order Block, Sweep, Premium/Discount, VP) — do NOT talk about generic EMA/ATR."),
                          f"{facts}\nMarket: {mkt_ctx}\n\nRecent chat:\n{transcript}\n{peers}\n\nCommander asks: {msg or '(attached a chart image)'}",
                          320, image_data_url=image)
            if res: text, tokens, src = res[0], res[1], "llm"; _tokens_add(tokens)
        if not text:
            lvl = f"POC {vp['poc']} (VAL {vp['val']} / VAH {vp['vah']})" if vp else f"~{px}"
            ote_txt = f"OTE .705={ote_ctx['ote_705']} (50% Eq {ote_ctx['eq']})" if ote_ctx else struct_lbl
            if image and not msg:
                text = (f"Reading your chart with XAUUSD at {px} ({struct_lbl}, {ote_txt}). Key structure sits at {lvl}. I'm currently {pos_txt} at #{rank} (${me['equity']:,.0f}) using {pr_obj['name']}.")
            elif any(k in msg.lower() for k in ("buy", "sell", "เข้า", "เทรด", "ทิศ", "แนวโน้ม", "trend", "ทอง", "gold", "วิเคราะห์", "analyze", "plan", "แผน")):
                bias = "long bias in Discount" if struct_lbl == "BULL" else "short bias in Premium"
                text = (f"XAUUSD @ {px} in {sess}: M15 structure is {struct_lbl} ({ote_txt}). Volume Profile {lvl} gives a {bias} under my {pr_obj['name']} preset. Right now I'm {pos_txt} (#{rank}, ${me['equity']:,.0f}).")
            elif mine:
                text = (f"Currently {pos_txt} while gold trades at {px} ({struct_lbl}, {ote_txt}). Watching {lvl} and keeping my stop respected at {mine[0]['sl']}.")
            else:
                text = (f"Rank #{rank} (${me['equity']:,.0f}) on {pr_obj['name']} — sitting flat at {px}. M15 structure is {struct_lbl} ({ote_txt}); watching {lvl} for a clean 2R+ setup.")
        rts = iso()
        rid = store.chat_add(rts, ag["agent_id"], "CHAT", text[:480], tokens, uid, None, src)
        discord.notify_chat(ag, text[:480], rts, msg[:120] if msg else "Shared an image")
        round_replies.append(f"{ag['short_name']}: {text[:300]}")
        replies.append(rid)
    return {"ok": True, "user_msg_id": uid, "reply_ids": replies}

def _template_reply(ag, target, rank, board, px, accts) -> Optional[str]:
    me = accts[ag["agent_id"]]; mine = store.trades(status="Open", agent_id=ag["agent_id"])
    if target and target["agent_id"] != ag["agent_id"] and target["agent_id"] in accts:
        who = "@" + agent_cfg(target["agent_id"])["short_name"]
        if target["kind"] == "TRADE_OPEN":
            t = next((x for x in store.trades(agent_id=target["agent_id"], limit=3) if x["status"] == "Open"), None)
            if t:
                if mine and mine[0]["side"] != t["side"]:
                    return random.choice([
                        f"{who} bold taking {t['side']} here at {t['entry']} — I'm literally {mine[0]['side']} from {mine[0]['entry']}. One of us is getting swept.",
                        f"Interesting {t['side']} {who}, I'm positioned the other way ({mine[0]['side']}). Let's see if {t['sl']} holds.",
                    ])
                return random.choice([
                    f"{who} nice {t['side']} at {t['entry']}, though {abs(t['tp']-t['entry']):.1f} pts to TP will need real NY volume.",
                    f"Clean entry {who}. Keeping an eye on {t['sl']} to see if buyers/sellers defend it.",
                ])
        if target["kind"] == "TRADE_CLOSE":
            return random.choice([
                f"{who} good discipline locking that in. I'm #{rank} at ${me['equity']:.0f}, {'staying patient in cash' if not mine else 'still riding my ' + mine[0]['side'] + ' from ' + str(mine[0]['entry'])}.",
                f"Noted {who}. Onto the next setup — gold at {px} still looks {('interesting' if mine else 'choppy')} here.",
            ])
    if target and target["kind"] == "CHAT" and target["agent_id"] in accts and target["agent_id"] != ag["agent_id"]:
        who = "@" + agent_cfg(target["agent_id"])["short_name"]; theirs = accts[target["agent_id"]]
        their_rank = [x["agent_id"] for x in board].index(target["agent_id"]) + 1
        pos = f"holding {mine[0]['side']} from {mine[0]['entry']}" if mine else "sitting in cash"
        opts = [
            f"{who} fair point, I'm {pos} with gold around {px}. No rush to force anything here.",
            f"{who} you're #{their_rank} (${theirs['equity']:.0f}) so respect, but I'm not chasing {px} unless it gives me 2R.",
            f"Yeah {who}, ${abs(theirs['equity']-me['equity']):.0f} between us is basically one clean swing. Currently {pos}.",
            f"Hearing you {who} — price action at {px} feels a bit stretched, {pos} for now.",
        ]
        return random.choice(opts)
    leader = agent_cfg(board[0]["agent_id"])["short_name"]
    if rank == 1:
        return random.choice([
            f"Holding #1 at ${me['equity']:.0f}. Staying selective around {px}, no need to overtrade.",
            f"Top of the board at ${me['equity']:.0f} right now — keeping risk tight at {px}.",
        ])
    return random.choice([
        f"@{leader} is only ${board[0]['equity']-me['equity']:.0f} ahead. Watching {px} closely for the next clean sweep.",
        f"Gold sitting at {px} — waiting for liquidity to clear before committing size.",
    ])

# ───────────────────────── manual controls (cockpit buttons) ─────────────────────────
def flatten() -> Dict[str, Any]:
    """Close every open position at the current real price."""
    with LOCK:
        pr = store.kv_get("price")
        if not pr: return {"closed": 0, "reason": "no price"}
        n = 0
        for t in store.trades(status="Open", limit=500):
            _close(t, pr["price"], "MANUAL"); n += 1
        return {"closed": n}

def set_agent_enabled(agent_id: str, enabled: bool) -> Dict[str, Any]:
    with LOCK:
        a = store.acct_get(agent_id)
        if not a: return {"ok": False}
        a["disabled"] = not enabled
        a["last_note"] = "Enabled by commander" if enabled else "Disabled by commander (open trade still managed)"
        store.acct_put(a)
        return {"ok": True, "disabled": a["disabled"]}

def reset_agent(agent_id: str) -> Dict[str, Any]:
    """Reset an individual AI's account back to initial $10,000."""
    with LOCK:
        a = store.acct_get(agent_id)
        if not a: return {"ok": False}
        pr = store.kv_get("price") or {}
        for t in store.trades(status="Open", agent_id=agent_id, limit=50):
            _close(t, pr.get("price") or t["entry"], "RESET")
        init_eq = float(a.get("initial_equity", 10000.0))
        a["equity"] = init_eq
        a["open_pnl"] = 0.0
        a["day_start_equity"] = init_eq
        a["week_start_equity"] = init_eq
        a["trades_today"] = 0
        a["consecutive_losses"] = 0
        a["cooldown_until"] = None
        a["last_note"] = f"Account reset to ${init_eq:,.0f}"
        store.acct_put(a)
        store.equity_add(iso(), agent_id, init_eq)
        return {"ok": True, "agent_id": agent_id, "equity": init_eq}

# ───────────────────────── read models for the UI ─────────────────────────
def calendar(agent_id: Optional[str] = None, month: Optional[str] = None) -> Dict[str, Any]:
    days: Dict[str, Dict[str, Any]] = {}
    for t in store.trades(status="Closed", agent_id=agent_id, limit=5000):
        d = t["closed_at"][:10]
        if month and not d.startswith(month): continue
        c = days.setdefault(d, {"pnl": 0.0, "trades": 0, "wins": 0})
        c["pnl"] = round(c["pnl"] + t["pnl"], 2); c["trades"] += 1; c["wins"] += 1 if t["pnl"] > 0 else 0
    return days

def stats(agent_id: str) -> Dict[str, Any]:
    cl = store.trades(status="Closed", agent_id=agent_id, limit=5000)
    wins = [t["pnl"] for t in cl if t["pnl"] > 0]; losses = [-t["pnl"] for t in cl if t["pnl"] <= 0]
    n = len(cl)
    return {"trades": n, "winrate": round(len(wins) / n * 100, 1) if n else 0.0,
            "profit_factor": round(sum(wins) / sum(losses), 2) if losses and sum(losses) else (None if not wins else 99.0),
            "avg_r": round(sum(t["r_multiple"] for t in cl) / n, 2) if n else 0.0}

def snapshot() -> Dict[str, Any]:
    init()
    px = store.kv_get("price") or {}
    accts = {x["agent_id"]: x for x in store.acct_all()}
    opens = store.trades(status="Open", limit=500)
    lc = get_leader_config()
    rows = []
    for ag in agents():
        a = accts.get(ag["agent_id"])
        if not a: continue
        o = [t for t in opens if t["agent_id"] == a["agent_id"]]
        prefs = get_agent_prefs(a["agent_id"])
        pr_obj = presets.get_preset(prefs["preset"])
        eq = a["equity"] + a.get("open_pnl", 0.0)
        day_pnl = round(a["equity"] - a["day_start_equity"] + a.get("open_pnl", 0.0), 2)
        dd_locked = prefs["daily_dd_limit"] > 0 and day_pnl <= -prefs["daily_dd_limit"]
        st = "DISABLED" if a.get("disabled") else "DD LOCKED" if dd_locked else "COOLDOWN" if a.get("cooldown_until") and iso() < a["cooldown_until"] else ("IN TRADE" if o else "SCANNING")
        live_mode = "llm" if llm.has_key(ag) else "preset"
        rows.append({"agent_id": a["agent_id"], "name": ag["display_name"], "short": ag["short_name"], "provider": ag["provider"],
                     "color": ag["color"], "avatar": ag.get("avatar", ""), "style": ag["style_archetype"], "mode": live_mode,
                     "balance": round(eq, 2), "equity": round(eq, 2), "roi_pct": round((eq / a["initial_equity"] - 1) * 100, 2),
                     "day_pnl": day_pnl, "open_pnl": a.get("open_pnl", 0.0),
                     "position": (f"{o[0]['side']} {o[0]['lots']}" if o else "-"), "avg_price": o[0]["entry"] if o else None,
                     "disabled": bool(a.get("disabled")), "symbol": "XAUUSD", "qty": o[0]["lots"] if o else None,
                     "status": st, "dd_locked": dd_locked, "preset": prefs["preset"], "preset_name": pr_obj["name"],
                     "daily_dd_limit": prefs["daily_dd_limit"], "allowed_assets": prefs["allowed_assets"],
                     "risk_pct": prefs["risk_pct"], "max_lot": prefs["max_lot"],
                     "is_leader": bool(lc["leader_id"] and lc["leader_id"] == a["agent_id"]),
                     "note": a.get("last_note", ""), **stats(a["agent_id"])})
    rows.sort(key=lambda r: r["equity"], reverse=True)
    for i, r in enumerate(rows): r["rank"] = i + 1
    tok = store.kv_get("tokens", {"used": 0})
    return {"ts": iso(), "price": px.get("price"), "price_source": px.get("source"), "price_ts": px.get("ts"),
            "paused": bool(store.kv_get("paused")), "trade_paused": bool(store.kv_get("trade_paused")),
            "ai_analysis_assets": get_ai_analysis_assets(), "leader_config": lc,
            "total_balance": round(sum(r["equity"] for r in rows), 2),
            "total_day_pnl": round(sum(r["day_pnl"] for r in rows), 2), "total_open_pnl": round(sum(r["open_pnl"] for r in rows), 2),
            "open_positions": len(opens), "tokens_used": tok.get("used", 0), "agents": rows,
            "open_trades": opens, "recent_trades": store.trades(limit=300)}

def strategy_dna(agent_id: str) -> Dict[str, Any]:
    """Condition winrate breakdown & lessons for the Strategy DNA panel."""
    cl = store.trades(status="Closed", agent_id=agent_id, limit=500)
    a = store.acct_get(agent_id) or {}
    prefs = get_agent_prefs(agent_id)
    by_sess: Dict[str, Dict[str, int]] = {}
    by_side: Dict[str, Dict[str, int]] = {}
    for t in cl:
        s = t.get("session") or "Unknown"
        sd = t.get("side") or "BUY"
        for d, k in ((by_sess, s), (by_side, sd)):
            b = d.setdefault(k, {"wins": 0, "total": 0})
            b["total"] += 1
            if t.get("pnl", 0) > 0: b["wins"] += 1
    return {
        "agent_id": agent_id,
        "preset": prefs["preset"],
        "preset_name": presets.get_preset(prefs["preset"])["name"],
        "lessons": a.get("lessons", [])[:6],
        "sessions": {k: {"total": v["total"], "winrate": round(v["wins"] / v["total"] * 100, 1)} for k, v in by_sess.items()},
        "sides": {k: {"total": v["total"], "winrate": round(v["wins"] / v["total"] * 100, 1)} for k, v in by_side.items()},
    }

def leaderboard(period: str = "all") -> Dict[str, Any]:
    """Ranked leaderboard with Daily/Weekly/Monthly/All-Time filtering & Sunday countdown."""
    snap = snapshot()
    n = now()
    cutoff = None
    if period == "daily":
        cutoff = n.strftime("%Y-%m-%d")
    elif period == "weekly":
        cutoff = (n - timedelta(days=n.weekday())).strftime("%Y-%m-%d")
    elif period == "monthly":
        cutoff = n.strftime("%Y-%m-01")
    rows = []
    for r in snap["agents"]:
        item = dict(r)
        if cutoff:
            cl = [t for t in store.trades(status="Closed", agent_id=r["agent_id"], limit=2000) if (t.get("closed_at") or "")[:10] >= cutoff]
            pnl = round(sum(t["pnl"] for t in cl) + r.get("open_pnl", 0.0), 2)
            wins = [t["pnl"] for t in cl if t["pnl"] > 0]
            losses = [-t["pnl"] for t in cl if t["pnl"] <= 0]
            item["period_pnl"] = pnl
            item["period_roi"] = round(pnl / 100.0, 2)
            item["period_trades"] = len(cl)
            item["period_winrate"] = round(len(wins) / len(cl) * 100, 1) if cl else 0.0
            item["period_pf"] = round(sum(wins) / sum(losses), 2) if losses and sum(losses) else (99.0 if wins else 0.0)
        else:
            item["period_pnl"] = round(r["equity"] - 10000.0, 2)
            item["period_roi"] = r["roi_pct"]
            item["period_trades"] = r["trades"]
            item["period_winrate"] = r["winrate"]
            item["period_pf"] = r["profit_factor"] or 0.0
        rows.append(item)
    rows.sort(key=lambda x: x["period_pnl"], reverse=True)
    for i, x in enumerate(rows):
        x["period_rank"] = i + 1
    days_to_sun = (6 - n.weekday()) % 7 or 7
    next_sun = (n + timedelta(days=days_to_sun)).replace(hour=20, minute=0, second=0, microsecond=0)
    return {"period": period, "agents": rows, "next_sunday_utc": iso(next_sun)}

def weekly_mentor_review(force: bool = False) -> Dict[str, Any]:
    """Sunday Weekly Review: #1 AI mentors bottom AIs and posts to Chat + Discord."""
    wk = now().strftime("%Y-W%W")
    if not force and store.kv_get("last_weekly_review") == wk:
        return {"ok": True, "skipped": True, "week": wk}
    snap = snapshot()
    if not snap["agents"]:
        return {"ok": False}
    top = snap["agents"][0]
    bottom = snap["agents"][-3:]
    ag = agent_cfg(top["agent_id"])
    summary = (f"Sunday Weekly Review ({wk}) — Leader: {top['short']} (${top['equity']:,.2f}, {top['roi_pct']:+.2f}%). "
               f"Coaching for {', '.join(b['short'] for b in bottom)}: cut losers early at invalidation, respect ±15m USD news filter, "
               f"and wait for 2.0R+ confluence inside London/NY Killzones.")
    if llm.has_key(ag) and _tokens_ok(500):
        res = llm.ask(ag, "You are the #1 ranked AI gold trader giving a crisp Sunday coaching review to the bottom 3 traders. Max 3 sentences.",
                      f"Top: {top['short']} ${top['equity']:.0f}. Bottom 3: {[(b['short'], b['equity'], b['winrate']) for b in bottom]}", 180)
        if res:
            summary = res[0].strip()[:420]
            _tokens_add(res[1])
    ts = iso()
    store.chat_add(ts, top["agent_id"], "CHAT", summary, 0, None)
    discord.notify_chat(ag, f"[Sunday Mentor Review] {summary}", ts, None)
    store.kv_set("last_weekly_review", wk)
    return {"ok": True, "week": wk, "mentor": top["short"], "summary": summary}

# ───────────────────────── loop ─────────────────────────
_started = False
def run_forever() -> None:
    """Single background loop: price every 5s, decisions every 15 min, chat every ~90s."""
    init()
    n = 0
    while True:
        try:
            tick()
            if n % 6 == 0: decide()          # internally throttled per agent
            if n % 12 == 0: converse()       # internally throttled by chat_min_gap_seconds
            if now().weekday() == 6 and now().hour >= 20:
                weekly_mentor_review(force=False)
        except Exception as e:               # never let the loop die
            print("engine loop error:", repr(e), flush=True)
        n += 1
        time.sleep(int(cfg()["token_budget"].get("tick_seconds", 5)))

def start_background() -> None:
    global _started
    if _started: return
    _started = True
    threading.Thread(target=run_forever, daemon=True, name="arena-engine").start()
