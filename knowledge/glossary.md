# Glossary of Quantitative Trading Terms

- **XAUUSD**: Spot price of 1 Troy Ounce of Gold quoted in US Dollars.
- **Lot**: Standardized contract unit (`1.00 lot = 100 oz`, `0.01 lot = 1 oz`).
- **R-Multiple (`R`)**: Trade net P&L divided by initial dollar risk (`risk_usd`). A `+$25` win on a `$10` risk trade equals `+2.5R`.
- **Fibonacci OTE**: Optimal Trade Entry retracement band (`0.62` to `0.79`, sweet spot `0.705`) of an impulse leg.
- **Open Interest (OI) Wall**: Strike or price cluster with heavy outstanding derivative contracts acting as support/resistance magnet.
- **Liquidity Sweep**: Brief price excursion beyond a prior Swing High or Swing Low that triggers resting stop orders before reversing.
- **Profit Factor**: Gross profit of all winning trades divided by gross absolute loss of all losing trades.
- **Expectancy**: Average expected return per trade in USD or R-multiple: `(WinRate * AvgWin) - (LossRate * AvgLoss)`.
- **Shadow Trade**: A simulated hypothetical trade recorded when a plan is rejected by the Validator or when an AI selects `no_trade` during a market trigger.
- **Account Run / Blowup**: A single lifecycle of an AI's `$1,000` paper account. If equity falls below the survival threshold or hits margin stop-out, the run terminates (`blowup`) and a fresh `$1,000` run begins while retaining all learned Playbook rules and Post-Mortem memory.
