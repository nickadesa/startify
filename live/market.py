"""Real market data only. If every feed fails the engine simply skips the tick —
it never invents a price."""
from __future__ import annotations
import json, time, urllib.parse, urllib.request
from typing import Any, Dict, List, Optional

UA = {"User-Agent": "Mozilla/5.0 Startify/3.0"}
_cache: Dict[str, Any] = {}

ASSETS: List[Dict[str, Any]] = [
    # Commodities
    {"symbol": "XAUUSD", "ticker": "GC=F", "name": "GC Perpetual Future", "category": "Commodities", "fav": True, "decimals": 2},
    {"symbol": "SILVER", "ticker": "SI=F", "name": "SI Silver Future", "category": "Commodities", "fav": True, "decimals": 3},
    {"symbol": "OIL", "ticker": "CL=F", "name": "CL Crude Oil Future", "category": "Commodities", "fav": True, "decimals": 2},
    {"symbol": "NG", "ticker": "NG=F", "name": "NG Natural Gas Future", "category": "Commodities", "fav": False, "decimals": 3},
    {"symbol": "COPPER", "ticker": "HG=F", "name": "HG Copper Future", "category": "Commodities", "fav": False, "decimals": 4},
    # Indices
    {"symbol": "NQ", "ticker": "NQ=F", "name": "NQ E-Mini Nasdaq Future", "category": "Indices", "fav": True, "decimals": 2},
    {"symbol": "ES", "ticker": "ES=F", "name": "ES E-Mini S&P 500 Future", "category": "Indices", "fav": True, "decimals": 2},
    {"symbol": "YM", "ticker": "YM=F", "name": "YM E-Mini Dow Future", "category": "Indices", "fav": False, "decimals": 0},
    {"symbol": "DXY", "ticker": "DX-Y.NYB", "name": "US Dollar Index", "category": "Indices", "fav": False, "decimals": 3},
    # Forex
    {"symbol": "EURUSD", "ticker": "EURUSD=X", "name": "EUR/USD Spot", "category": "Forex", "fav": True, "decimals": 5},
    {"symbol": "GBPUSD", "ticker": "GBPUSD=X", "name": "GBP/USD Spot", "category": "Forex", "fav": False, "decimals": 5},
    {"symbol": "USDJPY", "ticker": "USDJPY=X", "name": "USD/JPY Spot", "category": "Forex", "fav": False, "decimals": 3},
    {"symbol": "AUDUSD", "ticker": "AUDUSD=X", "name": "AUD/USD Spot", "category": "Forex", "fav": False, "decimals": 5},
    {"symbol": "USDCAD", "ticker": "USDCAD=X", "name": "USD/CAD Spot", "category": "Forex", "fav": False, "decimals": 5},
    # Crypto
    {"symbol": "BTCUSD", "ticker": "BTC-USD", "name": "BTC Perpetual", "category": "Crypto", "fav": True, "decimals": 2},
    {"symbol": "ETHUSD", "ticker": "ETH-USD", "name": "ETH Perpetual", "category": "Crypto", "fav": False, "decimals": 2},
    {"symbol": "SOLUSD", "ticker": "SOL-USD", "name": "SOL Perpetual", "category": "Crypto", "fav": False, "decimals": 2},
    {"symbol": "XRPUSD", "ticker": "XRP-USD", "name": "XRP Perpetual", "category": "Crypto", "fav": False, "decimals": 4},
    # Stocks
    {"symbol": "NVDA", "ticker": "NVDA", "name": "NVIDIA Corp.", "category": "Stock", "fav": False, "decimals": 2},
    {"symbol": "AAPL", "ticker": "AAPL", "name": "Apple Inc.", "category": "Stock", "fav": False, "decimals": 2},
    {"symbol": "TSLA", "ticker": "TSLA", "name": "Tesla Inc.", "category": "Stock", "fav": False, "decimals": 2},
    {"symbol": "MSFT", "ticker": "MSFT", "name": "Microsoft Corp.", "category": "Stock", "fav": False, "decimals": 2},
    {"symbol": "META", "ticker": "META", "name": "Meta Platforms", "category": "Stock", "fav": False, "decimals": 2},
    # ETFs
    {"symbol": "SPY", "ticker": "SPY", "name": "SPDR S&P 500 ETF", "category": "ETFs", "fav": False, "decimals": 2},
    {"symbol": "QQQ", "ticker": "QQQ", "name": "Invesco QQQ Trust", "category": "ETFs", "fav": False, "decimals": 2},
    {"symbol": "GLD", "ticker": "GLD", "name": "SPDR Gold Shares", "category": "ETFs", "fav": False, "decimals": 2},
    {"symbol": "TLT", "ticker": "TLT", "name": "iShares 20+ Year Treasury", "category": "ETFs", "fav": False, "decimals": 2},
]
_ASSET_MAP = {a["symbol"]: a for a in ASSETS}

