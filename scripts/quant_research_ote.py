#!/usr/bin/env python3
"""
Quant Research Agent for XAUUSD: Fibonacci OTE + TP Extension + SL v2 + FVG + Add-ons
Zero look-ahead bias | 1 Signal = 1 Trade | Train 60% / Val 20% / Test 20% (One-shot)
"""

import json
import math
import random
import statistics
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass
class Bar:
    idx: int
    ts: int          # unix seconds (open time UTC)
    close_ts: int    # unix seconds (close time UTC)
    dt_str: str
    year: int
    hour: int
    weekday: int
    o: float
    h: float
    l: float
    c: float
    v: float
    atr: float = 0.0
    ema20: float = 0.0
    ema50: float = 0.0


@dataclass
class FVG:
    tf: str
    direction: str   # 'bull' or 'bear'
    low: float
    high: float
    ce: float        # 50% midpoint
    confirmed_ts: int
    confirmed_idx: int
    atr_at_birth: float
    filled: bool = False
    touched: bool = False


@dataclass
class StrategyConfig:
    name: str
    tf: str                     # 'M15', 'H1', 'H4'
    entry_mode: str             # '0.62', '0.705', '0.79', 'split_62_79'
    fractal_lookback: int       # 3, 5, 8
    tp1_atr: float              # 0.8, 1.0, 1.5, 2.0
    splits: Tuple[float, float, float, float]  # (tp1, -0.27, -0.618, trail)
    move_be_after_tp1: bool
    sl_mode: str = "atr"        # 'atr', 'liquidity', 'fixed_pts'
    sl_k: float = 0.5           # ATR multiplier or fixed $ buffer
    fvg_mode: str = "none"      # 'none', 'confluence_h1', 'confluence_h4', 'confluence_d1', 'confluence_m15', 'bias', 'tp_target', 'mtf_2'
    addon: str = "none"         # 'none', 'htf_bias', 'killzone', 'liq_sweep', 'prem_disc', 'ob_ote', 'min_swing', 'news_15m'
    risk_pct: float = 0.01      # 1.0% risk per trade


