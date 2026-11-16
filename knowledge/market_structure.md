# XAUUSD Market Structure, Sessions & USD Macro Filter

## 1. Swing Highs & Swing Lows
- Swings are confirmed using a strict $k$-bar fractal pivot on closed H1 and H4 candles.
- Zero look-ahead guarantee: a swing pivot is only visible after $k$ subsequent bars have closed without breaching the pivot extreme.

## 2. Trading Sessions (UTC)
- **London Session (`07:00 - 16:00 UTC`)**: Often establishes the daily directional expansion or sweeps the Asian session range.
- **New York Session (`12:00 - 21:00 UTC`)**: Driven by USD macroeconomic releases, US Treasury yields (`US10Y`), and DXY flows.
- **London-NY Overlap (`12:00 - 16:00 UTC`)**: Peak institutional liquidity and deepest order book volume for XAUUSD.

## 3. USD-Only High-Impact Macro News Filter
- Startify tracks **USD-denominated macroeconomic events exclusively** (`FOMC`, `NFP`, `US CPI`, `Core PCE`, `ISM PMI`, `US GDP`, `Jobless Claims`, `Fed Chair Speech`).
- **Mandatory News Blackout**: No new market or limit orders may be opened within **45 minutes before** or **45 minutes after** a high-impact USD release.
- **Friday Pre-Close Flatten**: All open positions and pending limit orders are automatically closed on Friday at `16:00 America/New_York` to eliminate weekend gap risk.
