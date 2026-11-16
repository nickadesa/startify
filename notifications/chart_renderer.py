import struct
import zlib
from typing import Any, Dict, List, Optional, Tuple


# Compact 5x7 bitmap font for crisp price & header labels without external dependencies
_FONT_5X7: Dict[str, List[str]] = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ",": ["00000", "00000", "00000", "00000", "00000", "00110", "01100"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
    "/": ["00001", "00010", "00100", "00100", "01000", "10000", "00000"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
}


class _Canvas:
    def __init__(self, width: int, height: int, bg: Tuple[int, int, int] = (10, 10, 10)):
        self.w = width
        self.h = height
        self.buf = bytearray([bg[0], bg[1], bg[2]] * (width * height))

    def set_px(self, x: int, y: int, color: Tuple[int, int, int]):
        if 0 <= x < self.w and 0 <= y < self.h:
            idx = (y * self.w + x) * 3
            self.buf[idx] = color[0]
            self.buf[idx + 1] = color[1]
            self.buf[idx + 2] = color[2]

    def fill_rect(self, x0: int, y0: int, x1: int, y1: int, color: Tuple[int, int, int]):
        x_start = max(0, min(x0, x1))
        x_end = min(self.w - 1, max(x0, x1))
        y_start = max(0, min(y0, y1))
        y_end = min(self.h - 1, max(y0, y1))
        r, g, b = color
        for y in range(y_start, y_end + 1):
            row_base = y * self.w * 3
            for x in range(x_start, x_end + 1):
                idx = row_base + x * 3
                self.buf[idx] = r
                self.buf[idx + 1] = g
                self.buf[idx + 2] = b

    def blend_rect(self, x0: int, y0: int, x1: int, y1: int, color: Tuple[int, int, int], alpha: float):
        x_start = max(0, min(x0, x1))
        x_end = min(self.w - 1, max(x0, x1))
        y_start = max(0, min(y0, y1))
        y_end = min(self.h - 1, max(y0, y1))
        inv = 1.0 - alpha
        r, g, b = color
        for y in range(y_start, y_end + 1):
            row_base = y * self.w * 3
            for x in range(x_start, x_end + 1):
                idx = row_base + x * 3
                self.buf[idx] = int(self.buf[idx] * inv + r * alpha)
                self.buf[idx + 1] = int(self.buf[idx + 1] * inv + g * alpha)
                self.buf[idx + 2] = int(self.buf[idx + 2] * inv + b * alpha)

    def h_line(self, x0: int, x1: int, y: int, color: Tuple[int, int, int], dashed: bool = False):
        if y < 0 or y >= self.h:
            return
        for x in range(max(0, x0), min(self.w, x1 + 1)):
            if dashed and (x // 6) % 2 == 1:
                continue
            self.set_px(x, y, color)

    def v_line(self, x: int, y0: int, y1: int, color: Tuple[int, int, int]):
        if x < 0 or x >= self.w:
            return
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            self.set_px(x, y, color)

    def draw_text(self, x: int, y: int, text: str, color: Tuple[int, int, int], scale: int = 1):
        cx = x
        for ch in text.upper():
            glyph = _FONT_5X7.get(ch, _FONT_5X7[" "])
            for gy, row in enumerate(glyph):
                for gx, bit in enumerate(row):
                    if bit == "1":
                        if scale == 1:
                            self.set_px(cx + gx, y + gy, color)
                        else:
                            self.fill_rect(cx + gx * scale, y + gy * scale, cx + (gx + 1) * scale - 1, y + (gy + 1) * scale - 1, color)
            cx += 6 * scale

    def to_png(self) -> bytes:
        raw = bytearray()
        stride = self.w * 3
        for y in range(self.h):
            raw.append(0)
            start = y * stride
            raw.extend(self.buf[start : start + stride])

        def _chunk(tag: bytes, data: bytes) -> bytes:
            return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)

        ihdr = struct.pack("!IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0)
        idat = zlib.compress(bytes(raw), level=6)
        return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")


def render_setup_chart_png(
    candles: List[Dict[str, Any]],
    signal: Dict[str, Any],
    ote: Optional[Dict[str, Any]] = None,
    width: int = 880,
    height: int = 480,
) -> bytes:
    """
    Renders a crisp architectural Black & White XAUUSD candlestick chart with Fib OTE zone,
    Entry, Stop Loss, and TP1/TP2/TP3 levels into PNG bytes (pure Python, Vercel-safe).
    """
    c = _Canvas(width, height, bg=(10, 10, 10))
    pad_l, pad_r, pad_t, pad_b = 24, 106, 48, 28
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b

    recent = candles[-45:] if candles else []
    if not recent:
        px = float(signal.get("entry", 4020.0))
        recent = [{"open": px - 2, "high": px + 3, "low": px - 4, "close": px + 1} for _ in range(30)]

    entry = float(signal.get("entry", recent[-1]["close"]))
    sl = float(signal.get("stop_loss", entry - 8.0))
    tp1 = float(signal.get("tp1", entry + 6.0))
    tp2 = float(signal.get("tp2", entry + 14.0))
    tp3 = float(signal.get("tp3", entry + 22.0))

    prices = [float(b["high"]) for b in recent] + [float(b["low"]) for b in recent] + [entry, sl, tp1, tp2, tp3]
    if ote:
        prices.extend([float(ote.get("zone_low", entry)), float(ote.get("zone_high", entry))])

    p_min = min(prices)
    p_max = max(prices)
    p_pad = max((p_max - p_min) * 0.10, 2.0)
    p_min -= p_pad
    p_max += p_pad
    p_span = max(p_max - p_min, 1e-6)

    def y_of(price: float) -> int:
        ratio = (price - p_min) / p_span
        return int(pad_t + plot_h - ratio * plot_h)

    # Subtle architectural grid
    for i in range(5):
        gy = pad_t + int(plot_h * i / 4)
        c.h_line(pad_l, width - pad_r, gy, (24, 24, 27))
        grid_px = p_max - (p_span * i / 4)
        c.draw_text(width - pad_r + 8, gy - 3, f"{grid_px:.2f}", (113, 113, 122), scale=1)

    # Fib OTE Zone Band
    if ote and ote.get("zone_low") and ote.get("zone_high"):
        y_hi = y_of(float(ote["zone_high"]))
        y_lo = y_of(float(ote["zone_low"]))
        c.blend_rect(pad_l, y_hi, width - pad_r, y_lo, (0, 173, 255), 0.14)
        c.h_line(pad_l, width - pad_r, y_hi, (0, 120, 180), dashed=True)
        c.h_line(pad_l, width - pad_r, y_lo, (0, 120, 180), dashed=True)

    # Candlesticks
    n = len(recent)
    step = plot_w / max(n, 1)
    body_w = max(int(step * 0.58), 3)
    for i, bar in enumerate(recent):
        o = float(bar["open"])
        h = float(bar["high"])
        l = float(bar["low"])
        cl = float(bar["close"])
        bull = cl >= o
        col = (48, 209, 88) if bull else (255, 69, 58)
        cx = int(pad_l + (i + 0.5) * step)
        c.v_line(cx, y_of(h), y_of(l), col)
        yo, yc = y_of(o), y_of(cl)
        if abs(yo - yc) < 1:
            c.h_line(cx - body_w // 2, cx + body_w // 2, yo, col)
        else:
            c.fill_rect(cx - body_w // 2, yo, cx + body_w // 2, yc, col)

    # Level lines + right-axis price tags
    levels = [
        ("ENTRY", entry, (0, 173, 255), False),
        ("SL", sl, (255, 69, 58), True),
        ("TP1", tp1, (48, 209, 88), True),
        ("TP2", tp2, (34, 197, 94), True),
        ("TP3", tp3, (16, 185, 129), True),
    ]
    for label, lvl, col, dashed in levels:
        ly = y_of(lvl)
        c.h_line(pad_l, width - pad_r, ly, col, dashed=dashed)
        c.fill_rect(width - pad_r + 2, ly - 7, width - 4, ly + 7, col)
        txt_col = (0, 0, 0) if col[1] > 150 else (255, 255, 255)
        c.draw_text(width - pad_r + 6, ly - 3, f"{label} {lvl:.1f}", txt_col, scale=1)

    # Header bar
    direction = str(signal.get("direction", "long")).upper()
    score = int(signal.get("conviction_score", 0))
    c.draw_text(pad_l, 14, f"XAUUSD {direction}  STARTIFY 8-AI DESK", (255, 255, 255), scale=2)
    c.draw_text(pad_l, 32, f"CONVICTION {score}/100  LOT {signal.get('lot', 0.01)}  RISK {signal.get('risk_pct', 0.5)}%", (161, 161, 170), scale=1)

    # Border
    c.h_line(pad_l, width - pad_r, pad_t, (39, 39, 42))
    c.h_line(pad_l, width - pad_r, height - pad_b, (39, 39, 42))
    c.v_line(pad_l, pad_t, height - pad_b, (39, 39, 42))
    c.v_line(width - pad_r, pad_t, height - pad_b, (39, 39, 42))

    return c.to_png()
