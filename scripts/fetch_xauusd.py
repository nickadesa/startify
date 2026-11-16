#!/usr/bin/env python3
"""
fetch_xauusd.py - ดึงข้อมูลย้อนหลัง XAUUSD จาก Dukascopy เพื่อใช้ backtest

ติดตั้ง:
    pip install dukascopy-python pandas

ตัวอย่างการใช้งาน:
    python fetch_xauusd.py                          # H1 ตั้งแต่ 2007-01-01 ถึงปัจจุบัน
    python fetch_xauusd.py --base m15               # ดึง M15 (ใหญ่และช้ากว่า)
    python fetch_xauusd.py --start 2020-01-01       # ทดสอบช่วงสั้นก่อน
    python fetch_xauusd.py --side ask               # ใช้ราคา ask แทน bid
    python fetch_xauusd.py --refresh                # ดึงใหม่ทุกปี (ไม่ใช้แคช)

ผลลัพธ์ (โฟลเดอร์ data/):
    raw/XAUUSD_<base>_<side>_<year>.csv   ไฟล์แคชรายปี (ดึงต่อจากเดิมได้ถ้าหยุดกลางทาง)
    XAUUSD_<tf>_<side>.csv                ไฟล์รวม เช่น h1, h4, d1 (และ m15 ถ้าเลือก)

หมายเหตุ:
- เวลาทั้งหมดเป็น UTC
- ปีไหนที่ Dukascopy ไม่มีข้อมูล สคริปต์จะข้ามและแจ้งเตือน
- ตรวจเงื่อนไขการใช้งานข้อมูลของ Dukascopy ก่อนนำไปใช้จริง
"""

import argparse
import inspect
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

try:
    import dukascopy_python as dk
except ImportError:
    sys.exit("ยังไม่ได้ติดตั้ง dukascopy-python  ->  pip install dukascopy-python pandas")

OHLCV = ["open", "high", "low", "close", "volume"]


# ---------------------------------------------------------------------------
# ส่วนเรียกไลบรารี (รองรับทั้งเวอร์ชันเก่าและใหม่ของ dukascopy-python)
# ---------------------------------------------------------------------------
def get_instrument():
    inst_mod = getattr(dk, "instruments", None)
    for name in ("INSTRUMENT_FX_METALS_XAU_USD", "INSTRUMENT_XAU_USD"):
        if inst_mod is not None and hasattr(inst_mod, name):
            return getattr(inst_mod, name)
        if hasattr(dk, name):
            return getattr(dk, name)
    return "XAU/USD"  # ถ้าหาค่าคงที่ไม่เจอ ลองใช้ชื่อ instrument ตรงๆ


def get_offer_side(side: str):
    if hasattr(dk, "OfferSide"):
        return dk.OfferSide.BID if side == "bid" else dk.OfferSide.ASK
    name = "OFFER_SIDE_BID" if side == "bid" else "OFFER_SIDE_ASK"
    return getattr(dk, name)


def fetch_chunk(instrument, base: str, side: str, start: datetime, end: datetime) -> pd.DataFrame:
    """ดึงข้อมูลช่วงเวลาหนึ่งจาก Dukascopy"""
    offer = get_offer_side(side)
    if hasattr(dk, "fetch_candles"):
        interval, unit = (15, dk.TimeUnit.MINUTE) if base == "m15" else (1, dk.TimeUnit.HOUR)
        s_utc = start.replace(tzinfo=timezone.utc) if start.tzinfo is None else start
        e_utc = end.replace(tzinfo=timezone.utc) if end.tzinfo is None else end
        candles = dk.fetch_candles(instrument, interval, unit, offer, s_utc, e_utc)
        return dk.to_dataframe(candles)

    params = inspect.signature(dk.fetch).parameters
    if "time_unit" in params:
        interval, unit = (15, dk.TIME_UNIT_MIN) if base == "m15" else (1, dk.TIME_UNIT_HOUR)
        return dk.fetch(instrument, interval, unit, offer, start, end)

    interval = dk.INTERVAL_MIN_15 if base == "m15" else dk.INTERVAL_HOUR_1
    return dk.fetch(instrument, interval, offer, start, end)



def normalize(df: pd.DataFrame) -> pd.DataFrame:
    """ปรับให้เป็นรูปแบบเดียวกัน: index = เวลา UTC, คอลัมน์ OHLCV"""
    if df is None or len(df) == 0:
        return pd.DataFrame(columns=OHLCV)

    df = df.copy()
    df.columns = [str(c).lower() for c in df.columns]

    if not isinstance(df.index, pd.DatetimeIndex):
        for col in ("timestamp", "time", "datetime", "date"):
            if col in df.columns:
                df = df.set_index(pd.to_datetime(df[col]))
                break

    idx = pd.DatetimeIndex(df.index)
    idx = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
    df.index = idx
    df.index.name = "time"

    missing = [c for c in OHLCV if c not in df.columns]
    for c in missing:
        df[c] = 0.0
    return df[OHLCV].sort_index()


