# Agent-1 Trading Playbook (v2)
- **Model**: `gemini-model`
- **Primary Archetype**: OTE-Confluence
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
