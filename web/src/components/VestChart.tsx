import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  LineSeries,
  LineStyle,
  Time,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts';
import {
  Camera,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer,
  Settings,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { AssetIcon } from './AssetIcon';
import { RoomDrawing, TraderPosition } from '../types/toptier';

export interface ChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  delta?: number;
}

interface VestChartProps {
  symbol: string;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  candles: ChartCandle[];
  positions?: TraderPosition[];
  roomDrawings?: RoomDrawing[];
  onAddDrawing?: (tool: string, data: Record<string, unknown>) => void;
  onDeleteDrawing?: (id: string) => void;
  theme?: 'light' | 'dark';
  wsConnected?: boolean;
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M45', '1H', '4H', '1D', '1W', '1M'];

function toUtcTimestamp(iso: string): UTCTimestamp {
  const ms = Date.parse(iso);
  return Math.floor((Number.isNaN(ms) ? Date.now() : ms) / 1000) as UTCTimestamp;
}

function calcEMA(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let ema: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (ema === null) {
      const slice = values.slice(0, period);
      ema = slice.reduce((a, b) => a + b, 0) / period;
    } else {
      ema = values[i] * k + ema * (1 - k);
    }
    out.push(ema);
  }
  return out;
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      out.push(i === period ? (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)) : null);
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

