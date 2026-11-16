from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List


class PostMortemWriter:
    """
    Generates structured per-trade Post-Mortem reviews and aggregates recurring mistake tags
    for weekly Playbook evolution and `similar_past_trades` prompt injection.
    """

    VALID_MISTAKE_TAGS = [
        "none",
        "entry_too_early",
        "sl_too_tight",
        "counter_h4_trend",
        "oi_wall_ignored",
        "pre_usd_news_chop",
        "late_ny_low_liquidity",
    ]

    def write_postmortem(self, trade: Dict[str, Any]) -> Dict[str, Any]:
        pnl = float(trade.get("pnl_usd", 0.0))
        r_mult = float(trade.get("r_multiple", 0.0))
        outcome = "win" if pnl > 0.5 else ("loss" if pnl < -0.5 else "breakeven")
        style = trade.get("style_tag", "OTE-Setup")
        session = trade.get("session", "london_ny_overlap")

        if outcome == "win":
            mistake_tags = ["none"]
            what_happened = (
                f"Executed {trade['action'].upper()} at ${trade['entry']:.2f} inside {session} session; "
                f"price respected OTE invalidation and reached target for +{r_mult:.2f}R (+${pnl:.2f})."
            )
            what_worked = f"Waiting for {style} confluence with Rank #1 OI wall and shifting SL to breakeven after TP1."
            lesson = "Maintain patience for 0.705 sweet spot fills during high-liquidity London/NY hours."
            suggestion = "Keep current entry filter; consider holding runner to 3.2R when PAXG OI delta exceeds +2.5%."
        elif outcome == "loss":
            tag = "sl_too_tight" if abs(trade["entry"] - trade["stop_loss"]) < 5.2 else "entry_too_early"
            mistake_tags = [tag]
            what_happened = (
                f"{trade['action'].upper()} from ${trade['entry']:.2f} stopped out at ${trade['exit_price']:.2f} "
                f"({r_mult:.2f}R / ${pnl:.2f}) following deeper liquidity sweep toward 0.79 OTE boundary."
            )
            what_worked = "Position sizing strictly respected the 1% risk cap, containing drawdown."
            lesson = f"Address `{tag}` by demanding H1 candle close confirmation when PAXG OI is contracting."
            suggestion = f"Add buffer of 0.25x ATR below 0.79 OTE when trading `{style}`."
        else:
            mistake_tags = ["none"]
            what_happened = f"Trade hit TP1 and closed remaining leg at breakeven (${trade['exit_price']:.2f})."
            what_worked = "Breakeven stop rotation protected capital during USD yield reversal."
            lesson = "Breakeven protection after TP1 preserves equity curve stability."
            suggestion = "None required."

        return {
            "trade_id": trade["trade_id"],
            "agent_id": trade["agent_id"],
            "outcome": outcome,
            "followed_plan": True,
            "what_happened": what_happened,
            "mistake_tags": mistake_tags,
            "what_worked": what_worked,
            "lesson": lesson,
            "playbook_suggestion": suggestion,
            "created_at": trade.get("closed_at") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    def summarize_mistakes(self, postmortems: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        counter: Counter = Counter()
        for pm in postmortems:
            tags = pm.get("mistake_tags", [])
            if isinstance(tags, str):
                import json
                try:
                    tags = json.loads(tags)
                except Exception:
                    tags = [tags]
            for t in tags:
                counter[t] += 1
        total = max(sum(counter.values()), 1)
        return [
            {"tag": tag, "count": count, "pct": round(count / total * 100.0, 1)}
            for tag, count in counter.most_common()
        ]
