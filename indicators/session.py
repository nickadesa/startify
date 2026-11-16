from typing import Any, Dict, List
from data.price_provider import parse_iso_utc


def classify_session(as_of_time: str) -> str:
    dt = parse_iso_utc(as_of_time)
    h = dt.hour
    if 12 <= h < 16:
        return "london_ny_overlap"
    if 7 <= h < 12:
        return "london"
    if 16 <= h < 21:
        return "new_york"
    return "asian_off_hours"


def evaluate_triggers(
    current_price: float,
    ote: Dict[str, float],
    oi_levels: List[Dict[str, Any]],
    last_swing: Dict[str, float],
    candles_h1: List[Dict[str, Any]],
    as_of_time: str,
    ote_proximity_usd: float = 8.0,
    oi_proximity_usd: float = 5.0,
) -> Dict[str, Any]:
    """
    Trigger-based calling filter (from xauusd-ai-trader-ideas.md section 3.1):
    Only invokes LLM APIs when price is actionable:
    - Inside or within `ote_proximity_usd` of the Fibonacci OTE zone (0.62 - 0.79)
    - Within `oi_proximity_usd` of an institutional OI Wall (Rank 1 or 2)
    - Recent liquidity sweep of prior swing high/low
    - Session opening bell (London 07:00 UTC or NY 12:00 UTC)
    """
    reasons: List[str] = []
    primary_trigger = "none"

    if (ote["zone_low"] - ote_proximity_usd) <= current_price <= (ote["zone_high"] + ote_proximity_usd):
        in_band = ote["zone_low"] <= current_price <= ote["zone_high"]
        primary_trigger = "ote_sweet_spot" if in_band else "ote_proximity"
        reasons.append(
            f"Price ${current_price:.2f} near OTE zone [${ote['zone_low']:.2f} - ${ote['zone_high']:.2f}] (Sweet Spot ${ote['sweet_spot']:.2f})"
        )

    for wall in oi_levels[:2]:
        if abs(current_price - float(wall["price"])) <= oi_proximity_usd:
            if primary_trigger == "none":
                primary_trigger = "oi_wall_test"
            reasons.append(f"Price testing Rank #{wall['oi_rank']} OI Wall at ${wall['price']:.2f}")

    if candles_h1:
        last_bar = candles_h1[-1]
        if last_bar["high"] >= last_swing["high"] and last_bar["close"] < last_swing["high"]:
            if primary_trigger == "none":
                primary_trigger = "liquidity_sweep_high"
            reasons.append(f"Bearish liquidity sweep above swing high ${last_swing['high']:.2f}")
        elif last_bar["low"] <= last_swing["low"] and last_bar["close"] > last_swing["low"]:
            if primary_trigger == "none":
                primary_trigger = "liquidity_sweep_low"
            reasons.append(f"Bullish liquidity sweep below swing low ${last_swing['low']:.2f}")

    dt = parse_iso_utc(as_of_time)
    if dt.hour in (7, 12) and dt.minute == 0:
        if primary_trigger == "none":
            primary_trigger = "session_open"
        reasons.append(f"Session open bell ({'London' if dt.hour == 7 else 'New York'})")

    return {
        "should_call_ai": len(reasons) > 0,
        "primary_trigger": primary_trigger,
        "reasons": reasons,
    }