# ---------------------------------------------------------------------------
# ดึงข้อมูลรายปีพร้อมแคชและ retry
# ---------------------------------------------------------------------------
def download_year(instrument, year, base, side, raw_dir: Path, start, end, refresh, retries=3):
    path = raw_dir / f"XAUUSD_{base}_{side}_{year}.csv"
    now_year = datetime.now(timezone.utc).year

    if path.exists() and not refresh and year != now_year:
        df = pd.read_csv(path, index_col="time", parse_dates=True)
        print(f"  {year}: ใช้แคช ({len(df):,} แท่ง)")
        return df

    y_start = max(start, datetime(year, 1, 1))
    y_end = min(end, datetime(year + 1, 1, 1))
    if y_start >= y_end:
        return pd.DataFrame(columns=OHLCV)

    for attempt in range(1, retries + 1):
        try:
            raw = fetch_chunk(instrument, base, side, y_start, y_end)
            df = normalize(raw)
            if df.empty:
                print(f"  {year}: ไม่มีข้อมูล (ข้าม)")
                return df
            df.to_csv(path)
            print(f"  {year}: ดึงสำเร็จ {len(df):,} แท่ง")
            return df
        except Exception as exc:  # noqa: BLE001
            wait = 5 * attempt
            print(f"  {year}: พลาดครั้งที่ {attempt}/{retries} ({exc}) รอ {wait}s")
            time.sleep(wait)

    print(f"  {year}: ล้มเหลวหลัง retry ข้ามปีนี้ (รันซ้ำเพื่อดึงต่อได้)")
    return pd.DataFrame(columns=OHLCV)


# ---------------------------------------------------------------------------
# แปลงไทม์เฟรมและตรวจคุณภาพข้อมูล
# ---------------------------------------------------------------------------
def resample(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    out = df.resample(rule, label="left", closed="left").agg(agg)
    return out.dropna(subset=["open", "high", "low", "close"])


def quality_report(df: pd.DataFrame, name: str):
    print(f"\n[ตรวจคุณภาพ {name}]")
    print(f"  จำนวนแท่ง : {len(df):,}")
    print(f"  ช่วงเวลา  : {df.index.min()}  ->  {df.index.max()}")
    print(f"  ราคาต่ำสุด/สูงสุด : {df['low'].min():.2f} / {df['high'].max():.2f}")

    dup = df.index.duplicated().sum()
    bad = ((df["high"] < df["low"]) | (df["high"] < df[["open", "close"]].max(axis=1))
           | (df["low"] > df[["open", "close"]].min(axis=1))).sum()
    zero_vol = (df["volume"] == 0).sum()
    print(f"  แท่งซ้ำ: {dup} | แท่งผิดตรรกะ OHLC: {bad} | แท่ง volume=0: {zero_vol}")

    gaps = df.index.to_series().diff()
    big = gaps[gaps > pd.Timedelta(days=4)]
    if len(big):
        print(f"  ช่องว่างเกิน 4 วัน: {len(big)} จุด (ตัวอย่าง: {', '.join(str(t.date()) for t in big.index[:5])})")
    else:
        print("  ไม่พบช่องว่างเกิน 4 วัน")


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="ดึงข้อมูล XAUUSD จาก Dukascopy")
    ap.add_argument("--start", default="2007-01-01", help="วันเริ่มต้น YYYY-MM-DD (ค่าเริ่มต้น 2007-01-01)")
    ap.add_argument("--end", default=None, help="วันสิ้นสุด YYYY-MM-DD (ค่าเริ่มต้น = ปัจจุบัน)")
    ap.add_argument("--base", choices=["h1", "m15"], default="h1", help="ไทม์เฟรมที่ดึงจริง (ค่าเริ่มต้น h1)")
    ap.add_argument("--side", choices=["bid", "ask"], default="bid", help="ประเภทราคา (ค่าเริ่มต้น bid)")
    ap.add_argument("--out", default="data", help="โฟลเดอร์เก็บผลลัพธ์")
    ap.add_argument("--refresh", action="store_true", help="ไม่ใช้แคช ดึงใหม่ทั้งหมด")
    args = ap.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d")
    end = datetime.strptime(args.end, "%Y-%m-%d") if args.end else datetime.utcnow()

    out_dir = Path(args.out)
    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    instrument = get_instrument()
    print(f"XAUUSD | base={args.base} | side={args.side} | {start.date()} -> {end.date()}")

    frames = []
    for year in range(start.year, end.year + 1):
        df = download_year(instrument, year, args.base, args.side, raw_dir, start, end, args.refresh)
        if not df.empty:
            frames.append(df)
        time.sleep(1)  # เว้นจังหวะเล็กน้อย ไม่ยิงถี่เกินไป

    if not frames:
        sys.exit("ไม่ได้ข้อมูลเลย ลองทดสอบช่วงสั้นๆ เช่น --start 2024-01-01 หรือตรวจอินเทอร์เน็ต")

    base_df = pd.concat(frames)
    base_df = base_df[~base_df.index.duplicated(keep="last")].sort_index()

    outputs = {args.base: base_df}
    if args.base == "m15":
        outputs["h1"] = resample(base_df, "1h")
    outputs["h4"] = resample(outputs.get("h1", base_df), "4h")
    outputs["d1"] = resample(outputs.get("h1", base_df), "1D")

    for tf, df in outputs.items():
        path = out_dir / f"XAUUSD_{tf}_{args.side}.csv"
        df.to_csv(path)
        print(f"บันทึก {path}  ({len(df):,} แท่ง)")

    quality_report(base_df, args.base.upper())
    print("\nเสร็จสิ้น เวลาในไฟล์ทั้งหมดเป็น UTC")


if __name__ == "__main__":
    main()
