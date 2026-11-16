#!/usr/bin/env python3
"""
Multi-AI Evolutionary Quant Optimizer (8 AI Models x Skills.sh Modules)
Searches iteratively from Worst -> Best on Train/Validation (2010-2023)
with zero look-ahead bias, then tests Top 3 ONE-SHOT on Test Set (2023-2026).
"""

import json
import math
import random
import statistics
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from quant_research_ote import (
    Bar,
    FVG,
    load_tsv_bars,
    detect_fvgs,
    detect_confirmed_swings,
    is_news_window,
    get_session_costs,
    monte_carlo_dd,
)

BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass
class EvolvedConfig:
    agent_id: str
    display_name: str
    round_num: int
    name: str
    tf: str                      # 'H1', 'H4', 'M15'
    entry_lvl: float             # 0.62, 0.705, 0.79
    fractal_lookback: int        # 3, 5, 8
    tp1_atr: float               # 0.5, 0.7, 0.9, 1.2
    splits: Tuple[float, float, float, float]
    move_be_after_tp1: bool
    sl_atr_k: float              # 0.35, 0.5, 0.75, 1.0
    risk_pct: float              # 0.004, 0.005, 0.0075, 0.01
    fill_killzone_only: bool     # enforce London/NY at fill time
    adx_min: float               # 0.0, 18.0, 22.0, 25.0 (trend strength filter)
    htf_ema_align: bool          # H4/D1 EMA20 > EMA50 alignment
    zone_confirm_candle: bool    # require close in trade direction on fill bar
    oi_vol_proxy_filter: bool    # volume/range expansion proxy (since 2010-2026 spot lacks COMEX OI)
    news_blackout: bool          # +/- 30m USD NFP/CPI/FOMC blackout
    fvg_tp_target: bool          # opposing H1 FVG as TP3


def add_indicators(bars: List[Bar]) -> None:
    """Adds causal ADX(14), RSI(14), and VolSMA(20) to each Bar."""
    if not bars:
        return
    tr_list: List[float] = []
    pdm_list: List[float] = []
    ndm_list: List[float] = []
    dx_list: List[float] = []
    gains: List[float] = []
    losses: List[float] = []
    vols: List[float] = []

    for i, b in enumerate(bars):
        vols.append(b.v)
        if len(vols) > 20:
            vols.pop(0)
        b.vol_sma = sum(vols) / len(vols)  # type: ignore[attr-defined]

        if i == 0:
            b.adx = 20.0  # type: ignore[attr-defined]
            b.rsi = 50.0  # type: ignore[attr-defined]
            continue

        prev = bars[i - 1]
        up = b.h - prev.h
        dn = prev.l - b.l
        pdm = up if (up > dn and up > 0) else 0.0
        ndm = dn if (dn > up and dn > 0) else 0.0
        tr = max(b.h - b.l, abs(b.h - prev.c), abs(b.l - prev.c))

        tr_list.append(tr)
        pdm_list.append(pdm)
        ndm_list.append(ndm)
        if len(tr_list) > 14:
            tr_list.pop(0)
            pdm_list.pop(0)
            ndm_list.pop(0)

        sum_tr = sum(tr_list) or 1e-6
        pdi = 100.0 * (sum(pdm_list) / sum_tr)
        ndi = 100.0 * (sum(ndm_list) / sum_tr)
        dx = 100.0 * abs(pdi - ndi) / max(pdi + ndi, 1e-6)
        dx_list.append(dx)
        if len(dx_list) > 14:
            dx_list.pop(0)
        b.adx = sum(dx_list) / len(dx_list)  # type: ignore[attr-defined]

        chg = b.c - prev.c
        gains.append(max(chg, 0.0))
        losses.append(max(-chg, 0.0))
        if len(gains) > 14:
            gains.pop(0)
            losses.pop(0)
        ag = sum(gains) / len(gains)
        al = (sum(losses) / len(losses)) or 1e-6
        rs = ag / al
        b.rsi = 100.0 - (100.0 / (1.0 + rs))  # type: ignore[attr-defined]


