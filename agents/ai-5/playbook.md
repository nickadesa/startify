# Agent-5 Trading Playbook (v2.5)
- **Model**: `cloudflare-model`
- **Primary Archetype**: OTE-Confluence
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
