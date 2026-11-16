import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Crosshair,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  RotateCcw,
  Send,
  Settings,
  Square,
  TrendingUp,
  Type,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

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

type ToolType = 'cursor' | 'line' | 'hline' | 'box' | 'text' | 'draw' | 'rr_long' | 'rr_short';

interface DrawingItem {
  id: string;
  type: Exclude<ToolType, 'cursor'>;
  x1: number; // candle index (float)
  y1: number; // price
  x2?: number;
  y2?: number;
  text?: string;
  points?: { x: number; y: number }[];
  color: string;
}

interface ChartSettings {
  bg: string;
  bullColor: string;
  bearColor: string;
  showGrid: boolean;
  showWatermark: boolean;
}

interface OverlayToggles {
  ote: boolean;
  orderflow: boolean;
  vpvr: boolean;
  tpo: boolean;
  fvg: boolean;
  oiWalls: boolean;
  signalLevels: boolean;
}

interface TradingChartProProps {
  candles: ChartCandle[];
  timeframe: string;
  onTimeframeChange?: (tf: string) => void;
  ote?: ChartOteOverlay | null;
  signal?: ChartSignalOverlay | null;
  oiWalls?: ChartOiWalls | null;
  livePrice?: number | null;
}

export const TradingChartPro: React.FC<TradingChartProProps> = ({
  candles,
  timeframe,
  onTimeframeChange,
  ote,
  signal,
  oiWalls,
  livePrice,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tool, setTool] = useState<ToolType>('cursor');
  const [drawings, setDrawings] = useState<DrawingItem[]>([]);
  const [activeDraft, setActiveDraft] = useState<DrawingItem | null>(null);
  const [sendingDiscord, setSendingDiscord] = useState(false);
  const [discordToast, setDiscordToast] = useState<string | null>(null);

  const [settings, setSettings] = useState<ChartSettings>({
    bg: '#08080A',
    bullColor: '#30D158',
    bearColor: '#FF453A',
    showGrid: true,
    showWatermark: true,
  });

  const [overlays, setOverlays] = useState<OverlayToggles>({
    ote: true,
    orderflow: true,
    vpvr: true,
    tpo: false,
    fvg: true,
    oiWalls: true,
    signalLevels: true,
  });

  // View state: visible candle count, right offset (0 = latest candle at right edge), Y scale multiplier & pan
  const [visibleCount, setVisibleCount] = useState(60);
  const [rightOffset, setRightOffset] = useState(4);
  const [yScaleFactor, setYScaleFactor] = useState(1.0);
  const [yPanOffset, setYPanOffset] = useState(0.0);

  // Pointer interaction state
  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'yscale' | 'draw';
    startX: number;
    startY: number;
    startOffset: number;
    startYScale: number;
    startYPan: number;
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
    return Array.from({ length: 50 }, (_, i) => {
      const o = base + Math.sin(i * 0.3) * 4;
      const c = base + Math.sin((i + 1) * 0.3) * 4;
      return {
        time: new Date(Date.now() - (50 - i) * 900000).toISOString(),
        open: Number(o.toFixed(2)),
        high: Number((Math.max(o, c) + 1.8).toFixed(2)),
        low: Number((Math.min(o, c) - 1.8).toFixed(2)),
        close: Number(c.toFixed(2)),
        volume: 120 + (i % 7) * 25,
        delta: (c >= o ? 1 : -1) * (12 + (i % 5) * 8),
      };
    });
  }, [candles, livePrice]);

  // Compute coordinate helpers for current canvas dimensions
  const getLayout = useCallback(
    (width: number, height: number) => {
      const padL = 12;
      const padR = 76;
      const padT = 36;
      const padB = 26;
      const plotW = Math.max(width - padL - padR, 120);
      const plotH = Math.max(height - padT - padB, 120);

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
      const halfSpan = Math.max((maxP - minP) * 0.62, 4.0) * yScaleFactor;
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
    [safeCandles, visibleCount, rightOffset, yScaleFactor, yPanOffset, livePrice]
  );

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const width = parent.clientWidth;
    const height = isFullscreen ? Math.max(window.innerHeight - 130, 420) : 440;
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

    // Background
    ctx.fillStyle = settings.bg;
    ctx.fillRect(0, 0, width, height);

    const L = getLayout(width, height);

    // Watermark
    if (settings.showWatermark) {
      ctx.save();
      ctx.fillStyle = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.035)';
      ctx.font = '700 42px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`XAUUSD · ${timeframe}`, L.padL + L.plotW / 2, L.padT + L.plotH / 2 + 12);
      ctx.restore();
    }

    // Grid & Right Price Axis Labels
    const gridRows = 6;
    ctx.font = '500 11px Inter, sans-serif';
    for (let i = 0; i <= gridRows; i++) {
      const py = L.padT + (L.plotH * i) / gridRows;
      const price = L.pMax - ((L.pMax - L.pMin) * i) / gridRows;
      if (settings.showGrid) {
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

    // Vertical Time Grid
    const timeSteps = 6;
    for (let i = 0; i <= timeSteps; i++) {
      const idx = Math.round(L.startIdx + (visibleCount * i) / timeSteps);
      const px = L.idxToX(idx);
      if (px < L.padL || px > L.padL + L.plotW) continue;
      if (settings.showGrid) {
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
        ctx.fillText(label, px, L.padT + L.plotH + 17);
      }
    }

    // Clip plot region for overlays, candles, and drawings
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.padL, L.padT, L.plotW, L.plotH);
    ctx.clip();

    // Volume Profile (VPVR) & TPO (Market Profile) on right side of plot
    if (overlays.vpvr || overlays.tpo) {
      const bins = 24;
      const volBins = new Array(bins).fill(0);
      const tpoBins = new Array(bins).fill(0);
      for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
        const b = safeCandles[i];
        if (!b) continue;
        const binLow = Math.max(0, Math.min(bins - 1, Math.floor(((b.low - L.pMin) / (L.pMax - L.pMin)) * bins)));
        const binHigh = Math.max(0, Math.min(bins - 1, Math.floor(((b.high - L.pMin) / (L.pMax - L.pMin)) * bins)));
        const volPerBin = (b.volume || Math.abs(b.high - b.low) * 20 + 40) / Math.max(1, binHigh - binLow + 1);
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
        if (overlays.vpvr) {
          const barW = (volBins[k] / maxVol) * Math.min(L.plotW * 0.18, 95);
          ctx.fillStyle = 'rgba(0, 173, 255, 0.22)';
          ctx.fillRect(L.padL + L.plotW - barW, yTop + 1, barW, Math.max(binH - 2, 2));
        }
        if (overlays.tpo) {
          const blocks = Math.max(1, Math.round((tpoBins[k] / maxTpo) * 8));
          ctx.fillStyle = 'rgba(255, 214, 10, 0.35)';
          for (let t = 0; t < blocks; t++) {
            ctx.fillRect(L.padL + t * 8 + 4, yTop + 2, 6, Math.max(binH - 4, 2));
          }
        }
      }
    }

    // Fib OTE Zone
    if (overlays.ote && ote) {
      const y1 = L.priceToY(ote.zone_high);
      const y2 = L.priceToY(ote.zone_low);
      const ySweet = L.priceToY(ote.sweet_spot);
      ctx.fillStyle = 'rgba(0, 173, 255, 0.11)';
      ctx.fillRect(L.padL, Math.min(y1, y2), L.plotW, Math.abs(y2 - y1));
      ctx.strokeStyle = 'rgba(0, 173, 255, 0.65)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(L.padL, ySweet);
      ctx.lineTo(L.padL + L.plotW, ySweet);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#00ADFF';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillText(`OTE 0.705 $${ote.sweet_spot.toFixed(2)}`, L.padL + 8, ySweet - 4);
    }

    // FVG Detection (3-candle Fair Value Gaps)
    if (overlays.fvg) {
      for (let i = Math.max(2, L.sliceStart); i <= L.sliceEnd; i++) {
        const c0 = safeCandles[i - 2];
        const c2 = safeCandles[i];
        if (!c0 || !c2) continue;
        if (c2.low > c0.high) {
          const yTop = L.priceToY(c2.low);
          const yBot = L.priceToY(c0.high);
          const xStart = L.idxToX(i - 2);
          ctx.fillStyle = 'rgba(48, 209, 88, 0.12)';
          ctx.fillRect(xStart, yTop, L.padL + L.plotW - xStart, yBot - yTop);
        } else if (c2.high < c0.low) {
          const yTop = L.priceToY(c0.low);
          const yBot = L.priceToY(c2.high);
          const xStart = L.idxToX(i - 2);
          ctx.fillStyle = 'rgba(255, 69, 58, 0.12)';
          ctx.fillRect(xStart, yTop, L.padL + L.plotW - xStart, yBot - yTop);
        }
      }
    }

    // OI Liquidity Walls
    if (overlays.oiWalls && oiWalls) {
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
        ctx.fillText(`ASK WALL ${oiWalls.ask_wall.qty} PAXG`, L.padL + 8, yA - 4);
      }
    }

    // Candlesticks + Orderflow Delta Histogram
    const stepW = L.plotW / Math.max(visibleCount, 1);
    const bodyW = Math.max(Math.min(stepW * 0.62, 18), 2);
    for (let i = L.sliceStart; i <= L.sliceEnd; i++) {
      const b = safeCandles[i];
      if (!b) continue;
      const cx = L.idxToX(i);
      const isBull = b.close >= b.open;
      const col = isBull ? settings.bullColor : settings.bearColor;

      // Wick
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, L.priceToY(b.high));
      ctx.lineTo(cx, L.priceToY(b.low));
      ctx.stroke();

      // Body
      const yO = L.priceToY(b.open);
      const yC = L.priceToY(b.close);
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(Math.abs(yC - yO), 1.5);
      ctx.fillStyle = col;
      ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);

      // Orderflow Delta bar at bottom of plot
      if (overlays.orderflow && stepW >= 6) {
        const d = b.delta ?? (isBull ? 12 : -12);
        const dH = Math.min(Math.abs(d) * 0.45, 22);
        ctx.fillStyle = d >= 0 ? 'rgba(48, 209, 88, 0.45)' : 'rgba(255, 69, 58, 0.45)';
        ctx.fillRect(cx - bodyW / 2, L.padT + L.plotH - dH, bodyW, dH);
      }
    }

    // Signal Entry / SL / TP Lines
    if (overlays.signalLevels && signal) {
      const sigLines = [
        { label: 'ENTRY', price: signal.entry, color: '#00ADFF' },
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

    // User Drawings (Line, H-Line, Box, Text, Draw, Long/Short R:R)
    const allDrawings = activeDraft ? [...drawings, activeDraft] : drawings;
    allDrawings.forEach((d) => {
      ctx.strokeStyle = d.color;
      ctx.fillStyle = d.color;
      ctx.lineWidth = 1.6;
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
        ctx.fillText(`$${d.y1.toFixed(2)}`, L.padL + 8, py1 - 4);
      } else if (d.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();
      } else if (d.type === 'box') {
        ctx.fillStyle = 'rgba(0, 173, 255, 0.14)';
        ctx.fillRect(Math.min(px1, px2), Math.min(py1, py2), Math.abs(px2 - px1), Math.abs(py2 - py1));
        ctx.strokeRect(Math.min(px1, px2), Math.min(py1, py2), Math.abs(px2 - px1), Math.abs(py2 - py1));
      } else if (d.type === 'text' && d.text) {
        ctx.font = '600 12px Inter, sans-serif';
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
        ctx.fillText(`R:R ${rrRatio} · ${lot} lot ($5 risk)`, boxX + 6, yEntry - 5);
      }
    });

    // Crosshair inside plot
    if (crosshair && crosshair.x >= L.padL && crosshair.x <= L.padL + L.plotW && crosshair.y >= L.padT && crosshair.y <= L.padT + L.plotH) {
      ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(L.padL, crosshair.y);
      ctx.lineTo(L.padL + L.plotW, crosshair.y);
      ctx.moveTo(crosshair.x, L.padT);
      ctx.lineTo(crosshair.x, L.padT + L.plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // end clip

    // Crosshair Right Price Tag
    if (crosshair && crosshair.y >= L.padT && crosshair.y <= L.padT + L.plotH) {
      ctx.fillStyle = '#00ADFF';
      ctx.fillRect(L.padL + L.plotW + 2, crosshair.y - 9, L.padR - 4, 18);
      ctx.fillStyle = '#000000';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(crosshair.price.toFixed(2), L.padL + L.plotW + 6, crosshair.y + 3);
    }

    // Plot Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(L.padL, L.padT, L.plotW, L.plotH);

    // Top-left OHLC HUD
    const activeBar = crosshair?.candle || safeCandles[safeCandles.length - 1];
    if (activeBar) {
      ctx.fillStyle = textBright;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      const deltaStr = activeBar.delta !== undefined ? `  Δ ${activeBar.delta >= 0 ? '+' : ''}${activeBar.delta.toFixed(1)}` : '';
      ctx.fillText(
        `XAUUSD · ${timeframe}   O ${activeBar.open.toFixed(2)}  H ${activeBar.high.toFixed(2)}  L ${activeBar.low.toFixed(2)}  C ${activeBar.close.toFixed(2)}${deltaStr}`,
        L.padL + 6,
        22
      );
    }
  }, [
    safeCandles,
    timeframe,
    settings,
    overlays,
    ote,
    signal,
    oiWalls,
    visibleCount,
    rightOffset,
    yScaleFactor,
    yPanOffset,
    drawings,
    activeDraft,
    crosshair,
    isFullscreen,
    getLayout,
  ]);

  // Pointer Events
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const L = getLayout(rect.width, rect.height);

    // Right price axis drag -> Y scale
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

    if (tool === 'cursor') {
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

    const idx = L.xToIdx(x);
    const price = L.yToPrice(y);

    if (tool === 'hline') {
      setDrawings((prev) => [...prev, { id: `${Date.now()}`, type: 'hline', x1: idx, y1: price, color: '#00ADFF' }]);
      setTool('cursor');
      return;
    }
    if (tool === 'text') {
      const txt = window.prompt('Enter chart annotation text:');
      if (txt) {
        setDrawings((prev) => [...prev, { id: `${Date.now()}`, type: 'text', x1: idx, y1: price, text: txt, color: '#FFFFFF' }]);
      }
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
      color: tool === 'rr_long' ? '#30D158' : tool === 'rr_short' ? '#FF453A' : '#00ADFF',
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
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current.mode === 'draw' && activeDraft) {
      setDrawings((prev) => [...prev, activeDraft]);
      setActiveDraft(null);
      if (tool !== 'draw') setTool('cursor');
    }
    dragRef.current.mode = 'none';
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    setVisibleCount((v) => Math.max(15, Math.min(180, Math.round(v * factor))));
  };

  const handleResetView = () => {
    setVisibleCount(60);
    setRightOffset(4);
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
    if (!isFullscreen && containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setIsFullscreen((v) => !v);
  };

  const tools: { id: ToolType; label: string; icon: React.FC<any> }[] = [
    { id: 'cursor', label: 'Crosshair / Pan', icon: Crosshair },
    { id: 'line', label: 'Trend Line', icon: TrendingUp },
    { id: 'hline', label: 'Horizontal Line', icon: Minus },
    { id: 'box', label: 'Rectangle Box', icon: Square },
    { id: 'text', label: 'Text Note', icon: Type },
    { id: 'draw', label: 'Freehand Draw', icon: Pencil },
    { id: 'rr_long', label: 'Long R:R Tool', icon: ZoomIn },
    { id: 'rr_short', label: 'Short R:R Tool', icon: ZoomOut },
  ];

  return (
    <div
      ref={containerRef}
      className={`border border-white/[0.12] bg-[#0A0A0A] flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 p-3' : ''}`}
    >
      {/* Top TradingView-style Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.1] bg-[#050505]">
        <div className="flex flex-wrap items-center gap-1.5">
          {['M5', 'M15', '1H', '4H'].map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange?.(tf)}
              className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
                timeframe === tf
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent text-[#A1A1AA] border-white/[0.1] hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
          <span className="mx-1 h-4 w-[1px] bg-white/[0.12]" />
          {(
            [
              ['ote', 'Fib OTE'],
              ['orderflow', 'Orderflow'],
              ['vpvr', 'VPVR'],
              ['tpo', 'TPO'],
              ['fvg', 'FVG'],
              ['oiWalls', 'OI Walls'],
              ['signalLevels', 'SL/TP'],
            ] as [keyof OverlayToggles, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setOverlays((o) => ({ ...o, [key]: !o[key] }))}
              className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider border ${
                overlays[key]
                  ? 'border-[#00ADFF] text-[#00ADFF] bg-[#00ADFF]/10'
                  : 'border-white/[0.08] text-[#71717A] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 relative">
          <button
            onClick={() => setVisibleCount((v) => Math.max(15, Math.round(v * 0.8)))}
            className="p-1.5 border border-white/[0.1] text-[#A1A1AA] hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVisibleCount((v) => Math.min(180, Math.round(v * 1.25)))}
            className="p-1.5 border border-white/[0.1] text-[#A1A1AA] hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetView}
            className="px-2 py-1 text-[10px] font-semibold uppercase border border-white/[0.1] text-[#A1A1AA] hover:text-white flex items-center gap-1"
            title="Auto Fit"
          >
            <RotateCcw className="w-3 h-3" /> Auto
          </button>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={`p-1.5 border ${showSettings ? 'border-white text-white' : 'border-white/[0.1] text-[#A1A1AA] hover:text-white'}`}
            title="Chart Appearance Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSavePng}
            className="px-2 py-1 text-[10px] font-semibold uppercase border border-white/[0.1] text-white hover:bg-white hover:text-black flex items-center gap-1"
            title="Save Chart PNG"
          >
            <Camera className="w-3 h-3" /> PNG
          </button>
          <button
            onClick={handleSendChartDiscord}
            disabled={sendingDiscord}
            className="px-2 py-1 text-[10px] font-semibold uppercase border border-[#00ADFF] text-[#00ADFF] hover:bg-[#00ADFF] hover:text-black flex items-center gap-1"
            title="Send Annotated Chart to Discord"
          >
            <Send className="w-3 h-3" /> {sendingDiscord ? '...' : 'Discord'}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 border border-white/[0.1] text-[#A1A1AA] hover:text-white"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Chart-Only Appearance Settings Popover */}
          {showSettings && (
            <div className="absolute right-0 top-9 z-30 w-60 bg-[#0A0A0A] border border-white/[0.2] p-3 space-y-2.5 text-[11px]">
              <div className="font-semibold uppercase tracking-wider text-white">Chart Appearance</div>
              <div className="flex items-center justify-between">
                <span className="text-[#A1A1AA]">Chart Background</span>
                <div className="flex gap-1">
                  {['#08080A', '#0B0E14', '#131722', '#FFFFFF'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSettings((s) => ({ ...s, bg: c }))}
                      className={`w-4 h-4 border ${settings.bg === c ? 'border-[#00ADFF]' : 'border-white/30'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A1A1AA]">Bull Candle</span>
                <input
                  type="color"
                  value={settings.bullColor}
                  onChange={(e) => setSettings((s) => ({ ...s, bullColor: e.target.value }))}
                  className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A1A1AA]">Bear Candle</span>
                <input
                  type="color"
                  value={settings.bearColor}
                  onChange={(e) => setSettings((s) => ({ ...s, bearColor: e.target.value }))}
                  className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                />
              </div>
              <label className="flex items-center justify-between text-[#A1A1AA] cursor-pointer">
                <span>Grid Lines</span>
                <input
                  type="checkbox"
                  checked={settings.showGrid}
                  onChange={(e) => setSettings((s) => ({ ...s, showGrid: e.target.checked }))}
                />
              </label>
              <label className="flex items-center justify-between text-[#A1A1AA] cursor-pointer">
                <span>Watermark</span>
                <input
                  type="checkbox"
                  checked={settings.showWatermark}
                  onChange={(e) => setSettings((s) => ({ ...s, showWatermark: e.target.checked }))}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {discordToast && (
        <div className="px-3 py-1 text-[11px] bg-[#00ADFF]/15 text-[#00ADFF] border-b border-white/[0.08]">
          {discordToast}
        </div>
      )}

      {/* Main Body: Left Drawing Tools + Interactive Canvas */}
      <div className="flex flex-1 min-h-0">
        <div className="w-10 border-r border-white/[0.1] bg-[#050505] flex flex-col items-center py-2 gap-1.5 shrink-0">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={t.label}
                className={`w-7 h-7 flex items-center justify-center border transition-colors ${
                  tool === t.id
                    ? 'bg-white text-black border-white'
                    : 'border-transparent text-[#71717A] hover:text-white hover:border-white/[0.12]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
          <span className="w-5 h-[1px] bg-white/[0.1] my-1" />
          <button
            onClick={() => setDrawings((d) => d.slice(0, -1))}
            title="Undo Drawing"
            className="w-7 h-7 flex items-center justify-center text-[#71717A] hover:text-white"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDrawings([])}
            title="Clear Drawings"
            className="w-7 h-7 flex items-center justify-center text-[#71717A] hover:text-[#FF453A]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 relative overflow-hidden select-none touch-none">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              handlePointerUp();
              setCrosshair(null);
            }}
            onWheel={handleWheel}
            className="block w-full cursor-crosshair"
          />
        </div>
      </div>
    </div>
  );
};
