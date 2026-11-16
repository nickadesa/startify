import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.price_provider import load_dotenv_if_present


def fetch_twelvedata_series(interval: str, outputsize: int = 5000) -> list[dict]:
    load_dotenv_if_present()
    api_key = os.environ.get("TWELVEDATA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("TWELVEDATA_API_KEY not found in .env or environment")

    url = (
        f"https://api.twelvedata.com/time_series"
        f"?symbol=XAU/USD&interval={interval}&outputsize={outputsize}&apikey={api_key}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Startify-XAUUSD/2.5"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    values = payload.get("values") or []
    if not values:
        raise RuntimeError(f"TwelveData returned no values for {interval}: {payload.get('message')}")

    # TwelveData returns newest-first; reverse to chronological UTC ISO-8601
    bars = []
    for row in reversed(values):
        dt = row["datetime"].replace(" ", "T")
        if not dt.endswith("Z"):
            dt += "Z"
        bars.append(
            {
                "time": dt,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume") or 1000.0),
            }
        )
    return bars


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    for tf_label, interval, fname in [
        ("H4", "4h", "XAUUSD_h4_bid.csv"),
        ("H1", "1h", "XAUUSD_h1_bid.csv"),
        ("M15", "15min", "XAUUSD_m15_bid.csv"),
        ("M5", "5min", "XAUUSD_m5_bid.csv"),
    ]:
        bars = fetch_twelvedata_series(interval=interval, outputsize=5000)
        csv_path = out_dir / fname
        lines = ["time,open,high,low,close,volume"]
        for b in bars:
            lines.append(f"{b['time']},{b['open']},{b['high']},{b['low']},{b['close']},{b['volume']}")
        csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Saved {csv_path.name} ({tf_label}): {len(bars):,} bars ({bars[0]['time']} -> {bars[-1]['time']})")


if __name__ == "__main__":
    main()
