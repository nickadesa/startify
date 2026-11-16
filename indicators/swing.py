from typing import Any, Dict, List


def detect_confirmed_swings(
    candles: List[Dict[str, Any]], left_bars: int = 3, right_bars: int = 3
) -> Dict[str, Any]:
    """
    Identifies confirmed pivot Swing Highs and Swing Lows using strictly closed bars.
    A pivot at index i is only confirmed after `right_bars` subsequent candles have closed.
    """
    if len(candles) < (left_bars + right_bars + 2):
        lows = [c["low"] for c in candles] if candles else [4000.0]
        highs = [c["high"] for c in candles] if candles else [4030.0]
        return {
            "low": round(min(lows), 2),
            "high": round(max(highs), 2),
            "direction": "long",
            "swing_highs": [],
            "swing_lows": [],
        }

    swing_highs: List[Dict[str, Any]] = []
    swing_lows: List[Dict[str, Any]] = []
    max_idx = len(candles) - right_bars

    for i in range(left_bars, max_idx):
        curr_h = candles[i]["high"]
        curr_l = candles[i]["low"]
        window = candles[i - left_bars : i + right_bars + 1]

        if all(curr_h >= b["high"] for b in window):
            swing_highs.append({"index": i, "time": candles[i]["time"], "price": round(curr_h, 2)})
        if all(curr_l <= b["low"] for b in window):
            swing_lows.append({"index": i, "time": candles[i]["time"], "price": round(curr_l, 2)})

    recent_slice = candles[-36:] if len(candles) >= 36 else candles
    fallback_low = round(min(c["low"] for c in recent_slice), 2)
    fallback_high = round(max(c["high"] for c in recent_slice), 2)

    last_low = swing_lows[-1]["price"] if swing_lows else fallback_low
    last_high = swing_highs[-1]["price"] if swing_highs else fallback_high

    if last_high <= last_low:
        last_low = fallback_low
        last_high = max(fallback_high, round(last_low + 18.0, 2))

    # Determine impulse direction from order of most recent confirmed pivots or EMA slope
    if swing_highs and swing_lows:
        direction = "long" if swing_highs[-1]["index"] >= swing_lows[-1]["index"] else "short"
    else:
        direction = "long" if candles[-1]["close"] >= candles[0]["close"] else "short"

    return {
        "low": round(last_low, 2),
        "high": round(last_high, 2),
        "direction": direction,
        "swing_highs": swing_highs[-5:],
        "swing_lows": swing_lows[-5:],
    }


def classify_trend_and_regime(candles: List[Dict[str, Any]]) -> Dict[str, str]:
    """
    Computes deterministic H4/H1 trend bias and Market Regime tag (from xauusd-ai-trader-ideas.md 2.2).
    """
    if len(candles) < 15:
        return {"trend": "bullish", "regime": "bullish_impulse"}

    closes = [c["close"] for c in candles]
    sma_fast = sum(closes[-8:]) / 8.0
    sma_slow = sum(closes[-20:]) / min(len(closes), 20)
    ranges = [c["high"] - c["low"] for c in candles[-14:]]
    avg_atr = sum(ranges) / len(ranges)

    diff = sma_fast - sma_slow
    if abs(diff) < avg_atr * 0.35:
        trend = "neutral"
        regime = "range_consolidation"
    elif diff > 0:
        trend = "bullish"
        regime = "high_vol_expansion" if ranges[-1] > avg_atr * 1.45 else "bullish_impulse"
    else:
        trend = "bearish"
        regime = "high_vol_expansion" if ranges[-1] > avg_atr * 1.45 else "bearish_impulse"

    return {"trend": trend, "regime": regime}
