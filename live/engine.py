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
from . import store, market, llm, discord

BASE = Path(__file__).resolve().parent.parent
LOCK = threading.RLock()
CFG: Dict[str, Any] = {}
CONTRACT = 100.0   # oz per 1.00 lot

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
    if store.kv_get("initialised") and not fresh:
        return
    eq0 = float(cfg()["trading"]["initial_equity"])
    for a in agents():
        store.acct_put({"agent_id": a["agent_id"], "equity": eq0, "initial_equity": eq0, "day_start_equity": eq0,
                        "day": now().strftime("%Y-%m-%d"), "week_start_equity": eq0, "consecutive_losses": 0,
                        "cooldown_until": None, "last_decision_at": None, "trades_today": 0, "lessons": [],
                        "mode": "llm" if llm.has_key(a) else "rules", "last_note": "Waiting for first scan"})
        store.equity_add(iso(), a["agent_id"], eq0)
    store.kv_set("initialised", iso())
    store.kv_set("paused", False)
    store.kv_set("tokens", {"day": now().strftime("%Y-%m-%d"), "used": 0})

def reset_season() -> None:
    import sqlite3
    c = store.conn()
    for t in ("accounts", "trades", "journal", "chat", "equity", "kv"):
        c.execute(f"DELETE FROM {t}")
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
        for t in store.trades(status="Open", limit=500):
            t["mfe"] = max(t.get("mfe", 0.0), _pnl(t["side"], t["entry"], px, t["lots"]))
            t["mae"] = min(t.get("mae", 0.0), _pnl(t["side"], t["entry"], px, t["lots"]))
            t["pnl"] = _pnl(t["side"], t["entry"], px, t["lots"])
            t["last_price"] = px
            reason = None
            if t["side"] == "BUY":
                if px <= t["sl"]: reason, fill = "SL", t["sl"]
                elif px >= t["tp"]: reason, fill = "TP", t["tp"]
            else:
                if px >= t["sl"]: reason, fill = "SL", t["sl"]
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

# ───────────────────────── decide: AI opens trades ─────────────────────────
SYSTEM = ("You are an autonomous XAUUSD (gold) day trader in a competition against other AIs. Capital is a simulated $10,000. "
          "Rules: max 1 open position, SL and TP are mandatory, min reward:risk 2.0, SL distance between $3 and $40, no martingale, no averaging down. "
          "Holding cash is a valid decision. Answer ONLY with JSON: "
          "{\"action\":\"BUY|SELL|HOLD\",\"sl\":number,\"tp\":number,\"confidence\":0-100,\"thesis\":\"max 25 words, concrete, mention levels\"}.")

def _context(a: Dict[str, Any], ag: Dict[str, Any], px: float, bars: List[Dict[str, float]]) -> str:
    last = bars[-24:]
    rows = "\n".join(f"{datetime.fromtimestamp(b['t'], timezone.utc).strftime('%d %H:%M')} O{b['o']:.1f} H{b['h']:.1f} L{b['l']:.1f} C{b['c']:.1f}" for b in last)
    others = []
    for o in store.trades(status="Open", limit=50):
        if o["agent_id"] != a["agent_id"]:
            others.append(f"{agent_cfg(o['agent_id'])['short_name']} {o['side']} @ {o['entry']}")
    return (f"Your style: {ag['style_archetype']}.\nPrice now: {px}\nATR(14, M15): {market.atr(bars):.2f}\n"
            f"Session: {market.session(now().hour)} (UTC {now().strftime('%H:%M')})\nM15 candles (last 24):\n{rows}\n"
            f"Your equity: ${a['equity']:.2f} (day {a['equity']-a['day_start_equity']:+.2f}), losses in a row: {a['consecutive_losses']}\n"
            f"Your own recent lessons: {a['lessons'][:3] or 'none yet'}\nOther AIs' open trades: {others or 'none'}")

# Different style params so rule-mode agents don't all behave the same
RULE_PARAMS = {"ai-1": (20, 50, 1.4), "ai-2": (9, 21, 1.2), "ai-3": (14, 34, 1.5), "ai-4": (12, 26, 1.3),
               "ai-5": (21, 55, 1.6), "ai-6": (8, 18, 1.2), "ai-7": (16, 40, 1.4), "ai-8": (10, 30, 1.5)}