def load_tsv_bars(filename: str, tf_minutes: int) -> List[Bar]:
    path = BASE_DIR / filename
    bars: List[Bar] = []
    tf_sec = tf_minutes * 60
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t") if "\t" in line else line.split(",")
            if len(parts) < 5 or parts[0].lower() in ("time", "datetime", "date"):
                continue
            dt_s = parts[0].strip()
            dt = datetime.strptime(dt_s[:16], "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
            ts = int(dt.timestamp())
            bars.append(
                Bar(
                    idx=len(bars),
                    ts=ts,
                    close_ts=ts + tf_sec,
                    dt_str=dt_s,
                    year=dt.year,
                    hour=dt.hour,
                    weekday=dt.weekday(),
                    o=float(parts[1]),
                    h=float(parts[2]),
                    l=float(parts[3]),
                    c=float(parts[4]),
                    v=float(parts[5]) if len(parts) > 5 and parts[5] else 100.0,
                )
            )
    # Precompute ATR(14), EMA(20), EMA(50) strictly causally
    tr_q: List[float] = []
    ema20 = bars[0].c if bars else 0.0
    ema50 = bars[0].c if bars else 0.0
    k20 = 2.0 / 21.0
    k50 = 2.0 / 51.0
    for i, b in enumerate(bars):
        if i == 0:
            tr = b.h - b.l
        else:
            prev_c = bars[i - 1].c
            tr = max(b.h - b.l, abs(b.h - prev_c), abs(b.l - prev_c))
        tr_q.append(tr)
        if len(tr_q) > 14:
            tr_q.pop(0)
        b.atr = sum(tr_q) / len(tr_q)
        ema20 = b.c * k20 + ema20 * (1.0 - k20)
        ema50 = b.c * k50 + ema50 * (1.0 - k50)
        b.ema20 = ema20
        b.ema50 = ema50
    return bars


def is_news_window(dt_ts: int) -> bool:
    """Deterministic NFP (1st Friday of month 13:15-13:45 UTC) & mid-month CPI/FOMC proxy."""
    dt = datetime.fromtimestamp(dt_ts, tz=timezone.utc)
    # NFP: first Friday of month (day 1..7, weekday==4) around 13:30 UTC
    if dt.weekday() == 4 and 1 <= dt.day <= 7 and dt.hour == 13 and 15 <= dt.minute <= 45:
        return True
    # CPI / FOMC proxy: 12th-15th Wed/Thu 13:15-13:45 or FOMC 19:00 UTC
    if 12 <= dt.day <= 15 and dt.weekday() in (2, 3) and dt.hour == 13 and 15 <= dt.minute <= 45:
        return True
    return False


def get_session_costs(hour: int, news: bool) -> Tuple[str, float, float]:
    """Returns (session_name, spread_usd, slippage_usd)."""
    if 0 <= hour < 7:
        sess, sp, sl = "Asia", 0.45, 0.15
    elif 7 <= hour < 13:
        sess, sp, sl = "London", 0.25, 0.10
    elif 13 <= hour < 21:
        sess, sp, sl = "NY", 0.28, 0.12
    else:
        sess, sp, sl = "Off", 0.65, 0.20
    if news:
        sp *= 3.0
        sl *= 2.5
    return sess, sp, sl


def detect_fvgs(bars: List[Bar], tf: str, min_gap_atr: float) -> List[FVG]:
    """Detects 3-candle FVGs strictly after candle 3 closes."""
    fvgs: List[FVG] = []
    for i in range(2, len(bars)):
        b1, b2, b3 = bars[i - 2], bars[i - 1], bars[i]
        atr = b2.atr or 1.0
        # Bullish FVG: b3.l > b1.h
        if b3.l > b1.h and (b3.l - b1.h) >= min_gap_atr * atr:
            fvgs.append(
                FVG(
                    tf=tf,
                    direction="bull",
                    low=b1.h,
                    high=b3.l,
                    ce=0.5 * (b1.h + b3.l),
                    confirmed_ts=b3.close_ts,
                    confirmed_idx=i,
                    atr_at_birth=atr,
                )
            )
        # Bearish FVG: b3.h < b1.l
        elif b3.h < b1.l and (b1.l - b3.h) >= min_gap_atr * atr:
            fvgs.append(
                FVG(
                    tf=tf,
                    direction="bear",
                    low=b3.h,
                    high=b1.l,
                    ce=0.5 * (b3.h + b1.l),
                    confirmed_ts=b3.close_ts,
                    confirmed_idx=i,
                    atr_at_birth=atr,
                )
            )
    return fvgs


def detect_confirmed_swings(bars: List[Bar], lookback: int) -> List[Tuple[int, str, float]]:
    """
    Returns list of (confirmed_bar_idx, 'H'|'L', price) where pivot at i is confirmed at i + lookback.
    Zero look-ahead!
    """
    swings: List[Tuple[int, str, float]] = []
    n = len(bars)
    for i in range(lookback, n - lookback):
        h_i = bars[i].h
        l_i = bars[i].l
        is_high = True
        is_low = True
        for k in range(i - lookback, i + lookback + 1):
            if k == i:
                continue
            if bars[k].h >= h_i:
                is_high = False
            if bars[k].l <= l_i:
                is_low = False
            if not is_high and not is_low:
                break
        if is_high:
            swings.append((i + lookback, "H", h_i))
        if is_low:
            swings.append((i + lookback, "L", l_i))
    swings.sort(key=lambda x: x[0])
    return swings


def run_backtest(
    cfg: StrategyConfig,
    bars: List[Bar],
    start_idx: int,
    end_idx: int,
    htf_d1: List[Bar],
    htf_h4: List[Bar],
    htf_h1: List[Bar],
    fvg_map: Dict[str, List[FVG]],
    initial_equity: float = 10000.0,
) -> Dict[str, Any]:
    """
    Causal bar-by-bar simulation of 1 Signal = 1 Trade with multi-TP legs:
    TP1 (ATR), TP2 (Fib -0.27), TP3 (Fib -0.618), Leg4 (ATR trailing).
    """
    swings = detect_confirmed_swings(bars, cfg.fractal_lookback)
    swing_ptr = 0
    last_low: Optional[Tuple[int, float]] = None
    last_high: Optional[Tuple[int, float]] = None
    prev_low: Optional[Tuple[int, float]] = None
    prev_high: Optional[Tuple[int, float]] = None

    # Pointer for HTF bars (strictly closed_ts <= current bar close_ts)
    d1_ptr = 0
    h4_ptr = 0
    h1_ptr = 0

    equity = initial_equity
    peak_equity = initial_equity
    max_dd = 0.0

    trades: List[Dict[str, Any]] = []
    pending_order: Optional[Dict[str, Any]] = None
    active_trade: Optional[Dict[str, Any]] = None

    # Track SL-hit-then-reached-TP statistic
    sl_hit_trades: List[Dict[str, Any]] = []
    sl_later_tp_count = 0

    # Active FVG index pointers per TF
    fvg_ptrs = {tf: 0 for tf in fvg_map}
    active_fvgs: Dict[str, List[FVG]] = {tf: [] for tf in fvg_map}
    max_fvg_age_sec = {"M15": 15 * 60 * 48, "H1": 3600 * 60, "H4": 14400 * 50, "D1": 86400 * 30}

    for i in range(max(50, 2 * cfg.fractal_lookback), end_idx):
        b = bars[i]

        # Advance confirmed swings up to i
        while swing_ptr < len(swings) and swings[swing_ptr][0] <= i:
            _, stype, sprice = swings[swing_ptr]
            if stype == "L":
                prev_low = last_low
                last_low = (swings[swing_ptr][0], sprice)
            else:
                prev_high = last_high
                last_high = (swings[swing_ptr][0], sprice)
            swing_ptr += 1

        # Advance HTF closed bars
        while d1_ptr + 1 < len(htf_d1) and htf_d1[d1_ptr + 1].close_ts <= b.close_ts:
            d1_ptr += 1
        while h4_ptr + 1 < len(htf_h4) and htf_h4[h4_ptr + 1].close_ts <= b.close_ts:
            h4_ptr += 1
        while h1_ptr + 1 < len(htf_h1) and htf_h1[h1_ptr + 1].close_ts <= b.close_ts:
            h1_ptr += 1

        # Update active FVGs causally (mark filled if price closes/trades completely through)
        for tf, flist in fvg_map.items():
            p = fvg_ptrs[tf]
            while p < len(flist) and flist[p].confirmed_ts <= b.close_ts:
                active_fvgs[tf].append(flist[p])
                p += 1
            fvg_ptrs[tf] = p
            cutoff_ts = b.close_ts - max_fvg_age_sec.get(tf, 86400 * 30)
            kept = []
            for f in active_fvgs[tf]:
                if f.confirmed_ts < cutoff_ts:
                    continue
                if f.direction == "bull" and b.l <= f.low:
                    continue  # completely filled
                if f.direction == "bear" and b.h >= f.high:
                    continue  # completely filled
                kept.append(f)
            active_fvgs[tf] = kept

        # Check SL-hit counterfactuals
        still_watching = []
        for st in sl_hit_trades:
            st["bars_left"] -= 1
            if st["side"] == "long" and b.h >= st["tp1"]:
                sl_later_tp_count += 1
                continue
            if st["side"] == "short" and b.l <= st["tp1"]:
                sl_later_tp_count += 1
                continue
            if st["bars_left"] > 0:
                still_watching.append(st)
        sl_hit_trades = still_watching

        # 1. Manage active trade on current bar
        if active_trade is not None:
            tr = active_trade
            tr["bars_held"] += 1
            if b.hour == 22 and tr["last_swap_day"] != b.ts // 86400:
                tr["last_swap_day"] = b.ts // 86400
                tr["swap_cost"] += 0.08 * (tr["total_lots"] / 0.01) * tr["rem_weight"]

            side = tr["side"]
            # Conservative: check SL first on remaining legs
            sl_hit = (side == "long" and b.l <= tr["sl"]) or (side == "short" and b.h >= tr["sl"])
            if sl_hit:
                exit_px = tr["sl"]
                r_unit = (exit_px - tr["entry"]) / tr["risk_dist"] if side == "long" else (tr["entry"] - exit_px) / tr["risk_dist"]
                tr["realized_r"] += r_unit * tr["rem_weight"]
                tr["rem_weight"] = 0.0
                if not tr["tp1_hit"] and tr["sl_dist_orig"] > 0:
                    sl_hit_trades.append({"side": side, "tp1": tr["tp1"], "bars_left": 24})
            else:
                # Check TP1, TP2, TP3 in order
                if not tr["tp1_hit"] and tr["w1"] > 0:
                    hit = (side == "long" and b.h >= tr["tp1"]) or (side == "short" and b.l <= tr["tp1"])
                    if hit:
                        r1 = abs(tr["tp1"] - tr["entry"]) / tr["risk_dist"]
                        tr["realized_r"] += r1 * tr["w1"]
                        tr["rem_weight"] -= tr["w1"]
                        tr["tp1_hit"] = True
                        if cfg.move_be_after_tp1:
                            tr["sl"] = tr["entry"] + (0.30 if side == "long" else -0.30)

                if not tr["tp2_hit"] and tr["w2"] > 0:
                    hit = (side == "long" and b.h >= tr["tp2"]) or (side == "short" and b.l <= tr["tp2"])
                    if hit:
                        r2 = abs(tr["tp2"] - tr["entry"]) / tr["risk_dist"]
                        tr["realized_r"] += r2 * tr["w2"]
                        tr["rem_weight"] -= tr["w2"]
                        tr["tp2_hit"] = True

                if not tr["tp3_hit"] and tr["w3"] > 0:
                    hit = (side == "long" and b.h >= tr["tp3"]) or (side == "short" and b.l <= tr["tp3"])
                    if hit:
                        r3 = abs(tr["tp3"] - tr["entry"]) / tr["risk_dist"]
                        tr["realized_r"] += r3 * tr["w3"]
                        tr["rem_weight"] -= tr["w3"]
                        tr["tp3_hit"] = True

                # Trailing leg (w4): trail SL by 1.5 * ATR once TP2 hit
                if tr["rem_weight"] > 1e-6 and tr["tp2_hit"]:
                    if side == "long":
                        new_sl = b.c - 1.5 * (b.atr or 2.0)
                        if new_sl > tr["sl"]:
                            tr["sl"] = new_sl
                    else:
                        new_sl = b.c + 1.5 * (b.atr or 2.0)
                        if new_sl < tr["sl"]:
                            tr["sl"] = new_sl

            # Close trade if rem_weight == 0 or max hold 120 bars
            if tr["rem_weight"] <= 1e-6 or tr["bars_held"] >= 120:
                if tr["rem_weight"] > 1e-6:
                    r_rem = ((b.c - tr["entry"]) if side == "long" else (tr["entry"] - b.c)) / tr["risk_dist"]
                    tr["realized_r"] += r_rem * tr["rem_weight"]
                    tr["rem_weight"] = 0.0

                gross_pnl = tr["realized_r"] * tr["risk_usd"]
                net_pnl = gross_pnl - tr["cost_usd"] - tr["swap_cost"]
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
                    "fvg_aligned": tr["fvg_aligned"],
                    "regime": tr["regime"],
                })
                active_trade = None
            continue

        # 2. Check pending OTE limit order fill
        if pending_order is not None:
            po = pending_order
            po["ttl"] -= 1
            filled = (po["side"] == "long" and b.l <= po["entry"] <= b.h) or (
                po["side"] == "short" and b.l <= po["entry"] <= b.h
            )
            # Invalidation if swing broken before fill
            invalid = (po["side"] == "long" and b.l <= po["sl"]) or (
                po["side"] == "short" and b.h >= po["sl"]
            )
            if invalid or po["ttl"] <= 0:
                pending_order = None
            elif filled and i >= start_idx:
                news = is_news_window(b.ts)
                if cfg.addon == "news_15m" and news:
                    pending_order = None
                    continue
                sess, sp, slp = get_session_costs(b.hour, news)
                risk_dist = abs(po["entry"] - po["sl"])
                if risk_dist < 0.5:
                    pending_order = None
                    continue
                risk_usd = min(equity * cfg.risk_pct, equity * 0.018)  # cap <2% worst trade
                total_lots = risk_usd / (risk_dist * 100.0)
                cost_usd = (sp + slp) * total_lots * 100.0 * 0.5  # realistic half-spread + slippage impact
                # Determine regime
                ema_diff = (b.ema20 - b.ema50) / max(b.atr, 0.5)
                if ema_diff > 0.6:
                    regime = "Uptrend"
                elif ema_diff < -0.6:
                    regime = "Downtrend"
                else:
                    regime = "Sideways"

                active_trade = {
                    "side": po["side"],
                    "entry": po["entry"],
                    "sl": po["sl"],
                    "sl_dist_orig": risk_dist,
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
                    "fvg_aligned": po["fvg_aligned"],
                    "regime": regime,
                }
                pending_order = None
                continue

        # 3. Generate new OTE setup only within [start_idx, end_idx)
        if i < start_idx or pending_order is not None or last_low is None or last_high is None:
            continue

        # Addon: Killzone filter (London 07-11 or NY 13-17 UTC)
        if cfg.addon == "killzone" and not ((7 <= b.hour <= 11) or (13 <= b.hour <= 17)):
            continue

        atr = max(b.atr, 0.5)
        # Determine direction from confirmed swing sequence + HTF bias
        side = None
        if last_high[0] > last_low[0] and b.c > last_low[1]:
            # Bullish impulse (low -> high), looking for pullback into OTE
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

        # Addon: min_swing
        if cfg.addon == "min_swing" and rng < 2.8 * atr:
            continue

        # Addon: htf_bias (H4 + D1 EMA alignment)
        if cfg.addon == "htf_bias":
            d1_b = htf_d1[d1_ptr]
            h4_b = htf_h4[h4_ptr]
            if side == "long" and not (h4_b.ema20 > h4_b.ema50 and d1_b.c >= d1_b.ema20):
                continue
            if side == "short" and not (h4_b.ema20 < h4_b.ema50 and d1_b.c <= d1_b.ema20):
                continue

        # Addon: liq_sweep (recent bar swept previous swing before impulse)
        if cfg.addon == "liq_sweep":
            if side == "long" and (prev_low is None or last_low[1] >= prev_low[1]):
                continue
            if side == "short" and (prev_high is None or last_high[1] <= prev_high[1]):
                continue

        # Addon: prem_disc (strictly in discount <50% for long, premium >50% for short)
        if cfg.addon == "prem_disc":
            mid = 0.5 * (swing_low + swing_high)
            if side == "long" and b.c > mid:
                continue
            if side == "short" and b.c < mid:
                continue

        # Compute OTE entry price
        fib_lvl = 0.705 if cfg.entry_mode in ("0.705", "split_62_79") else float(cfg.entry_mode)
        if side == "long":
            entry_px = swing_high - fib_lvl * rng
            base_sl = swing_low
        else:
            entry_px = swing_low + fib_lvl * rng
            base_sl = swing_high

        # FVG Module Check
        fvg_aligned = False
        target_fvg_tp: Optional[float] = None
        if cfg.fvg_mode != "none":
            if cfg.fvg_mode.startswith("confluence_"):
                tf_req = cfg.fvg_mode.split("_")[1].upper()
                f_dir = "bull" if side == "long" else "bear"
                matched = [
                    f for f in active_fvgs.get(tf_req, [])
                    if f.direction == f_dir and f.low <= entry_px <= f.high
                ]
                if not matched:
                    continue
                fvg_aligned = True
            elif cfg.fvg_mode == "mtf_2":
                f_dir = "bull" if side == "long" else "bear"
                tf_hits = 0
                for tf_req in ("H1", "H4", "D1"):
                    if any(f.direction == f_dir and f.low <= entry_px <= f.high for f in active_fvgs.get(tf_req, [])):
                        tf_hits += 1
                if tf_hits < 2:
                    continue
                fvg_aligned = True
            elif cfg.fvg_mode == "bias":
                f_dir = "bull" if side == "long" else "bear"
                if not active_fvgs.get("H4", []) or active_fvgs["H4"][-1].direction != f_dir:
                    continue
                fvg_aligned = True
            elif cfg.fvg_mode == "tp_target":
                opp_dir = "bear" if side == "long" else "bull"
                cands = [f for f in active_fvgs.get("H1", []) if f.direction == opp_dir]
                if cands:
                    target_fvg_tp = cands[-1].ce
                    fvg_aligned = True

        # SL v2 Calculation
        if cfg.sl_mode == "atr":
            buf = cfg.sl_k * atr
        elif cfg.sl_mode == "fixed_pts":
            buf = cfg.sl_k  # fixed $ buffer
        elif cfg.sl_mode == "liquidity":
            # Push SL beyond nearest liquidity/FVG edge or 0.6*ATR
            buf = max(0.6 * atr, 2.5)
        else:
            buf = 0.5 * atr

        sl_px = (base_sl - buf) if side == "long" else (base_sl + buf)

        # TP1 (ATR), TP2 (-0.27), TP3 (-0.618)
        if side == "long":
            tp1 = entry_px + cfg.tp1_atr * atr
            tp2 = swing_high + 0.27 * rng
            tp3 = target_fvg_tp if (target_fvg_tp and target_fvg_tp > tp2) else (swing_high + 0.618 * rng)
        else:
            tp1 = entry_px - cfg.tp1_atr * atr
            tp2 = swing_low - 0.27 * rng
            tp3 = target_fvg_tp if (target_fvg_tp and target_fvg_tp < tp2) else (swing_low - 0.618 * rng)

        pending_order = {
            "side": side,
            "entry": entry_px,
            "sl": sl_px,
            "tp1": tp1,
            "tp2": tp2,
            "tp3": tp3,
            "ttl": 16,
            "fvg_aligned": fvg_aligned,
        }

    return compute_metrics(cfg, trades, equity, initial_equity, max_dd, sl_later_tp_count, len(sl_hit_trades))


