# Immutable Risk Rules (Code-Enforced Guardrails)

These rules are enforced by `risk/validator.py` and **cannot** be overridden by any AI agent or Playbook update:

1. **Per-Trade Risk Cap**: `risk_pct` must be between `0.5%` and `2.0%` of current account equity. Hard cap is strictly `2.0%`.
2. **Minimum Reward-to-Risk**: Weighted average Take Profit must yield at least **`2.0R`** (`1:2` Risk-Reward ratio).
3. **Stop Loss Validity**: Every trade plan must specify a hard `stop_loss` on the correct side of `entry` (`stop_loss < entry < take_profit` for `long`; `take_profit < entry < stop_loss` for `short`).
4. **Position & Frequency Limits**:
   - Maximum concurrent open positions: **`2`**
   - Maximum executed trades per calendar day: **`3`**
5. **Drawdown Circuit Breakers**:
   - **Daily Loss Limit**: Trading halts for the remainder of the UTC day if realized + unrealized daily loss reaches **`3.0%`**.
   - **Weekly Loss Limit**: Trading halts for the remainder of the week if cumulative weekly loss reaches **`8.0%`**.
6. **Margin Ceiling**: Total margin utilized across open positions cannot exceed **`30.0%`** of account equity.
7. **Anti-Martingale & No Averaging Down**: Increasing lot size after a losing trade or opening an additional position in a losing trade's zone to average down entry price is strictly prohibited.
8. **USD News Blackout**: Opening new trades within `45` minutes before or after a high-impact USD news event is blocked.
