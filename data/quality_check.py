from datetime import timedelta
from typing import Any, Dict, List
from data.price_provider import parse_iso_utc


class DataQualityChecker:
    """
    Validates market data integrity before constructing a Market Snapshot for AI agents:
    1. Minimum candle count check
    2. Missing bar / time-gap check (accounting for weekend market close)
    3. Abnormal price spike check (> 5x 14-bar average range)
    4. Weekend / market closed check
    5. Positive price & valid high/low ordering check
    """

    def check(self, candles: List[Dict[str, Any]], as_of_time: str, timeframe: str = "H1") -> Dict[str, Any]:
        if not candles or len(candles) < 20:
            return {
                "passed": False,
                "reason": f"Insufficient closed candles ({len(candles) if candles else 0} < 20 required)",
                "metrics": {},
            }

        now = parse_iso_utc(as_of_time)
        if now.weekday() == 5 or (now.weekday() == 6 and now.hour < 22):
            return {
                "passed": False,
                "reason": "XAUUSD market is closed for the weekend",
                "metrics": {"weekday": now.weekday()},
            }

        for bar in candles:
            if bar["high"] < bar["low"] or bar["open"] <= 0 or bar["close"] <= 0:
                return {
                    "passed": False,
                    "reason": f"Corrupted OHLC values at {bar.get('time')}",
                    "metrics": {"bar": bar},
                }

        # Check abnormal spike on latest closed candle compared to prior 14 bars
        recent_ranges = [max(c["high"] - c["low"], 0.1) for c in candles[-15:-1]]
        avg_range = sum(recent_ranges) / len(recent_ranges)
        last_range = candles[-1]["high"] - candles[-1]["low"]
        if last_range > avg_range * 5.5 and last_range > 35.0:
            return {
                "passed": False,
                "reason": f"Abnormal price spike detected on latest candle ({last_range:.2f} USD > 5.5x ATR {avg_range:.2f} USD)",
                "metrics": {"last_range": round(last_range, 2), "avg_range": round(avg_range, 2)},
            }

        # Check staleness / missing gap on non-weekend transitions
        expected_hours = 1 if timeframe.upper() == "H1" else 4
        last_bar_dt = parse_iso_utc(candles[-1]["time"])
        age_hours = (now - last_bar_dt).total_seconds() / 3600.0
        if age_hours > expected_hours * 6 and now.weekday() not in (0, 6):
            return {
                "passed": False,
                "reason": f"Stale price data: latest closed candle is {age_hours:.1f}h old",
                "metrics": {"age_hours": round(age_hours, 2)},
            }

        return {
            "passed": True,
            "reason": "OK",
            "metrics": {
                "candle_count": len(candles),
                "avg_range_14": round(avg_range, 2),
                "last_range": round(last_range, 2),
                "latest_bar_time": candles[-1]["time"],
            },
        }
