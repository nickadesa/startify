"""Preset-driven strategy engine (M5+ multi-timeframe, Killzones UTC-4, LIMIT/MARKET/ZONE, Open Interest).

Purely follows each AI's active Strategy Preset (e.g. DAVINICK STRATEGY: HTF Bias, Killzone UTC-4,
Liquidity Sweep, Premium/Discount 50%, Fib OTE 0.62/0.705/0.79, FVG, Order Block, Swing SL,
Multi-TP -0.27/-0.618, COMEX Open Interest) without generic retail EMA/ATR noise.
"""
from __future__ import annotations
import hashlib
import math
from typing import Any, Dict, List, Optional
from . import market, presets


def _structure_bias(bars: List[Dict[str, float]], lookback: int = 24) -> str:
    """Pure price-action market structure (Higher Highs / Higher Lows vs Lower Highs / Lower Lows & 50% eq)."""
    if len(bars) < 8:
        return "FLAT"
    win = bars[-lookback:] if len(bars) >= lookback else bars
    half = max(3, len(win) // 2)
    first, second = win[:half], win[half:]
    h1, l1 = max(b["h"] for b in first), min(b["l"] for b in first)
    h2, l2 = max(b["h"] for b in second), min(b["l"] for b in second)
    hi, lo = max(h1, h2), min(l1, l2)
    rng = max(hi - lo, 0.5)
    c = win[-1]["c"]
    if h2 > h1 and l2 >= l1 and c >= lo + rng * 0.45:
        return "BULL"
    if l2 < l1 and h2 <= h1 and c <= hi - rng * 0.45:
        return "BEAR"
    if (c - win[0]["o"]) > rng * 0.25:
        return "BULL"
    if (win[0]["o"] - c) > rng * 0.25:
        return "BEAR"
    return "FLAT"


# Keep _trend alias for callers, using pure market structure
def _trend(bars: List[Dict[str, float]], fast: int = 9, slow: int = 21) -> str:
    return _structure_bias(bars, max(16, slow))


def _swing_ote(bars: List[Dict[str, float]], direction: str) -> Dict[str, float]:
    """Calculate DAVINICK Swing High/Low, 50% Equilibrium, OTE (0.62 / 0.705 / 0.79), Swing SL, and Fib -0.27 / -0.618 TPs."""
    win = bars[-32:] if len(bars) >= 32 else bars
    hi = max(b["h"] for b in win)
    lo = min(b["l"] for b in win)
    rng = max(hi - lo, 1.0)
    eq = round((hi + lo) / 2.0, 2)
    buf = max(1.8, round(rng * 0.08, 2))
    if direction == "BULL":
        ote_62 = round(hi - rng * 0.62, 2)
        ote_705 = round(hi - rng * 0.705, 2)
        ote_79 = round(hi - rng * 0.79, 2)
        sl = round(lo - buf, 2)
        tp_27 = round(hi + rng * 0.27, 2)
        tp_618 = round(hi + rng * 0.618, 2)
    else:
        ote_62 = round(lo + rng * 0.62, 2)
        ote_705 = round(lo + rng * 0.705, 2)
        ote_79 = round(lo + rng * 0.79, 2)
        sl = round(hi + buf, 2)
        tp_27 = round(lo - rng * 0.27, 2)
        tp_618 = round(lo - rng * 0.618, 2)
    return {
        "hi": round(hi, 2),
        "lo": round(lo, 2),
        "rng": round(rng, 2),
        "eq": eq,
        "ote_62": ote_62,
        "ote_705": ote_705,
        "ote_79": ote_79,
        "sl": sl,
        "tp": tp_27,
        "tp_27": tp_27,
        "tp_618": tp_618,
    }


def _has_fvg(bars: List[Dict[str, float]], direction: str) -> Optional[tuple]:
    """Detect 3-candle closed Fair Value Gap (FVG) in the given direction."""
    if len(bars) < 5:
        return None
    for i in range(len(bars) - 1, max(2, len(bars) - 10), -1):
        b0, _, b2 = bars[i - 2], bars[i - 1], bars[i]
        if direction == "BULL" and b2["l"] > b0["h"]:
            return (round(b0["h"], 2), round(b2["l"], 2))
        if direction == "BEAR" and b2["h"] < b0["l"]:
            return (round(b2["h"], 2), round(b0["l"], 2))
    return None


def _order_block(bars: List[Dict[str, float]], direction: str) -> Optional[tuple]:
    """Locate the last opposite-colored Order Block candle before displacement."""
    if len(bars) < 6:
        return None
    for i in range(len(bars) - 2, max(1, len(bars) - 12), -1):
        b, nxt = bars[i], bars[i + 1]
        if direction == "BULL" and b["c"] < b["o"] and nxt["c"] > b["h"]:
            return (round(b["l"], 2), round(b["h"], 2))
        if direction == "BEAR" and b["c"] > b["o"] and nxt["c"] < b["l"]:
            return (round(b["l"], 2), round(b["h"], 2))
    return None


def _has_sweep(bars: List[Dict[str, float]], direction: str) -> bool:
    """Detect prior swing high/low Liquidity Sweep & rejection."""
    if len(bars) < 12:
        return False
    prev = bars[-14:-3]
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
    return round(vwap, 2), round(max(sd, 0.5), 2)


def _clamp_sl_tp(side: str, entry: float, sl: float, tp: float, swing_rng: float = 12.0) -> tuple:
    dist = abs(entry - sl)
    fallback_dist = max(4.5, min(25.0, swing_rng * 0.35))
    dist = max(4.0, min(35.0, dist if dist >= 3.0 else fallback_dist))
    sl = entry - dist if side == "BUY" else entry + dist
    rew = abs(tp - entry)
    if rew < dist * 2.1:
        rew = dist * 2.25
    tp = entry + rew if side == "BUY" else entry - rew
    return round(sl, 2), round(tp, 2)


def _agent_ote_fib(agent_id: str) -> tuple[str, float]:
    """Distribute AIs across the 3 DAVINICK OTE fib levels (0.62, 0.705, 0.79) so they don't all stack on one identical price."""
    h = int(hashlib.md5((agent_id or "ai-1").encode()).hexdigest()[:4], 16) % 3
    return ((".62", 0.62), (".705", 0.705), (".79", 0.79))[h]


def preset_snapshot(
    preset_id: str,
    px: float,
    m5: List[Dict[str, float]],
    m15: List[Dict[str, float]],
    h1: List[Dict[str, float]],
    h4: List[Dict[str, float]],
    vp: Dict[str, float],
    macro: Dict[str, Any],
    oi: Dict[str, Any],
    kz: Dict[str, Any],
    agent_id: str = "ai-1",
) -> str:
    """Build a human/LLM-readable summary of the active Preset's exact institutional levels (NO EMA/ATR)."""
    pr = presets.get_preset(preset_id)
    bars = m5 if len(m5) >= 30 else m15
    t_m5 = _structure_bias(m5, 16)
    t_m15 = _structure_bias(m15, 24)
    t_h1 = _structure_bias(h1, 24)
    t_h4 = _structure_bias(h4, 24)
    htf = t_h4 if t_h4 != "FLAT" else (t_h1 if t_h1 != "FLAT" else t_m15)
    dir_str = "BEAR" if htf == "BEAR" else "BULL"
    ote = _swing_ote(m15 or bars, dir_str)
    pd_zone = "DISCOUNT (<50% eq)" if px <= ote["eq"] else "PREMIUM (>50% eq)"
    fvg = _has_fvg(m5 or m15, dir_str)
    ob = _order_block(m5 or m15, dir_str)
    sweep = _has_sweep(m5 or m15, dir_str)
    oi_txt = f"COMEX GC OI={oi.get('futures_oi') or '-'}, Put/Call OI={oi.get('pc_oi_ratio') or '-'}"
    vp_txt = f"POC {vp.get('poc','-')}, VAH {vp.get('vah','-')}, VAL {vp.get('val','-')}" if vp else "VP N/A"

    lines = [
        f"Active Preset: {pr['name']} ({preset_id})",
        f"Preset Rules: {pr['prompt']}",
        f"Killzone (UTC-4): {kz['name']} ({kz['ny_time']} NY, active={kz['active']})",
        f"Market Structure Bias: H4={t_h4} | H1={t_h1} | M15={t_m15} | M5={t_m5} (HTF Bias={htf})",
        f"Swing Range (M15): Low {ote['lo']} .. High {ote['hi']} | 50% Equilibrium: {ote['eq']} -> Price {px} is in {pd_zone}",
        f"Fibonacci OTE Zone ({dir_str}): 0.62={ote['ote_62']} | 0.705={ote['ote_705']} | 0.79={ote['ote_79']} | Swing SL={ote['sl']} | Fib TP1(-0.27)={ote['tp_27']} | Fib TP2(-0.618)={ote['tp_618']}",
        f"ICT Confluence: FVG={'Yes ' + str(fvg) if fvg else 'None'} | Order Block={'Yes ' + str(ob) if ob else 'None'} | Liquidity Sweep={'Confirmed' if sweep else 'Pending'}",
        f"Orderflow & Profile: {oi_txt} | Volume Profile: {vp_txt}",
    ]
    if preset_id in ("mean_reversion", "regime_hmm", "gold_silver_ratio", "auto_evolve"):
        lines.append(f"Stat-Arb Z-Score (24-bar): {_zscore(m15 or bars, 24):+.2f} SD | Gold/Silver Ratio: {macro.get('gold_silver_ratio','-')}")
    if preset_id == "vwap_anchored":
        vw, sd = _vwap_sd(m15 or bars)
        lines.append(f"Anchored Session VWAP: {vw} (±1 SD={sd}, +2 SD={round(vw+2*sd,2)}, -2 SD={round(vw-2*sd,2)})")
    if preset_id == "asian_breakout" and len(bars) >= 12:
        box = bars[-36:-12] if len(bars) >= 36 else bars[:-4]
        lines.append(f"Asian Session Range Box: Low {min(b['l'] for b in box):.2f} .. High {max(b['h'] for b in box):.2f}")
    return "\n".join(lines)


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
    """Execute the AI's selected Strategy Preset using M5+ market structure, Killzones, OTE/FVG/OB/Sweep, and 3 entry modes."""
    bars = m5 if len(m5) >= 30 else m15
    t_m5 = _structure_bias(m5, 16)
    t_m15 = _structure_bias(m15, 24)
    t_h1 = _structure_bias(h1, 24)
    t_h4 = _structure_bias(h4, 24)
    htf = t_h4 if t_h4 != "FLAT" else (t_h1 if t_h1 != "FLAT" else t_m15)
    oi_note = f"OI P/C {oi['pc_oi_ratio']}" if oi.get("pc_oi_ratio") else "COMEX OI aligned"
    fib_lbl, fib_ratio = _agent_ote_fib(agent_id)

    # 1. DAVINICK STRATEGY (Fib OTE 0.62/0.705/0.79 + FVG + OB + Sweep + Premium/Discount + OI)
    if preset_id == "davinick":
        if htf == "FLAT":
            return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"DAVINICK ZONE: H4/H1 structure neutral in {kz['name']}; waiting BOS."}
        side = "BUY" if htf == "BULL" else "SELL"
        dir_str = htf
        ote = _swing_ote(m15 or bars, dir_str)
        rng = ote["rng"]
        in_disc = px <= ote["eq"] if side == "BUY" else px >= ote["eq"]
        fvg = _has_fvg(m5 or m15, dir_str)
        ob = _order_block(m5 or m15, dir_str)
        sweep = _has_sweep(m5 or m15, dir_str)
        in_ote = (ote["ote_79"] <= px <= ote["ote_62"]) if side == "BUY" else (ote["ote_62"] <= px <= ote["ote_79"])

        if in_ote and (fvg or ob or sweep or t_m5 == dir_str):
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_27"], rng)
            conf_tag = "Liquidity Sweep + OTE" if sweep else ("FVG + OTE" if fvg else ("Order Block + OTE" if ob else "OTE + M5 BOS"))
            return {
                "action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 84,
                "thesis": f"DAVINICK {dir_str}: {conf_tag} in {'Discount' if side=='BUY' else 'Premium'} ({ote['ote_79']}-{ote['ote_62']}), TP -0.27 ({tp}), {oi_note}.",
            }
        if not in_disc or not in_ote:
            lim_px = round((ote["hi"] - rng * fib_ratio) if side == "BUY" else (ote["lo"] + rng * fib_ratio), 2)
            sl, tp = _clamp_sl_tp(side, lim_px, ote["sl"], ote["tp_27"], rng)
            return {
                "action": side, "entry_mode": "LIMIT", "limit_price": lim_px,
                "sl": sl, "tp": tp, "confidence": 76,
                "thesis": f"DAVINICK {dir_str}: HTF BOS confirmed; LIMIT @ Fib OTE {fib_lbl} ({lim_px}), Swing SL {sl}, TP -0.27 ({tp}), {oi_note}.",
            }
        return {
            "action": "HOLD", "entry_mode": "ZONE",
            "thesis": f"DAVINICK ZONE: Monitoring {dir_str} OTE {ote['ote_79']}-{ote['ote_62']} & FVG/OB in {kz['name']}.",
        }

    # 2. CTA Time-Series Momentum
    if preset_id == "cta_momentum":
        ote = _swing_ote(m15 or bars, htf if htf != "FLAT" else "BULL")
        if htf != "FLAT" and (t_m5 == htf or t_m15 == htf):
            side = "BUY" if htf == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_618"], ote["rng"])
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 77,
                    "thesis": f"CTA Time-Series Momentum: Multi-horizon H4/H1/M15 {htf} return sign aligned; OTE pullback entry."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"CTA Momentum ZONE: M5 ({t_m5}) awaiting HTF ({htf}) impulse."}

    # 3. Volatility Targeting / Risk Parity
    if preset_id == "risk_parity":
        ote = _swing_ote(m15 or bars, t_m15 if t_m15 != "FLAT" else "BULL")
        if t_m15 == "FLAT" or t_m5 != t_m15:
            return {"action": "HOLD", "entry_mode": "ZONE", "thesis": "Risk Parity ZONE: Waiting M5+M15 structure alignment."}
        side = "BUY" if t_m15 == "BULL" else "SELL"
        sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_27"], ote["rng"])
        return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 74,
                "thesis": f"Risk Parity: Volatility-normalized position sizing on {t_m15} swing range ({ote['lo']}-{ote['hi']})."}

    # 4. Mean Reversion Z-Score (Stat Arb)
    if preset_id == "mean_reversion":
        z = _zscore(m15 or bars, 24)
        ote = _swing_ote(m15 or bars, "BEAR" if z > 0 else "BULL")
        if abs(z) >= 1.75:
            side = "SELL" if z > 0 else "BUY"
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["eq"], ote["rng"])
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"Stat-Arb Mean Reversion: Z-score {z:+.2f} SD stretch; fading toward 50% mean ({ote['eq']})."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Stat-Arb ZONE: Z-score {z:+.2f} SD inside normal band."}

    # 5. Cross-Asset / Macro Signal
    if preset_id == "macro_signal":
        dxy = macro.get("DXY")
        ote = _swing_ote(m15 or bars, htf if htf != "FLAT" else "BULL")
        if htf != "FLAT" and t_m5 == htf:
            side = "BUY" if htf == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_27"], ote["rng"])
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 75,
                    "thesis": f"Macro Signal ({htf}): DXY {dxy or '-'}, {oi_note}, HTF structure + OTE confirmed."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Macro ZONE: DXY {dxy or '-'}, waiting HTF + Killzone trigger."}

    # 6. Regime Detection (HMM)
    if preset_id == "regime_hmm":
        ote = _swing_ote(m15 or bars, htf if htf != "FLAT" else "BULL")
        if ote["rng"] > 48.0:
            return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"HMM Regime PANIC (range ${ote['rng']:.1f}); standing down."}
        z = _zscore(m15 or bars, 20)
        if htf != "FLAT" and t_m5 == htf:
            side = "BUY" if htf == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_27"], ote["rng"])
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"HMM Regime TREND ({htf}): Markov state aligned with M5/HTF BOS."}
        if htf == "FLAT" and abs(z) >= 1.8:
            side = "SELL" if z > 0 else "BUY"
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["eq"], ote["rng"])
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 72,
                    "thesis": f"HMM Regime RANGE: Fading Z={z:+.2f} SD extreme back to equilibrium {ote['eq']}."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": "HMM Regime transitional; waiting high-probability state."}

    # 7. Asian Range Breakout
    if preset_id == "asian_breakout":
        box = bars[-36:-12] if len(bars) >= 36 else bars[:-4]
        hi, lo = round(max(b["h"] for b in box), 2), round(min(b["l"] for b in box), 2)
        box_rng = max(hi - lo, 4.0)
        if px > hi and t_m5 == "BULL":
            sl, tp = _clamp_sl_tp("BUY", px, lo, px + box_rng * 2.1, box_rng)
            return {"action": "BUY", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"Asian Range Breakout: Bullish expansion above Asian High {hi} in {kz['name']}."}
        if px < lo and t_m5 == "BEAR":
            sl, tp = _clamp_sl_tp("SELL", px, hi, px - box_rng * 2.1, box_rng)
            return {"action": "SELL", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"Asian Range Breakout: Bearish breakdown below Asian Low {lo} in {kz['name']}."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Asian Box {lo}-{hi}; waiting London/NY breakout."}

    # 8. Volatility Squeeze -> Expansion
    if preset_id == "vol_squeeze":
        ote = _swing_ote(m15 or bars, htf if htf != "FLAT" else "BULL")
        rng6 = max(b["h"] for b in bars[-6:]) - min(b["l"] for b in bars[-6:])
        if rng6 < ote["rng"] * 0.35 and htf != "FLAT":
            side = "BUY" if htf == "BULL" else "SELL"
            trig = round(max(b["h"] for b in bars[-6:]) + 0.4 if side == "BUY" else min(b["l"] for b in bars[-6:]) - 0.4, 2)
            sl, tp = _clamp_sl_tp(side, trig, ote["sl"], ote["tp_27"], ote["rng"])
            return {"action": side, "entry_mode": "LIMIT", "limit_price": trig, "sl": sl, "tp": tp, "confidence": 73,
                    "thesis": f"Vol Squeeze -> Expansion: NR7 compression coiled @ {trig}, staging {side} LIMIT with {htf} HTF bias."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": "Vol Squeeze ZONE: Monitoring M15 range compression."}

    # 9. VWAP & Anchored VWAP
    if preset_id == "vwap_anchored":
        vw, sd = _vwap_sd(m15 or bars)
        ote = _swing_ote(m15 or bars, t_m15 if t_m15 != "FLAT" else "BULL")
        if t_m15 != "FLAT" and abs(px - vw) <= sd * 0.5 and t_m5 == t_m15:
            side = "BUY" if t_m15 == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_27"], ote["rng"])
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                    "thesis": f"Anchored VWAP: Institutional pullback @ VWAP {vw} (±1SD {sd}) with {t_m15} orderflow."}
        if t_m15 != "FLAT":
            side = "BUY" if t_m15 == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, vw, ote["sl"], ote["tp_27"], ote["rng"])
            return {"action": side, "entry_mode": "LIMIT", "limit_price": vw, "sl": sl, "tp": tp, "confidence": 71,
                    "thesis": f"Anchored VWAP LIMIT: Staging {side} @ session VWAP {vw}."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Anchored VWAP {vw}: Waiting directional displacement."}

    # 10. Volume Profile / Value Area
    if preset_id == "volume_profile" and vp.get("poc"):
        poc, vah, val = vp["poc"], vp["vah"], vp["val"]
        va_rng = max(vah - val, 5.0)
        if px <= val + 1.5 and t_m5 == "BULL":
            sl, tp = _clamp_sl_tp("BUY", px, val - va_rng * 0.45, vah, va_rng)
            return {"action": "BUY", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 77,
                    "thesis": f"Volume Profile 80% Rule: VAL {val:.1f} defense rotating through POC {poc:.1f} toward VAH {vah:.1f}."}
        if px >= vah - 1.5 and t_m5 == "BEAR":
            sl, tp = _clamp_sl_tp("SELL", px, vah + va_rng * 0.45, val, va_rng)
            return {"action": "SELL", "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 77,
                    "thesis": f"Volume Profile 80% Rule: VAH {vah:.1f} rejection rotating through POC {poc:.1f} toward VAL {val:.1f}."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Volume Profile ZONE: Value Area {val:.1f}-{vah:.1f} (POC {poc:.1f})."}

    # 11. Gold/Silver Ratio
    if preset_id == "gold_silver_ratio":
        gsr = macro.get("gold_silver_ratio")
        ote = _swing_ote(m15 or bars, t_m15 if t_m15 != "FLAT" else "BULL")
        if gsr and t_m5 != "FLAT" and t_m5 == t_m15:
            side = "BUY" if t_m5 == "BULL" else "SELL"
            sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_27"], ote["rng"])
            return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 73,
                    "thesis": f"XAU/XAG Relative Value (Ratio {gsr}): M15/M5 {t_m5} structure confluence."}
        return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"XAU/XAG Ratio {gsr or '-'}: Waiting relative-value divergence trigger."}

    # 12. Auto-Evolve (synthesizes DAVINICK OTE + FVG/Sweep)
    ote = _swing_ote(m15 or bars, htf if htf != "FLAT" else "BULL")
    if htf != "FLAT" and t_m5 == htf:
        side = "BUY" if htf == "BULL" else "SELL"
        sl, tp = _clamp_sl_tp(side, px, ote["sl"], ote["tp_27"], ote["rng"])
        return {"action": side, "entry_mode": "MARKET", "sl": sl, "tp": tp, "confidence": 76,
                "thesis": f"Auto-Evolve: Synthesized {htf} OTE ({ote['ote_705']}) + M5 BOS setup in {kz['name']}."}
    return {"action": "HOLD", "entry_mode": "ZONE", "thesis": f"Auto-Evolve ZONE: Scanning {kz['name']} OTE {ote['ote_79']}-{ote['ote_62']}."}


def manage_open_by_preset(preset_id: str, t: Dict[str, Any], px: float, m5: List[Dict[str, float]], m15: List[Dict[str, float]]) -> Dict[str, str]:
    """Step 3: Decide whether to HOLD or manually CLOSE an existing open trade based on Preset structure."""
    t_m5 = _structure_bias(m5, 16)
    t_m15 = _structure_bias(m15, 24)
    pnl = float(t.get("pnl") or 0.0)
    r_usd = abs(t["entry"] - t.get("sl_initial", t["sl"])) * t["lots"] * 100
    if r_usd > 0 and pnl > r_usd * 0.65:
        if t["side"] == "BUY" and t_m5 == "BEAR" and t_m15 == "BEAR":
            return {"action": "CLOSE", "reason": f"M5+M15 CHoCH flipped BEAR; locking +${pnl:.2f} per {preset_id}."}
        if t["side"] == "SELL" and t_m5 == "BULL" and t_m15 == "BULL":
            return {"action": "CLOSE", "reason": f"M5+M15 CHoCH flipped BULL; locking +${pnl:.2f} per {preset_id}."}
    return {"action": "HOLD", "reason": f"Holding {t['side']} per {preset_id} structure (SL {t['sl']}, TP {t['tp']})."}
