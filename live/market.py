"""Real market data only. If every feed fails the engine simply skips the tick —
it never invents a price."""
from __future__ import annotations
import json, os, time, urllib.request
from typing import Any, Dict, List, Optional

UA = {"User-Agent": "Mozilla/5.0 Startify/3.0"}
_cache: Dict[str, Any] = {}

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
        ("yahoo GC=F", lambda: float(_get("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d")["chart"]["result"][0]["meta"]["regularMarketPrice"])),
        ("binance PAXG", lambda: float(_get("https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT")["price"])),
        ("bybit PAXG", lambda: float(_get("https://api.bybit.com/v5/market/tickers?category=linear&symbol=PAXGUSDT")["result"]["list"][0]["lastPrice"])),
    ]
    for name, fn in feeds:
        try:
            px = fn()
            if px > 100:
                return {"price": round(px, 2), "source": name}
        except Exception:
            continue
    return None

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
