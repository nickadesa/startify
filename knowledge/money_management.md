# XAUUSD Money Management & Position Sizing ($1,000 Base Equity)

## 1. Contract Specifications
- **Symbol**: `XAUUSD` (Gold Spot vs US Dollar)
- **Initial Account Equity**: `$1,000.00` per account run
- **1.00 Standard Lot**: `100` Troy Ounces (`$1.00` move = `$100.00` P&L)
- **0.10 Mini Lot**: `10` Troy Ounces (`$1.00` move = `$10.00` P&L)
- **0.01 Micro Lot**: `1` Troy Ounce (`$1.00` move = `$1.00` P&L)
- **Minimum Lot**: `0.01` (`lot_step = 0.01`, `max_lot = 1.00`)
- **Margin Required**: `(lot * 100 * entry_price) / leverage` (Default leverage = `1:100`)

## 2. Deterministic Lot Size Formula
The Risk Manager always recalculates and enforces position size using:
```python
risk_usd = equity * (risk_pct / 100.0)
sl_distance = abs(entry - stop_loss)
raw_lot = risk_usd / (sl_distance * 100.0)
lot = math.floor(raw_lot / 0.01) * 0.01
```

## 3. Practical Examples on a $1,000 Account
- **Example A**: Equity = `$1,000`, `risk_pct = 1.0%` (`$10.00` risk), `sl_distance = $5.00` per oz.
  - `raw_lot = 10 / (5 * 100) = 0.02 lot` -> `actual_risk = $10.00` (`1.0%`).
- **Example B**: Equity = `$1,000`, `risk_pct = 1.5%` (`$15.00` risk), `sl_distance = $5.00` per oz.
  - `raw_lot = 15 / (5 * 100) = 0.03 lot` -> `actual_risk = $15.00` (`1.5%`).
- **Example C**: Equity = `$1,000`, `risk_pct = 1.0%` (`$10.00` risk), `sl_distance = $12.00` per oz.
  - `raw_lot = 10 / 1200 = 0.0083` -> rounds down to `0.00 lot` -> trade is rejected unless `risk_pct` is sized appropriately within the `2.0%` hard cap (`$20.00` max risk).
