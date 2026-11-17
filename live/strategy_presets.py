"""Preset-driven strategy engine (M5+ multi-timeframe, Killzones UTC-4, LIMIT/MARKET/ZONE, Open Interest)."""
from __future__ import annotations
import math
from typing import Any, Dict, List, Optional
from . import market


def _trend(bars: List[Dict[str, float]], fast: int = 9, slow: int = 21) -> str:
    if len(bars) < slow + 5:
        return "FLAT"
    cs = [b["c"] for b in bars]
    ef, es = market.ema(cs[-slow * 3:], fast), market.ema(cs[-slow * 3:], slow)
    at = market.atr(bars) or 1.0
    gap = (ef - es) / at
    if gap > 0.12 and cs[-1] >= es:
        return "BULL"
    if gap < -0.12 and cs[-1] <= es:
        return "BEAR"
    return "FLAT"


def _swing_ote(bars: List[Dict[str, float]], direction: str) -> Dict[str, float]:
    win = bars[-32:] if len(bars) >= 32 else bars
    hi = max(b["h"] for b in win)
    lo = min(b["l"] for b in win)
    rng = max(hi - lo, 0.5)
    eq = (hi + lo) / 2.0
    if direction == "BULL":
        ote_62 = hi - rng * 0.62
        ote_705 = hi - rng * 0.705
        ote_79 = hi - rng * 0.79
        sl = lo - max(1.5, rng * 0.08)
        tp = hi + rng * 0.27
    else:
        ote_62 = lo + rng * 0.62
        ote_705 = lo + rng * 0.705
        ote_79 = lo + rng * 0.79
        sl = hi + max(1.5, rng * 0.08)
        tp = lo - rng * 0.27
    return {"hi": hi, "lo": lo, "eq": eq, "ote_62": ote_62, "ote_705": ote_705, "ote_79": ote_79, "sl": sl, "tp": tp}


def _has_fvg(bars: List[Dict[str, float]], direction: str) -> Optional[tuple]:
    if len(bars) < 5:
        return None
    for i in range(len(bars) - 1, max(2, len(bars) - 8), -1):
        b0, _, b2 = bars[i - 2], bars[i - 1], bars[i]
        if direction == "BULL" and b2["l"] > b0["h"]:
            return (b0["h"], b2["l"])
        if direction == "BEAR" and b2["h"] < b0["l"]:
            return (b2["h"], b0["l"])
    return None


def _has_sweep(bars: List[Dict[str, float]], direction: str) -> bool:
    if len(bars) < 12:
        return False
    prev = bars[-12:-3]
    recent = bars[-3:]
    if direction == "BULL":
        prev_lo = min(b["l"] for b in prev)
        return any(b["l"] < prev_lo and b["c"] > prev_lo for b in recent)
    prev_hi = max(b["h"] for b in prev)
    return any(b["h"] > prev_hi and b["c"] < prev_hi for b in recent)


def _zscore(bars: List[Dict[str, float]], n: int = 24) -> float:
    cs = [b["c"] for b in bars[-n:]]
    if len(cs) < 10:
        return 0.0
    mu = sum(cs) / len(cs)
    sd = math.sqrt(sum((x - mu) ** 2 for x in cs) / len(cs))
    return (cs[-1] - mu) / sd if sd > 1e-6 else 0.0


def _vwap_sd(bars: List[Dict[str, float]]) -> tuple:
    win = bars[-32:] if len(bars) >= 32 else bars
    tv, vv = 0.0, 0.0
    tps = []
    for b in win:
        tp = (b["h"] + b["l"] + b["c"]) / 3.0
        v = b.get("v") or max(b["h"] - b["l"], 0.1)
        tv += tp * v
        vv += v
        tps.append(tp)
    vwap = tv / max(vv, 1.0)
    sd = math.sqrt(sum((x - vwap) ** 2 for x in tps) / max(len(tps), 1))
    return vwap, max(sd, 0.5)


def _clamp_sl_tp(side: str, entry: float, sl: float, tp: float, at: float) -> tuple:
    dist = abs(entry - sl)
    dist = max(4.0, min(35.0, dist if dist >= 3.0 else max(4.0, at * 1.4)))
    sl = entry - dist if side == "BUY" else entry + dist
    rew = abs(tp - entry)
    if rew < dist * 2.1:
        rew = dist * 2.2
    tp = entry + rew if side == "BUY" else entry - rew
    return round(sl, 2), round(tp, 2)