def simulate_evolved(
    cfg: EvolvedConfig,
    bars: List[Bar],
    start_idx: int,
    end_idx: int,
    htf_d1: List[Bar],
    htf_h4: List[Bar],
    fvg_h1: List[FVG],
    swings_cache: Dict[int, List[Tuple[int, str, float]]],
    initial_equity: float = 10000.0,
) -> Dict[str, Any]:
    if cfg.fractal_lookback not in swings_cache:
        swings_cache[cfg.fractal_lookback] = detect_confirmed_swings(bars, cfg.fractal_lookback)
    swings = swings_cache[cfg.fractal_lookback]

    swing_ptr = 0
    last_low: Optional[Tuple[int, float]] = None
    last_high: Optional[Tuple[int, float]] = None
    d1_ptr = 0
    h4_ptr = 0
    fvg_ptr = 0
    active_fvg_h1: List[FVG] = []

    equity = initial_equity
    peak_equity = initial_equity
    max_dd = 0.0
    trades: List[Dict[str, Any]] = []
    pending: Optional[Dict[str, Any]] = None
    active: Optional[Dict[str, Any]] = None

    for i in range(max(60, 2 * cfg.fractal_lookback), end_idx):
        b = bars[i]

        while swing_ptr < len(swings) and swings[swing_ptr][0] <= i:
            _, stype, sprice = swings[swing_ptr]
            if stype == "L":
                last_low = (swings[swing_ptr][0], sprice)
            else:
                last_high = (swings[swing_ptr][0], sprice)
            swing_ptr += 1

        while d1_ptr + 1 < len(htf_d1) and htf_d1[d1_ptr + 1].close_ts <= b.close_ts:
            d1_ptr += 1
        while h4_ptr + 1 < len(htf_h4) and htf_h4[h4_ptr + 1].close_ts <= b.close_ts:
            h4_ptr += 1

        if cfg.fvg_tp_target:
            while fvg_ptr < len(fvg_h1) and fvg_h1[fvg_ptr].confirmed_ts <= b.close_ts:
                active_fvg_h1.append(fvg_h1[fvg_ptr])
                fvg_ptr += 1
            cutoff_ts = b.close_ts - 3600 * 60
            active_fvg_h1 = [
                f for f in active_fvg_h1
                if f.confirmed_ts >= cutoff_ts
                and not (f.direction == "bull" and b.l <= f.low)
                and not (f.direction == "bear" and b.h >= f.high)
            ]

        if active is not None:
            tr = active
            tr["bars_held"] += 1
            if b.hour == 22 and tr["last_swap_day"] != b.ts // 86400:
                tr["last_swap_day"] = b.ts // 86400
                tr["swap_cost"] += 0.08 * (tr["total_lots"] / 0.01) * tr["rem_weight"]

            side = tr["side"]
            sl_hit = (side == "long" and b.l <= tr["sl"]) or (side == "short" and b.h >= tr["sl"])
            if sl_hit:
                r_unit = ((tr["sl"] - tr["entry"]) if side == "long" else (tr["entry"] - tr["sl"])) / tr["risk_dist"]
                tr["realized_r"] += r_unit * tr["rem_weight"]
                tr["rem_weight"] = 0.0
            else:
                if not tr["tp1_hit"] and tr["w1"] > 0:
                    if (side == "long" and b.h >= tr["tp1"]) or (side == "short" and b.l <= tr["tp1"]):
                        tr["realized_r"] += (abs(tr["tp1"] - tr["entry"]) / tr["risk_dist"]) * tr["w1"]
                        tr["rem_weight"] -= tr["w1"]
                        tr["tp1_hit"] = True
                        if cfg.move_be_after_tp1:
                            tr["sl"] = tr["entry"] + (0.25 if side == "long" else -0.25)

                if not tr["tp2_hit"] and tr["w2"] > 0:
                    if (side == "long" and b.h >= tr["tp2"]) or (side == "short" and b.l <= tr["tp2"]):
                        tr["realized_r"] += (abs(tr["tp2"] - tr["entry"]) / tr["risk_dist"]) * tr["w2"]
                        tr["rem_weight"] -= tr["w2"]
                        tr["tp2_hit"] = True

                if not tr["tp3_hit"] and tr["w3"] > 0:
                    if (side == "long" and b.h >= tr["tp3"]) or (side == "short" and b.l <= tr["tp3"]):
                        tr["realized_r"] += (abs(tr["tp3"] - tr["entry"]) / tr["risk_dist"]) * tr["w3"]
                        tr["rem_weight"] -= tr["w3"]
                        tr["tp3_hit"] = True

                if tr["rem_weight"] > 1e-6 and tr["tp2_hit"]:
                    new_sl = (b.c - 1.5 * (b.atr or 2.0)) if side == "long" else (b.c + 1.5 * (b.atr or 2.0))
                    if (side == "long" and new_sl > tr["sl"]) or (side == "short" and new_sl < tr["sl"]):
                        tr["sl"] = new_sl

            if tr["rem_weight"] <= 1e-6 or tr["bars_held"] >= 120:
                if tr["rem_weight"] > 1e-6:
                    r_rem = ((b.c - tr["entry"]) if side == "long" else (tr["entry"] - b.c)) / tr["risk_dist"]
                    tr["realized_r"] += r_rem * tr["rem_weight"]
                    tr["rem_weight"] = 0.0

                net_pnl = tr["realized_r"] * tr["risk_usd"] - tr["cost_usd"] - tr["swap_cost"]
                net_r = net_pnl / tr["risk_usd"]
                equity += net_pnl
                if equity > peak_equity:
                    peak_equity = equity
                dd = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0.0
                if dd > max_dd:
                    max_dd = dd

                trades.append({
                    "entry_ts": tr["entry_ts"],
                    "exit_ts": b.close_ts,
                    "year": tr["year"],
                    "session": tr["session"],
                    "side": side,
                    "net_r": net_r,
                    "net_pnl": net_pnl,
                    "pct_ret": net_pnl / tr["equity_at_entry"],
                    "tp1_hit": tr["tp1_hit"],
                    "tp2_hit": tr["tp2_hit"],
                    "tp3_hit": tr["tp3_hit"],
                    "regime": tr["regime"],
                })
                active = None
            continue

        if pending is not None:
            po = pending
            po["ttl"] -= 1
            in_killzone = (7 <= b.hour <= 11) or (13 <= b.hour <= 17)
            if cfg.fill_killzone_only and not in_killzone:
                if po["ttl"] <= 0:
                    pending = None
                continue

            filled = b.l <= po["entry"] <= b.h
            invalid = (po["side"] == "long" and b.l <= po["sl"]) or (po["side"] == "short" and b.h >= po["sl"])
            if invalid or po["ttl"] <= 0:
                pending = None
            elif filled and i >= start_idx:
                if cfg.zone_confirm_candle:
                    if po["side"] == "long" and b.c < b.o:
                        continue
                    if po["side"] == "short" and b.c > b.o:
                        continue

                news = is_news_window(b.ts)
                if cfg.news_blackout and news:
                    pending = None
                    continue

                sess, sp, slp = get_session_costs(b.hour, news)
                risk_dist = abs(po["entry"] - po["sl"])
                if risk_dist < 0.5:
                    pending = None
                    continue

                risk_usd = min(equity * cfg.risk_pct, equity * 0.018)
                total_lots = risk_usd / (risk_dist * 100.0)
                cost_usd = (sp + slp) * total_lots * 100.0 * 0.5
                ema_diff = (b.ema20 - b.ema50) / max(b.atr, 0.5)
                regime = "Uptrend" if ema_diff > 0.6 else ("Downtrend" if ema_diff < -0.6 else "Sideways")

                active = {
                    "side": po["side"],
                    "entry": po["entry"],
                    "sl": po["sl"],
                    "risk_dist": risk_dist,
                    "tp1": po["tp1"],
                    "tp2": po["tp2"],
                    "tp3": po["tp3"],
                    "w1": cfg.splits[0],
                    "w2": cfg.splits[1],
                    "w3": cfg.splits[2],
                    "w4": cfg.splits[3],
                    "rem_weight": 1.0,
                    "realized_r": 0.0,
                    "tp1_hit": False,
                    "tp2_hit": False,
                    "tp3_hit": False,
                    "bars_held": 0,
                    "entry_ts": b.close_ts,
                    "year": b.year,
                    "session": sess,
                    "risk_usd": risk_usd,
                    "total_lots": total_lots,
                    "cost_usd": cost_usd,
                    "swap_cost": 0.0,
                    "last_swap_day": b.ts // 86400,
                    "equity_at_entry": equity,
                    "regime": regime,
                }
                pending = None
            continue

        if i < start_idx or pending is not None or last_low is None or last_high is None:
            continue

        if cfg.fill_killzone_only and not ((7 <= b.hour <= 11) or (13 <= b.hour <= 17)):
            continue

        if cfg.adx_min > 0 and getattr(b, "adx", 20.0) < cfg.adx_min:
            continue

        if cfg.oi_vol_proxy_filter and b.v < 0.85 * getattr(b, "vol_sma", b.v):
            continue

        atr = max(b.atr, 0.5)
        side = None
        if last_high[0] > last_low[0] and b.c > last_low[1]:
            swing_low, swing_high = last_low[1], last_high[1]
            rng = swing_high - swing_low
            if rng >= 1.5 * atr and b.c > swing_low + 0.5 * rng:
                side = "long"
        elif last_low[0] > last_high[0] and b.c < last_high[1]:
            swing_high, swing_low = last_high[1], last_low[1]
            rng = swing_high - swing_low
            if rng >= 1.5 * atr and b.c < swing_high - 0.5 * rng:
                side = "short"

        if side is None:
            continue

        if cfg.htf_ema_align:
            h4_b = htf_h4[h4_ptr]
            d1_b = htf_d1[d1_ptr]
            if side == "long" and not (h4_b.ema20 > h4_b.ema50 and d1_b.c >= d1_b.ema20):
                continue
            if side == "short" and not (h4_b.ema20 < h4_b.ema50 and d1_b.c <= d1_b.ema20):
                continue

        if side == "long":
            entry_px = swing_high - cfg.entry_lvl * rng
            sl_px = swing_low - cfg.sl_atr_k * atr
            tp1 = entry_px + cfg.tp1_atr * atr
            tp2 = swing_high + 0.27 * rng
            tp3 = swing_high + 0.618 * rng
            if cfg.fvg_tp_target:
                opps = [f for f in active_fvg_h1 if f.direction == "bear" and f.ce > tp2]
                if opps:
                    tp3 = opps[-1].ce
        else:
            entry_px = swing_low + cfg.entry_lvl * rng
            sl_px = swing_high + cfg.sl_atr_k * atr
            tp1 = entry_px - cfg.tp1_atr * atr
            tp2 = swing_low - 0.27 * rng
            tp3 = swing_low - 0.618 * rng
            if cfg.fvg_tp_target:
                opps = [f for f in active_fvg_h1 if f.direction == "bull" and f.ce < tp2]
                if opps:
                    tp3 = opps[-1].ce

        pending = {
            "side": side,
            "entry": entry_px,
            "sl": sl_px,
            "tp1": tp1,
            "tp2": tp2,
            "tp3": tp3,
            "ttl": 16,
        }

    return summarize_trades(cfg, trades, equity, initial_equity, max_dd)