def compute_metrics(
    cfg: StrategyConfig,
    trades: List[Dict[str, Any]],
    final_equity: float,
    initial_equity: float,
    max_dd: float,
    sl_later_tp_count: int,
    sl_open_count: int,
) -> Dict[str, Any]:
    n = len(trades)
    if n == 0:
        return {
            "name": cfg.name,
            "tf": cfg.tf,
            "trades": 0,
            "win_rate": 0.0,
            "max_dd": 1.0,
            "sharpe": 0.0,
            "pf": 0.0,
            "avg_r": 0.0,
            "worst_trade_pct": 0.0,
            "max_consec_losses": 0,
            "consistency": 0.0,
            "score": -10.0,
            "net_ret_pct": 0.0,
            "tp_rates": {"tp1": 0.0, "tp2": 0.0, "tp3": 0.0},
            "sl_later_tp_pct": 0.0,
            "passed_filters": False,
            "raw_trades": [],
        }

    wins = [t for t in trades if t["net_pnl"] > 0]
    losses = [t for t in trades if t["net_pnl"] <= 0]
    win_rate = len(wins) / n
    gross_win = sum(t["net_pnl"] for t in wins)
    gross_loss = abs(sum(t["net_pnl"] for t in losses)) or 1e-6
    pf = min(gross_win / gross_loss, 9.99)

    avg_win = (gross_win / len(wins)) if wins else 0.0
    avg_loss = (gross_loss / len(losses)) if losses else 0.0
    avg_r = sum(t["net_r"] for t in trades) / n
    worst_trade_pct = abs(min(t["pct_ret"] for t in trades)) * 100.0

    # Max consecutive losses
    max_cl = 0
    cur_cl = 0
    for t in trades:
        if t["net_pnl"] <= 0:
            cur_cl += 1
            if cur_cl > max_cl:
                max_cl = cur_cl
        else:
            cur_cl = 0

    # Sharpe (annualized trade-return approximation)
    rets = [t["pct_ret"] for t in trades]
    mean_r = sum(rets) / n
    std_r = statistics.pstdev(rets) if n > 1 else 1e-6
    # Estimate trades per year from span
    span_years = max((trades[-1]["exit_ts"] - trades[0]["entry_ts"]) / (365.25 * 86400), 0.5)
    tpy = n / span_years
    sharpe = (mean_r / max(std_r, 1e-6)) * math.sqrt(tpy)

    # Yearly consistency
    by_year: Dict[int, float] = {}
    for t in trades:
        by_year[t["year"]] = by_year.get(t["year"], 0.0) + t["net_pnl"]
    pos_years = sum(1 for v in by_year.values() if v > 0)
    consistency = pos_years / max(len(by_year), 1)

    # Score = Sharpe*0.3 + PF*0.2 + WinRate*0.15 - MaxDD*0.25 + Consistency*0.1
    score = sharpe * 0.3 + pf * 0.2 + win_rate * 0.15 - max_dd * 0.25 + consistency * 0.1

    passed_filters = (
        n >= 200
        and worst_trade_pct <= 2.05
        and (avg_win == 0 or avg_loss <= 3.0 * avg_win)
    )

    sl_total = max(len(losses), 1)
    sl_later_tp_pct = (sl_later_tp_count / sl_total) * 100.0

    return {
        "name": cfg.name,
        "tf": cfg.tf,
        "trades": n,
        "win_rate": round(win_rate * 100.0, 2),
        "max_dd": round(max_dd * 100.0, 2),
        "sharpe": round(sharpe, 3),
        "pf": round(pf, 3),
        "avg_r": round(avg_r, 3),
        "avg_win_usd": round(avg_win, 2),
        "avg_loss_usd": round(avg_loss, 2),
        "worst_trade_pct": round(worst_trade_pct, 2),
        "max_consec_losses": max_cl,
        "consistency": round(consistency * 100.0, 1),
        "score": round(score, 4),
        "net_ret_pct": round(((final_equity - initial_equity) / initial_equity) * 100.0, 2),
        "tp_rates": {
            "tp1": round(sum(1 for t in trades if t["tp1_hit"]) / n * 100.0, 1),
            "tp2": round(sum(1 for t in trades if t["tp2_hit"]) / n * 100.0, 1),
            "tp3": round(sum(1 for t in trades if t["tp3_hit"]) / n * 100.0, 1),
        },
        "sl_later_tp_pct": round(sl_later_tp_pct, 1),
        "passed_filters": passed_filters,
        "raw_trades": trades,
    }


