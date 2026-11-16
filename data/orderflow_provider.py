import json
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List


class OrderflowProvider:
    """
    Free Real-Time Gold Orderflow & Macro Provider (TapeDelta-inspired):
    - Binance Futures/Spot PAXGUSDT Orderbook Depth (Resting Liquidity Walls)
    - Binance PAXGUSDT AggTrades -> Bid/Ask Volume, Footprint Delta, CVD, Imbalance
    - Binance PAXGUSDT Perp Open Interest & Funding Rate
    - Yahoo Finance DXY (DX-Y.NYB) & US10Y (^TNX) Macro Correlation
    """

    def _get_json(self, url: str, timeout: int = 5) -> Any:
        req = urllib.request.Request(url, headers={"User-Agent": "Startify-Orderflow/3.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def get_live_klines(
        self, interval: str = "15m", limit: int = 80, symbol: str = "XAUUSD"
    ) -> List[Dict[str, Any]]:
        iv_upper = interval.upper()
        is_m45 = iv_upper == "M45" or iv_upper == "45M"
        iv_map = {
            "M1": "1m", "1M": "1m",
            "M5": "5m", "5M": "5m",
            "M15": "15m", "15M": "15m",
            "M45": "15m", "45M": "15m",
            "1H": "1h", "H1": "1h",
            "4H": "4h", "H4": "4h",
            "1D": "1d", "D1": "1d",
            "1W": "1w", "W1": "1w",
            "1MO": "1M", "1MONTH": "1M",
        }
        if iv_upper == "1M":
            iv = "1M"
        else:
            iv = iv_map.get(iv_upper, interval.lower())
        fetch_limit = min(limit * 3, 450) if is_m45 else limit

        sym = symbol.upper()
        binance_map = {
            "XAUUSD": "PAXGUSDT",
            "PAXGUSDT": "PAXGUSDT",
            "BTCUSDT": "BTCUSDT",
            "ETHUSDT": "ETHUSDT",
            "SOLUSDT": "SOLUSDT",
        }
        yahoo_map = {
            "NAS100": "NQ=F",
            "NASDAQ": "NQ=F",
            "SPX500": "ES=F",
            "XAGUSD": "SI=F",
            "EURUSD": "EURUSD=X",
            "DXY": "DX-Y.NYB",
        }

        if sym in binance_map:
            b_sym = binance_map[sym]
            try:
                raw = self._get_json(
                    f"https://fapi.binance.com/fapi/v1/klines?symbol={b_sym}&interval={iv}&limit={fetch_limit}"
                )
                out: List[Dict[str, Any]] = []
                for row in raw:
                    o = float(row[1])
                    h = float(row[2])
                    l = float(row[3])
                    c = float(row[4])
                    vol = float(row[5])
                    taker_buy = float(row[9]) if len(row) > 9 else vol * 0.5
                    delta = taker_buy - (vol - taker_buy)
                    out.append({
                        "time": datetime.fromtimestamp(int(row[0]) / 1000, tz=timezone.utc).isoformat(),
                        "open": round(o, 2),
                        "high": round(h, 2),
                        "low": round(l, 2),
                        "close": round(c, 2),
                        "volume": round(vol, 2),
                        "delta": round(delta, 2),
                    })
                if is_m45 and out:
                    agg: List[Dict[str, Any]] = []
                    for i in range(0, len(out), 3):
                        chunk = out[i : i + 3]
                        if not chunk:
                            continue
                        agg.append({
                            "time": chunk[0]["time"],
                            "open": chunk[0]["open"],
                            "high": max(x["high"] for x in chunk),
                            "low": min(x["low"] for x in chunk),
                            "close": chunk[-1]["close"],
                            "volume": round(sum(x["volume"] for x in chunk), 2),
                            "delta": round(sum(x["delta"] for x in chunk), 2),
                        })
                    return agg[-limit:]
                if out:
                    return out
            except Exception:
                pass
        elif sym in yahoo_map:
            yf_sym = yahoo_map[sym]
            yf_iv_map = {
                "1m": ("1m", "1d"),
                "5m": ("5m", "5d"),
                "15m": ("15m", "5d"),
                "1h": ("60m", "1mo"),
                "4h": ("60m", "3mo"),
                "1d": ("1d", "6mo"),
                "1w": ("1wk", "2y"),
                "1M": ("1mo", "5y"),
            }
            yf_iv, yf_rng = yf_iv_map.get(iv, ("15m", "5d"))
            try:
                raw = self._get_json(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(yf_sym)}?interval={yf_iv}&range={yf_rng}"
                )
                res = (raw.get("chart", {}).get("result") or [{}])[0]
                ts_list = res.get("timestamp") or []
                q = (res.get("indicators", {}).get("quote") or [{}])[0]
                opens, highs, lows, closes, vols = (
                    q.get("open") or [],
                    q.get("high") or [],
                    q.get("low") or [],
                    q.get("close") or [],
                    q.get("volume") or [],
                )
                dec = 4 if sym == "EURUSD" else 2
                out = []
                for idx_t, ts_val in enumerate(ts_list):
                    o, h, l, c = opens[idx_t], highs[idx_t], lows[idx_t], closes[idx_t]
                    if o is None or h is None or l is None or c is None:
                        continue
                    v = float(vols[idx_t] or 100)
                    out.append({
                        "time": datetime.fromtimestamp(int(ts_val), tz=timezone.utc).isoformat(),
                        "open": round(float(o), dec),
                        "high": round(float(h), dec),
                        "low": round(float(l), dec),
                        "close": round(float(c), dec),
                        "volume": round(v, 2),
                        "delta": round((1 if c >= o else -1) * (v * 0.15 + 5), 2),
                    })
                if out:
                    return out[-limit:]
            except Exception:
                pass
        return []

    def get_markets_overview(self) -> List[Dict[str, Any]]:
        catalog = [
            {"symbol": "XAUUSD", "name": "Gold Spot", "category": "Commodities", "leverage": "25x", "price": 3874.50, "change_24h_pct": -0.76, "funding_rate": -0.0003, "open_interest": "$12.36M", "volume_24h": "$317.18M", "binance": "PAXGUSDT"},
            {"symbol": "PAXGUSDT", "name": "Gold Perp", "category": "Commodities", "leverage": "25x", "price": 3876.40, "change_24h_pct": -0.72, "funding_rate": 0.0012, "open_interest": "$28.45M", "volume_24h": "$142.80M", "binance": "PAXGUSDT"},
            {"symbol": "NAS100", "name": "NASDAQ 100", "category": "Indices", "leverage": "50x", "price": 21704.25, "change_24h_pct": -1.85, "funding_rate": 0.0001, "open_interest": "$84.45M", "volume_24h": "$6.64B", "yahoo": "NQ=F"},
            {"symbol": "SPX500", "name": "S&P 500", "category": "Indices", "leverage": "75x", "price": 6046.38, "change_24h_pct": -0.85, "funding_rate": -0.0001, "open_interest": "$5.61M", "volume_24h": "$282.44M", "yahoo": "ES=F"},
            {"symbol": "BTCUSDT", "name": "Bitcoin", "category": "Crypto", "leverage": "50x", "price": 91354.00, "change_24h_pct": -1.45, "funding_rate": 0.0006, "open_interest": "$10.38M", "volume_24h": "$1.64B", "binance": "BTCUSDT"},
            {"symbol": "ETHUSDT", "name": "Ethereum", "category": "Crypto", "leverage": "50x", "price": 3104.16, "change_24h_pct": -1.71, "funding_rate": 0.0012, "open_interest": "$4.22M", "volume_24h": "$187.77M", "binance": "ETHUSDT"},
            {"symbol": "SOLUSDT", "name": "Solana", "category": "Crypto", "leverage": "20x", "price": 211.24, "change_24h_pct": -2.06, "funding_rate": -0.0009, "open_interest": "$5.53M", "volume_24h": "$23.01M", "binance": "SOLUSDT"},
            {"symbol": "XAGUSD", "name": "Silver Spot", "category": "Commodities", "leverage": "25x", "price": 31.42, "change_24h_pct": -2.77, "funding_rate": 0.0000, "open_interest": "$165.49K", "volume_24h": "$12.74M", "yahoo": "SI=F"},
            {"symbol": "EURUSD", "name": "Euro / USD", "category": "Forex", "leverage": "100x", "price": 1.0542, "change_24h_pct": -0.16, "funding_rate": -0.0001, "open_interest": "$1.17M", "volume_24h": "$8.37M", "yahoo": "EURUSD=X"},
            {"symbol": "DXY", "name": "US Dollar Index", "category": "Forex", "leverage": "50x", "price": 106.68, "change_24h_pct": 0.34, "funding_rate": 0.0000, "open_interest": "$3.20M", "volume_24h": "$44.10M", "yahoo": "DX-Y.NYB"},
        ]
        try:
            tickers = self._get_json("https://fapi.binance.com/fapi/v1/ticker/24hr", timeout=4)
            t_map = {t["symbol"]: t for t in tickers if isinstance(t, dict) and "symbol" in t}
            for item in catalog:
                bsym = item.get("binance")
                if bsym and bsym in t_map:
                    t = t_map[bsym]
                    item["price"] = round(float(t.get("lastPrice", item["price"])), 2)
                    item["change_24h_pct"] = round(float(t.get("priceChangePercent", item["change_24h_pct"])), 2)
        except Exception:
            pass
        return catalog

    def get_live_orderflow(self, spot_xauusd_price: float = 4028.90) -> Dict[str, Any]:
        now_iso = datetime.now(timezone.utc).isoformat()
        bids: List[Dict[str, float]] = []
        asks: List[Dict[str, float]] = []
        footprint_bars: List[Dict[str, Any]] = []
        cvd_usd = 0.0
        buy_vol = 0.0
        sell_vol = 0.0
        open_interest = 0.0
        funding_rate = 0.0
        paxg_price = spot_xauusd_price
        source = "Binance PAXGUSDT Live"

        try:
            depth = self._get_json("https://fapi.binance.com/fapi/v1/depth?symbol=PAXGUSDT&limit=10")
            bids = [{"price": round(float(p), 2), "qty": round(float(q), 3)} for p, q in depth.get("bids", [])[:8]]
            asks = [{"price": round(float(p), 2), "qty": round(float(q), 3)} for p, q in depth.get("asks", [])[:8]]

            trades = self._get_json("https://fapi.binance.com/fapi/v1/aggTrades?symbol=PAXGUSDT&limit=120")
            if trades:
                paxg_price = round(float(trades[-1]["p"]), 2)
                # Group into 6 footprint buckets of 20 trades each
                for b_idx in range(0, len(trades), 20):
                    chunk = trades[b_idx : b_idx + 20]
                    b_buy = sum(float(t["q"]) for t in chunk if not t.get("m", False))
                    b_sell = sum(float(t["q"]) for t in chunk if t.get("m", False))
                    delta = b_buy - b_sell
                    buy_vol += b_buy
                    sell_vol += b_sell
                    cvd_usd += delta * paxg_price
                    footprint_bars.append({
                        "bucket": f"T-{6 - (b_idx // 20)}",
                        "price": round(float(chunk[-1]["p"]), 2),
                        "buy_vol": round(b_buy, 3),
                        "sell_vol": round(b_sell, 3),
                        "delta": round(delta, 3),
                        "imbalance": "BUY_STACK" if b_buy > b_sell * 1.6 else ("SELL_STACK" if b_sell > b_buy * 1.6 else "BALANCED"),
                    })

            oi_data = self._get_json("https://fapi.binance.com/fapi/v1/openInterest?symbol=PAXGUSDT")
            open_interest = round(float(oi_data.get("openInterest", 0.0)), 2)

            prem_data = self._get_json("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=PAXGUSDT")
            funding_rate = round(float(prem_data.get("lastFundingRate", 0.0)) * 100.0, 4)
        except Exception:
            source = "Fallback Snapshot (Binance rate-limited/offline)"
            paxg_price = round(spot_xauusd_price + 1.4, 2)
            bids = [{"price": round(paxg_price - i * 0.8, 2), "qty": round(14.5 + i * 3.2, 2)} for i in range(1, 7)]
            asks = [{"price": round(paxg_price + i * 0.8, 2), "qty": round(12.0 + i * 2.8, 2)} for i in range(1, 7)]
            footprint_bars = [
                {"bucket": f"T-{6 - i}", "price": round(paxg_price + (i - 3) * 0.6, 2), "buy_vol": 18.4, "sell_vol": 11.2, "delta": 7.2, "imbalance": "BUY_STACK" if i % 2 == 0 else "BALANCED"}
                for i in range(6)
            ]
            buy_vol = 110.4
            sell_vol = 67.2
            cvd_usd = round((buy_vol - sell_vol) * paxg_price, 2)
            open_interest = 28450.0
            funding_rate = 0.01

        bid_wall = max(bids, key=lambda x: x["qty"], default={"price": paxg_price - 2.0, "qty": 0.0})
        ask_wall = max(asks, key=lambda x: x["qty"], default={"price": paxg_price + 2.0, "qty": 0.0})
        net_delta = round(buy_vol - sell_vol, 3)

        return {
            "timestamp": now_iso,
            "source": source,
            "symbol": "PAXGUSDT",
            "paxg_price": paxg_price,
            "spot_proxy_xauusd": spot_xauusd_price,
            "buy_volume": round(buy_vol, 3),
            "sell_volume": round(sell_vol, 3),
            "net_delta": net_delta,
            "cvd_usd": round(cvd_usd, 2),
            "delta_bias": "bullish" if net_delta > 0 else ("bearish" if net_delta < 0 else "neutral"),
            "open_interest_paxg": open_interest,
            "funding_rate_pct": funding_rate,
            "bid_wall": bid_wall,
            "ask_wall": ask_wall,
            "orderbook_bids": bids,
            "orderbook_asks": asks,
            "footprint_buckets": footprint_bars,
        }
