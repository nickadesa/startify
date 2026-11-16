# ICT Fibonacci OTE (Optimal Trade Entry) + Extensions (`-0.27` & `-0.618`) & Break-Even Protocol

## 1. Multi-Timeframe Top-Down Structure (`4H` -> `1H` -> `M15` -> `M5`)
Before placing any XAUUSD order, every AI agent must verify historical warm-up statistics and top-down structure across 4 timeframes:
- **`4H` (Macro Bias & Liquidity Pools)**: Identify overarching bullish/bearish market structure (`HH/HL` vs `LH/LL`) and external liquidity targets.
- **`1H` (Impulse Swing & Open Interest Walls)**: Anchor the Fibonacci retracement on the most recent confirmed `1H` impulse swing (`swing_low` to `swing_high`) and align with `PAXGUSDT` / `GLD` OI strike walls.
- **`M15` (Fibonacci OTE Discount/Premium Zone)**: Wait for price to retrace into the `0.618` – `0.786` (`0.705` Sweet Spot) zone.
- **`M5` (Precision Entry Trigger)**: Confirm Change of Character (`CHoCH`) / Break of Structure (`BOS`) or rejection displacement candle inside the OTE zone.

## 2. Exact Fibonacci Levels & Take-Profit Extensions (`-0.27` & `-0.618`)
Given an impulse range `R = swing_high - swing_low`:
- **Entry Zone (OTE Retracement)**:
  - `0.618` (`61.8%` retracement)
  - **`0.705` (`70.5%` OTE Sweet Spot — Primary Institutional Entry)**
  - `0.786` (`78.6%` deep retracement)
- **Stop-Loss Invalidation (`1.0`)**:
  - Placed just beyond the `1.0` impulse origin (`swing_low - buffer` for Long; `swing_high + buffer` for Short).
- **Break-Even Trigger ("ตั้ง SL กันหน้าทุน" at `+1.0R` / `Fib 0.0`)**:
  - As soon as price moves `+1.0R` in profit or reaches `Fib 0.0` (the impulse `swing_high` for Long or `swing_low` for Short), immediately move `stop_loss` to **`Entry Price + $0.50`** (Long) or **`Entry Price - $0.50`** (Short) so the trade can never turn into a loss.
- **Multi-Lot Partial Close & Extension Targets (`-0.27` & `-0.618`)**:
  - **TP1 = `Fib -0.27` (`-27%` extension beyond `Fib 0.0`)**:
    - Long: `swing_high + 0.27 * R` | Short: `swing_low - 0.27 * R`
    - Action: **Partial close `50%` of the lot size** to lock realized profit in the bank, and ensure SL is locked at Break-Even+ ("กันหน้าทุน").
  - **TP2 = `Fib -0.618` (`-61.8%` extension beyond `Fib 0.0`)**:
    - Long: `swing_high + 0.618 * R` | Short: `swing_low - 0.618 * R`
    - Action: **Close the remaining `50%` runner lot** (while trailing SL to `Fib 0.0` once `-0.27` is cleared).
