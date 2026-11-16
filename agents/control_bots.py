from typing import Any, Dict
from risk.money_management import calc_lot


class RuleBasedOTEBot:
    """
    Control Bot 1 (`ctrl-ote`): Pure deterministic rule-based bot (zero AI).
    Places a limit order at the 0.705 Fibonacci OTE sweet spot whenever H4 trend aligns
    and price is within $8 of the OTE zone, with SL at swing invalidation and TP at 2.2R.
    """

    def decide(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        if snapshot.get("news_blackout"):
            return self._no_trade("USD high-impact news blackout window active")

        ote = snapshot["ote"]
        swing = snapshot["last_swing"]
        direction = swing.get("impulse_direction", "long")
        entry = float(ote["sweet_spot"])
        sl = float(ote["invalidation"])
        sl_dist = abs(entry - sl)
        if sl_dist < 2.0 or sl_dist > 25.0:
            return self._no_trade("Swing range outside optimal mechanical bounds")

        tp1 = round(entry + (sl_dist * 2.0 if direction == "long" else -sl_dist * 2.0), 2)
        tp2 = round(entry + (sl_dist * 3.0 if direction == "long" else -sl_dist * 3.0), 2)
        equity = float(snapshot.get("account", {}).get("equity", 1000.0))
        lot, _ = calc_lot(equity, 1.0, entry, sl)

        if lot <= 0:
            return self._no_trade("Position size rounded to 0.00 lot under 1% risk rule")

        return {
            "action": direction,
            "order_type": "limit",
            "entry": entry,
            "stop_loss": sl,
            "take_profits": [
                {"price": tp1, "close_pct": 50},
                {"price": tp2, "close_pct": 50},
            ],
            "risk_pct": 1.0,
            "lot": lot,
            "confidence": 0.65,
            "style_tag": "Mechanical-0.705-OTE",
            "reasoning": f"Deterministic H4 {snapshot.get('trend_h4')} impulse pullback to 0.705 OTE sweet spot (${entry:.2f}) with fixed 2.0R/3.0R targets.",
            "invalid_if": f"H1 closes beyond swing invalidation ${sl:.2f} before fill.",
        }

    def _no_trade(self, reason: str) -> Dict[str, Any]:
        return {
            "action": "no_trade",
            "order_type": "limit",
            "entry": 0.0,
            "stop_loss": 0.0,
            "take_profits": [],
            "risk_pct": 0.0,
            "lot": 0.0,
            "confidence": 0.0,
            "style_tag": "Mechanical-0.705-OTE",
            "reasoning": reason,
            "invalid_if": "N/A",
        }


class BuyAndHoldBenchmarkBot:
    """
    Control Bot 2 (`ctrl-bnh`): Passive XAUUSD benchmark allocation on $1,000 initial equity.
    """

    def compute_benchmark_equity(
        self, initial_equity: float, start_gold_price: float, current_gold_price: float, lot: float = 0.05
    ) -> float:
        price_diff = current_gold_price - start_gold_price
        pnl = price_diff * lot * 100.0
        return round(initial_equity + pnl, 2)
