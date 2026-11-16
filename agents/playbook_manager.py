from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent.parent


class PlaybookManager:
    """
    Manages self-authored AI Playbooks (`agents/<agent_id>/playbook.md`).
    Enforces:
    - Maximum 1,500 words limit to conserve token quota
    - Strictly no modification of immutable `risk_rules.md` guardrails
    - Versioning (`v1`, `v2`, `v3`) with statistical justification and minimum trade sample size
    """

    MAX_WORDS = 1500
    MIN_TRADES_BEFORE_STYLE_CHANGE = 15

    def ensure_agent_playbook(self, agent_cfg: Dict[str, Any]) -> str:
        agent_id = agent_cfg["agent_id"]
        pb_dir = BASE_DIR / "agents" / agent_id
        pb_dir.mkdir(parents=True, exist_ok=True)
        pb_path = pb_dir / "playbook.md"

        if not pb_path.exists():
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
        return f"""# {name} Trading Playbook (v2)
- **Model**: `{model}`
- **Primary Archetype**: {style}
- **Base Account Equity**: $1,000.00 (Immutable Risk Rules Enforced)

## 1. Core Edge & Market Filter
- Trade exclusively when XAUUSD H4 structure and H1 impulse leg align with CFTC COT Managed Money bias.
- Require price to enter or approach the Fibonacci OTE retracement zone (`0.62` to `0.79`, targeting the `0.705` sweet spot).
- Confirm institutional liquidity defense via GLD Options OI Wall (Rank #1 or #2 within $4.00) or PAXG 1H Open Interest expansion.

## 2. Session & USD Macro Discipline
- Primary execution windows: **London Open (`07:00-11:00 UTC`)** and **London-NY Overlap (`12:00-16:00 UTC`)**.
- Strictly stand down 45 minutes before and after high-impact **USD** releases (`FOMC`, `NFP`, `US CPI`, `Core PCE`, `ISM PMI`).

## 3. Execution, Scale-Out & Post-Mortem Loop
- **Risk Allocation**: `1.0%` standard (`$10.00` on `$1,000`), scaling to `1.5%` when OTE + OI Wall + Liquidity Sweep all converge.
- **Targets**: Close `50%` at `TP1 (2.0R)` and shift stop loss to breakeven; trail remaining `50%` to `TP2 (3.2R)`.
"""
