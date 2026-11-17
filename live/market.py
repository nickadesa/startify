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

def candles(interval: str = "15m", rng: str = "5d", symbol: str = "XAUUSD") -> List[Dict[str, float]]:
    sym = symbol.upper().strip()
    meta = _ASSET_MAP.get(sym, _ASSET_MAP["XAUUSD"])
    key = f"c:{sym}:{interval}:{rng}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < 60:
        return hit[1]
    if sym == "XAUUSD":
        hook = _cache.get("candles_override")
        if hook:
            return hook()
    try:
        tkr = urllib.parse.quote(meta["ticker"])
        j = _get(f"https://query1.finance.yahoo.com/v8/finance/chart/{tkr}?interval={interval}&range={rng}", 8)
        res = j["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        vols = q.get("volume") or [0] * len(res["timestamp"])
        out = []
        for i, t in enumerate(res["timestamp"]):
            if None in (q["open"][i], q["high"][i], q["low"][i], q["close"][i]):
                continue
            out.append({
                "t": t,
                "o": q["open"][i],
                "h": q["high"][i],
                "l": q["low"][i],
                "c": q["close"][i],
                "v": float(vols[i] or 0),
            })
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

def news_events() -> List[Dict[str, Any]]:
    """ForexFactory high-impact economic calendar cached for 15m."""
    hit = _cache.get("ff_news")
    if hit and time.time() - hit[0] < 900:
        return hit[1]
    try:
        raw = _get("https://nfs.faireconomy.media/ff_calendar_thisweek.json", 6.0)
        out = []
        for ev in (raw if isinstance(raw, list) else []):
            if str(ev.get("impact", "")).lower() in ("high", "medium"):
                out.append({
                    "title": ev.get("title", ""),
                    "country": ev.get("country", ""),
                    "date": ev.get("date", ""),
                    "impact": ev.get("impact", ""),
                    "forecast": ev.get("forecast", ""),
                    "previous": ev.get("previous", ""),
                })
        _cache["ff_news"] = (time.time(), out)
        return out
    except Exception:
        return hit[1] if hit else []

def is_news_window(minutes: int = 15) -> Optional[Dict[str, Any]]:
    """Return active High-Impact USD news event if within +/- `minutes` of now."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for ev in news_events():
        if str(ev.get("impact", "")).lower() != "high" or ev.get("country") != "USD":
            continue
        ds = ev.get("date", "")
        if not ds:
            continue
        try:
            dt = datetime.fromisoformat(ds.replace("Z", "+00:00"))
            if abs((dt - now).total_seconds()) <= minutes * 60:
                return ev
        except Exception:
            continue
    return None

def volume_profile(bars: List[Dict[str, float]], bins: int = 16) -> Dict[str, float]:
    """Approximate Volume Profile (POC, VAH, VAL) from OHLCV bars."""
    if not bars or len(bars) < 5:
        return {}
    lo = min(b["l"] for b in bars)
    hi = max(b["h"] for b in bars)
    if hi <= lo:
        return {}
    step = (hi - lo) / bins
    buckets = [0.0] * bins
    for b in bars:
        mid = (b["h"] + b["l"] + b["c"]) / 3.0
        idx = min(bins - 1, max(0, int((mid - lo) / step)))
        w = b.get("v") or (b["h"] - b["l"]) or 1.0
        buckets[idx] += float(w)
    poc_i = max(range(bins), key=lambda i: buckets[i])
    total = sum(buckets) or 1.0
    l_i = r_i = poc_i
    acc = buckets[poc_i]
    while acc / total < 0.70 and (l_i > 0 or r_i < bins - 1):
        lv = buckets[l_i - 1] if l_i > 0 else -1
        rv = buckets[r_i + 1] if r_i < bins - 1 else -1
        if lv >= rv:
            l_i -= 1; acc += lv
        else:
            r_i += 1; acc += rv
    return {
        "poc": round(lo + (poc_i + 0.5) * step, 2),
        "vah": round(lo + (r_i + 1) * step, 2),
        "val": round(lo + l_i * step, 2),
    }

def macro_context() -> Dict[str, Any]:
    """Cached cross-asset snapshot: DXY, TLT, SILVER, Gold/Silver ratio."""
    hit = _cache.get("macro_ctx")
    if hit and time.time() - hit[0] < 120:
        return hit[1]
    ctx: Dict[str, Any] = {}
    for sym in ("DXY", "TLT", "SILVER", "XAUUSD"):
        q = quote(sym)
        if q:
            ctx[sym] = q["price"]
    if ctx.get("XAUUSD") and ctx.get("SILVER"):
        ctx["gold_silver_ratio"] = round(ctx["XAUUSD"] / ctx["SILVER"], 2)
    _cache["macro_ctx"] = (time.time(), ctx)
    return ctx


def killzone_utc4(utc_dt=None) -> Dict[str, Any]:
    """ICT Killzone schedule in New York (UTC-4) fixed offset per user spec."""
    from datetime import datetime, timedelta, timezone
    now_utc = utc_dt or datetime.now(timezone.utc)
    ny = now_utc - timedelta(hours=4)
    hm = ny.hour * 60 + ny.minute
    windows = [
        ("Asian Killzone", 18 * 60, 21 * 60, "18:00-21:00 UTC-4"),
        ("London Killzone", 2 * 60, 5 * 60, "02:00-05:00 UTC-4"),
        ("New York AM Killzone", 7 * 60, 10 * 60, "07:00-10:00 UTC-4"),
        ("New York PM Session", 12 * 60, 16 * 60, "12:00-16:00 UTC-4"),
    ]
    for name, s, e, lbl in windows:
        if s <= hm < e:
            return {"active": True, "name": name, "window": lbl, "ny_time": ny.strftime("%H:%M"), "ny_hour": ny.hour}
    return {"active": False, "name": "Off-Killzone", "window": "Outside KZ", "ny_time": ny.strftime("%H:%M"), "ny_hour": ny.hour}


def open_interest(symbol: str = "XAUUSD") -> Dict[str, Any]:
    """Fetch COMEX GC=F / GLD Options Open Interest snapshot (cached 5m)."""
    ck = f"oi:{symbol}"
    hit = _cache.get(ck)
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    out: Dict[str, Any] = {"symbol": symbol, "futures_oi": None, "options_call_oi": 0, "options_put_oi": 0, "pc_oi_ratio": None, "source": "unavailable"}
    try:
        j = _get("https://query1.finance.yahoo.com/v7/finance/quote?symbols=GC=F", 5.0)
        res = (j.get("quoteResponse", {}).get("result") or [{}])[0]
        if res.get("openInterest") is not None:
            out["futures_oi"] = int(res["openInterest"])
            out["source"] = "Yahoo GC=F"
    except Exception:
        pass
    try:
        opt = _get("https://query1.finance.yahoo.com/v7/finance/options/GLD", 5.0)
        chain = (opt.get("optionChain", {}).get("result") or [{}])[0].get("options") or []
        if chain:
            c_oi = sum(int(x.get("openInterest") or 0) for x in chain[0].get("calls", []))
            p_oi = sum(int(x.get("openInterest") or 0) for x in chain[0].get("puts", []))
            if c_oi + p_oi > 0:
                out["options_call_oi"] = c_oi
                out["options_put_oi"] = p_oi
                out["pc_oi_ratio"] = round(p_oi / max(c_oi, 1), 2)
                out["source"] = (out["source"] + " + GLD Options OI").replace("unavailable + ", "")
    except Exception:
        pass
    _cache[ck] = (time.time(), out)
    return out


