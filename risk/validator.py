from typing import Any, Dict, Tuple
from risk.money_management import calc_lot, calc_margin_required, calc_weighted_rr


class PlanValidator:
    """
    Code-enforced validator checking every trade plan against immutable risk_rules.md
    before execution in the Paper Trading Engine.
    """

    def __init__(self, config: Dict[str, Any] = None):
        cfg = config or {}
        rr = cfg.get("risk_rules", {})
        tr = cfg.get("trading", {})
        self.min_risk_pct = float(rr.get("min_risk_pct", 0.5))
        self.max_risk_pct = float(rr.get("max_risk_pct", 2.0))
        self.min_rr = float(rr.get("min_rr", 2.0))
        self.max_open_positions = int(rr.get("max_open_positions", 2))
        self.max_trades_per_day = int(rr.get("max_trades_per_day", 3))
        self.max_daily_loss_pct = float(rr.get("max_daily_loss_pct", 3.0))
        self.max_weekly_loss_pct = float(rr.get("max_weekly_loss_pct", 8.0))
        self.max_margin_usage_pct = float(rr.get("max_margin_usage_pct", 30.0))
        self.contract_oz = int(tr.get("contract_oz", 100))
        self.lot_step = float(tr.get("lot_step", 0.01))
        self.min_lot = float(tr.get("min_lot", 0.01))
        self.max_lot = float(tr.get("max_lot", 1.0))
        self.leverage = int(tr.get("leverage", 100))

    def validate(
        self,
        plan: Dict[str, Any],
        snapshot: Dict[str, Any],
        account: Dict[str, Any],
    ) -> Tuple[bool, str, Dict[str, Any]]:
        action = str(plan.get("action", "no_trade")).lower()
        if action == "no_trade":
            return True, "no_trade", plan

        if action not in ("long", "short"):
            return False, f"Invalid action '{action}'", plan

        # 1. USD High-Impact News Blackout check
        if snapshot.get("news_blackout"):
            return False, snapshot.get("news_blackout_reason", "Blocked by USD News Blackout Window"), plan

        # 2. Session & Open/Daily trade limits
        open_positions = account.get("open_positions", [])
        if len(open_positions) >= self.max_open_positions:
            return False, f"Max concurrent open positions reached ({len(open_positions)}/{self.max_open_positions})", plan

        trades_today = int(account.get("trades_today", 0))
        if trades_today >= self.max_trades_per_day:
            return False, f"Max daily trade count reached ({trades_today}/{self.max_trades_per_day})", plan

        # 3. Daily and Weekly Drawdown circuit breakers
        equity = float(account.get("equity", 1000.0))
        start_of_day_equity = float(account.get("start_of_day_equity", equity))
        start_of_week_equity = float(account.get("start_of_week_equity", equity))
        today_pnl = float(account.get("today_pnl", 0.0))
        week_pnl = float(account.get("week_pnl", 0.0))

        if today_pnl <= -(start_of_day_equity * (self.max_daily_loss_pct / 100.0)):
            return False, f"Daily loss circuit breaker active ({today_pnl:.2f} USD <= -{self.max_daily_loss_pct}%)", plan

        if week_pnl <= -(start_of_week_equity * (self.max_weekly_loss_pct / 100.0)):
            return False, f"Weekly loss circuit breaker active ({week_pnl:.2f} USD <= -{self.max_weekly_loss_pct}%)", plan

        # 4. Anti-averaging down / Martingale protection
        for pos in open_positions:
            if pos.get("action") == action and float(pos.get("unrealized_pnl", 0.0)) < 0:
                return False, "Prohibited averaging down into an existing losing position", plan

        # 5. Entry, Stop Loss, and Take Profit geometry
        entry = float(plan.get("entry", 0.0))
        stop_loss = float(plan.get("stop_loss", 0.0))
        take_profits = plan.get("take_profits", [])
        current_price = float(snapshot.get("price", entry))

        if entry <= 0 or stop_loss <= 0 or not take_profits:
            return False, "Missing or non-positive entry, stop_loss, or take_profits", plan

        if abs(entry - current_price) > 45.0:
            return False, f"Entry ${entry:.2f} is too far from current market price ${current_price:.2f}", plan

        if action == "long" and stop_loss >= entry:
            return False, f"Invalid LONG stop_loss (${stop_loss:.2f} >= entry ${entry:.2f})", plan
        if action == "short" and stop_loss <= entry:
            return False, f"Invalid SHORT stop_loss (${stop_loss:.2f} <= entry ${entry:.2f})", plan

        # 6. Minimum Reward-to-Risk check
        rr = calc_weighted_rr(entry, stop_loss, take_profits, action)
        if rr < self.min_rr:
            return False, f"Weighted Reward-to-Risk {rr:.2f}R is below minimum {self.min_rr:.2f}R", plan

        # 7. Risk % bounds & Deterministic Lot Recalculation
        risk_pct = float(plan.get("risk_pct", 1.0))
        if risk_pct < self.min_risk_pct or risk_pct > self.max_risk_pct:
            return False, f"Requested risk_pct {risk_pct:.2f}% outside allowed [{self.min_risk_pct}%, {self.max_risk_pct}%]", plan

        lot, actual_risk_usd = calc_lot(
            equity=equity,
            risk_pct=risk_pct,
            entry=entry,
            stop_loss=stop_loss,
            contract_oz=self.contract_oz,
            lot_step=self.lot_step,
            min_lot=self.min_lot,
            max_lot=self.max_lot,
        )
        if lot <= 0 or actual_risk_usd > equity * (self.max_risk_pct / 100.0) + 0.05:
            return False, f"Calculated lot {lot} invalid or exceeds {self.max_risk_pct}% hard risk cap on ${equity:.2f} equity", plan

        # 8. Margin Usage Cap (<= 30% of equity)
        existing_margin = sum(float(p.get("margin_used", 0.0)) for p in open_positions)
        new_margin = calc_margin_required(lot, entry, self.contract_oz, self.leverage)
        if (existing_margin + new_margin) > equity * (self.max_margin_usage_pct / 100.0):
            return False, f"Total margin ${existing_margin + new_margin:.2f} exceeds {self.max_margin_usage_pct}% of equity", plan

        normalized_plan = dict(plan)
        normalized_plan["lot"] = lot
        normalized_plan["risk_usd"] = actual_risk_usd
        normalized_plan["weighted_rr"] = rr
        normalized_plan["margin_required"] = new_margin
        return True, "valid", normalized_plan