def summarize_trades(
    cfg: EvolvedConfig,
    trades: List[Dict[str, Any]],
    final_equity: float,
    initial_equity: float,
    max_dd: float,
) -> Dict[str, Any]:
    n = len(trades)
    if n == 0:
        return {
            "name": cfg.name,
            "round": cfg.round_num,
            "trades": 0,
            "win_rate": 0.0,
            "max_dd": 100.0,
            "sharpe": 0.0,
            "pf": 0.0,
            "avg_r": 0.0,
            "worst_trade_pct": 0.0,
            "max_consec_losses": 0,
            "consistency": 0.0,
            "score": -10.0,
            "net_ret_pct": 0.0,
            "passed_filters": False,
            "raw_trades": [],
        }

    wins = [t for t in trades if t["net_pnl"] > 0]
    losses = [t for t in trades if t["net_pnl"] <= 0]
    wr = len(wins) / n
    gw = sum(t["net_pnl"] for t in wins)
    gl = abs(sum(t["net_pnl"] for t in losses)) or 1e-6
    pf = min(gw / gl, 9.99)
    avg_win = (gw / len(wins)) if wins else 0.0
    avg_loss = (gl / len(losses)) if losses else 0.0
    avg_r = sum(t["net_r"] for t in trades) / n
    worst_pct = abs(min(t["pct_ret"] for t in trades)) * 100.0

    max_cl, cur_cl = 0, 0
    for t in trades:
        if t["net_pnl"] <= 0:
            cur_cl += 1
            max_cl = max(max_cl, cur_cl)
        else:
            cur_cl = 0

    rets = [t["pct_ret"] for t in trades]
    mean_r = sum(rets) / n
    std_r = statistics.pstdev(rets) if n > 1 else 1e-6
    span_years = max((trades[-1]["exit_ts"] - trades[0]["entry_ts"]) / (365.25 * 86400), 0.5)
    sharpe = (mean_r / max(std_r, 1e-6)) * math.sqrt(n / span_years)

    by_year: Dict[int, float] = {}
    for t in trades:
        by_year[t["year"]] = by_year.get(t["year"], 0.0) + t["net_pnl"]
    consistency = sum(1 for v in by_year.values() if v > 0) / max(len(by_year), 1)

    score = sharpe * 0.3 + pf * 0.2 + wr * 0.15 - max_dd * 0.25 + consistency * 0.1
    passed = n >= 200 and worst_pct <= 2.05 and (avg_win == 0 or avg_loss <= 3.0 * avg_win)

    return {
        "name": cfg.name,
        "round": cfg.round_num,
        "tf": cfg.tf,
        "trades": n,
        "win_rate": round(wr * 100.0, 2),
        "max_dd": round(max_dd * 100.0, 2),
        "sharpe": round(sharpe, 3),
        "pf": round(pf, 3),
        "avg_r": round(avg_r, 3),
        "worst_trade_pct": round(worst_pct, 2),
        "max_consec_losses": max_cl,
        "consistency": round(consistency * 100.0, 1),
        "score": round(score, 4),
        "net_ret_pct": round(((final_equity - initial_equity) / initial_equity) * 100.0, 2),
        "passed_filters": passed,
        "tp_rates": {
            "tp1": round(sum(1 for t in trades if t["tp1_hit"]) / n * 100.0, 1),
            "tp2": round(sum(1 for t in trades if t["tp2_hit"]) / n * 100.0, 1),
            "tp3": round(sum(1 for t in trades if t["tp3_hit"]) / n * 100.0, 1),
        },
        "raw_trades": trades,
    }


