# Open Interest (OI) Proxies & Liquidity Profile for Gold

## Why Proxies Are Used
Spot XAUUSD is decentralized OTC and does not publish a single central Open Interest tape. Startify synthesizes three transparent, zero-cost institutional proxies into the Market Snapshot:

1. **GLD Options Strike OI Profile (`oi_levels`)**:
   - Extracted from active GLD options chains and mapped to XAUUSD spot equivalent price levels.
   - `oi_rank: 1` and `oi_rank: 2` denote the largest open interest walls. Price often gravitates toward these strikes as liquidity magnets or rejects sharply upon first test.
2. **PAXGUSDT Perpetual Open Interest Delta (`oi_change_paxg_1h_pct`)**:
   - Real-time tokenized gold perpetual futures OI change over the last closed H1 bar.
   - **Rising Price + Positive OI Change (`> +1.5%`)**: Fresh long positioning entering the impulse leg.
   - **Liquidity Sweep of Swing High/Low + Negative OI Change (`< -1.5%`)**: Leveraged stop-hunt / liquidation flush, often preceding a high-probability reversal into OTE.
3. **CFTC COT Managed Money Bias (`cot_bias`)**:
   - Weekly Friday Commitment of Traders positioning (`net long increasing`, `net long trimming`, `net short increasing`, `neutral`).
   - Serves as a medium-term macro filter for weekly directional conviction.
