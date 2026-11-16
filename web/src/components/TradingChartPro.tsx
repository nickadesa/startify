import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Camera,
  ChevronDown,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  RotateCcw,
  Ruler,
  Send,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AssetIcon } from './AssetIcon';

export interface ChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  delta?: number;
}

export interface ChartSignalOverlay {
  direction: string;
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  lot?: number;
  conviction_score?: number;
}

export interface ChartOteOverlay {
  zone_low: number;
  zone_high: number;
  sweet_spot: number;
}

export interface ChartOiWalls {
  bid_wall?: { price: number; qty: number };
  ask_wall?: { price: number; qty: number };
}

type ToolType =
  | 'cursor'
  | 'line'
  | 'ray'
  | 'hline'
  | 'vline'
  | 'channel'
  | 'fib'
  | 'box'
  | 'text'
  | 'draw'
  | 'rr_long'
  | 'rr_short'
  | 'measure';

interface DrawingItem {
  id: string;
  type: Exclude<ToolType, 'cursor'>;
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  text?: string;
  points?: { x: number; y: number }[];
  color: string;
  lineWidth?: number;
}

interface ChartSettings {
  bg: string;
  bullBody: string;
  bullBorder: string;
  bullWick: string;
  bearBody: string;
  bearBorder: string;
  bearWick: string;
  showHorzGrid: boolean;
  showVertGrid: boolean;
  showWatermark: boolean;
  showCountdown: boolean;
  crosshairStyle: 'dashed' | 'solid';
}

type IndicatorKey =
  | 'ema20'
  | 'ema50'
  | 'ema200'
  | 'sma50'
  | 'bb'
  | 'vwap'
  | 'ote'
  | 'fvg'
  | 'bos'
  | 'killzones'
  | 'volume'
  | 'orderflow'
  | 'vpvr'
  | 'tpo'
  | 'oiWalls'
  | 'signalLevels'
  | 'rsi'
  | 'macd';

interface IndicatorMeta {
  key: IndicatorKey;
  label: string;
  category: 'Trend & Volatility' | 'ICT / Smart Money' | 'Orderflow & Volume' | 'Oscillators';
  color: string;
}

const INDICATOR_CATALOG: IndicatorMeta[] = [
  { key: 'ema20', label: 'EMA 20', category: 'Trend & Volatility', color: '#FFFFFF' },
  { key: 'ema50', label: 'EMA 50', category: 'Trend & Volatility', color: '#A1A1AA' },
  { key: 'ema200', label: 'EMA 200', category: 'Trend & Volatility', color: '#FFD60A' },
  { key: 'sma50', label: 'SMA 50', category: 'Trend & Volatility', color: '#E4E4E7' },
  { key: 'bb', label: 'Bollinger Bands (20,2)', category: 'Trend & Volatility', color: '#71717A' },
  { key: 'vwap', label: 'Session VWAP', category: 'Trend & Volatility', color: '#F59E0B' },
  { key: 'ote', label: 'Fib OTE (0.62–0.79)', category: 'ICT / Smart Money', color: '#FFFFFF' },
  { key: 'fvg', label: 'FVG (Fair Value Gaps)', category: 'ICT / Smart Money', color: '#30D158' },
  { key: 'bos', label: 'BOS / CHoCH Swings', category: 'ICT / Smart Money', color: '#E4E4E7' },
  { key: 'killzones', label: 'London / NY Killzones', category: 'ICT / Smart Money', color: '#52525B' },
  { key: 'volume', label: 'Volume Bars', category: 'Orderflow & Volume', color: '#71717A' },
  { key: 'orderflow', label: 'Footprint Delta', category: 'Orderflow & Volume', color: '#30D158' },
  { key: 'vpvr', label: 'VPVR (Volume Profile)', category: 'Orderflow & Volume', color: '#D4D4D8' },
  { key: 'tpo', label: 'TPO (Market Profile)', category: 'Orderflow & Volume', color: '#FFD60A' },
  { key: 'oiWalls', label: 'OI Liquidity Walls', category: 'Orderflow & Volume', color: '#30D158' },
  { key: 'signalLevels', label: 'Desk Entry / SL / TP', category: 'Orderflow & Volume', color: '#FFFFFF' },
  { key: 'rsi', label: 'RSI (14)', category: 'Oscillators', color: '#FFFFFF' },
  { key: 'macd', label: 'MACD (12,26,9)', category: 'Oscillators', color: '#30D158' },
];

const ALL_TIMEFRAMES = ['M1', 'M5', 'M15', 'M45', '1H', '4H', '1D', '1W', '1M'] as const;
const PINNED_TIMEFRAMES = ['M5', 'M15', '1H', '4H'] as const;

const TF_SECONDS: Record<string, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M45: 2700,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000,
};

interface TradingChartProProps {
  candles: ChartCandle[];
  symbol?: string;
  timeframe: string;
  onTimeframeChange?: (tf: string) => void;
  ote?: ChartOteOverlay | null;
  signal?: ChartSignalOverlay | null;
  oiWalls?: ChartOiWalls | null;
  livePrice?: number | null;
  wsConnected?: boolean;
  netDelta?: number;
  cvdUsd?: number;
  defaultFullscreen?: boolean;
  onExitFullscreen?: () => void;
}

function calcEMA(values: number[], period: number): (number | null)[] {
  const res: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return res;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  res[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    res[i] = ema;
  }
  return res;
}

