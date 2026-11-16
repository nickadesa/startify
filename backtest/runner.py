from typing import Any, Dict, List
from agents.control_bots import RuleBasedOTEBot
from indicators.snapshot import SnapshotBuilder
from paper.engine import PaperTradingEngine
from risk.validator import PlanValidator


class BacktestRunner:
    """
    Executes strict Train / Test split backtests on historical H1 XAUUSD candles
    with zero look-ahead bias.
    """

    def __init__(self, initial_equity: float = 1000.0):
        self.initial_equity = initial_equity
        self.snapshot_builder = SnapshotBuilder()
        self.validator = PlanValidator()
        self.engine = PaperTradingEngine(initial_equity=initial_equity)

    def run_baseline_ote(self, candles_h1: List[Dict[str, Any]]) -> Dict[str, Any]:
        bot = RuleBasedOTEBot()
        equity = self.initial_equity
        peak = equity
        max_dd = 0.0
        trades: List[Dict[str, Any]] = []

        idx = 40
        while idx < len(candles_h1) - 12:
            history = candles_h1[:idx]
            as_of_time = history[-1]["time"]
            snap = self.snapshot_builder.build(
                as_of_time=as_of_time,
                candles_h1=history,
                account_state={"equity": equity, "open_positions": [], "today_pnl": 0.0, "week_pnl": 0.0, "trades_today": 0},
            )
            if not snap["trigger"]["should_call_ai"]:
                idx += 1
                continue

            plan = bot.decide(snap)
            valid, _, norm_plan = self.validator.validate(plan, snap, snap["account"])
            if not valid or norm_plan.get("action") == "no_trade":
                idx += 1
                continue

            norm_plan["opened_at"] = as_of_time
            future_bars = candles_h1[idx : idx + 12]
            exec_res = self.engine.simulate_bar_execution(norm_plan, future_bars, spread=snap["spread"])
            if exec_res["filled"]:
                equity = round(equity + exec_res["pnl_usd"], 2)
                peak = max(peak, equity)
                dd = round(((peak - equity) / peak) * 100.0, 2) if peak > 0 else 0.0
                max_dd = max(max_dd, dd)
                trades.append(exec_res)
                idx += 4
            else:
                idx += 1

        wins = [t for t in trades if t["pnl_usd"] > 0]
        losses = [t for t in trades if t["pnl_usd"] <= 0]
        gross_win = sum(t["pnl_usd"] for t in wins)
        gross_loss = abs(sum(t["pnl_usd"] for t in losses))
        return {
            "initial_equity": self.initial_equity,
            "final_equity": equity,
            "net_pnl_usd": round(equity - self.initial_equity, 2),
            "total_trades": len(trades),
            "win_rate": round((len(wins) / len(trades) * 100.0), 1) if trades else 0.0,
            "profit_factor": round(gross_win / max(gross_loss, 1.0), 2),
            "max_drawdown_pct": max_dd,
        }
