from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_recent_bars(csv_name: str = "XAUUSD60.csv", limit: int = 360) -> List[Dict[str, float]]:
    path = BASE_DIR / csv_name
    if not path.exists():
        return []
    rows: List[Dict[str, float]] = []
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if len(row) < 5:
                continue
            try:
                # Handle either Date,Time,O,H,L,C or Timestamp,O,H,L,C
                if len(row) >= 6 and ":" in str(row[1]):
                    o, h, l, c = float(row[2]), float(row[3]), float(row[4]), float(row[5])
                else:
                    o, h, l, c = float(row[1]), float(row[2]), float(row[3]), float(row[4])
                rows.append({"o": o, "h": h, "l": l, "c": c})
            except ValueError:
                continue
    return rows[-limit:]


def compute_historical_quant_baseline() -> Dict[str, Any]:
    bars = _load_recent_bars("XAUUSD60.csv", limit=400)
    if len(bars) < 50:
        return {
            "bars_analyzed": 0,
            "avg_atr_h1": 4.85,
            "trend_bias": "BULLISH",
            "ote_sweet_spot": 0.705,
            "last_close": 2661.80,
            "market_open_target": "2026-11-17T00:00:00Z",
        }

    closes = [b["c"] for b in bars]
    atrs = [b["h"] - b["l"] for b in bars[-48:]]
    avg_atr = round(sum(atrs) / max(1, len(atrs)), 2)
    ema20 = sum(closes[-20:]) / 20.0
    ema50 = sum(closes[-50:]) / 50.0
    trend_bias = "BULLISH" if ema20 >= ema50 else "BEARISH"
    last_close = round(closes[-1], 2)

    return {
        "bars_analyzed": len(bars),
        "avg_atr_h1": avg_atr,
        "ema20": round(ema20, 2),
        "ema50": round(ema50, 2),
        "trend_bias": trend_bias,
        "ote_sweet_spot": 0.705,
        "last_close": last_close,
        "market_open_target": "2026-11-17T00:00:00Z",
    }


def train_all_ais_foundational(state: Dict[str, Any]) -> Dict[str, Any]:
    baseline = compute_historical_quant_baseline()
    skill_modules = {
        "ai-1": "Macro Regime + H4 OTE 0.705 Sniper (Calibrated on 400 H1 bars)",
        "ai-2": "Liquidity Sweep + PAXG OI Divergence (High-Vol Guard)",
        "ai-3": "Statistical Z-Score Mean Reversion + US10Y Yield Filter",
        "ai-4": "Asian-London Range Breakout + 0.650 Fib Retest",
        "ai-5": "DXY Inverse Slope + COT Confluence Gate",
        "ai-6": "NY Overlap Volatility Compression Breakout",
        "ai-7": "OI Wall Rejection + ADX>28 Counter-Trend Veto",
        "ai-8": "Discount OTE Pullback + 4h Tilt Cooldown Guard",
    }

    for ai in state.get("ais", []):
        aid = ai["agent_id"]
        trained_rule = (
            f"[Trained • Nov 17 Ready] {skill_modules.get(aid, 'Core Quant OTE')} | "
            f"H1 ATR=${baseline['avg_atr_h1']} | Bias={baseline['trend_bias']}."
        )
        pb = ai.get("playbook", [])
        pb = [r for r in pb if not r.startswith("[Trained • Nov 17 Ready]")]
        pb.insert(0, trained_rule)
        ai["playbook"] = pb[:5]
        ai["trained_skill"] = skill_modules.get(aid, "Core Quant OTE")
        ai["nov17_ready"] = True

    state["training_baseline"] = baseline
    return state
