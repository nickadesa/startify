from typing import Any, Dict, List, Optional
from data.news_provider import USDNewsProvider
from data.oi_provider import OIProvider
from data.price_provider import PriceProvider
from indicators.fib_ote import ote_zone
from indicators.session import classify_session, evaluate_triggers
from indicators.swing import classify_trend_and_regime, detect_confirmed_swings


class SnapshotBuilder:
    """
    Constructs the deterministic Market Snapshot JSON passed to all competing AI agents,
    including Multi-Timeframe (4H, 1H, M15, M5) structure, Historical Warm-Up stats,
    and exact Fibonacci OTE Retracement (0.618-0.786 / 0.705) + Extensions (-0.27 & -0.618).
    """

    def __init__(self):
        self.oi_provider = OIProvider()
        self.news_provider = USDNewsProvider()
        self.price_provider = PriceProvider()

    def build(
        self,
        as_of_time: str,
        candles_h1: List[Dict[str, Any]],
        candles_h4: Optional[List[Dict[str, Any]]] = None,
        candles_m15: Optional[List[Dict[str, Any]]] = None,
        candles_m5: Optional[List[Dict[str, Any]]] = None,
        account_state: Optional[Dict[str, Any]] = None,
        similar_past_trades: Optional[List[Dict[str, Any]]] = None,
        custom_news: Optional[List[Dict[str, Any]]] = None,
        base_spread: float = 0.30,
    ) -> Dict[str, Any]:
        current_price = round(float(candles_h1[-1]["close"]), 2) if candles_h1 else 4021.35
        swings_h1 = detect_confirmed_swings(candles_h1, left_bars=3, right_bars=3)
        trend_info = classify_trend_and_regime(candles_h4 if candles_h4 else candles_h1)
        direction = "long" if trend_info["trend"] != "bearish" else "short"

        ote = ote_zone(swings_h1["low"], swings_h1["high"], direction)
        oi_data = self.oi_provider.get_oi_snapshot(current_price, candles_h1)
        upcoming_news = self.news_provider.get_upcoming_usd_news(as_of_time, custom_news)
        in_blackout, blackout_reason = self.news_provider.is_in_news_blackout(as_of_time, upcoming_news)
        session_name = classify_session(as_of_time)

        warmup = self.price_provider.analyze_historical_warmup(
            as_of_time=as_of_time,
            candles_h4=candles_h4,
            candles_h1=candles_h1,
            candles_m15=candles_m15,
            candles_m5=candles_m5,
        )

        trigger_eval = evaluate_triggers(
            current_price=current_price,
            ote=ote,
            oi_levels=oi_data["oi_levels"],
            last_swing={"low": swings_h1["low"], "high": swings_h1["high"]},
            candles_h1=candles_h1,
            as_of_time=as_of_time,
        )

        spread = round(base_spread * (2.5 if in_blackout else 1.0), 2)

        return {
            "symbol": "XAUUSD",
            "time": as_of_time,
            "price": current_price,
            "spread": spread,
            "session": session_name,
            "trend_h4": trend_info["trend"],
            "market_regime": trend_info["regime"],
            "timeframes": warmup["timeframes"],
            "mtf_alignment": warmup["mtf_alignment_score"],
            "historical_warmup": warmup,
            "last_swing": {
                "low": swings_h1["low"],
                "high": swings_h1["high"],
                "impulse_direction": direction,
            },
            "ote": ote,
            "oi_levels": oi_data["oi_levels"],
            "oi_profile": oi_data["oi_profile"],
            "oi_change_paxg_1h_pct": oi_data["oi_change_paxg_1h_pct"],
            "cot_bias": oi_data["cot_bias"],
            "upcoming_news": upcoming_news,
            "news_blackout": in_blackout,
            "news_blackout_reason": blackout_reason or "",
            "trigger": trigger_eval,
            "account": account_state or {
                "equity": 1000.0,
                "open_positions": [],
                "today_pnl": 0.0,
                "week_pnl": 0.0,
                "trades_today": 0,
            },
            "similar_past_trades": similar_past_trades or [],
        }