def decide_by_preset(
    preset_id: str,
    agent_id: str,
    px: float,
    m5: List[Dict[str, float]],
    m15: List[Dict[str, float]],
    h1: List[Dict[str, float]],
    h4: List[Dict[str, float]],
    vp: Dict[str, float],
    macro: Dict[str, Any],
    oi: Dict[str, Any],
    kz: Dict[str, Any],
    lessons: List[str],
) -> Dict[str, Any]:
    """Execute the AI's selected Strategy Preset using M5+ data, Killzones, and 3 entry modes."""
    bars = m5 if len(m5) >= 30 else m15
    at = market.atr(m15 or bars) or 5.0
    t_m5 = _trend(m5, 8, 21)
    t_m15 = _trend(m15, 9, 21)
    t_h1 = _trend(h1, 9, 21)
    t_h4 = _trend(h4, 9, 21)
    htf = t_h4 if t_h4 != "FLAT" else t_h1
    oi_note = f"OI P/C {oi['pc_oi_ratio']}" if oi.get("pc_oi_ratio") else "OI neutral"

    # 1. DAVINICK STRATEGY (Fib OTE + FVG + Sweep + Premium/Discount + OI)
    if preset_id == "davinick":
        if htf == "FLAT":
            return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"HTF H1/H4 flat ({kz['name']}); waiting clear bias."}
        side = "BUY" if htf == "BULL" else "SELL"
        dir_str = htf
        ote = _swing_ote(m15 or bars, dir_str)
        in_disc = px <= ote["eq"] if side == "BUY" else px >= ote["eq"]
        fvg = _has_fvg(m5 or m15, dir_str)
        sweep = _has_sweep(m5 or m15, dir_str)
        if not in_disc:
            sl, tp = _clamp_sl_tp(side, ote["ote_705"], ote["sl"], ote["tp"], at)
            return {
                "action": side, "entry_mode": "LIMIT", "limit_price": round(ote["ote_705"], 2),
                "sl": sl, "tp": tp, "confidence": 72,
                "thesis": f"DAVINICK {dir_str}: HTF+M5 aligned; placing LIMIT @ OTE .705 ({ote['ote_705']:.2f}), {oi_note}.",
            }
        in_ote = (ote["ote_79"] <= px <= ote["ote_62"]) if side == "BUY" else (ote["ote_62"] <= px <= ote["ote_79"])
        if in_ote and (fvg or sweep or t_m5 == dir_str):
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp"], at)
            return {
                "action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 82,
                "thesis": f"DAVINICK {dir_str}: Price in OTE zone + M5 {'sweep' if sweep else 'FVG'} confluence ({oi_note}).",
            }
        return {
            "action": "HOLD", "entry_mode": "ZONE",
            "thesis": f"ZONE: Watching {dir_str} OTE {ote['ote_79']:.1f}-{ote['ote_62']:.1f} on M5+ ({kz['name']}).",
        }

    # 2. CTA Time-Series Momentum
    if preset_id == "cta_momentum":
        if htf != "FLAT" and t_m5 == htf and t_m15 == htf:
            side = "BUY" if htf == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, px - at * 1.6 if side == "BUY" else px + at * 1.6, px + at * 3.8 if side == "BUY" else px - at * 3.8, at)
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"CTA Momentum: M5/M15/HTF aligned {htf}; trailing trend entry."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"CTA: M5 ({t_m5}) not aligned with HTF ({htf})."}

    # 3. Volatility Targeting / Risk Parity
    if preset_id == "risk_parity":
        if t_m15 == "FLAT" or t_m5 != t_m15:
            return {"action": "HOLD", "entry_mode": "ZONE", "thesis": "Risk Parity: Waiting M5+M15 volatility-normalized trend."}
        side = "BUY" if t_m15 == "BULL" else "SELL"
        k = 1.8 if at > 8 else 1.3
        sl, tp = _clamp_sl_tp(side, px, px - at * k if side == "BUY" else px + at * k, px + at * k * 2.3 if side == "BUY" else px - at * k * 2.3, at)
        return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 74,
                "thesis": f"Risk Parity: ATR={at:.2f}, vol-scaled {k}xATR stop on {t_m15} M5+."}

    # 4. Mean Reversion Z-Score (Stat Arb)
    if preset_id == "mean_reversion":
        z = _zscore(m15 or bars, 24)
        if abs(z) >= 1.85:
            side = "SELL" if z > 0 else "BUY"
            sl, tp = _clamp_sl_tp(side, px, px + at * 1.4 if side == "SELL" else px - at * 1.4, px - at * 3.0 if side == "SELL" else px + at * 3.0, at)
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 75,
                    "thesis": f"Stat-Arb Z-score {z:+.2f} SD extreme; fading back toward mean."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Stat-Arb ZONE: Z={z:+.2f}, waiting >= ±1.85 SD."}

    # 5. Cross-Asset / Macro Signal
    if preset_id == "macro_signal":
        dxy = macro.get("DXY")
        if htf != "FLAT" and t_m5 == htf:
            side = "BUY" if htf == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, px - at * 1.5 if side == "BUY" else px + at * 1.5, px + at * 3.4 if side == "BUY" else px - at * 3.4, at)
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 73,
                    "thesis": f"Macro {htf}: DXY {dxy or '-'}, {oi_note}, M5+ trigger confirmed."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Macro ZONE: DXY {dxy or '-'}, waiting M5+ alignment."}

    # 6. Regime Detection (HMM)
    if preset_id == "regime_hmm":
        if at > 16.0:
            return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Regime PANIC (ATR {at:.1f}); standing down."}
        z = _zscore(m15 or bars, 20)
        if htf != "FLAT" and t_m5 == htf:
            side = "BUY" if htf == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, px - at * 1.4 if side == "BUY" else px + at * 1.4, px + at * 3.1 if side == "BUY" else px - at * 3.1, at)
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 75,
                    "thesis": f"Regime TREND ({htf}): M5+ aligned, clean ATR {at:.1f}."}
        if htf == "FLAT" and abs(z) >= 1.9:
            side = "SELL" if z > 0 else "BUY"
            sl, tp = _clamp_sl_tp(side, px, px + at * 1.3 if side == "SELL" else px - at * 1.3, px - at * 2.8 if side == "SELL" else px + at * 2.8, at)
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 71,
                    "thesis": f"Regime RANGE: Fading Z={z:+.2f} extreme."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": "Regime transitional; holding cash."}

    # 7. Asian Range Breakout
    if preset_id == "asian_breakout":
        box = bars[-36:-12] if len(bars) >= 36 else bars[:-4]
        hi, lo = max(b["h"] for b in box), min(b["l"] for b in box)
        if px > hi and t_m5 == "BULL":
            sl, tp = _clamp_sl_tp("BUY", px, lo, px + (hi - lo) * 2.1, at)
            return {"action": "BUY", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 74,
                    "thesis": f"Asian Breakout: Break above box {hi:.1f} during {kz['name']}."}
        if px < lo and t_m5 == "BEAR":
            sl, tp = _clamp_sl_tp("SELL", px, hi, px - (hi - lo) * 2.1, at)
            return {"action": "SELL", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 74,
                    "thesis": f"Asian Breakout: Break below box {lo:.1f} during {kz['name']}."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Asian Box {lo:.1f}-{hi:.1f}; waiting breakout."}

    # 8. Volatility Squeeze -> Expansion
    if preset_id == "vol_squeeze":
        rng6 = max(b["h"] for b in bars[-6:]) - min(b["l"] for b in bars[-6:])
        if rng6 < at * 1.8 and htf != "FLAT":
            side = "BUY" if htf == "BULL" else "SELL"
            trig = max(b["h"] for b in bars[-6:]) + 0.5 if side == "BUY" else min(b["l"] for b in bars[-6:]) - 0.5
            sl, tp = _clamp_sl_tp(side, trig, trig - at * 1.4 if side == "BUY" else trig + at * 1.4, trig + at * 3.2 if side == "BUY" else trig - at * 3.2, at)
            return {"action": side, "entry_mode": "LIMIT", "limit_price": round(trig, 2), "sl": sl, "tp": tp, "confidence": 71,
                    "thesis": f"Vol Squeeze: Compression near {trig:.2f}, staging LIMIT in {htf} bias."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": "Vol Squeeze: Waiting narrow range compression."}

    # 9. VWAP & Anchored VWAP
    if preset_id == "vwap_anchored":
        vw, sd = _vwap_sd(m15 or bars)
        if t_m15 != "FLAT" and abs(px - vw) <= sd * 0.45 and t_m5 == t_m15:
            side = "BUY" if t_m15 == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, px - at * 1.4 if side == "BUY" else px + at * 1.4, px + at * 3.2 if side == "BUY" else px - at * 3.2, at)
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 75,
                    "thesis": f"VWAP Pullback: Price @ {vw:.1f} with M5+ {t_m15} confirmation."}
        if t_m15 != "FLAT":
            side = "BUY" if t_m15 == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, vw, vw - at * 1.4 if side == "BUY" else vw + at * 1.4, vw + at * 3.2 if side == "BUY" else vw - at * 3.2, at)
            return {"action": side, "entry_mode": "LIMIT", "limit_price": round(vw, 2), "sl": sl, "tp": tp, "confidence": 70,
                    "thesis": f"VWAP LIMIT: Staging {side} @ VWAP {vw:.2f}."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"VWAP {vw:.1f}: Flat M15 structure."}

    # 10. Volume Profile / Value Area
    if preset_id == "volume_profile" and vp.get("poc"):
        poc, vah, val = vp["poc"], vp["vah"], vp["val"]
        if px <= val + at * 0.3 and t_m5 == "BULL":
            sl, tp = _clamp_sl_tp("BUY", px, val - at * 1.3, vah, at)
            return {"action": "BUY", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"Volume Profile: VAL {val:.1f} bounce targeting VAH {vah:.1f}."}
        if px >= vah - at * 0.3 and t_m5 == "BEAR":
            sl, tp = _clamp_sl_tp("SELL", px, vah + at * 1.3, val, at)
            return {"action": "SELL", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"Volume Profile: VAH {vah:.1f} rejection targeting VAL {val:.1f}."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"VP ZONE: Waiting VAL {val:.1f} or VAH {vah:.1f} (POC {poc:.1f})."}

    # 11. Gold/Silver Ratio
    if preset_id == "gold_silver_ratio":
        gsr = macro.get("gold_silver_ratio")
        if gsr and t_m5 != "FLAT" and t_m5 == t_m15:
            side = "BUY" if t_m5 == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, px - at * 1.4 if side == "BUY" else px + at * 1.4, px + at * 3.1 if side == "BUY" else px - at * 3.1, at)
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 72,
                    "thesis": f"Gold/Silver Ratio {gsr}: M5+ {t_m5} relative-value entry."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Gold/Silver Ratio {gsr or '-'}: Waiting M5+ trigger."}

    # 12. Auto-Evolve (or fallback)
    z = _zscore(m15 or bars, 24)
    if htf != "FLAT" and t_m5 == htf:
        side = "BUY" if htf == "BULL" else "SELL"
        sl, tp = _clamp_sl_tp(side, px, px - at * 1.5 if side == "BUY" else px + at * 1.5, px + at * 3.3 if side == "BUY" else px - at * 3.3, at)
        return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 75,
                "thesis": f"Auto-Evolve: Selected Trend-OTE ({htf}) from M5+ alignment."}
    if abs(z) >= 2.0:
        side = "SELL" if z > 0 else "BUY"
        sl, tp = _clamp_sl_tp(side, px, px + at * 1.4 if side == "SELL" else px - at * 1.4, px - at * 3.0 if side == "SELL" else px + at * 3.0, at)
        return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 72,
                "thesis": f"Auto-Evolve: Range Z={z:+.2f} mean-reversion edge."}
    return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Auto-Evolve ZONE: Monitoring M5+ ({t_m5}/{htf})."}


def manage_open_by_preset(preset_id: str, t: Dict[str, Any], px: float, m5: List[Dict[str, float]], m15: List[Dict[str, float]]) -> Dict[str, str]:
    """Step 3: Decide whether to HOLD or manually CLOSE an existing open trade."""
    t_m5 = _trend(m5, 8, 21)
    t_m15 = _trend(m15, 9, 21)
    pnl = float(t.get("pnl") or 0.0)
    # Close manually only if both M5 and M15 flip strongly against the position AND trade is in profit > 0.5R
    r_usd = abs(t["entry"] - t.get("sl_initial", t["sl"])) * t["lots"] * 100
    if r_usd > 0 and pnl > r_usd * 0.6:
        if t["side"] == "BUY" and t_m5 == "BEAR" and t_m15 == "BEAR":
            return {"action": "CLOSE", "reason": f"M5+M15 structure flipped BEAR; locking +${pnl:.2f} ({preset_id})."}
        if t["side"] == "SELL" and t_m5 == "BULL" and t_m15 == "BULL":
            return {"action": "CLOSE", "reason": f"M5+M15 structure flipped BULL; locking +${pnl:.2f} ({preset_id})."}
    return {"action": "HOLD", "reason": f"Holding {t['side']} per {preset_id}."}