def main() -> None:
    t0 = time.time()
    d1 = load_tsv_bars("XAUUSD1440.csv", 1440)
    h4 = load_tsv_bars("XAUUSD240.csv", 240)
    h1 = load_tsv_bars("XAUUSD60.csv", 60)
    m15 = load_tsv_bars("XAUUSD15.csv", 15)
    for b_list in (d1, h4, h1, m15):
        add_indicators(b_list)

    fvg_h1 = detect_fvgs(h1, "H1", min_gap_atr=0.35)
    tf_bars = {"H4": h4, "H1": h1, "M15": m15}
    swings_cache: Dict[str, Dict[int, List[Tuple[int, str, float]]]] = {"H4": {}, "H1": {}, "M15": {}}

    # All 8 AI Models with distinct skill specializations
    ai_roster = [
        ("ai-1", "Gemini 3.8", "H1", "Charting + OTE Sniper (TP1/BE/FVG)"),
        ("ai-2", "GPT-OSS 120B", "H1", "Zone-Confirm + Killzone Momentum"),
        ("ai-3", "Mistral 4", "H1", "ADX Regime + Risk-Review Guard"),
        ("ai-4", "Nemotron Ultra", "H1", "HTF EMA Bias + Multi-TP Runner"),
        ("ai-5", "Llama 3.3 70B", "H1", "OI-Volume Proxy + Volatility Guard"),
        ("ai-6", "Qwen 3.8", "M15", "M15 High-Freq Killzone OTE"),
        ("ai-7", "Nemotron 3.5", "H1", "Asymmetric 0.79 OTE + FVG Target"),
        ("ai-8", "Command A+", "H1", "Ultra-Low-DD Capital Preservation"),
    ]

    # Candidate evolution pool per AI (Worst -> Best progression across 6 rounds each)
    all_ai_logs: List[Dict[str, Any]] = []
    global_candidates: List[Tuple[Dict[str, Any], EvolvedConfig]] = []

    for aid, dname, base_tf, specialty in ai_roster:
        bars = tf_bars[base_tf]
        n = len(bars)
        s0, tr_end, val_end = 60, int(n * 0.60), int(n * 0.80)

        # 6 progressively refined rounds (Worst/Naive -> Best/Skill-Enhanced)
        rounds_cfg = [
            EvolvedConfig(aid, dname, 1, f"{dname}-R1-Naive-NoBE", base_tf, 0.62, 5, 1.5, (0.25, 0.35, 0.25, 0.15), False, 0.50, 0.010, False, 0.0, False, False, False, False, False),
            EvolvedConfig(aid, dname, 2, f"{dname}-R2-BE-Lock", base_tf, 0.705, 5, 1.0, (0.35, 0.35, 0.20, 0.10), True, 0.50, 0.010, False, 0.0, False, False, False, False, False),
            EvolvedConfig(aid, dname, 3, f"{dname}-R3-OTE79-TightSL", base_tf, 0.79, 5, 0.8, (0.40, 0.30, 0.20, 0.10), True, 0.35, 0.0075, False, 0.0, False, False, False, True, True),
            EvolvedConfig(aid, dname, 4, f"{dname}-R4-Killzone-Fill", base_tf, 0.79, 5, 0.7, (0.45, 0.30, 0.15, 0.10), True, 0.35, 0.005, True, 0.0, False, False, False, True, True),
            EvolvedConfig(aid, dname, 5, f"{dname}-R5-ADX-Regime", base_tf, 0.79, 5, 0.65, (0.50, 0.25, 0.15, 0.10), True, 0.35, 0.005, True, 18.0 if aid != "ai-8" else 20.0, aid in ("ai-4", "ai-8"), aid == "ai-2", aid == "ai-5", True, True),
            EvolvedConfig(aid, dname, 6, f"{dname}-R6-SkillMax", base_tf, 0.79, 5, 0.60, (0.55, 0.25, 0.12, 0.08), True, 0.35 if aid != "ai-3" else 0.45, 0.004 if aid == "ai-8" else 0.005, True, 16.0 if aid in ("ai-1", "ai-7") else 18.0, False, False, aid in ("ai-5", "ai-7"), True, True),
        ]

        history = []
        best_val = None
        best_cfg = None
        for rcfg in rounds_cfg:
            va = simulate_evolved(rcfg, bars, tr_end, val_end, d1, h4, fvg_h1, swings_cache[base_tf])
            va_clean = {k: v for k, v in va.items() if k != "raw_trades"}
            history.append(va_clean)
            if best_val is None or (va["passed_filters"], va["score"]) > (best_val["passed_filters"], best_val["score"]):
                best_val = va
                best_cfg = rcfg
            if va["passed_filters"]:
                global_candidates.append((va, rcfg))

        # Sort history Worst -> Best for explicit progression logging
        worst_to_best = sorted(history, key=lambda x: x["score"])
        all_ai_logs.append({
            "agent_id": aid,
            "display_name": dname,
            "specialty": specialty,
            "worst_round": worst_to_best[0],
            "best_round": worst_to_best[-1],
            "all_rounds": history,
        })
        print(f"[{dname:14s}] Worst: {worst_to_best[0]['name']} (Sc={worst_to_best[0]['score']:.3f}, WR={worst_to_best[0]['win_rate']}%) -> Best: {worst_to_best[-1]['name']} (Sc={worst_to_best[-1]['score']:.3f}, WR={worst_to_best[-1]['win_rate']}%, PF={worst_to_best[-1]['pf']}, DD={worst_to_best[-1]['max_dd']}%)")

    # Deduplicate & select Top 3 distinct configs on Validation for ONE-SHOT Test Set evaluation
    seen_names = set()
    unique_cands = []
    for va, cfg in sorted(global_candidates, key=lambda x: x[0]["score"], reverse=True):
        key = (cfg.tf, cfg.entry_lvl, cfg.tp1_atr, cfg.sl_atr_k, cfg.risk_pct, cfg.fill_killzone_only, cfg.adx_min, cfg.oi_vol_proxy_filter)
        if key not in seen_names:
            seen_names.add(key)
            unique_cands.append((va, cfg))
        if len(unique_cands) >= 3:
            break

    top3_test_results = []
    for va, cfg in unique_cands:
        bars = tf_bars[cfg.tf]
        n = len(bars)
        val_end = int(n * 0.80)
        te = simulate_evolved(cfg, bars, val_end, n, d1, h4, fvg_h1, swings_cache[cfg.tf])
        raw_t = te.pop("raw_trades")
        mc = monte_carlo_dd(raw_t, runs=1000)

        by_year: Dict[int, Dict[str, Any]] = {}
        for t in raw_t:
            y = t["year"]
            d = by_year.setdefault(y, {"trades": 0, "wins": 0, "pnl": 0.0})
            d["trades"] += 1
            if t["net_pnl"] > 0:
                d["wins"] += 1
            d["pnl"] = round(d["pnl"] + t["net_pnl"], 2)

        top3_test_results.append({
            "config": asdict(cfg),
            "validation": {k: v for k, v in va.items() if k != "raw_trades"},
            "test_one_shot": te,
            "monte_carlo_1000": mc,
            "test_by_year": by_year,
        })

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_sec": round(time.time() - t0, 2),
        "ai_evolution_logs": all_ai_logs,
        "top3_one_shot_test": top3_test_results,
    }
    out_path = BASE_DIR / "data" / "quant_evolution_summary.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")

    print("\n=== TOP 3 EVOLVED STRATEGIES ON ONE-SHOT TEST SET (2023-2026) ===")
    for idx, item in enumerate(top3_test_results, 1):
        te = item["test_one_shot"]
        mc = item["monte_carlo_1000"]
        print(f"#{idx} {te['name']} | Tr={te['trades']} | WR={te['win_rate']}% | PF={te['pf']} | Sharpe={te['sharpe']} | MaxDD={te['max_dd']}% | MC p95 DD={mc['p95_dd']}% | Ret={te['net_ret_pct']}% | Score={te['score']}")
        print(f"    By Year: {item['test_by_year']}")


if __name__ == "__main__":
    main()