def _rule_decision(agent_id: str, px: float, bars: List[Dict[str, float]]) -> Dict[str, Any]:
    fast, slow, k = RULE_PARAMS.get(agent_id, (12, 30, 1.4))
    closes = [b["c"] for b in bars]
    if len(closes) < slow + 5: return {"action": "HOLD", "thesis": "Not enough candles yet."}
    f, s, at = market.ema(closes[-slow*3:], fast), market.ema(closes[-slow*3:], slow), market.atr(bars)
    if at <= 0: return {"action": "HOLD", "thesis": "No ATR."}
    gap = (f - s) / at
    if gap > 0.15 and px > f:
        return {"action": "BUY", "sl": px - at * k, "tp": px + at * k * 2.2, "confidence": min(90, int(55 + gap * 40)),
                "thesis": f"EMA{fast}>EMA{slow} uptrend, price above fast EMA; stop {k}×ATR below."}
    if gap < -0.15 and px < f:
        return {"action": "SELL", "sl": px + at * k, "tp": px - at * k * 2.2, "confidence": min(90, int(55 - gap * 40)),
                "thesis": f"EMA{fast}<EMA{slow} downtrend, price below fast EMA; stop {k}×ATR above."}
    return {"action": "HOLD", "thesis": "Trend filter flat, standing aside."}

def _risk_gate(a: Dict[str, Any]) -> Optional[str]:
    r = cfg()["risk_rules"]
    if store.kv_get("paused"): return "arena paused"
    if a.get("cooldown_until") and iso() < a["cooldown_until"]: return "tilt cooldown"
    if a["trades_today"] >= r["max_trades_per_day"]: return "daily trade cap"
    if (a["equity"] - a["day_start_equity"]) / a["day_start_equity"] * 100 <= -r["max_daily_loss_pct"]: return "daily loss limit"
    if (a["equity"] - a["week_start_equity"]) / a["week_start_equity"] * 100 <= -r["max_weekly_loss_pct"]: return "weekly loss limit"
    return None

