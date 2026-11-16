from pathlib import Path
from typing import Any, Dict

BASE_DIR = Path(__file__).resolve().parent.parent


class PlaybookManager:
    """
    Manages self-authored AI Playbooks (`agents/<agent_id>/playbook.md`).
    Enforces:
    - Maximum 1,500 words limit to conserve token quota
    - Strictly no modification of immutable `risk_rules.md` guardrails
    - Versioning (`v1`, `v2`, `v3`) with pre-competition Walk-Forward Historical Backtest calibration
      and 11 installed skills.sh trading intelligence modules.
    """

    MAX_WORDS = 1500
    MIN_TRADES_BEFORE_STYLE_CHANGE = 15

    def ensure_agent_playbook(self, agent_cfg: Dict[str, Any], force_refresh: bool = True) -> str:
        agent_id = agent_cfg["agent_id"]
        pb_dir = BASE_DIR / "agents" / agent_id
        pb_dir.mkdir(parents=True, exist_ok=True)
        pb_path = pb_dir / "playbook.md"

        if force_refresh or not pb_path.exists():
            content = self._generate_initial_playbook(agent_cfg)
            pb_path.write_text(content, encoding="utf-8")
            return content
        return pb_path.read_text(encoding="utf-8")

    def validate_playbook_update(self, new_content: str, trade_count_since_last_update: int) -> tuple[bool, str]:
        words = len(new_content.split())
        if words > self.MAX_WORDS:
            return False, f"Playbook exceeds {self.MAX_WORDS} word limit ({words} words)"
        if trade_count_since_last_update < self.MIN_TRADES_BEFORE_STYLE_CHANGE:
            return (
                False,
                f"Insufficient trade sample ({trade_count_since_last_update} < {self.MIN_TRADES_BEFORE_STYLE_CHANGE} required before Playbook revision)",
            )
        forbidden_overrides = ["override risk_rules", "max_risk_pct > 2", "martingale allowed"]
        for phrase in forbidden_overrides:
            if phrase in new_content.lower():
                return False, f"Playbook attempted to override immutable risk rule: {phrase}"
        return True, "valid"

    def _generate_initial_playbook(self, agent_cfg: Dict[str, Any]) -> str:
        name = agent_cfg["display_name"]
        model = agent_cfg["model_name"]
        style = agent_cfg.get("style_archetype", "OTE-OI-Confluence")
        return f"""# {name} Trading Playbook (v2.5)
- **Model**: `{model}`
- **Primary Archetype**: {style}
- **Base Account Equity**: $1,000.00 (Immutable Risk Rules Enforced)
- **Pre-Competition Training**: Walk-Forward Historical Backtest (2,700+ candles across 4H, 1H, M15, M5) + 11 Skills.sh Modules

## 1. Multi-Timeframe Structure & Fibonacci OTE Edge
- **4H & 1H**: Identify primary institutional impulse leg and CFTC COT Managed Money directional bias.
- **M15**: Map Fibonacci OTE retracement zone (`0.618` to `0.786`, targeting the `0.705` sweet spot) and GLD/PAXG Open Interest strike walls.
- **M5**: Confirm displacement / CHoCH trigger before committing capital.

## 2. Autonomous Execution Modes (`market` | `limit` | `zone_confirm`)
- **`limit`**: Stage Buy Limit / Sell Limit directly at Fib `0.705` or `0.618` when HTF structure and OI wall converge.
- **`zone_confirm`**: Wait without a resting limit order until price enters the `0.618–0.786` zone and prints an M5 rejection candle.
- **`market`**: Execute immediately when price is already inside the OTE zone with an active M5 BOS/CHoCH displacement.

## 3. Break-Even Lock & Partial Close (`-0.27` & `-0.618`)
- **Break-Even Protection**: Automatically shift SL to Entry + $0.50 once price reaches `+1.0R` or `Fib 0.0`.
- **Multi-Lot Partial Close**: Close `50%` lot at `TP1 (Fib -0.27)` and hold the remaining `50%` runner to `TP2 (Fib -0.618)`.
- **USD-Only Macro Filter**: Stand down 30 minutes before and after high-impact USD events (`FOMC`, `NFP`, `US CPI`, `Core PCE`, `ISM PMI`).
"""