export const VestChart: React.FC<VestChartProps> = ({
  symbol,
  timeframe,
  onTimeframeChange,
  candles,
  positions = [],
  roomDrawings = [],
  onAddDrawing,
  onDeleteDrawing,
  theme = 'light',
  wsConnected = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const drawingSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showVol, setShowVol] = useState(true);
  const [showRsi, setShowRsi] = useState(false);
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drawTool, setDrawTool] = useState<'cursor' | 'hline' | 'trend'>('cursor');
  const [pendingTrendPt, setPendingTrendPt] = useState<{ time: number; price: number } | null>(null);
  const [hoverOhlc, setHoverOhlc] = useState<ChartCandle | null>(null);

  const [styleCfg, setStyleCfg] = useState({
    upBody: '#10B981',
    downBody: '#EF4444',
    upWick: '#10B981',
    downWick: '#EF4444',
    upBorder: '#10B981',
    downBorder: '#EF4444',
    showGrid: true,
  });

  // Deduplicate & sort ascending by timestamp for lightweight-charts
  const normalizedCandles = useMemo(() => {
    const map = new Map<UTCTimestamp, ChartCandle>();
    for (const c of candles) {
      const ts = toUtcTimestamp(c.time);
      map.set(ts, c);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, c]) => ({ ...c, ts }));
  }, [candles]);

  // Create chart instance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#13161E' : '#FFFFFF' },
        textColor: isDark ? '#9CA3AF' : '#6B7280',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: {
          visible: styleCfg.showGrid,
          color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(17,24,39,0.05)',
        },
        horzLines: {
          visible: styleCfg.showGrid,
          color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(17,24,39,0.05)',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelBackgroundColor: isDark ? '#1F242D' : '#111827' },
        horzLine: { labelBackgroundColor: isDark ? '#1F242D' : '#111827' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#1F242D' : '#E5E7EB',
        scaleMargins: { top: 0.08, bottom: showRsi ? 0.28 : 0.16 },
      },
      timeScale: {
        borderColor: isDark ? '#1F242D' : '#E5E7EB',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: styleCfg.upBody,
      downColor: styleCfg.downBody,
      borderUpColor: styleCfg.upBorder,
      borderDownColor: styleCfg.downBorder,
      wickUpColor: styleCfg.upWick,
      wickDownColor: styleCfg.downWick,
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0.0 },
    });

    const ema20Series = chart.addSeries(LineSeries, {
      color: '#3B82F6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#8B5CF6',
      lineWidth: 1,
      priceScaleId: 'rsi',
      priceLineVisible: false,
    });
    chart.priceScale('rsi').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0.02 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current = volSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    rsiSeriesRef.current = rsiSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHoverOhlc(null);
        return;
      }
      const d = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined;
      if (d) {
        setHoverOhlc({ time: String(param.time), open: d.open, high: d.high, low: d.low, close: d.close });
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      rsiSeriesRef.current = null;
      drawingSeriesRef.current = [];
      priceLinesRef.current = [];
    };
  }, [theme, styleCfg, showRsi]);

  // Handle drawing click on chart
  useEffect(() => {
    const chart = chartRef.current;
    const cs = candleSeriesRef.current;
    if (!chart || !cs || drawTool === 'cursor') return;

    const handler = (param: { point?: { x: number; y: number }; time?: Time }) => {
      if (!param.point) return;
      const price = cs.coordinateToPrice(param.point.y);
      if (price === null || price === undefined) return;
      const roundedPrice = Number(price.toFixed(symbol === 'EURUSD' ? 4 : 2));

      if (drawTool === 'hline') {
        onAddDrawing?.('hline', { price: roundedPrice });
        setDrawTool('cursor');
      } else if (drawTool === 'trend') {
        const ts = typeof param.time === 'number' ? param.time : Math.floor(Date.now() / 1000);
        if (!pendingTrendPt) {
          setPendingTrendPt({ time: ts, price: roundedPrice });
        } else {
          onAddDrawing?.('trend', { p1: pendingTrendPt, p2: { time: ts, price: roundedPrice } });
          setPendingTrendPt(null);
          setDrawTool('cursor');
        }
      }
    };

    chart.subscribeClick(handler);
    return () => {
      chart.unsubscribeClick(handler);
    };
  }, [drawTool, pendingTrendPt, onAddDrawing, symbol]);

  // Update candle & indicator data
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volSeriesRef.current;
    const e20 = ema20SeriesRef.current;
    const e50 = ema50SeriesRef.current;
    const rsiS = rsiSeriesRef.current;
    if (!cs || normalizedCandles.length === 0) return;

    cs.setData(
      normalizedCandles.map((c) => ({
        time: c.ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    if (vs) {
      vs.setData(
        showVol
          ? normalizedCandles.map((c) => ({
              time: c.ts,
              value: c.volume ?? 0,
              color: c.close >= c.open ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)',
            }))
          : []
      );
    }

    const closes = normalizedCandles.map((c) => c.close);
    if (e20) {
      const vals = calcEMA(closes, 20);
      e20.setData(
        showEma20
          ? normalizedCandles
              .map((c, i) => (vals[i] !== null ? { time: c.ts, value: vals[i] as number } : null))
              .filter((x): x is { time: UTCTimestamp; value: number } => x !== null)
          : []
      );
    }
    if (e50) {
      const vals = calcEMA(closes, 50);
      e50.setData(
        showEma50
          ? normalizedCandles
              .map((c, i) => (vals[i] !== null ? { time: c.ts, value: vals[i] as number } : null))
              .filter((x): x is { time: UTCTimestamp; value: number } => x !== null)
          : []
      );
    }
    if (rsiS) {
      const vals = calcRSI(closes, 14);
      rsiS.setData(
        showRsi
          ? normalizedCandles
              .map((c, i) => (vals[i] !== null ? { time: c.ts, value: vals[i] as number } : null))
              .filter((x): x is { time: UTCTimestamp; value: number } => x !== null)
          : []
      );
    }
  }, [normalizedCandles, showVol, showEma20, showEma50, showRsi, theme, styleCfg]);

  // Update interactive Position Lines & Shared Team Drawings
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!cs || !chart) return;

    for (const pl of priceLinesRef.current) {
      try {
        cs.removePriceLine(pl);
      } catch {}
    }
    priceLinesRef.current = [];

    for (const ds of drawingSeriesRef.current) {
      try {
        chart.removeSeries(ds);
      } catch {}
    }
    drawingSeriesRef.current = [];

    // Open/Pending Positions on active symbol
    const activePos = positions.filter((p) => p.symbol === symbol && p.status !== 'CLOSED');
    for (const p of activePos) {
      priceLinesRef.current.push(
        cs.createPriceLine({
          price: p.entry_price,
          color: p.side === 'LONG' ? '#10B981' : '#EF4444',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `${p.side} $${p.notional_usd.toFixed(0)}`,
        })
      );
      if (p.stop_loss) {
        priceLinesRef.current.push(
          cs.createPriceLine({
            price: p.stop_loss,
            color: '#EF4444',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'SL',
          })
        );
      }
      if (p.take_profit) {
        priceLinesRef.current.push(
          cs.createPriceLine({
            price: p.take_profit,
            color: '#10B981',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'TP',
          })
        );
      }
    }

    // Shared Team Drawings
    const symDrawings = roomDrawings.filter((d) => d.symbol === symbol);
    for (const d of symDrawings) {
      try {
        const parsed = JSON.parse(d.data_json);
        if (d.tool === 'hline' && typeof parsed.price === 'number') {
          priceLinesRef.current.push(
            cs.createPriceLine({
              price: parsed.price,
              color: '#3B82F6',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: `@${d.username}`,
            })
          );
        } else if (d.tool === 'trend' && parsed.p1 && parsed.p2) {
          const pts = [parsed.p1, parsed.p2].sort((a, b) => a.time - b.time);
          if (pts[0].time !== pts[1].time) {
            const line = chart.addSeries(LineSeries, {
              color: '#F59E0B',
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            line.setData([
              { time: pts[0].time as UTCTimestamp, value: pts[0].price },
              { time: pts[1].time as UTCTimestamp, value: pts[1].price },
            ]);
            drawingSeriesRef.current.push(line);
          }
        }
      } catch {}
    }
  }, [positions, roomDrawings, symbol]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && wrapperRef.current) {
      wrapperRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSnapshot = () => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `TOPTIERclub_${symbol}_${timeframe}.png`;
    a.click();
  };

  const latest = hoverOhlc || normalizedCandles[normalizedCandles.length - 1];
  const symDrawingsCount = roomDrawings.filter((d) => d.symbol === symbol).length;

  return (
    <div
      ref={wrapperRef}
      className="tt-card flex flex-col w-full h-full overflow-hidden relative"
    >
      {/* Single-line Horizontal Scroll Toolbar (Mobile-safe: never wraps!) */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)] overflow-x-auto no-scrollbar whitespace-nowrap">
        <div className="flex items-center gap-2 shrink-0">
          <AssetIcon symbol={symbol} size={20} />
          <span className="font-semibold text-[0.8125rem] text-[var(--text-primary)]">{symbol}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${
              wsConnected ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-500/15 text-[var(--text-secondary)]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
            {wsConnected ? 'LIVE' : 'FEED'}
          </span>

          <div className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

          <div className="flex items-center gap-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2 py-1 rounded-md text-[0.75rem] font-medium transition-colors cursor-pointer ${
                  timeframe === tf
                    ? 'bg-[var(--text-primary)] text-[var(--bg-card)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Drawing Tools */}
          <button
            onClick={() => {
              setDrawTool('cursor');
              setPendingTrendPt(null);
            }}
            title="Pointer"
            className={`p-1.5 rounded-md cursor-pointer ${drawTool === 'cursor' ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setDrawTool(drawTool === 'hline' ? 'cursor' : 'hline');
              setPendingTrendPt(null);
            }}
            title="Horizontal Line (Syncs to Team)"
            className={`p-1.5 rounded-md cursor-pointer ${drawTool === 'hline' ? 'bg-sky-500/20 text-sky-500' : 'text-[var(--text-secondary)]'}`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setDrawTool(drawTool === 'trend' ? 'cursor' : 'trend');
              setPendingTrendPt(null);
            }}
            title="Trendline (2 clicks, Syncs to Team)"
            className={`p-1.5 rounded-md cursor-pointer ${drawTool === 'trend' ? 'bg-amber-500/20 text-amber-500' : 'text-[var(--text-secondary)]'}`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
          </button>

          {symDrawingsCount > 0 && onDeleteDrawing && (
            <button
              onClick={() => {
                const last = roomDrawings.filter((d) => d.symbol === symbol).pop();
                if (last) onDeleteDrawing(last.id);
              }}
              title="Undo Last Team Drawing"
              className="p-1.5 rounded-md text-rose-500 hover:bg-rose-500/10 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

          <button
            onClick={() => setShowIndicatorsMenu((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[0.75rem] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Indicators</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Chart Settings"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSnapshot}
            title="Save Chart PNG"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            title="Fullscreen"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Indicators Dropdown */}
      {showIndicatorsMenu && (
        <div className="absolute right-3 top-11 z-30 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl p-3 space-y-2 text-[0.75rem]">
          <div className="flex items-center justify-between font-semibold text-[var(--text-primary)] pb-1 border-b border-[var(--border-subtle)]">
            <span>Chart Indicators</span>
            <button onClick={() => setShowIndicatorsMenu(false)} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {[
            { label: 'EMA 20 (Blue)', active: showEma20, toggle: () => setShowEma20((v) => !v) },
            { label: 'EMA 50 (Amber)', active: showEma50, toggle: () => setShowEma50((v) => !v) },
            { label: 'Volume Histogram', active: showVol, toggle: () => setShowVol((v) => !v) },
            { label: 'RSI (14) Sub-pane', active: showRsi, toggle: () => setShowRsi((v) => !v) },
          ].map((item) => (
            <label key={item.label} className="flex items-center justify-between cursor-pointer py-1">
              <span>{item.label}</span>
              <input type="checkbox" checked={item.active} onChange={item.toggle} className="accent-emerald-500" />
            </label>
          ))}
        </div>
      )}

      {/* OHLC Overlay Legend + Drawing Hint */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[0.6875rem] text-[var(--text-secondary)] border-b border-[var(--border-subtle)] overflow-x-auto no-scrollbar whitespace-nowrap">
        {latest ? (
          <div className="flex items-center gap-3 tabular-nums">
            <span className="font-semibold text-[var(--text-primary)]">
              {symbol} · {timeframe}
            </span>
            <span>O {latest.open}</span>
            <span>H {latest.high}</span>
            <span>L {latest.low}</span>
            <span className={latest.close >= latest.open ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'}>
              C {latest.close}
            </span>
          </div>
        ) : (
          <span>Loading market feed...</span>
        )}
        {drawTool !== 'cursor' && (
          <span className="text-sky-500 font-medium">
            {drawTool === 'hline'
              ? 'Click chart to place Horizontal Line'
              : pendingTrendPt
              ? 'Click 2nd point to complete Trendline'
              : 'Click 1st point for Trendline'}
          </span>
        )}
      </div>

      {/* TradingView Lightweight Charts Canvas */}
      <div ref={containerRef} className="w-full flex-1 min-h-[20rem]" />

      {/* Chart Customization Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="tt-card w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-[0.9375rem] font-semibold">Chart Appearance</h3>
              <button onClick={() => setShowSettings(false)} className="cursor-pointer text-[var(--text-secondary)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[0.75rem]">
              <label className="flex items-center justify-between tt-subcard px-3 py-2">
                <span>Bull Body</span>
                <input type="color" value={styleCfg.upBody} onChange={(e) => setStyleCfg({ ...styleCfg, upBody: e.target.value, upBorder: e.target.value, upWick: e.target.value })} />
              </label>
              <label className="flex items-center justify-between tt-subcard px-3 py-2">
                <span>Bear Body</span>
                <input type="color" value={styleCfg.downBody} onChange={(e) => setStyleCfg({ ...styleCfg, downBody: e.target.value, downBorder: e.target.value, downWick: e.target.value })} />
              </label>
              <label className="flex items-center justify-between tt-subcard px-3 py-2 col-span-2">
                <span>Show Background Grid</span>
                <input type="checkbox" checked={styleCfg.showGrid} onChange={(e) => setStyleCfg({ ...styleCfg, showGrid: e.target.checked })} className="accent-emerald-500" />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.8125rem] font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