def decide(force: bool = False) -> List[str]:
    out = []
    with LOCK:
        init()
        pr = store.kv_get("price")
        bars = market.candles("15m")
        if not pr or len(bars) < 60: return ["no data"]
        px = pr["price"]
        interval = int(cfg()["token_budget"].get("decision_minutes", 15))
        for ag in agents():
            a = store.acct_get(ag["agent_id"]); _roll_day(a)
            if a.get("disabled") or store.trades(status="Open", agent_id=a["agent_id"]):
                continue
            if a["last_decision_at"] and not force and now() - datetime.strptime(a["last_decision_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(minutes=interval):
                continue
            a["last_decision_at"] = iso()
            blocked = _risk_gate(a)
            if blocked:
                a["last_note"] = f"Standing down: {blocked}"; store.acct_put(a); continue
            mode, d, tokens = "rules", None, 0
            if llm.has_key(ag) and _tokens_ok(900):
                res = llm.ask(ag, SYSTEM, _context(a, ag, px, bars), 350)
                if res:
                    d = llm.parse_json(res[0]); tokens = res[1]; _tokens_add(tokens)
                    mode = "llm" if d else "rules"
            if not d: d = _rule_decision(ag["agent_id"], px, bars)
            a["mode"] = mode
            ok, why = _validate(d, px)
            if not ok:
                a["last_note"] = f"{d.get('action','?')} rejected: {why}"; store.acct_put(a); continue
            if d["action"] == "HOLD":
                a["last_note"] = d.get("thesis", "Holding cash"); store.acct_put(a); continue
            spread = float(cfg()["paper"]["base_spread_usd"])
            entry = round(px + spread / 2 if d["action"] == "BUY" else px - spread / 2, 2)
            lots = _lots(a["equity"], entry, float(d["sl"]), float(cfg()["risk_rules"]["default_risk_pct"]))
            t = {"id": "T-" + uuid.uuid4().hex[:8].upper(), "agent_id": a["agent_id"], "status": "Open", "side": d["action"],
                 "lots": lots, "entry": entry, "sl": round(float(d["sl"]), 2), "sl_initial": round(float(d["sl"]), 2), "tp": round(float(d["tp"]), 2),
                 "opened_at": iso(), "session": market.session(now().hour), "thesis": str(d.get("thesis", ""))[:240],
                 "confidence": int(d.get("confidence", 60)), "mode": mode, "pnl": 0.0, "mfe": 0.0, "mae": 0.0}
            a["trades_today"] += 1; a["last_note"] = t["thesis"]
            store.trade_put(t); store.acct_put(a); out.append(t["id"])
            _announce(t, a, opened=True)
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

def converse(force: bool = False) -> Optional[int]:
    """Pick an AI that did NOT speak last and let it respond to the recent chat."""
    with LOCK:
        init()
        gap = int(cfg()["token_budget"].get("chat_min_gap_seconds", 90))
        msgs = store.chat(limit=12)
        if msgs and not force and (now() - datetime.strptime(msgs[-1]["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() < gap:
            return None
        recent_speakers = [m["agent_id"] for m in msgs[-3:]]
        pool = [g for g in agents() if g["agent_id"] not in recent_speakers] or agents()
        # prefer the AI involved in the latest trade event, otherwise random
        last_ev = next((m for m in reversed(msgs) if m["kind"].startswith("TRADE")), None)
        ag = random.choice(pool)
        accts = {x["agent_id"]: x for x in store.acct_all()}
        board = sorted(accts.values(), key=lambda x: x["equity"], reverse=True)
        rank = [x["agent_id"] for x in board].index(ag["agent_id"]) + 1
        px = (store.kv_get("price") or {}).get("price")
        transcript = "\n".join(f"[{m['id']}] {agent_cfg(m['agent_id'])['short_name'] if m['agent_id'] in accts else m['agent_id']}: {m['text']}" for m in msgs[-8:]) or "(empty)"
        standings = ", ".join(f"{agent_cfg(x['agent_id'])['short_name']} ${x['equity']:.0f}" for x in board)
        target = msgs[-1] if msgs else None
        text, tokens = None, 0
        if llm.has_key(ag) and _tokens_ok(300):
            res = llm.ask(ag, f"You are {ag['short_name']}, an AI gold trader ({ag['style_archetype']}) chatting with rival AI traders in a shared room. "
                              "Reply to the latest message in 1-2 short sentences, address the other AI by name, be sharp and specific (levels, risk, their trade). "
                              "Banter allowed, no insults, no financial-advice disclaimers.",
                          f"Gold: {px}. Standings: {standings}. You are #{rank}.\nChat:\n{transcript}\n\nWrite your next message.", 120)
            if res: text, tokens = res[0].strip().strip('"'), res[1]; _tokens_add(tokens)
        if not text:
            text = _template_reply(ag, target, rank, board, px, accts)
        if not text: return None
        ts = iso()
        cid = store.chat_add(ts, ag["agent_id"], "CHAT", text[:420], tokens, target["id"] if target else None)
        discord.notify_chat(ag, text[:420], ts, target["text"] if target else None)
        return cid

def _template_reply(ag, target, rank, board, px, accts) -> Optional[str]:
    me = accts[ag["agent_id"]]; mine = store.trades(status="Open", agent_id=ag["agent_id"])
    if target and target["agent_id"] != ag["agent_id"] and target["agent_id"] in accts:
        who = agent_cfg(target["agent_id"])["short_name"]
        if target["kind"] == "TRADE_OPEN":
            t = next((x for x in store.trades(agent_id=target["agent_id"], limit=3) if x["status"] == "Open"), None)
            if t:
                if mine and mine[0]["side"] != t["side"]: return f"{who}, I'm {mine[0]['side']} and you're {t['side']} — one of us is wrong at {px}. Your stop at {t['sl']} is my first target."
                return f"{who}, {t['side']} here makes sense but your {abs(t['tp']-t['entry'])/abs(t['entry']-t['sl']):.1f}R target needs {abs(t['tp']-t['entry']):.0f} points to run. I'll watch {t['entry']}."
        if target["kind"] == "TRADE_CLOSE":
            return f"{who}, noted. I'm #{rank} at ${me['equity']:.0f}; {'sitting flat until the setup is clean' if not mine else 'managing my open ' + mine[0]['side'] + ' at ' + str(mine[0]['entry'])}."
    if target and target["kind"] == "CHAT" and target["agent_id"] in accts and target["agent_id"] != ag["agent_id"]:
        who = agent_cfg(target["agent_id"])["short_name"]; theirs = accts[target["agent_id"]]
        their_rank = [x["agent_id"] for x in board].index(target["agent_id"]) + 1
        pos = f"I'm holding a {mine[0]['side']} from {mine[0]['entry']}" if mine else "I'm flat right now"
        opts = [f"{who}, you're #{their_rank} at ${theirs['equity']:.0f} — fair, but {pos}. Gold {px}, I'm waiting for my level, not chasing.",
                f"Hear you, {who}. {pos}; my note: {me['last_note'][:80]}",
                f"{who}, gap between us is ${abs(theirs['equity']-me['equity']):.0f}. That's one trade. {pos}."]
        return random.choice(opts)
    leader = agent_cfg(board[0]["agent_id"])["short_name"]
    if rank == 1: return f"Leading at ${me['equity']:.0f}. Not changing anything — {me['last_note'][:90]}"
    return f"{leader} is ahead by ${board[0]['equity']-me['equity']:.0f}. My read at {px}: {me['last_note'][:100]}"

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
    accts = store.acct_all()
    opens = store.trades(status="Open", limit=500)
    rows = []
    for a in accts:
        ag = agent_cfg(a["agent_id"]); o = [t for t in opens if t["agent_id"] == a["agent_id"]]
        eq = a["equity"] + a.get("open_pnl", 0.0)
        rows.append({"agent_id": a["agent_id"], "name": ag["display_name"], "short": ag["short_name"], "provider": ag["provider"],
                     "color": ag["color"], "avatar": ag.get("avatar", ""), "style": ag["style_archetype"], "mode": a["mode"],
                     "balance": round(eq, 2), "equity": round(eq, 2), "roi_pct": round((eq / a["initial_equity"] - 1) * 100, 2),
                     "day_pnl": round(a["equity"] - a["day_start_equity"] + a.get("open_pnl", 0.0), 2), "open_pnl": a.get("open_pnl", 0.0),
                     "position": (f"{o[0]['side']} {o[0]['lots']}" if o else "-"), "avg_price": o[0]["entry"] if o else None,
                     "disabled": bool(a.get("disabled")), "symbol": "XAUUSD", "qty": o[0]["lots"] if o else None,
                     "status": "DISABLED" if a.get("disabled") else "COOLDOWN" if a.get("cooldown_until") and iso() < a["cooldown_until"] else ("IN TRADE" if o else "SCANNING"),
                     "note": a.get("last_note", ""), **stats(a["agent_id"])})
    rows.sort(key=lambda r: r["equity"], reverse=True)
    for i, r in enumerate(rows): r["rank"] = i + 1
    tok = store.kv_get("tokens", {"used": 0})
    return {"ts": iso(), "price": px.get("price"), "price_source": px.get("source"), "price_ts": px.get("ts"),
            "paused": bool(store.kv_get("paused")), "total_balance": round(sum(r["equity"] for r in rows), 2),
            "total_day_pnl": round(sum(r["day_pnl"] for r in rows), 2), "total_open_pnl": round(sum(r["open_pnl"] for r in rows), 2),
            "open_positions": len(opens), "tokens_used": tok.get("used", 0), "agents": rows,
            "open_trades": opens, "recent_trades": store.trades(limit=300)}

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
        except Exception as e:               # never let the loop die
            print("engine loop error:", repr(e), flush=True)
        n += 1
        time.sleep(int(cfg()["token_budget"].get("tick_seconds", 5)))

def start_background() -> None:
    global _started
    if _started: return
    _started = True
    threading.Thread(target=run_forever, daemon=True, name="arena-engine").start()
