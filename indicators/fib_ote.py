from typing import Dict


def ote_zone(swing_low: float, swing_high: float, direction: str) -> Dict[str, float]:
    """
    Calculates ICT Fibonacci OTE (Optimal Trade Entry) retracement zone AND
    exact Fibonacci Expansion Take-Profit targets (-0.27 and -0.618):
    - Entry Retracement Zone: 0.618 to 0.786 (0.62 to 0.79), Sweet Spot = 0.705
    - Invalidation (SL reference): 1.0 (Swing Low for Long, Swing High for Short)
    - Fib 0.0 (Swing High/Low liquidity + Break-Even "กันหน้าทุน" trigger reference)
    - TP1 (Partial Close 50% Lots): Fib -0.27 (-27% extension beyond Fib 0.0)
    - TP2 (Runner Close 50% Lots): Fib -0.618 (-61.8% extension beyond Fib 0.0)
    """
    rng = max(abs(swing_high - swing_low), 0.01)
    if direction == "long":
        fib_0618 = swing_high - 0.618 * rng
        fib_062 = swing_high - 0.62 * rng
        fib_0705 = swing_high - 0.705 * rng
        fib_0786 = swing_high - 0.786 * rng
        fib_079 = swing_high - 0.79 * rng
        invalidation = swing_low
        fib_0_0 = swing_high
        tp1_neg_027 = swing_high + 0.27 * rng
        tp2_neg_0618 = swing_high + 0.618 * rng
        be_lock_price = round(fib_0705 + 0.50, 2)
    else:
        fib_0618 = swing_low + 0.618 * rng
        fib_062 = swing_low + 0.62 * rng
        fib_0705 = swing_low + 0.705 * rng
        fib_0786 = swing_low + 0.786 * rng
        fib_079 = swing_low + 0.79 * rng
        invalidation = swing_high
        fib_0_0 = swing_low
        tp1_neg_027 = swing_low - 0.27 * rng
        tp2_neg_0618 = swing_low - 0.618 * rng
        be_lock_price = round(fib_0705 - 0.50, 2)

    return {
        "zone_low": round(min(fib_062, fib_079), 2),
        "zone_high": round(max(fib_062, fib_079), 2),
        "fib_0618": round(fib_0618, 2),
        "sweet_spot": round(fib_0705, 2),
        "sweet_spot_705": round(fib_0705, 2),
        "fib_0786": round(fib_0786, 2),
        "invalidation": round(invalidation, 2),
        "fib_0_0": round(fib_0_0, 2),
        "tp1_neg_027": round(tp1_neg_027, 2),
        "tp2_neg_0618": round(tp2_neg_0618, 2),
        "be_lock_price": be_lock_price,
    }
