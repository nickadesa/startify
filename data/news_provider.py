from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from data.price_provider import parse_iso_utc


USD_HIGH_IMPACT_CATALOG: List[Dict[str, Any]] = [
    {
        "event_id": "usd-fomc-mins-202611",
        "name": "FOMC Meeting Minutes & Fed Funds Guidance",
        "category": "interest_rates",
        "currency": "USD",
        "impact": "high",
        "actual": "4.25%",
        "forecast": "4.25%",
        "prior": "4.50%",
        "surprise_delta": "0.00%",
        "gold_15m_move_usd": 14.80,
        "gold_60m_move_usd": 26.40,
        "neutral_summary": "Federal Reserve officials noted inflation progress toward 2.0% while emphasizing data-dependent pace on further USD rate adjustments.",
    },
    {
        "event_id": "usd-cpi-202611",
        "name": "US Core CPI (MoM & YoY)",
        "category": "inflation",
        "currency": "USD",
        "impact": "high",
        "actual": "0.2%",
        "forecast": "0.3%",
        "prior": "0.3%",
        "surprise_delta": "-0.1%",
        "gold_15m_move_usd": 19.50,
        "gold_60m_move_usd": 31.20,
        "neutral_summary": "US Bureau of Labor Statistics reported Core CPI at 0.2% MoM versus 0.3% consensus forecast; DXY index moved -0.42% on release.",
    },
    {
        "event_id": "usd-nfp-202611",
        "name": "US Non-Farm Payrolls (NFP) & Unemployment Rate",
        "category": "labor_market",
        "currency": "USD",
        "impact": "high",
        "actual": "168K",
        "forecast": "185K",
        "prior": "194K",
        "surprise_delta": "-17K",
        "gold_15m_move_usd": 22.10,
        "gold_60m_move_usd": 34.90,
        "neutral_summary": "US non-farm payrolls added 168K jobs in the reference month compared to 185K expected, with unemployment steady at 4.1%.",
    },
    {
        "event_id": "usd-pce-202611",
        "name": "US Core PCE Price Index (MoM)",
        "category": "inflation",
        "currency": "USD",
        "impact": "high",
        "actual": "0.2%",
        "forecast": "0.2%",
        "prior": "0.3%",
        "surprise_delta": "0.0%",
        "gold_15m_move_usd": 9.40,
        "gold_60m_move_usd": 15.80,
        "neutral_summary": "BEA reported US Core PCE rose 0.2% MoM in line with consensus estimates; 10-Year US Treasury yield traded at 4.18%.",
    },
    {
        "event_id": "usd-ism-pmi-202611",
        "name": "US ISM Services PMI & DXY Flows",
        "category": "growth_activity",
        "currency": "USD",
        "impact": "high",
        "actual": "53.8",
        "forecast": "52.5",
        "prior": "51.9",
        "surprise_delta": "+1.3",
        "gold_15m_move_usd": -12.60,
        "gold_60m_move_usd": -18.40,
        "neutral_summary": "ISM Services PMI registered 53.8 versus 52.5 forecast, driven by stronger new orders and business activity components.",
    },
]


class USDNewsProvider:
    """
    Strictly USD-only macroeconomic news & calendar provider.
    Filters out any non-USD event and produces neutral, factual digests without directional bias.
    """

    def __init__(self, blackout_before_min: int = 45, blackout_after_min: int = 45):
        self.blackout_before_min = blackout_before_min
        self.blackout_after_min = blackout_after_min

    def filter_usd_only(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [
            e for e in events
            if str(e.get("currency", "USD")).upper() == "USD"
        ]

    def get_upcoming_usd_news(
        self, as_of_time: str, custom_events: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        now = parse_iso_utc(as_of_time)
        if custom_events is not None:
            filtered = self.filter_usd_only(custom_events)
            return filtered

        # Schedule upcoming USD high-impact events relative to current trading day
        base_day = now.replace(hour=13, minute=30, second=0, microsecond=0)
        if base_day < now - timedelta(hours=2):
            base_day = base_day + timedelta(days=1)

        scheduled = []
        for idx, item in enumerate(USD_HIGH_IMPACT_CATALOG[:3]):
            ev_time = base_day + timedelta(hours=idx * 24 + (5 if idx == 0 else 0))
            scheduled.append({
                "event_id": item["event_id"],
                "event": item["name"],
                "currency": "USD",
                "category": item["category"],
                "impact": item["impact"],
                "time": ev_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "forecast": item["forecast"],
                "prior": item["prior"],
                "neutral_summary": item["neutral_summary"],
            })
        return self.filter_usd_only(scheduled)

    def is_in_news_blackout(
        self, as_of_time: str, upcoming_events: List[Dict[str, Any]]
    ) -> tuple[bool, Optional[str]]:
        now = parse_iso_utc(as_of_time)
        for ev in self.filter_usd_only(upcoming_events):
            ev_dt = parse_iso_utc(ev["time"])
            delta_min = (ev_dt - now).total_seconds() / 60.0
            if -self.blackout_after_min <= delta_min <= self.blackout_before_min:
                return True, f"USD News Blackout Window: {ev.get('event') or ev.get('name')} ({ev['time']})"
        return False, None
