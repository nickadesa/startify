"""Strategy presets for TOPTIERclub AI models (DAVINICK STRATEGY + 10 Quant/Institutional presets + Auto-Evolve)."""
from __future__ import annotations
from typing import Any, Dict, List

PRESETS: List[Dict[str, str]] = [
    {
        "id": "davinick",
        "name": "DAVINICK STRATEGY",
        "tag": "Primary",
        "summary": "Fib OTE (0.62/0.705/0.79), Swing SL+buffer, Multi-TP (-0.27/-0.618/runner), Partials+BE, OI Profile, FVG, HTF Bias, Killzone, Liquidity Sweep, Premium/Discount, OB, News Filter ±15m.",
        "prompt": (
            "Primary strategy: DAVINICK STRATEGY. "
            "1) HTF Bias: trade only in H4/D1 trend direction. "
            "2) Liquidity Sweep & Killzone: wait for prior high/low sweep during London/NY open. "
            "3) Premium/Discount: BUY only in discount (<50% range), SELL only in premium (>50% range). "
            "4) Entry: Fibonacci OTE (0.62 / 0.705 / 0.79) overlapping FVG (D1/H4/H1/M15 3rd candle closed) and Order Block. "
            "5) SL beyond origin swing + buffer; Multi-TP (pts, -0.27, -0.618, runner) with partials and BE after TP1. "
            "6) Filter with COMEX GC OI profile and avoid entries ±15m around high-impact news (NFP, FOMC, CPI)."
        ),
    },
    {
        "id": "cta_momentum",
        "name": "Time-Series Momentum (CTA)",
        "tag": "Quant",
        "summary": "Man AHL / Winton style: 1–12M return sign dictates Long/Short macro bias, stacked with OTE pullbacks on trending Gold.",
        "prompt": (
            "Strategy: CTA Time-Series Momentum (Man AHL / Winton style). "
            "Use multi-horizon trend return sign (positive = Long bias, negative = Short bias) as primary directional filter, "
            "entering on pullbacks with strict trailing risk control."
        ),
    },
    {
        "id": "risk_parity",
        "name": "Volatility Targeting / Risk Parity",
        "tag": "Quant",
        "summary": "Bridgewater style: scale position size inversely to ATR volatility so per-trade risk stays constant and equity curve stays smooth.",
        "prompt": (
            "Strategy: Volatility Targeting / Risk Parity (Bridgewater style). "
            "Normalize stop distance and sizing to current ATR regime (high ATR = wider stop & smaller lot, low ATR = tighter stop) "
            "to keep portfolio volatility constant and minimize drawdown."
        ),
    },
    {
        "id": "mean_reversion",
        "name": "Mean Reversion Z-Score (Stat Arb)",
        "tag": "Quant",
        "summary": "Renaissance style: measure distance from mean in SD (Z-score) and fade > ±2 SD extremes in range-bound regimes.",
        "prompt": (
            "Strategy: Mean Reversion on Z-Score (Stat Arb). "
            "Detect range-bound conditions and fade price stretches beyond ±2.0 standard deviations from the rolling mean, "
            "targeting reversion to the mean with strict invalidation."
        ),
    },
    {
        "id": "macro_signal",
        "name": "Cross-Asset / Macro Signal",
        "tag": "Macro",
        "summary": "Soros / Tudor style: align with Real Yields (TIPS), DXY, and COT Commercial vs Speculator contrarian extremes.",
        "prompt": (
            "Strategy: Cross-Asset / Macro Signal (Soros / Tudor style). "
            "Evaluate USD/DXY strength, real yield pressure, and extreme positioning sentiment as contrarian/macro filters before entering Gold."
        ),
    },
    {
        "id": "regime_hmm",
        "name": "Regime Detection (HMM / Markov)",
        "tag": "Quant",
        "summary": "Two Sigma style: classify market into Trend / Range / Panic regimes and activate only the matching playbook or stand down.",
        "prompt": (
            "Strategy: Regime Detection (Two Sigma style). "
            "First classify current market state into Trend, Range, or Panic. "
            "Trade breakouts/pullbacks in Trend, fade extremes in Range, and reduce size or HOLD during Panic regimes."
        ),
    },
    {
        "id": "asian_breakout",
        "name": "Asian Range Breakout (Opening Range)",
        "tag": "Session",
        "summary": "Mark Asian session High/Low and trade the London Open breakout/retest with SL on opposite side and 1R/2R/1x range partials.",
        "prompt": (
            "Strategy: Asian Range Breakout (Opening Range). "
            "Identify the Asian session high/low consolidation box and enter on London Open breakout or retest, "
            "placing SL on the opposite side of the Asian range and targeting 1R, 2R, and 1x range width."
        ),
    },
    {
        "id": "vol_squeeze",
        "name": "Volatility Squeeze → Expansion",
        "tag": "Breakout",
        "summary": "BB inside Keltner / NR7 compression breakout aligned with H4/D1 HTF bias before trend expansion.",
        "prompt": (
            "Strategy: Volatility Squeeze to Expansion. "
            "Detect volatility compression (narrow range / Bollinger inside Keltner) and enter the expansion breakout "
            "only in the direction of H4/D1 HTF bias."
        ),
    },
    {
        "id": "vwap_anchored",
        "name": "VWAP & Anchored VWAP",
        "tag": "Intraday",
        "summary": "Institutional session/swing VWAP with ±1/±2 SD bands: buy/sell VWAP pullbacks in trends, fade outer bands in ranges.",
        "prompt": (
            "Strategy: VWAP & Anchored VWAP. "
            "Use session/swing-anchored VWAP and ±1/±2 SD bands as institutional fair value: "
            "enter pullbacks to VWAP in trends, or fade ±2 SD outer bands in range regimes."
        ),
    },
    {
        "id": "volume_profile",
        "name": "Volume Profile / Value Area",
        "tag": "Profile",
        "summary": "Prior day POC, VAH, VAL: apply 80% Value Area rotation rule or breakout through Low-Volume Nodes (LVN).",
        "prompt": (
            "Strategy: Volume Profile / Value Area. "
            "Track prior session POC, VAH, and VAL. Apply the 80% rule when price re-enters Value Area from outside, "
            "or trade fast momentum through Low-Volume Nodes."
        ),
    },
    {
        "id": "gold_silver_ratio",
        "name": "Gold/Silver Ratio Relative Value",
        "tag": "Pair",
        "summary": "Monitor XAU/XAG Z-score stretch for relative-value mean reversion across precious metals.",
        "prompt": (
            "Strategy: Gold/Silver Ratio Relative Value. "
            "Evaluate Gold vs Silver relative stretch (XAU/XAG Z-score) to bias Gold entries toward mean-reverting relative value."
        ),
    },
    {
        "id": "auto_evolve",
        "name": "Auto-Evolve (AI Self-Adapted)",
        "tag": "Auto",
        "summary": "AI analyzes its own trade journal & current market regime to dynamically synthesize and refine its own strategy.",
        "prompt": (
            "Strategy: Auto-Evolve Mode. "
            "Review your recent closed trades and current volatility/trend regime, synthesize the highest-expectancy setup, "
            "and explicitly state which edge you are applying and why."
        ),
    },
]

PRESET_MAP: Dict[str, Dict[str, str]] = {p["id"]: p for p in PRESETS}


def get_preset(preset_id: str) -> Dict[str, str]:
    return PRESET_MAP.get(preset_id, PRESET_MAP["davinick"])