function calcSMA(values: number[], period: number): (number | null)[] {
  const res: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) res[i] = sum / period;
  }
  return res;
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const res: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return res;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  res[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    res[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return res;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export const TradingChartPro: React.FC<TradingChartProProps> = ({
  candles,
  symbol = 'XAUUSD',
  timeframe,
  onTimeframeChange,
  ote,
  signal,
  oiWalls,
  livePrice,
  wsConnected = false,
  netDelta = 0,
  cvdUsd = 0,
  defaultFullscreen = false,
  onExitFullscreen,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(defaultFullscreen);
  const [showTfDropdown, setShowTfDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'candles' | 'canvas' | 'scales'>('candles');
  const [showIndicatorsModal, setShowIndicatorsModal] = useState(false);
  const [tool, setTool] = useState<ToolType>('cursor');
  const [drawings, setDrawings] = useState<DrawingItem[]>([]);
  const [activeDraft, setActiveDraft] = useState<DrawingItem | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [textPopover, setTextPopover] = useState<{
    x: number;
    y: number;
    idx: number;
    price: number;
    value: string;
    editingId?: string;
  } | null>(null);

  const [sendingDiscord, setSendingDiscord] = useState(false);
  const [discordToast, setDiscordToast] = useState<string | null>(null);
  const [resizeTick, setResizeTick] = useState(0);
  const [countdownText, setCountdownText] = useState('00:00');

  useEffect(() => {
    const updateClock = () => {
      const secPerBar = TF_SECONDS[timeframe] || 900;
      const nowSec = Math.floor(Date.now() / 1000);
      const rem = secPerBar - (nowSec % secPerBar);
      const h = Math.floor(rem / 3600);
      const m = Math.floor((rem % 3600) / 60);
      const s = rem % 60;
      setCountdownText(
        h > 0
          ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, [timeframe]);

  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [settings, setSettings] = useState<ChartSettings>({
    bg: '#000000',
    bullBody: '#30D158',
    bullBorder: '#30D158',
    bullWick: '#30D158',
    bearBody: '#FF453A',
    bearBorder: '#FF453A',
    bearWick: '#FF453A',
    showHorzGrid: true,
    showVertGrid: true,
    showWatermark: true,
    showCountdown: true,
    crosshairStyle: 'dashed',
  });

  const [activeIndicators, setActiveIndicators] = useState<Record<IndicatorKey, boolean>>({
    ema20: true,
    ema50: false,
    ema200: false,
    sma50: false,
    bb: false,
    vwap: false,
    ote: true,
    fvg: true,
    bos: false,
    killzones: false,
    volume: true,
    orderflow: true,
    vpvr: true,
    tpo: false,
    oiWalls: true,
    signalLevels: true,
    rsi: false,
    macd: false,
  });

  const [hiddenIndicators, setHiddenIndicators] = useState<Partial<Record<IndicatorKey, boolean>>>({});

  const isIndVisible = useCallback(
    (k: IndicatorKey) => Boolean(activeIndicators[k] && !hiddenIndicators[k]),
    [activeIndicators, hiddenIndicators]
  );

  const [visibleCount, setVisibleCount] = useState(65);
  const [rightOffset, setRightOffset] = useState(5);
  const [yScaleFactor, setYScaleFactor] = useState(1.0);
  const [yPanOffset, setYPanOffset] = useState(0.0);

  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'yscale' | 'draw' | 'move_drawing' | 'handle1' | 'handle2';
    startX: number;
    startY: number;
    startOffset: number;
    startYScale: number;
    startYPan: number;
    origDrawing?: DrawingItem;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startOffset: 0,
    startYScale: 1,
    startYPan: 0,
  });

  const [crosshair, setCrosshair] = useState<{
    x: number;
    y: number;
    idx: number;
    price: number;
    candle: ChartCandle | null;
  } | null>(null);

  const safeCandles = useMemo(() => {
    if (candles.length > 0) return candles;
    const base = livePrice || 4025;
    return Array.from({ length: 60 }, (_, i) => {
      const o = base + Math.sin(i * 0.3) * 4;
      const c = base + Math.sin((i + 1) * 0.3) * 4;
      return {
        time: new Date(Date.now() - (60 - i) * 900000).toISOString(),
        open: Number(o.toFixed(2)),
        high: Number((Math.max(o, c) + 1.8).toFixed(2)),
        low: Number((Math.min(o, c) - 1.8).toFixed(2)),
        close: Number(c.toFixed(2)),
        volume: 120 + (i % 7) * 25,
        delta: (c >= o ? 1 : -1) * (12 + (i % 5) * 8),
      };
    });
  }, [candles, livePrice]);

  // Precompute indicator series
  const seriesData = useMemo(() => {
    const closes = safeCandles.map((c) => c.close);
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, 200);
    const sma50 = calcSMA(closes, 50);
    const sma20 = calcSMA(closes, 20);
    const bbUpper = closes.map((_, i) => {
      if (i < 19 || sma20[i] === null) return null;
      let sumSq = 0;
      for (let j = i - 19; j <= i; j++) {
        const d = closes[j] - (sma20[i] as number);
        sumSq += d * d;
      }
      return (sma20[i] as number) + 2 * Math.sqrt(sumSq / 20);
    });
    const bbLower = closes.map((_, i) => {
      if (i < 19 || sma20[i] === null) return null;
      let sumSq = 0;
      for (let j = i - 19; j <= i; j++) {
        const d = closes[j] - (sma20[i] as number);
        sumSq += d * d;
      }
      return (sma20[i] as number) - 2 * Math.sqrt(sumSq / 20);
    });
    let cumPV = 0;
    let cumV = 0;
    const vwap = safeCandles.map((c) => {
      const typical = (c.high + c.low + c.close) / 3;
      const vol = c.volume || 50;
      cumPV += typical * vol;
      cumV += vol;
      return cumV > 0 ? cumPV / cumV : typical;
    });
    const rsi = calcRSI(closes, 14);
    const ema12 = calcEMA(closes, 12);
    const ema26 = calcEMA(closes, 26);
    const macdLine = closes.map((_, i) =>
      ema12[i] !== null && ema26[i] !== null ? (ema12[i] as number) - (ema26[i] as number) : null
    );
    const validMacd = macdLine.map((v) => v ?? 0);
    const macdSignal = calcEMA(validMacd, 9);
    const macdHist = macdLine.map((v, i) =>
      v !== null && macdSignal[i] !== null ? v - (macdSignal[i] as number) : null
    );
    return { ema20, ema50, ema200, sma50, sma20, bbUpper, bbLower, vwap, rsi, macdLine, macdSignal, macdHist };
  }, [safeCandles]);

  const hasSubPane = isIndVisible('rsi') || isIndVisible('macd');

  const getLayout = useCallback(
    (width: number, height: number) => {
      const padL = 10;
      const padR = 78;
      const padT = 34;
      const padB = 24;
      const subH = hasSubPane ? Math.min(115, Math.floor(height * 0.24)) : 0;
      const subGap = hasSubPane ? 8 : 0;
      const plotW = Math.max(width - padL - padR, 120);
      const plotH = Math.max(height - padT - padB - subH - subGap, 140);

      const n = safeCandles.length;
      const endIdx = n - 1 + rightOffset;
      const startIdx = endIdx - visibleCount;
      const sliceStart = Math.max(0, Math.floor(startIdx));
      const sliceEnd = Math.min(n - 1, Math.ceil(endIdx));

      let minP = Infinity;
      let maxP = -Infinity;
      for (let i = sliceStart; i <= sliceEnd; i++) {
        const b = safeCandles[i];
        if (!b) continue;
        if (b.low < minP) minP = b.low;
        if (b.high > maxP) maxP = b.high;
      }
      if (!Number.isFinite(minP) || !Number.isFinite(maxP)) {
        minP = (livePrice || 4000) - 15;
        maxP = (livePrice || 4000) + 15;
      }
      const mid = (minP + maxP) / 2 + yPanOffset;
      const halfSpan = Math.max((maxP - minP) * 0.62, 3.0) * yScaleFactor;
      const pMin = mid - halfSpan;
      const pMax = mid + halfSpan;

      const xToIdx = (px: number) => startIdx + ((px - padL) / plotW) * visibleCount;
      const idxToX = (idx: number) => padL + ((idx - startIdx) / visibleCount) * plotW;
      const yToPrice = (py: number) => pMax - ((py - padT) / plotH) * (pMax - pMin);
      const priceToY = (price: number) => padT + ((pMax - price) / (pMax - pMin)) * plotH;

      return {
        padL,
        padR,
        padT,
        padB,
        subH,
        subGap,
        plotW,
        plotH,
        startIdx,
        endIdx,
        sliceStart,
        sliceEnd,
        pMin,
        pMax,
        xToIdx,
        idxToX,
        yToPrice,
        priceToY,
      };
    },
    [safeCandles, visibleCount, rightOffset, yScaleFactor, yPanOffset, livePrice, hasSubPane]
  );

  // Keyboard Delete for selected drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId && !textPopover) {
        setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
        setSelectedDrawingId(null);
      } else if (e.key === 'Escape') {
        setSelectedDrawingId(null);
        setTextPopover(null);
        setShowTfDropdown(false);
        setShowSettingsModal(false);
        setShowIndicatorsModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDrawingId, textPopover]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const width = parent.clientWidth;
    const height = isFullscreen ? Math.max(parent.clientHeight, 360) : 520;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isLight = settings.bg.toLowerCase() === '#ffffff' || settings.bg.toLowerCase() === '#f4f4f5';
    const textMuted = isLight ? '#52525B' : '#71717A';
    const textBright = isLight ? '#09090B' : '#FFFFFF';
    const gridColor = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
    const borderColor = isLight ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.14)';

    ctx.fillStyle = settings.bg;
    ctx.fillRect(0, 0, width, height);

    const L = getLayout(width, height);

    if (settings.showWatermark) {
      ctx.save();
      ctx.fillStyle = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
      ctx.font = '700 44px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`XAUUSD · ${timeframe}`, L.padL + L.plotW / 2, L.padT + L.plotH / 2 + 12);
      ctx.restore();
    }

    // Horizontal Grid & Price Axis
    const gridRows = 7;
    ctx.font = '500 11px Inter, sans-serif';
    for (let i = 0; i <= gridRows; i++) {
      const py = L.padT + (L.plotH * i) / gridRows;
      const price = L.pMax - ((L.pMax - L.pMin) * i) / gridRows;
      if (settings.showHorzGrid) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.padL, py);
        ctx.lineTo(L.padL + L.plotW, py);
        ctx.stroke();
      }
      ctx.fillStyle = textMuted;
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(2), L.padL + L.plotW + 8, py + 4);
    }

    // Vertical Grid & Time Axis
    const timeSteps = 7;
    for (let i = 0; i <= timeSteps; i++) {
      const idx = Math.round(L.startIdx + (visibleCount * i) / timeSteps);
      const px = L.idxToX(idx);
      if (px < L.padL || px > L.padL + L.plotW) continue;
      if (settings.showVertGrid) {
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        ctx.moveTo(px, L.padT);
        ctx.lineTo(px, L.padT + L.plotH);
        ctx.stroke();
      }
      const cItem = safeCandles[idx];
      if (cItem) {
        const dt = new Date(cItem.time);
        const label = Number.isNaN(dt.getTime())
          ? cItem.time.slice(11, 16)
          : `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`;
        ctx.fillStyle = textMuted;
        ctx.textAlign = 'center';
        ctx.fillText(label, px, height - 6);
      }
    }

    // Clip Plot Region
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.padL, L.padT, L.plotW, L.plotH);
    ctx.clip();

    // Killzones (London 07-10 UTC, NY 12-15 UTC)
    if (isIndVisible('killzones')) {
      for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
        const b = safeCandles[i];
        if (!b) continue;
        const dt = new Date(b.time);
        const hr = dt.getUTCHours();
        if ((hr >= 7 && hr < 10) || (hr >= 12 && hr < 15)) {
          const x = L.idxToX(i);
          const w = L.plotW / Math.max(visibleCount, 1);
          ctx.fillStyle = hr < 11 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.05)';
          ctx.fillRect(x - w / 2, L.padT, w, L.plotH);
        }
      }
    }

    // VPVR & TPO
    if (isIndVisible('vpvr') || isIndVisible('tpo')) {
      const bins = 26;
      const volBins = new Array(bins).fill(0);
      const tpoBins = new Array(bins).fill(0);
      for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
        const b = safeCandles[i];
        if (!b) continue;
        const binLow = Math.max(0, Math.min(bins - 1, Math.floor(((b.low - L.pMin) / (L.pMax - L.pMin)) * bins)));
        const binHigh = Math.max(0, Math.min(bins - 1, Math.floor(((b.high - L.pMin) / (L.pMax - L.pMin)) * bins)));
        const volPerBin = (b.volume || 50) / Math.max(1, binHigh - binLow + 1);
        for (let k = binLow; k <= binHigh; k++) {
          volBins[k] += volPerBin;
          tpoBins[k] += 1;
        }
      }
      const maxVol = Math.max(...volBins, 1);
      const maxTpo = Math.max(...tpoBins, 1);
      const binH = L.plotH / bins;
      for (let k = 0; k < bins; k++) {
        const yTop = L.padT + L.plotH - (k + 1) * binH;
        if (isIndVisible('vpvr')) {
          const barW = (volBins[k] / maxVol) * Math.min(L.plotW * 0.16, 90);
          ctx.fillStyle = isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.15)';
          ctx.fillRect(L.padL + L.plotW - barW, yTop + 1, barW, Math.max(binH - 2, 2));
        }
        if (isIndVisible('tpo')) {
          const blocks = Math.max(1, Math.round((tpoBins[k] / maxTpo) * 8));
          ctx.fillStyle = 'rgba(255, 214, 10, 0.32)';
          for (let t = 0; t < blocks; t++) {
            ctx.fillRect(L.padL + t * 8 + 4, yTop + 2, 6, Math.max(binH - 4, 2));
          }
        }
      }
    }

    // Fib OTE Zone
    if (isIndVisible('ote') && ote) {
      const y1 = L.priceToY(ote.zone_high);
      const y2 = L.priceToY(ote.zone_low);
      const ySweet = L.priceToY(ote.sweet_spot);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(L.padL, Math.min(y1, y2), L.plotW, Math.abs(y2 - y1));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(L.padL, ySweet);
      ctx.lineTo(L.padL + L.plotW, ySweet);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = textBright;
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillText(`OTE 0.705 $${ote.sweet_spot.toFixed(2)}`, L.padL + 8, ySweet - 4);
    }

    // FVG
    if (isIndVisible('fvg')) {
      for (let i = Math.max(2, L.sliceStart); i <= L.sliceEnd; i++) {
        const c0 = safeCandles[i - 2];
        const c2 = safeCandles[i];
        if (!c0 || !c2) continue;
        if (c2.low > c0.high) {
          const yTop = L.priceToY(c2.low);
          const yBot = L.priceToY(c0.high);
          const xStart = L.idxToX(i - 2);
          ctx.fillStyle = 'rgba(48, 209, 88, 0.11)';
          ctx.fillRect(xStart, yTop, L.padL + L.plotW - xStart, yBot - yTop);
        } else if (c2.high < c0.low) {
          const yTop = L.priceToY(c0.low);
          const yBot = L.priceToY(c2.high);
          const xStart = L.idxToX(i - 2);
          ctx.fillStyle = 'rgba(255, 69, 58, 0.11)';
          ctx.fillRect(xStart, yTop, L.padL + L.plotW - xStart, yBot - yTop);
        }
      }
    }

    // BOS / CHoCH Swing Markers
    if (isIndVisible('bos')) {
      ctx.font = '600 9px Inter, sans-serif';
      for (let i = Math.max(3, L.sliceStart); i <= Math.min(safeCandles.length - 4, L.sliceEnd); i++) {
        const b = safeCandles[i];
        if (!b) continue;
        const isSwingH =
          b.high > safeCandles[i - 1].high &&
          b.high > safeCandles[i - 2].high &&
          b.high > safeCandles[i + 1].high &&
          b.high > safeCandles[i + 2].high;
        const isSwingL =
          b.low < safeCandles[i - 1].low &&
          b.low < safeCandles[i - 2].low &&
          b.low < safeCandles[i + 1].low &&
          b.low < safeCandles[i + 2].low;
        if (isSwingH) {
          const sx = L.idxToX(i);
          const sy = L.priceToY(b.high);
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText('BOS', sx, sy - 6);
        } else if (isSwingL) {
          const sx = L.idxToX(i);
          const sy = L.priceToY(b.low);
          ctx.fillStyle = '#A1A1AA';
          ctx.textAlign = 'center';
          ctx.fillText('SWL', sx, sy + 11);
        }
      }
    }

    // OI Walls
    if (isIndVisible('oiWalls') && oiWalls) {
      if (oiWalls.bid_wall) {
        const yB = L.priceToY(oiWalls.bid_wall.price);
        ctx.strokeStyle = 'rgba(48, 209, 88, 0.55)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(L.padL, yB);
        ctx.lineTo(L.padL + L.plotW, yB);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#30D158';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`BID WALL ${oiWalls.bid_wall.qty} PAXG`, L.padL + 8, yB - 4);
      }
      if (oiWalls.ask_wall) {
        const yA = L.priceToY(oiWalls.ask_wall.price);
        ctx.strokeStyle = 'rgba(255, 69, 58, 0.55)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(L.padL, yA);
        ctx.lineTo(L.padL + L.plotW, yA);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#FF453A';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`ASK WALL ${oiWalls.ask_wall.qty} PAXG`, L.padL + 8, yA - 4);
      }
    }

    // Line Indicators Helper
    const drawLineSeries = (vals: (number | null)[], color: string, widthPx = 1.3) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.beginPath();
      let started = false;
      for (let i = Math.max(0, L.sliceStart); i <= L.sliceEnd; i++) {
        const v = vals[i];
        if (v === null || v === undefined) continue;
        const px = L.idxToX(i);
        const py = L.priceToY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    };

    if (isIndVisible('ema20')) drawLineSeries(seriesData.ema20, '#FFFFFF', 1.2);
    if (isIndVisible('ema50')) drawLineSeries(seriesData.ema50, '#A1A1AA', 1.2);
    if (isIndVisible('ema200')) drawLineSeries(seriesData.ema200, '#FFD60A', 1.5);
    if (isIndVisible('sma50')) drawLineSeries(seriesData.sma50, '#E4E4E7', 1.2);
    if (isIndVisible('vwap')) drawLineSeries(seriesData.vwap, '#F59E0B', 1.3);
    if (isIndVisible('bb')) {
      drawLineSeries(seriesData.bbUpper, 'rgba(255,255,255,0.4)', 1);
      drawLineSeries(seriesData.sma20, 'rgba(255,255,255,0.25)', 1);
      drawLineSeries(seriesData.bbLower, 'rgba(255,255,255,0.4)', 1);
    }

    // Volume & Candlesticks
    const stepW = L.plotW / Math.max(visibleCount, 1);
    const bodyW = Math.max(Math.min(stepW * 0.64, 18), 2);
    let maxBarVol = 1;
    for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
      maxBarVol = Math.max(maxBarVol, safeCandles[i]?.volume || 1);
    }

    for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
      const b = safeCandles[i];
      if (!b) continue;
      const cx = L.idxToX(i);
      const isBull = b.close >= b.open;

      if (isIndVisible('volume')) {
        const vH = ((b.volume || 20) / maxBarVol) * Math.min(L.plotH * 0.14, 48);
        ctx.fillStyle = isBull ? 'rgba(48, 209, 88, 0.22)' : 'rgba(255, 69, 58, 0.22)';
        ctx.fillRect(cx - bodyW / 2, L.padT + L.plotH - vH, bodyW, vH);
      }

      // Wick
      ctx.strokeStyle = isBull ? settings.bullWick : settings.bearWick;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, L.priceToY(b.high));
      ctx.lineTo(cx, L.priceToY(b.low));
      ctx.stroke();

      // Body + Border
      const yO = L.priceToY(b.open);
      const yC = L.priceToY(b.close);
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(Math.abs(yC - yO), 1.5);
      ctx.fillStyle = isBull ? settings.bullBody : settings.bearBody;
      ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
      ctx.strokeStyle = isBull ? settings.bullBorder : settings.bearBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);

      // Footprint Delta
      if (isIndVisible('orderflow') && stepW >= 6) {
        const d = b.delta ?? (isBull ? 12 : -12);
        const dH = Math.min(Math.abs(d) * 0.45, 22);
        ctx.fillStyle = d >= 0 ? 'rgba(48, 209, 88, 0.65)' : 'rgba(255, 69, 58, 0.65)';
        ctx.fillRect(cx - bodyW / 2, L.padT + L.plotH - dH, bodyW, dH);
      }
    }

    // Signal Entry / SL / TP
    if (isIndVisible('signalLevels') && signal) {
      const sigLines = [
        { label: 'ENTRY', price: signal.entry, color: '#FFFFFF' },
        { label: 'SL', price: signal.stop_loss, color: '#FF453A' },
        { label: 'TP1 BE', price: signal.tp1, color: '#30D158' },
        { label: 'TP2 -0.27', price: signal.tp2, color: '#22C55E' },
        { label: 'TP3 -0.618', price: signal.tp3, color: '#10B981' },
      ];
      sigLines.forEach((s) => {
        const ly = L.priceToY(s.price);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash(s.label === 'ENTRY' ? [] : [5, 4]);
        ctx.beginPath();
        ctx.moveTo(L.padL, ly);
        ctx.lineTo(L.padL + L.plotW, ly);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // User Drawings
    const allDrawings = activeDraft ? [...drawings, activeDraft] : drawings;
    allDrawings.forEach((d) => {
      const isSelected = d.id === selectedDrawingId;
      ctx.strokeStyle = d.color;
      ctx.fillStyle = d.color;
      ctx.lineWidth = d.lineWidth || 1.6;
      const px1 = L.idxToX(d.x1);
      const py1 = L.priceToY(d.y1);
      const px2 = d.x2 !== undefined ? L.idxToX(d.x2) : px1;
      const py2 = d.y2 !== undefined ? L.priceToY(d.y2) : py1;

      if (d.type === 'hline') {
        ctx.beginPath();
        ctx.moveTo(L.padL, py1);
        ctx.lineTo(L.padL + L.plotW, py1);
        ctx.stroke();
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`$${d.y1.toFixed(2)}`, L.padL + 8, py1 - 4);
      } else if (d.type === 'vline') {
        ctx.beginPath();
        ctx.moveTo(px1, L.padT);
        ctx.lineTo(px1, L.padT + L.plotH);
        ctx.stroke();
      } else if (d.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();
      } else if (d.type === 'ray') {
        const dx = px2 - px1;
        const dy = py2 - py1;
        const len = Math.hypot(dx, dy) || 1;
        const ext = 2000;
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px1 + (dx / len) * ext, py1 + (dy / len) * ext);
        ctx.stroke();
      } else if (d.type === 'channel') {
        const offsetPx = 28;
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.moveTo(px1, py1 + offsetPx);
        ctx.lineTo(px2, py2 + offsetPx);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.lineTo(px2, py2 + offsetPx);
        ctx.lineTo(px1, py1 + offsetPx);
        ctx.closePath();
        ctx.fill();
      } else if (d.type === 'fib') {
        const fibLevels = [0, 0.382, 0.5, 0.618, 0.705, 0.786, 1];
        const left = Math.min(px1, px2);
        const w = Math.max(Math.abs(px2 - px1), 60);
        fibLevels.forEach((lvl) => {
          const fp = d.y1 + (d.y2! - d.y1) * lvl;
          const fy = L.priceToY(fp);
          ctx.strokeStyle = lvl === 0.705 ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
          ctx.setLineDash(lvl === 0.705 ? [] : [3, 3]);
          ctx.beginPath();
          ctx.moveTo(left, fy);
          ctx.lineTo(left + w, fy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#D4D4D8';
          ctx.font = '500 9px Inter, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${lvl} ($${fp.toFixed(2)})`, left + 4, fy - 3);
        });
      } else if (d.type === 'box') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(Math.min(px1, px2), Math.min(py1, py2), Math.abs(px2 - px1), Math.abs(py2 - py1));
        ctx.strokeRect(Math.min(px1, px2), Math.min(py1, py2), Math.abs(px2 - px1), Math.abs(py2 - py1));
      } else if (d.type === 'text' && d.text) {
        ctx.font = '600 12px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(d.text, px1, py1);
      } else if (d.type === 'draw' && d.points && d.points.length > 1) {
        ctx.beginPath();
        d.points.forEach((pt, idx) => {
          const gx = L.idxToX(pt.x);
          const gy = L.priceToY(pt.y);
          if (idx === 0) ctx.moveTo(gx, gy);
          else ctx.lineTo(gx, gy);
        });
        ctx.stroke();
      } else if (d.type === 'measure') {
        const diffP = (d.y2 ?? d.y1) - d.y1;
        const pct = (diffP / Math.max(d.y1, 1)) * 100;
        const bars = Math.abs(Math.round((d.x2 ?? d.x1) - d.x1));
        ctx.fillStyle = diffP >= 0 ? 'rgba(48,209,88,0.14)' : 'rgba(255,69,58,0.14)';
        ctx.fillRect(Math.min(px1, px2), Math.min(py1, py2), Math.abs(px2 - px1), Math.abs(py2 - py1));
        ctx.strokeRect(Math.min(px1, px2), Math.min(py1, py2), Math.abs(px2 - px1), Math.abs(py2 - py1));
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
          `${diffP >= 0 ? '+' : ''}${diffP.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${bars} bars`,
          Math.min(px1, px2) + 4,
          Math.min(py1, py2) - 4
        );
      } else if (d.type === 'rr_long' || d.type === 'rr_short') {
        const entryP = d.y1;
        const targetP = d.y2 ?? entryP + (d.type === 'rr_long' ? 12 : -12);
        const riskDist = Math.max(Math.abs(targetP - entryP) * 0.45, 3.0);
        const slP = d.type === 'rr_long' ? entryP - riskDist : entryP + riskDist;
        const rrRatio = (Math.abs(targetP - entryP) / riskDist).toFixed(2);
        const lot = Math.max(5.0 / (riskDist * 100), 0.01).toFixed(2);
        const boxW = Math.max(Math.abs(px2 - px1), 90);
        const boxX = Math.min(px1, px2);

        const yEntry = L.priceToY(entryP);
        const yTarget = L.priceToY(targetP);
        const ySl = L.priceToY(slP);

        ctx.fillStyle = 'rgba(48, 209, 88, 0.18)';
        ctx.fillRect(boxX, Math.min(yEntry, yTarget), boxW, Math.abs(yTarget - yEntry));
        ctx.fillStyle = 'rgba(255, 69, 58, 0.18)';
        ctx.fillRect(boxX, Math.min(yEntry, ySl), boxW, Math.abs(ySl - yEntry));

        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(boxX, yEntry);
        ctx.lineTo(boxX + boxW, yEntry);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`R:R ${rrRatio} · ${lot} lot ($5 risk)`, boxX + 6, yEntry - 5);
      }

      // Selection Anchor Handles
      if (isSelected) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.fillRect(px1 - 4, py1 - 4, 8, 8);
        ctx.strokeRect(px1 - 4, py1 - 4, 8, 8);
        if (d.x2 !== undefined && d.y2 !== undefined) {
          ctx.fillRect(px2 - 4, py2 - 4, 8, 8);
          ctx.strokeRect(px2 - 4, py2 - 4, 8, 8);
        }
      }
    });

    // Crosshair
    if (
      crosshair &&
      crosshair.x >= L.padL &&
      crosshair.x <= L.padL + L.plotW &&
      crosshair.y >= L.padT &&
      crosshair.y <= L.padT + L.plotH
    ) {
      ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash(settings.crosshairStyle === 'dashed' ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(L.padL, crosshair.y);
      ctx.lineTo(L.padL + L.plotW, crosshair.y);
      ctx.moveTo(crosshair.x, L.padT);
      ctx.lineTo(crosshair.x, L.padT + L.plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // end main plot clip

    // Live Price Line + Countdown on Right Axis
    const lastBar = safeCandles[safeCandles.length - 1];
    const currentPx = livePrice || lastBar?.close;
    if (currentPx && currentPx >= L.pMin && currentPx <= L.pMax) {
      const ly = L.priceToY(currentPx);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(L.padL, ly);
      ctx.lineTo(L.padL + L.plotW, ly);
      ctx.stroke();
      ctx.setLineDash([]);

      const tagH = settings.showCountdown ? 28 : 18;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(L.padL + L.plotW + 2, ly - 9, L.padR - 4, tagH);
      ctx.fillStyle = '#000000';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(currentPx.toFixed(2), L.padL + L.plotW + 6, ly + 3);
      if (settings.showCountdown) {
        ctx.font = '500 9px Inter, sans-serif';
        ctx.fillText(countdownText, L.padL + L.plotW + 6, ly + 15);
      }
    }

    // Crosshair Right Price Tag
    if (crosshair && crosshair.y >= L.padT && crosshair.y <= L.padT + L.plotH) {
      ctx.fillStyle = '#27272A';
      ctx.fillRect(L.padL + L.plotW + 2, crosshair.y - 9, L.padR - 4, 18);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(L.padL + L.plotW + 2, crosshair.y - 9, L.padR - 4, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(crosshair.price.toFixed(2), L.padL + L.plotW + 6, crosshair.y + 3);
    }

    // Sub-pane Oscillator (RSI / MACD)
    if (hasSubPane) {
      const subTop = L.padT + L.plotH + L.subGap;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(L.padL, subTop, L.plotW, L.subH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(L.padL, subTop, L.plotW, L.subH);
      ctx.clip();

      if (isIndVisible('rsi')) {
        const y70 = subTop + (1 - 0.7) * L.subH;
        const y30 = subTop + (1 - 0.3) * L.subH;
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(L.padL, y70);
        ctx.lineTo(L.padL + L.plotW, y70);
        ctx.moveTo(L.padL, y30);
        ctx.lineTo(L.padL + L.plotW, y30);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let started = false;
        for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
          const val = seriesData.rsi[i];
          if (val === null || val === undefined) continue;
          const rx = L.idxToX(i);
          const ry = subTop + (1 - val / 100) * L.subH;
          if (!started) {
            ctx.moveTo(rx, ry);
            started = true;
          } else {
            ctx.lineTo(rx, ry);
          }
        }
        ctx.stroke();
        ctx.fillStyle = textMuted;
        ctx.font = '600 9px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('RSI (14)', L.padL + 6, subTop + 12);
      } else if (isIndVisible('macd')) {
        let maxAbs = 0.5;
        for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
          const m = Math.abs(seriesData.macdLine[i] ?? 0);
          const h = Math.abs(seriesData.macdHist[i] ?? 0);
          maxAbs = Math.max(maxAbs, m, h);
        }
        const midY = subTop + L.subH / 2;
        const bw = Math.max(bodyW * 0.8, 2);
        for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
          const h = seriesData.macdHist[i];
          if (h === null || h === undefined) continue;
          const px = L.idxToX(i);
          const barH = (h / maxAbs) * (L.subH * 0.42);
          ctx.fillStyle = h >= 0 ? 'rgba(48,209,88,0.55)' : 'rgba(255,69,58,0.55)';
          ctx.fillRect(px - bw / 2, barH >= 0 ? midY - barH : midY, bw, Math.abs(barH));
        }
        ctx.fillStyle = textMuted;
        ctx.font = '600 9px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('MACD (12,26,9)', L.padL + 6, subTop + 12);
      }

      ctx.restore();
    }

    // Main Plot Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(L.padL, L.padT, L.plotW, L.plotH);

    // Top-left OHLC HUD
    const activeBar = crosshair?.candle || safeCandles[safeCandles.length - 1];
    if (activeBar) {
      ctx.fillStyle = textBright;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      const deltaStr =
        activeBar.delta !== undefined
          ? `  Δ ${activeBar.delta >= 0 ? '+' : ''}${activeBar.delta.toFixed(1)}`
          : '';
      ctx.fillText(
        `${symbol} · ${timeframe}   O ${activeBar.open.toFixed(2)}  H ${activeBar.high.toFixed(2)}  L ${activeBar.low.toFixed(2)}  C ${activeBar.close.toFixed(2)}${deltaStr}`,
        L.padL + 6,
        21
      );
    }
  }, [
    safeCandles,
    symbol,
    timeframe,
    settings,
    activeIndicators,
    hiddenIndicators,
    isIndVisible,
    seriesData,
    hasSubPane,
    ote,
    signal,
    oiWalls,
    livePrice,
    countdownText,
    visibleCount,
    rightOffset,
    yScaleFactor,
    yPanOffset,
    drawings,
    activeDraft,
    selectedDrawingId,
    crosshair,
    isFullscreen,
    resizeTick,
    getLayout,
  ]);

  // Hit-testing for drawings
  const hitTestDrawing = (
    px: number,
    py: number,
    L: ReturnType<typeof getLayout>
  ): { id: string; part: 'handle1' | 'handle2' | 'body' } | null => {
    for (let i = drawings.length - 1; i >= 0; i--) {
      const d = drawings[i];
      const x1 = L.idxToX(d.x1);
      const y1 = L.priceToY(d.y1);
      const x2 = d.x2 !== undefined ? L.idxToX(d.x2) : x1;
      const y2 = d.y2 !== undefined ? L.priceToY(d.y2) : y1;

      if (Math.hypot(px - x1, py - y1) <= 10) return { id: d.id, part: 'handle1' };
      if (d.x2 !== undefined && d.y2 !== undefined && Math.hypot(px - x2, py - y2) <= 10) {
        return { id: d.id, part: 'handle2' };
      }

      if (d.type === 'hline' && Math.abs(py - y1) <= 7) return { id: d.id, part: 'body' };
      if (d.type === 'vline' && Math.abs(px - x1) <= 7) return { id: d.id, part: 'body' };
      if (d.type === 'text' && px >= x1 - 6 && px <= x1 + 120 && py >= y1 - 18 && py <= y1 + 8) {
        return { id: d.id, part: 'body' };
      }
      if ((d.type === 'line' || d.type === 'ray' || d.type === 'channel') && distToSegment(px, py, x1, y1, x2, y2) <= 8) {
        return { id: d.id, part: 'body' };
      }
      if (d.type === 'box' || d.type === 'fib' || d.type === 'measure' || d.type === 'rr_long' || d.type === 'rr_short') {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2, minX + 60);
        const minY = Math.min(y1, y2) - 10;
        const maxY = Math.max(y1, y2) + 10;
        if (px >= minX - 6 && px <= maxX + 6 && py >= minY - 6 && py <= maxY + 6) {
          return { id: d.id, part: 'body' };
        }
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const L = getLayout(rect.width, rect.height);

    setShowTfDropdown(false);

    if (x > L.padL + L.plotW) {
      dragRef.current = {
        mode: 'yscale',
        startX: x,
        startY: y,
        startOffset: rightOffset,
        startYScale: yScaleFactor,
        startYPan: yPanOffset,
      };
      return;
    }

    const idx = L.xToIdx(x);
    const price = L.yToPrice(y);

    if (tool === 'cursor') {
      const hit = hitTestDrawing(x, y, L);
      if (hit) {
        setSelectedDrawingId(hit.id);
        const orig = drawings.find((d) => d.id === hit.id);
        dragRef.current = {
          mode: hit.part === 'handle1' ? 'handle1' : hit.part === 'handle2' ? 'handle2' : 'move_drawing',
          startX: x,
          startY: y,
          startOffset: rightOffset,
          startYScale: yScaleFactor,
          startYPan: yPanOffset,
          origDrawing: orig ? { ...orig } : undefined,
        };
        return;
      }
      setSelectedDrawingId(null);
      dragRef.current = {
        mode: 'pan',
        startX: x,
        startY: y,
        startOffset: rightOffset,
        startYScale: yScaleFactor,
        startYPan: yPanOffset,
      };
      return;
    }

    if (tool === 'hline' || tool === 'vline') {
      const item: DrawingItem = {
        id: `${Date.now()}`,
        type: tool,
        x1: idx,
        y1: price,
        color: '#FFFFFF',
        lineWidth: 1.5,
      };
      setDrawings((prev) => [...prev, item]);
      setSelectedDrawingId(item.id);
      setTool('cursor');
      return;
    }

    if (tool === 'text') {
      setTextPopover({ x, y, idx, price, value: '' });
      setTool('cursor');
      return;
    }

    dragRef.current = {
      mode: 'draw',
      startX: x,
      startY: y,
      startOffset: rightOffset,
      startYScale: yScaleFactor,
      startYPan: yPanOffset,
    };
    setActiveDraft({
      id: `${Date.now()}`,
      type: tool,
      x1: idx,
      y1: price,
      x2: idx,
      y2: price,
      points: tool === 'draw' ? [{ x: idx, y: price }] : undefined,
      color: tool === 'rr_long' ? '#30D158' : tool === 'rr_short' ? '#FF453A' : '#FFFFFF',
      lineWidth: 1.6,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const L = getLayout(rect.width, rect.height);

    const idx = Math.round(L.xToIdx(x));
    const price = L.yToPrice(y);
    setCrosshair({
      x,
      y,
      idx,
      price,
      candle: safeCandles[idx] || null,
    });

    if (dragRef.current.mode === 'pan') {
      const dx = x - dragRef.current.startX;
      const dy = y - dragRef.current.startY;
      const candlesDelta = (dx / L.plotW) * visibleCount;
      setRightOffset(Math.max(-20, Math.min(safeCandles.length - 5, dragRef.current.startOffset + candlesDelta)));
      const pricePerPx = (L.pMax - L.pMin) / L.plotH;
      setYPanOffset(dragRef.current.startYPan + dy * pricePerPx);
    } else if (dragRef.current.mode === 'yscale') {
      const dy = y - dragRef.current.startY;
      setYScaleFactor(Math.max(0.25, Math.min(4.0, dragRef.current.startYScale * (1 + dy * 0.006))));
    } else if (dragRef.current.mode === 'draw' && activeDraft) {
      const fIdx = L.xToIdx(x);
      setActiveDraft((prev) =>
        prev
          ? {
              ...prev,
              x2: fIdx,
              y2: price,
              points: prev.type === 'draw' && prev.points ? [...prev.points, { x: fIdx, y: price }] : prev.points,
            }
          : null
      );
    } else if (
      (dragRef.current.mode === 'move_drawing' ||
        dragRef.current.mode === 'handle1' ||
        dragRef.current.mode === 'handle2') &&
      selectedDrawingId &&
      dragRef.current.origDrawing
    ) {
      const orig = dragRef.current.origDrawing;
      const dIdx = L.xToIdx(x) - L.xToIdx(dragRef.current.startX);
      const dPrice = L.yToPrice(y) - L.yToPrice(dragRef.current.startY);
      setDrawings((prev) =>
        prev.map((d) => {
          if (d.id !== selectedDrawingId) return d;
          if (dragRef.current.mode === 'handle1') {
            return { ...d, x1: orig.x1 + dIdx, y1: orig.y1 + dPrice };
          }
          if (dragRef.current.mode === 'handle2' && orig.x2 !== undefined && orig.y2 !== undefined) {
            return { ...d, x2: orig.x2 + dIdx, y2: orig.y2 + dPrice };
          }
          return {
            ...d,
            x1: orig.x1 + dIdx,
            y1: orig.y1 + dPrice,
            x2: orig.x2 !== undefined ? orig.x2 + dIdx : undefined,
            y2: orig.y2 !== undefined ? orig.y2 + dPrice : undefined,
          };
        })
      );
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current.mode === 'draw' && activeDraft) {
      setDrawings((prev) => [...prev, activeDraft]);
      setSelectedDrawingId(activeDraft.id);
      setActiveDraft(null);
      if (tool !== 'draw') setTool('cursor');
    }
    dragRef.current.mode = 'none';
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    setVisibleCount((v) => Math.max(15, Math.min(200, Math.round(v * factor))));
  };

  const handleResetView = () => {
    setVisibleCount(65);
    setRightOffset(5);
    setYScaleFactor(1.0);
    setYPanOffset(0.0);
  };

  const handleSavePng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `startify-xauusd-${timeframe.toLowerCase()}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleSendChartDiscord = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSendingDiscord(true);
    setDiscordToast(null);
    try {
      const res = await fetch('/api/discord/send-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: canvas.toDataURL('image/png'),
          title: `XAUUSD ${timeframe} CHART — STARTIFY DESK`,
          description: `Live chart snapshot with custom annotations & overlays (${drawings.length} drawings).`,
        }),
      });
      const json = await res.json();
      setDiscordToast(json?.delivery?.sent ? 'Chart sent to Discord' : 'Discord send failed');
    } catch {
      setDiscordToast('Discord send failed');
    } finally {
      setSendingDiscord(false);
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      if (defaultFullscreen && onExitFullscreen) {
        onExitFullscreen();
      } else {
        setIsFullscreen(false);
      }
    }
  };

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) || null;
  const activeIndicatorList = INDICATOR_CATALOG.filter((m) => activeIndicators[m.key]);

  const tools: { id: ToolType; label: string; icon: React.FC<any> }[] = [
    { id: 'cursor', label: 'Crosshair / Select', icon: Crosshair },
    { id: 'line', label: 'Trend Line', icon: TrendingUp },
    { id: 'ray', label: 'Ray', icon: TrendingUp },
    { id: 'hline', label: 'Horizontal Line', icon: Minus },
    { id: 'vline', label: 'Vertical Line', icon: SlidersHorizontal },
    { id: 'channel', label: 'Parallel Channel', icon: Layers },
    { id: 'fib', label: 'Fib Retracement', icon: Activity },
    { id: 'box', label: 'Rectangle Box', icon: Square },
    { id: 'text', label: 'Text Note', icon: Type },
    { id: 'draw', label: 'Brush', icon: Pencil },
    { id: 'rr_long', label: 'Long R:R', icon: ZoomIn },
    { id: 'rr_short', label: 'Short R:R', icon: ZoomOut },
    { id: 'measure', label: 'Measure', icon: Ruler },
  ];

  const displayedPinnedTfs = useMemo(() => {
    if ((PINNED_TIMEFRAMES as readonly string[]).includes(timeframe)) return [...PINNED_TIMEFRAMES];
    return [...PINNED_TIMEFRAMES.slice(0, 3), timeframe];
  }, [timeframe]);

  return (
    <div
      ref={containerRef}
      className={`border border-white/[0.12] bg-[#000000] flex flex-col select-none ${
        isFullscreen ? 'fixed inset-0 z-[9990]' : ''
      }`}
    >
      {/* Top TradingView-Style Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.12] bg-[#0B0B0D]">
        <div className="flex flex-wrap items-center gap-1.5 relative">
          {/* Symbol + Live WS Status */}
          <div className="flex items-center gap-2 pr-2 border-r border-white/[0.12]">
            <AssetIcon symbol={symbol} size={18} />
            <span className="text-[12px] font-semibold text-white tracking-tight">{symbol}</span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 border ${
                wsConnected
                  ? 'border-[#30D158]/40 text-[#30D158] bg-[#30D158]/10'
                  : 'border-white/[0.14] text-[#A1A1AA] bg-[#141416]'
              }`}
            >
              <span className={`w-1.5 h-1.5 ${wsConnected ? 'bg-[#30D158]' : 'bg-[#71717A]'}`} />
              {wsConnected ? 'LIVE' : 'POLL'}
            </span>
          </div>

          {/* Compact Pinned Timeframes + All 9 TFs In-Page Dropdown */}
          {displayedPinnedTfs.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange?.(tf)}
              className={`px-2 py-1 text-[11px] font-semibold border cursor-pointer transition-colors ${
                timeframe === tf
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent text-[#A1A1AA] border-white/[0.1] hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTfDropdown((v) => !v)}
              className="px-2 py-1 text-[11px] font-medium border border-white/[0.12] text-[#A1A1AA] hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <span>All TFs</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showTfDropdown && (
              <div className="absolute left-0 top-8 z-50 w-44 bg-[#0B0B0D] border border-white/[0.2] p-1.5 grid grid-cols-3 gap-1 shadow-2xl">
                {ALL_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => {
                      onTimeframeChange?.(tf);
                      setShowTfDropdown(false);
                    }}
                    className={`py-1.5 text-[11px] font-semibold border cursor-pointer ${
                      timeframe === tf
                        ? 'bg-white text-black border-white'
                        : 'bg-[#141416] text-[#D4D4D8] border-white/[0.08] hover:border-white/30'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="mx-1 h-4 w-[1px] bg-white/[0.12]" />

          {/* Indicators Modal Trigger */}
          <button
            type="button"
            onClick={() => setShowIndicatorsModal(true)}
            className="px-2.5 py-1 text-[11px] font-medium border border-white/[0.14] bg-[#141416] text-white hover:bg-white hover:text-black flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Indicators ({activeIndicatorList.length})</span>
          </button>

          {/* TapeDelta Live Metrics */}
          <div className="hidden xl:flex items-center gap-3 pl-2 text-[11px] tabular-nums text-[#A1A1AA]">
            <span>
              Net Δ{' '}
              <span className={netDelta >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'}>
                {netDelta >= 0 ? '+' : ''}
                {netDelta.toFixed(1)}
              </span>
            </span>
            <span>CVD ${cvdUsd.toFixed(0)}</span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVisibleCount((v) => Math.max(15, Math.round(v * 0.8)))}
            className="p-1.5 border border-white/[0.1] text-[#A1A1AA] hover:text-white cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setVisibleCount((v) => Math.min(200, Math.round(v * 1.25)))}
            className="p-1.5 border border-white/[0.1] text-[#A1A1AA] hover:text-white cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="px-2 py-1 text-[11px] font-medium border border-white/[0.1] text-[#A1A1AA] hover:text-white flex items-center gap-1 cursor-pointer"
            title="Auto Fit"
          >
            <RotateCcw className="w-3 h-3" /> Auto
          </button>
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 border border-white/[0.1] text-[#A1A1AA] hover:text-white cursor-pointer"
            title="Chart Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleSavePng}
            className="px-2 py-1 text-[11px] font-medium border border-white/[0.12] text-white hover:bg-white hover:text-black flex items-center gap-1 cursor-pointer"
            title="Save Chart PNG"
          >
            <Camera className="w-3 h-3" /> PNG
          </button>
          <button
            type="button"
            onClick={handleSendChartDiscord}
            disabled={sendingDiscord}
            className="px-2 py-1 text-[11px] font-medium border border-white/[0.2] text-white hover:bg-white hover:text-black flex items-center gap-1 cursor-pointer"
            title="Send Chart to Discord"
          >
            <Send className="w-3 h-3" /> {sendingDiscord ? '...' : 'Discord'}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-2 py-1 text-[11px] font-medium border border-white/[0.2] bg-white text-black hover:bg-[#E4E4E7] flex items-center gap-1 cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'F11 Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Exit' : 'Full'}</span>
          </button>
        </div>
      </div>

      {/* Active Indicator Chips Bar */}
      {activeIndicatorList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.08] bg-[#050505]">
          {activeIndicatorList.map((ind) => {
            const hidden = Boolean(hiddenIndicators[ind.key]);
            return (
              <div
                key={ind.key}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10.5px] border ${
                  hidden
                    ? 'border-white/[0.08] text-[#52525B] bg-transparent'
                    : 'border-white/[0.14] text-[#D4D4D8] bg-[#141416]'
                }`}
              >
                <span>{ind.label}</span>
                <button
                  type="button"
                  onClick={() => setShowIndicatorsModal(true)}
                  className="hover:text-white cursor-pointer"
                  title="Configure"
                >
                  <Settings className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setHiddenIndicators((h) => ({ ...h, [ind.key]: !h[ind.key] }))}
                  className="hover:text-white cursor-pointer"
                  title={hidden ? 'Show' : 'Hide'}
                >
                  {hidden ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndicators((a) => ({ ...a, [ind.key]: false }))}
                  className="hover:text-[#FF453A] cursor-pointer"
                  title="Remove"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {discordToast && (
        <div className="px-3 py-1 text-[11px] bg-[#141416] text-white border-b border-white/[0.1]">
          {discordToast}
        </div>
      )}

      {/* Main Body: Left Drawing Tools + Interactive Canvas */}
      <div className="flex flex-1 min-h-0 relative">
        <div className="w-10 border-r border-white/[0.1] bg-[#050505] flex flex-col items-center py-2 gap-1 shrink-0 overflow-y-auto">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                title={t.label}
                className={`w-7 h-7 flex items-center justify-center border cursor-pointer transition-colors shrink-0 ${
                  tool === t.id
                    ? 'bg-white text-black border-white'
                    : 'text-[#A1A1AA] border-transparent hover:border-white/[0.2] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
          <div className="w-5 h-[1px] bg-white/[0.1] my-1 shrink-0" />
          <button
            type="button"
            onClick={() => setDrawings((d) => d.slice(0, -1))}
            title="Undo Last Drawing"
            className="w-7 h-7 flex items-center justify-center text-[#A1A1AA] hover:text-white cursor-pointer shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawings([]);
              setSelectedDrawingId(null);
            }}
            title="Clear All Drawings"
            className="w-7 h-7 flex items-center justify-center text-[#A1A1AA] hover:text-[#FF453A] cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-w-0 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              setCrosshair(null);
              handlePointerUp();
            }}
            onWheel={handleWheel}
            className="block w-full h-full cursor-crosshair touch-none"
          />

          {/* Floating Selected Drawing Mini-Toolbar */}
          {selectedDrawing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#0B0B0D] border border-white/[0.25] px-2.5 py-1.5 shadow-2xl">
              <span className="text-[10.5px] font-medium text-[#A1A1AA] uppercase">
                {selectedDrawing.type}
              </span>
              <div className="flex items-center gap-1">
                {['#FFFFFF', '#30D158', '#FF453A', '#FFD60A', '#A1A1AA'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() =>
                      setDrawings((prev) =>
                        prev.map((d) => (d.id === selectedDrawing.id ? { ...d, color: col } : d))
                      )
                    }
                    className={`w-3.5 h-3.5 border cursor-pointer ${
                      selectedDrawing.color === col ? 'border-white scale-110' : 'border-white/25'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
              {[1, 2, 3].map((lw) => (
                <button
                  key={lw}
                  type="button"
                  onClick={() =>
                    setDrawings((prev) =>
                      prev.map((d) => (d.id === selectedDrawing.id ? { ...d, lineWidth: lw } : d))
                    )
                  }
                  className={`px-1.5 py-0.5 text-[10px] border cursor-pointer ${
                    (selectedDrawing.lineWidth || 1.6) === lw
                      ? 'bg-white text-black border-white'
                      : 'text-[#A1A1AA] border-white/[0.15]'
                  }`}
                >
                  {lw}px
                </button>
              ))}
              {selectedDrawing.type === 'text' && (
                <button
                  type="button"
                  onClick={() =>
                    setTextPopover({
                      x: 120,
                      y: 80,
                      idx: selectedDrawing.x1,
                      price: selectedDrawing.y1,
                      value: selectedDrawing.text || '',
                      editingId: selectedDrawing.id,
                    })
                  }
                  className="px-2 py-0.5 text-[10px] border border-white/[0.2] text-white hover:bg-white hover:text-black cursor-pointer"
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawing.id));
                  setSelectedDrawingId(null);
                }}
                className="p-1 text-[#FF453A] hover:bg-[#FF453A]/15 cursor-pointer"
                title="Delete Drawing"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* In-Page Inline Text Annotation Popover (No OS window.prompt) */}
          {textPopover && (
            <div
              className="absolute z-40 bg-[#0B0B0D] border border-white/[0.25] p-2.5 flex items-center gap-2 shadow-2xl"
              style={{
                left: Math.min(textPopover.x, 300),
                top: Math.max(12, Math.min(textPopover.y, 260)),
              }}
            >
              <input
                type="text"
                autoFocus
                value={textPopover.value}
                onChange={(e) => setTextPopover({ ...textPopover, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && textPopover.value.trim()) {
                    if (textPopover.editingId) {
                      setDrawings((prev) =>
                        prev.map((d) =>
                          d.id === textPopover.editingId ? { ...d, text: textPopover.value.trim() } : d
                        )
                      );
                    } else {
                      setDrawings((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}`,
                          type: 'text',
                          x1: textPopover.idx,
                          y1: textPopover.price,
                          text: textPopover.value.trim(),
                          color: '#FFFFFF',
                        },
                      ]);
                    }
                    setTextPopover(null);
                  }
                }}
                placeholder="Type chart note..."
                className="h-7 px-2 bg-[#000000] border border-white/[0.2] text-[12px] text-white focus:outline-none focus:border-white"
              />
              <button
                type="button"
                onClick={() => {
                  if (textPopover.value.trim()) {
                    if (textPopover.editingId) {
                      setDrawings((prev) =>
                        prev.map((d) =>
                          d.id === textPopover.editingId ? { ...d, text: textPopover.value.trim() } : d
                        )
                      );
                    } else {
                      setDrawings((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}`,
                          type: 'text',
                          x1: textPopover.idx,
                          y1: textPopover.price,
                          text: textPopover.value.trim(),
                          color: '#FFFFFF',
                        },
                      ]);
                    }
                  }
                  setTextPopover(null);
                }}
                className="h-7 px-2.5 bg-white text-black text-[11px] font-semibold cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setTextPopover(null)}
                className="h-7 px-2 border border-white/[0.15] text-[#A1A1AA] text-[11px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* In-Page Chart Settings Modal (3 Tabs: Candles, Canvas, Scales) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[9995] bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0B0B0D] border border-white/[0.22] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.12] pb-3">
              <div className="text-[14px] font-semibold text-white">Chart Settings</div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-[#A1A1AA] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 border border-white/[0.12] bg-[#000000]">
              {(['candles', 'canvas', 'scales'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSettingsTab(tab)}
                  className={`py-1.5 text-[11.5px] font-medium capitalize cursor-pointer ${
                    settingsTab === tab ? 'bg-white text-black' : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {settingsTab === 'candles' && (
              <div className="space-y-3 text-[12.5px]">
                <div className="text-[11px] text-[#71717A] font-medium">Bullish Candle</div>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ['bullBody', 'Body'],
                      ['bullBorder', 'Border'],
                      ['bullWick', 'Wick'],
                    ] as const
                  ).map(([field, lbl]) => (
                    <label key={field} className="flex items-center justify-between border border-white/[0.1] p-2 bg-[#000000]">
                      <span className="text-[#D4D4D8]">{lbl}</span>
                      <input
                        type="color"
                        value={settings[field]}
                        onChange={(e) => setSettings((s) => ({ ...s, [field]: e.target.value }))}
                        className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>

                <div className="text-[11px] text-[#71717A] font-medium pt-1">Bearish Candle</div>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ['bearBody', 'Body'],
                      ['bearBorder', 'Border'],
                      ['bearWick', 'Wick'],
                    ] as const
                  ).map(([field, lbl]) => (
                    <label key={field} className="flex items-center justify-between border border-white/[0.1] p-2 bg-[#000000]">
                      <span className="text-[#D4D4D8]">{lbl}</span>
                      <input
                        type="color"
                        value={settings[field]}
                        onChange={(e) => setSettings((s) => ({ ...s, [field]: e.target.value }))}
                        className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {settingsTab === 'canvas' && (
              <div className="space-y-3 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#D4D4D8]">Background</span>
                  <div className="flex items-center gap-1.5">
                    {['#000000', '#08080A', '#0B0E14', '#131722', '#FFFFFF'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, bg: c }))}
                        className={`w-5 h-5 border cursor-pointer ${
                          settings.bg === c ? 'border-white scale-110' : 'border-white/30'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.bg}
                      onChange={(e) => setSettings((s) => ({ ...s, bg: e.target.value }))}
                      className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between text-[#D4D4D8] cursor-pointer">
                  <span>Horizontal Grid Lines</span>
                  <input
                    type="checkbox"
                    checked={settings.showHorzGrid}
                    onChange={(e) => setSettings((s) => ({ ...s, showHorzGrid: e.target.checked }))}
                  />
                </label>
                <label className="flex items-center justify-between text-[#D4D4D8] cursor-pointer">
                  <span>Vertical Grid Lines</span>
                  <input
                    type="checkbox"
                    checked={settings.showVertGrid}
                    onChange={(e) => setSettings((s) => ({ ...s, showVertGrid: e.target.checked }))}
                  />
                </label>
                <label className="flex items-center justify-between text-[#D4D4D8] cursor-pointer">
                  <span>Symbol Watermark</span>
                  <input
                    type="checkbox"
                    checked={settings.showWatermark}
                    onChange={(e) => setSettings((s) => ({ ...s, showWatermark: e.target.checked }))}
                  />
                </label>
              </div>
            )}

            {settingsTab === 'scales' && (
              <div className="space-y-3 text-[12.5px]">
                <label className="flex items-center justify-between text-[#D4D4D8] cursor-pointer">
                  <span>Countdown to Bar Close</span>
                  <input
                    type="checkbox"
                    checked={settings.showCountdown}
                    onChange={(e) => setSettings((s) => ({ ...s, showCountdown: e.target.checked }))}
                  />
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-[#D4D4D8]">Crosshair Line</span>
                  <div className="flex border border-white/[0.15]">
                    {(['dashed', 'solid'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, crosshairStyle: st }))}
                        className={`px-2.5 py-1 text-[11px] capitalize cursor-pointer ${
                          settings.crosshairStyle === st ? 'bg-white text-black' : 'text-[#A1A1AA]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-white/[0.1]">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-1.5 bg-white text-black text-[12px] font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Page Indicators Modal */}
      {showIndicatorsModal && (
        <div className="fixed inset-0 z-[9995] bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#0B0B0D] border border-white/[0.22] p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.12] pb-3">
              <div className="text-[14px] font-semibold text-white">Indicators &amp; Orderflow Modules</div>
              <button
                type="button"
                onClick={() => setShowIndicatorsModal(false)}
                className="text-[#A1A1AA] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(['Trend & Volatility', 'ICT / Smart Money', 'Orderflow & Volume', 'Oscillators'] as const).map(
              (cat) => (
                <div key={cat} className="space-y-2">
                  <div className="text-[11px] font-medium text-[#71717A]">{cat}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {INDICATOR_CATALOG.filter((m) => m.category === cat).map((m) => {
                      const on = activeIndicators[m.key];
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() =>
                            setActiveIndicators((prev) => ({ ...prev, [m.key]: !prev[m.key] }))
                          }
                          className={`flex items-center justify-between px-3 py-2 text-[12px] border cursor-pointer transition-colors ${
                            on
                              ? 'bg-white text-black border-white font-semibold'
                              : 'bg-[#000000] text-[#D4D4D8] border-white/[0.12] hover:border-white/30'
                          }`}
                        >
                          <span>{m.label}</span>
                          <span className="text-[10.5px]">{on ? 'ON' : 'ADD'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
