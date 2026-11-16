import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.price_provider import PriceProvider


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    provider = PriceProvider("XAUUSD")

    for tf_name, fname, limit in [
        ("H4", "XAUUSD_h4_bid.csv", 180),
        ("H1", "XAUUSD_h1_bid.csv", 480),
        ("M15", "XAUUSD_m15_bid.csv", 720),
        ("M5", "XAUUSD_m5_bid.csv", 1440),
    ]:
        bars = provider.get_closed_candles(tf_name, as_of_time="2026-11-15T20:00:00Z", limit=limit, use_live_api=True)
        csv_path = out_dir / fname
        lines = ["time,open,high,low,close,volume"]
        for b in bars:
            lines.append(f"{b['time']},{b['open']},{b['high']},{b['low']},{b['close']},{b['volume']}")
        csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Saved {csv_path.name}: {len(bars)} bars ({bars[0]['time']} -> {bars[-1]['time']})")


if __name__ == "__main__":
    main()
