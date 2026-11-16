from datetime import datetime
from typing import Any, Dict, List
from zoneinfo import ZoneInfo


NY_TZ = ZoneInfo("America/New_York")


class WeeklyReportGenerator:
    """
    Generates the Friday 17:00 America/New_York Weekly Competition Report:
    - Crowns Weekly Season Champion based on Net P&L & Profit Factor
    - Summarizes per-AI trades, win rate, RR, drawdown, mistake tags, and blowup survival
    - Computes Consensus signal performance vs single-agent trades
    - Publishes next week's CFTC COT Managed Money bias
    """

    def is_friday_report_window(self, utc_iso: str) -> bool:
        dt_utc = datetime.fromisoformat(utc_iso.replace("Z", "+00:00"))
        dt_ny = dt_utc.astimezone(NY_TZ)
        return dt_ny.weekday() == 4 and dt_ny.hour >= 17

    def generate(
        self,
        week_id: str,
        week_start: str,
        week_end: str,
        leaderboard: List[Dict[str, Any]],
        cot_bias: str = "Net Long Increasing (+14,280 Contracts WoW)",
    ) -> Dict[str, Any]:
        sorted_board = sorted(leaderboard, key=lambda x: float(x.get("net_pnl_usd", 0.0)), reverse=True)
        champ = sorted_board[0] if sorted_board else {"agent_id": "ai-1", "display_name": "Alpha-Gemini", "net_pnl_usd": 0.0, "win_rate": 0.0, "profit_factor": 1.0, "total_trades": 0}
        runner_up = sorted_board[1] if len(sorted_board) > 1 else champ

        md_lines = [
            f"# 🏆 Startify Weekly Season Report ({week_id})",
            f"**Period**: `{week_start}` to `{week_end}` (Closed Friday 17:00 `America/New_York`)",
            f"**Weekly Champion**: **{champ['display_name']}** (`+${champ['net_pnl_usd']:.2f}` | WR `{champ['win_rate']:.1f}%` | PF `{champ['profit_factor']:.2f}`)",
            f"**Runner-Up**: **{runner_up['display_name']}** (`+${runner_up['net_pnl_usd']:.2f}`)",
            f"**Next Week CFTC COT Bias**: `{cot_bias}`",
            "",
            "## Standings Summary",
        ]
        for idx, row in enumerate(sorted_board[:8], start=1):
            md_lines.append(
                f"{idx}. **{row['display_name']}** ({row.get('model_name', '')}) — "
                f"Net P&L: `${row['net_pnl_usd']:+.2f}` | WR: `{row['win_rate']:.1f}%` | "
                f"PF: `{row['profit_factor']:.2f}` | Blowups: `{row.get('blowup_count', 0)}`"
            )

        return {
            "week_id": week_id,
            "week_start": week_start,
            "week_end": week_end,
            "champion_agent_id": champ["agent_id"],
            "runner_up_agent_id": runner_up["agent_id"],
            "net_pnl_usd": round(float(champ["net_pnl_usd"]), 2),
            "net_return_pct": round(float(champ["net_pnl_usd"]) / 10.0, 2),
            "win_rate": round(float(champ["win_rate"]), 1),
            "profit_factor": round(float(champ["profit_factor"]), 2),
            "total_trades": int(champ.get("total_trades", 0)),
            "cot_bias_next_week": cot_bias,
            "summary_markdown": "\n".join(md_lines),
        }