def _get(url: str, timeout: float = 5.0) -> Any:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def price() -> Optional[Dict[str, Any]]:
    """Returns {"price": float, "source": str} or None."""
    hook = _cache.get("price_override")  # tests
    if hook:
        return hook()
    feeds = [
        ("GC Perpetual Future", lambda: float(_get("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d")["chart"]["result"][0]["meta"]["regularMarketPrice"])),
        ("PAXG Perpetual", lambda: float(_get("https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT")["price"])),
        ("PAXG Linear", lambda: float(_get("https://api.bybit.com/v5/market/tickers?category=linear&symbol=PAXGUSDT")["result"]["list"][0]["lastPrice"])),
    ]
    for name, fn in feeds:
        try:
            px = fn()
            if px > 100:
                return {"price": round(px, 2), "source": name}
        except Exception:
            continue
    return None

def quote(symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch real live quote for any asset in ASSETS (10s cache, returns None if unavailable)."""
    sym = symbol.upper().strip()
    meta = _ASSET_MAP.get(sym)
    if not meta:
        return None
    ck = f"q:{sym}"
    hit = _cache.get(ck)
    if hit and time.time() - hit[0] < 10:
        return hit[1]
    try:
        tkr = urllib.parse.quote(meta["ticker"])
        j = _get(f"https://query1.finance.yahoo.com/v8/finance/chart/{tkr}?interval=1m&range=1d", 5.0)
        px = float(j["chart"]["result"][0]["meta"]["regularMarketPrice"])
        if px > 0:
            res = {"symbol": sym, "name": meta["name"], "category": meta["category"], "price": round(px, meta["decimals"]), "decimals": meta["decimals"]}
            _cache[ck] = (time.time(), res)
            return res
    except Exception:
        pass
    return hit[1] if hit else None

def candles(interval: str = "15m", rng: str = "5d") -> List[Dict[str, float]]:
    key = f"c:{interval}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < 60:
        return hit[1]
    hook = _cache.get("candles_override")
    if hook:
        return hook()
    try:
        j = _get(f"https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval={interval}&range={rng}", 8)
        res = j["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        out = []
        for i, t in enumerate(res["timestamp"]):
            if None in (q["open"][i], q["high"][i], q["low"][i], q["close"][i]):
                continue
            out.append({"t": t, "o": q["open"][i], "h": q["high"][i], "l": q["low"][i], "c": q["close"][i]})
        _cache[key] = (time.time(), out)
        return out
    except Exception:
        return hit[1] if hit else []

def atr(bars: List[Dict[str, float]], n: int = 14) -> float:
    if len(bars) < n + 1:
        return 0.0
    trs = [max(b["h"] - b["l"], abs(b["h"] - p["c"]), abs(b["l"] - p["c"])) for p, b in zip(bars[:-1], bars[1:])]
    return sum(trs[-n:]) / n

def ema(vals: List[float], n: int) -> float:
    if not vals: return 0.0
    k, e = 2 / (n + 1), vals[0]
    for v in vals[1:]: e = v * k + e * (1 - k)
    return e

def session(utc_hour: int) -> str:
    if 12 <= utc_hour < 16: return "NY Overlap"
    if 7 <= utc_hour < 12: return "London"
    if 16 <= utc_hour < 21: return "New York"
    return "Asian"