def monte_carlo_dd(trades: List[Dict[str, Any]], runs: int = 1000) -> Dict[str, float]:
    if not trades:
        return {"p50_dd": 0.0, "p95_dd": 0.0, "p99_dd": 0.0}
    rets = [t["pct_ret"] for t in trades]
    rng = random.Random(42)
    dds = []
    for _ in range(runs):
        sample = rng.choices(rets, k=len(rets))
        eq = 1.0
        pk = 1.0
        mdd = 0.0
        for r in sample:
            eq *= (1.0 + r)
            if eq > pk:
                pk = eq
            dd = (pk - eq) / pk
            if dd > mdd:
                mdd = dd
        dds.append(mdd * 100.0)
    dds.sort()
    return {
        "p50_dd": round(dds[int(0.50 * runs)], 2),
        "p95_dd": round(dds[int(0.95 * runs)], 2),
        "p99_dd": round(dds[int(0.99 * runs)], 2),
    }


def main() -> None:
    t0 = time.time()
    print("Loading real XAUUSD 2010-2026 historical bars...")
    d1 = load_tsv_bars("XAUUSD1440.csv", 1440)
    h4 = load_tsv_bars("XAUUSD240.csv", 240)
    h1 = load_tsv_bars("XAUUSD60.csv", 60)
    m15 = load_tsv_bars("XAUUSD15.csv", 15)
    print(f"Loaded D1={len(d1):,}, H4={len(h4):,}, H1={len(h1):,}, M15={len(m15):,}")

    # Precompute causal FVGs per TF (strictly fixed thresholds per spec)
    fvg_map = {
        "D1": detect_fvgs(d1, "D1", min_gap_atr=0.25),
        "H4": detect_fvgs(h4, "H4", min_gap_atr=0.30),
        "H1": detect_fvgs(h1, "H1", min_gap_atr=0.35),
        "M15": detect_fvgs(m15, "M15", min_gap_atr=0.45),
    }

    tf_bars = {"H4": h4, "H1": h1, "M15": m15}

    def split_indices(bars: List[Bar]) -> Tuple[int, int, int, int]:
        n = len(bars)
        tr_end = int(n * 0.60)
        val_end = int(n * 0.80)
        return 60, tr_end, val_end, n

    def eval_cfg(cfg: StrategyConfig, phase: str) -> Dict[str, Any]:
        bars = tf_bars[cfg.tf]
        s0, tr_end, val_end, n = split_indices(bars)
        if phase == "train":
            return run_backtest(cfg, bars, s0, tr_end, d1, h4, h1, fvg_map)
        elif phase == "val":
            return run_backtest(cfg, bars, tr_end, val_end, d1, h4, h1, fvg_map)
        elif phase == "test":
            return run_backtest(cfg, bars, val_end, n, d1, h4, h1, fvg_map)
        else:
            return run_backtest(cfg, bars, s0, val_end, d1, h4, h1, fvg_map)

    report: Dict[str, Any] = {"stages": {}}

    # ==================== STAGE 1: Core OTE + TP Extension (No OI/FVG) ====================
    stage1_candidates = [
        StrategyConfig("S1-H1-705-L5-BE", "H1", "0.705", 5, 1.0, (0.30, 0.35, 0.25, 0.10), True),
        StrategyConfig("S1-H1-620-L5-BE", "H1", "0.62", 5, 1.0, (0.30, 0.35, 0.25, 0.10), True),
        StrategyConfig("S1-H1-790-L5-BE", "H1", "0.79", 5, 1.2, (0.30, 0.35, 0.25, 0.10), True),
        StrategyConfig("S1-H1-705-L8-NoBE", "H1", "0.705", 8, 1.5, (0.25, 0.35, 0.25, 0.15), False),
        StrategyConfig("S1-H4-705-L5-BE", "H4", "0.705", 5, 1.0, (0.30, 0.35, 0.25, 0.10), True),
        StrategyConfig("S1-H4-620-L3-BE", "H4", "0.62", 3, 1.2, (0.35, 0.35, 0.20, 0.10), True),
        StrategyConfig("S1-M15-705-L5-BE", "M15", "0.705", 5, 1.0, (0.30, 0.35, 0.25, 0.10), True),
        StrategyConfig("S1-M15-705-L8-BE", "M15", "0.705", 8, 1.2, (0.35, 0.35, 0.20, 0.10), True),
    ]

    s1_results = []
    for cfg in stage1_candidates:
        tr = eval_cfg(cfg, "train")
        va = eval_cfg(cfg, "val")
        # Check Val vs Train degradation <= 30%
        degrad = (tr["score"] - va["score"]) / max(abs(tr["score"]), 0.1) if tr["score"] > 0 else 0.0
        va["train_score"] = tr["score"]
        va["val_degrad_pct"] = round(degrad * 100.0, 1)
        va["cfg"] = asdict(cfg)
        s1_results.append((va, cfg))

    s1_results.sort(key=lambda x: (x[0]["passed_filters"], x[0]["score"]), reverse=True)
    best_s1_res, best_s1_cfg = s1_results[0]
    report["stages"]["stage1"] = [
        {k: v for k, v in r.items() if k != "raw_trades"} for r, _ in s1_results
    ]
    print(f"[Stage 1] Best Baseline: {best_s1_cfg.name} | Val Score={best_s1_res['score']} | WR={best_s1_res['win_rate']}% | PF={best_s1_res['pf']} | Trades={best_s1_res['trades']}")

    # ==================== STAGE 2: SL v2 Variants ====================
    s2_variants = [
        StrategyConfig(**{**asdict(best_s1_cfg), "name": "S2-ATR-0.3", "sl_mode": "atr", "sl_k": 0.3}),
        StrategyConfig(**{**asdict(best_s1_cfg), "name": "S2-ATR-0.5 (Base)", "sl_mode": "atr", "sl_k": 0.5}),
        StrategyConfig(**{**asdict(best_s1_cfg), "name": "S2-ATR-0.8", "sl_mode": "atr", "sl_k": 0.8}),
        StrategyConfig(**{**asdict(best_s1_cfg), "name": "S2-Liquidity-Edge", "sl_mode": "liquidity", "sl_k": 0.6}),
        StrategyConfig(**{**asdict(best_s1_cfg), "name": "S2-Fixed-5USD", "sl_mode": "fixed_pts", "sl_k": 5.0}),
    ]
    s2_results = []
    for cfg in s2_variants:
        va = eval_cfg(cfg, "val")
        va["cfg"] = asdict(cfg)
        s2_results.append((va, cfg))
    s2_results.sort(key=lambda x: (x[0]["passed_filters"], x[0]["score"]), reverse=True)
    best_s2_res, best_s2_cfg = s2_results[0]
    report["stages"]["stage2"] = [{k: v for k, v in r.items() if k != "raw_trades"} for r, _ in s2_results]
    print(f"[Stage 2] Best SL: {best_s2_cfg.name} | Val Score={best_s2_res['score']} | SL->TP%={best_s2_res['sl_later_tp_pct']}%")

    # ==================== STAGE 3: OI Profile Audit ====================
    report["stages"]["stage3_oi_audit"] = {
        "status": "NO_HISTORICAL_COMEX_OI_IN_2010_2026_DATASET",
        "conclusion": "Spot XAUUSD CSVs (2010-2026) do not contain historical COMEX GC / Options Open Interest timestamps. Per anti-fabrication & zero-look-ahead rules, OI filter is reported as N/A (not beneficial / unavailable) rather than simulated synthetically.",
    }

    # ==================== STAGE 4: FVG Module A/B per TF ====================
    s4_variants = [
        StrategyConfig(**{**asdict(best_s2_cfg), "name": "S4-0-Baseline (No FVG)", "fvg_mode": "none"}),
        StrategyConfig(**{**asdict(best_s2_cfg), "name": "S4-A-FVG-H1", "fvg_mode": "confluence_h1"}),
        StrategyConfig(**{**asdict(best_s2_cfg), "name": "S4-A-FVG-H4", "fvg_mode": "confluence_h4"}),
        StrategyConfig(**{**asdict(best_s2_cfg), "name": "S4-A-FVG-D1", "fvg_mode": "confluence_d1"}),
        StrategyConfig(**{**asdict(best_s2_cfg), "name": "S4-B-FVG-Bias-H4", "fvg_mode": "bias"}),
        StrategyConfig(**{**asdict(best_s2_cfg), "name": "S4-C-FVG-TP-Target", "fvg_mode": "tp_target"}),
        StrategyConfig(**{**asdict(best_s2_cfg), "name": "S4-D-FVG-MTF-2+", "fvg_mode": "mtf_2"}),
    ]
    s4_results = []
    for cfg in s4_variants:
        va = eval_cfg(cfg, "val")
        va["cfg"] = asdict(cfg)
        s4_results.append((va, cfg))
    s4_results.sort(key=lambda x: (x[0]["passed_filters"], x[0]["score"]), reverse=True)
    best_s4_res, best_s4_cfg = s4_results[0]
    if best_s4_res["score"] <= best_s2_res["score"]:
        best_s4_cfg = best_s2_cfg
        best_s4_res = best_s2_res
    report["stages"]["stage4"] = [{k: v for k, v in r.items() if k != "raw_trades"} for r, _ in s4_results]
    print(f"[Stage 4] Best FVG: {best_s4_cfg.name} | Val Score={best_s4_res['score']} | Trades={best_s4_res['trades']}")

    # ==================== STAGE 5: Add-ons A/B One-by-One ====================
    addons = ["none", "htf_bias", "killzone", "liq_sweep", "prem_disc", "min_swing", "news_15m"]
    s5_results = []
    for ad in addons:
        cfg = StrategyConfig(**{**asdict(best_s4_cfg), "name": f"S5-Addon-{ad}", "addon": ad})
        va = eval_cfg(cfg, "val")
        va["cfg"] = asdict(cfg)
        s5_results.append((va, cfg))
    s5_results.sort(key=lambda x: (x[0]["passed_filters"], x[0]["score"]), reverse=True)
    best_s5_res, best_s5_cfg = s5_results[0]
    if best_s5_res["score"] <= best_s4_res["score"]:
        best_s5_cfg = best_s4_cfg
        best_s5_res = best_s4_res
    report["stages"]["stage5"] = [{k: v for k, v in r.items() if k != "raw_trades"} for r, _ in s5_results]
    print(f"[Stage 5] Winner: {best_s5_cfg.name} | Val Score={best_s5_res['score']} | PF={best_s5_res['pf']} | WR={best_s5_res['win_rate']}%")

    # ==================== STAGE 6: Walk-Forward + Sensitivity + Monte Carlo + ONE-SHOT TEST ====================
    bars = tf_bars[best_s5_cfg.tf]
    s0, tr_end, val_end, n = split_indices(bars)

    # 5 Walk-forward windows across Train+Val
    wf_windows = []
    span = val_end - s0
    w_len = span // 5
    for w in range(5):
        ws = s0 + w * w_len
        we = ws + w_len if w < 4 else val_end
        wr = run_backtest(best_s5_cfg, bars, ws, we, d1, h4, h1, fvg_map)
        wf_windows.append({
            "window": w + 1,
            "start": bars[ws].dt_str[:10],
            "end": bars[we - 1].dt_str[:10],
            "trades": wr["trades"],
            "win_rate": wr["win_rate"],
            "pf": wr["pf"],
            "sharpe": wr["sharpe"],
            "net_ret_pct": wr["net_ret_pct"],
            "max_dd": wr["max_dd"],
        })

    # Sensitivity +/-20% on sl_k and tp1_atr
    sens = []
    for label, mult in [("-20%", 0.8), ("Base", 1.0), ("+20%", 1.2)]:
        scfg = StrategyConfig(**{
            **asdict(best_s5_cfg),
            "name": f"Sens-{label}",
            "sl_k": round(best_s5_cfg.sl_k * mult, 3),
            "tp1_atr": round(best_s5_cfg.tp1_atr * mult, 3),
        })
        sr = eval_cfg(scfg, "val")
        sens.append({"label": label, "score": sr["score"], "pf": sr["pf"], "win_rate": sr["win_rate"], "max_dd": sr["max_dd"]})

    # ONE-SHOT TEST SET EVALUATION (20%)
    test_res = eval_cfg(best_s5_cfg, "test")
    test_trades = test_res.pop("raw_trades")
    mc = monte_carlo_dd(test_trades, runs=1000)

    # Breakdowns on Test set
    def group_stats(key: str) -> Dict[str, Any]:
        groups: Dict[Any, List[Dict[str, Any]]] = {}
        for t in test_trades:
            groups.setdefault(t[key], []).append(t)
        out = {}
        for k, lst in sorted(groups.items()):
            w = sum(1 for x in lst if x["net_pnl"] > 0)
            out[str(k)] = {
                "trades": len(lst),
                "win_rate": round(w / len(lst) * 100.0, 1),
                "avg_r": round(sum(x["net_r"] for x in lst) / len(lst), 3),
                "net_pnl": round(sum(x["net_pnl"] for x in lst), 2),
            }
        return out

    report["stages"]["stage6"] = {
        "winner_config": asdict(best_s5_cfg),
        "walk_forward_5_windows": wf_windows,
        "sensitivity_20pct": sens,
        "test_set_one_shot": test_res,
        "monte_carlo_1000": mc,
        "test_by_year": group_stats("year"),
        "test_by_side": group_stats("side"),
        "test_by_session": group_stats("session"),
        "test_by_regime": group_stats("regime"),
        "elapsed_sec": round(time.time() - t0, 2),
    }

    out_path = BASE_DIR / "data" / "quant_research_results.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n[Stage 6 ONE-SHOT TEST] {best_s5_cfg.name} | Trades={test_res['trades']} | WR={test_res['win_rate']}% | PF={test_res['pf']} | Sharpe={test_res['sharpe']} | MaxDD={test_res['max_dd']}% | MC p95 DD={mc['p95_dd']}% | Score={test_res['score']}")
    print(f"Saved full results to {out_path} in {report['stages']['stage6']['elapsed_sec']}s")


if __name__ == "__main__":
    main()
