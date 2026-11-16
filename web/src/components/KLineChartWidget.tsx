import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  Crosshair,
  Maximize2,
  Minimize2,
  MousePointer,
  Pencil,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  Chart,
  KLineData,
  Period,
  dispose,
  init,
  registerOverlay,
} from 'klinecharts';
import { AssetIcon } from './AssetIcon';
import { TraderPosition } from '../types/toptier';

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface KLineChartWidgetProps {
  symbol: string;
  candles: ChartCandle[];
  livePrice?: number | null;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  theme: 'light' | 'dark';
  openPositions: TraderPosition[];
  defaultIndicators?: string[];
  candleTypePref?: 'candle_solid' | 'candle_stroke' | 'ohlc' | 'area';
  showPositionLines?: boolean;
  replayActive?: boolean;
  replayBadge?: string;
  wsConnected?: boolean;
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M45', '1H', '4H', '1D', '1W'];

const PERIOD_MAP: Record<string, Period> = {
  M1: { type: 'minute', span: 1 },
  M5: { type: 'minute', span: 5 },
  M15: { type: 'minute', span: 15 },
  M45: { type: 'minute', span: 45 },
  '1H': { type: 'hour', span: 1 },
  '4H': { type: 'hour', span: 4 },
  '1D': { type: 'day', span: 1 },
  '1W': { type: 'week', span: 1 },
};

const DRAWING_TOOLS = [
  { id: 'horizontalStraightLine', label: 'H-Line', short: '—' },
  { id: 'horizontalRayLine', label: 'H-Ray', short: '→' },
  { id: 'straightLine', label: 'Trendline', short: '╱' },
  { id: 'rayLine', label: 'Ray', short: '↗' },
  { id: 'parallelStraightLine', label: 'Channel', short: '⫽' },
  { id: 'fibonacciLine', label: 'Fib Retrace', short: 'Fib' },
];

const INDICATORS_LIST = [
  { id: 'MA', label: 'MA (Moving Avg)', main: true },
  { id: 'EMA', label: 'EMA (Exponential)', main: true },
  { id: 'BOLL', label: 'BOLL (Bollinger)', main: true },
  { id: 'VOL', label: 'VOL (Volume)', main: false },
  { id: 'RSI', label: 'RSI (Relative Strength)', main: false },
  { id: 'MACD', label: 'MACD', main: false },
  { id: 'KDJ', label: 'KDJ Stochastic', main: false },
  { id: 'ATR', label: 'ATR (Volatility)', main: false },
];

let overlayRegistered = false;
function ensurePositionOverlayRegistered() {
  if (overlayRegistered) return;
  overlayRegistered = true;
  registerOverlay<{ label: string; color: string; dashed?: boolean }>({
    name: 'toptierPositionLine',
    totalStep: 2,
    lock: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (!coordinates.length) return [];
      const y = coordinates[0].y;
      const data = overlay.extendData || { label: '', color: '#00C076', dashed: false };
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: bounding.width, y },
            ],
          },
          styles: {
            style: data.dashed ? 'dashed' : 'solid',
            color: data.color,
            size: 1.5,
            dashedValue: [5, 4],
          },
        },
        {
          type: 'text',
          attrs: {
            x: 10,
            y: y - 4,
            text: data.label,
            align: 'left',
            baseline: 'bottom',
          },
          styles: {
            color: '#FFFFFF',
            backgroundColor: data.color,
            borderRadius: 4,
            paddingLeft: 6,
            paddingRight: 6,
            paddingTop: 3,
            paddingBottom: 3,
            size: 11,
            weight: 700,
          },
        },
      ];
    },
    createYAxisFigures: ({ coordinates, bounding, overlay }) => {
      if (!coordinates.length) return [];
      const y = coordinates[0].y;
      const price = overlay.points[0]?.value;
      const data = overlay.extendData || { label: '', color: '#00C076' };
      if (price === undefined) return [];
      return [
        {
          type: 'text',
          attrs: {
            x: 4,
            y,
            text: price >= 100 ? price.toFixed(2) : price.toFixed(4),
            align: 'left',
            baseline: 'middle',
          },
          styles: {
            color: '#FFFFFF',
            backgroundColor: data.color,
            borderRadius: 3,
            paddingLeft: 4,
            paddingRight: 4,
            paddingTop: 2,
            paddingBottom: 2,
            size: 11,
            weight: 700,
          },
          ignoreEvent: true,
        },
      ];
    },
  });
}

function getPricePrecision(sym: string): number {
  const s = sym.toUpperCase();
  if (s === 'EURUSD' || s === 'GBPUSD') return 4;
  if (s === 'USDJPY' || s === 'XAGUSD' || s === 'DXY') return 3;
  return 2;
}

export const KLineChartWidget: React.FC<KLineChartWidgetProps> = ({
  symbol,
  candles,
  livePrice,
  timeframe,
  onTimeframeChange,
  theme,
  openPositions,
  defaultIndicators = ['EMA', 'VOL'],
  candleTypePref = 'candle_solid',
  showPositionLines = true,
  replayActive = false,
  replayBadge,
  wsConnected = false,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const barsRef = useRef<KLineData[]>([]);
  const subscribeCbRef = useRef<((data: KLineData) => void) | null>(null);
  const lastDatasetKeyRef = useRef<string>('');

  const [activeTool, setActiveTool] = useState<string>('pointer');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(defaultIndicators);
  const [candleType, setCandleType] = useState<'candle_solid' | 'candle_stroke' | 'ohlc' | 'area'>(candleTypePref);
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showPosLines, setShowPosLines] = useState(showPositionLines);
  const [showIndMenu, setShowIndMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setCandleType(candleTypePref);
  }, [candleTypePref]);

  useEffect(() => {
    setShowPosLines(showPositionLines);
  }, [showPositionLines]);

  const toKLineData = (list: ChartCandle[]): KLineData[] =>
    list.map((c) => ({
      timestamp: c.time > 1e12 ? c.time : c.time * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));

  // Initialize KLineChart instance once
  useEffect(() => {
    if (!hostRef.current) return;
    ensurePositionOverlayRegistered();
    const chart = init(hostRef.current);
    if (!chart) return;
    chartRef.current = chart;

    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type === 'init') {
          callback(barsRef.current, { forward: false, backward: false });
        } else {
          callback([], { forward: false, backward: false });
        }
      },
      subscribeBar: ({ callback }) => {
        subscribeCbRef.current = callback;
      },
      unsubscribeBar: () => {
        subscribeCbRef.current = null;
      },
    });

    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      if (hostRef.current) {
        dispose(hostRef.current);
      }
      chartRef.current = null;
      subscribeCbRef.current = null;
    };
  }, []);

  // Apply Pure Black Dark / Light theme & chart settings
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isDark = theme === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.06)';
    const textColor = isDark ? '#A1A1AA' : '#4B5563';
    const borderColor = isDark ? '#1F1F1F' : '#E5E7EB';

    chart.setStyles({
      grid: {
        show: showGrid,
        horizontal: { show: showGrid, size: 1, color: gridColor, style: 'solid' },
        vertical: { show: showGrid, size: 1, color: gridColor, style: 'solid' },
      },
      candle: {
        type: candleType,
        bar: {
          upColor: '#00C076',
          downColor: '#FF3B69',
          noChangeColor: '#888888',
          upBorderColor: '#00C076',
          downBorderColor: '#FF3B69',
          noChangeBorderColor: '#888888',
          upWickColor: '#00C076',
          downWickColor: '#FF3B69',
          noChangeWickColor: '#888888',
        },
        area: {
          lineSize: 2,
          lineColor: '#00C076',
          value: 'close',
          backgroundColor: [
            { offset: 0, color: 'rgba(0,192,118,0.02)' },
            { offset: 1, color: 'rgba(0,192,118,0.28)' },
          ],
        },
        priceMark: {
          show: true,
          high: { show: true, color: textColor },
          low: { show: true, color: textColor },
          last: {
            show: true,
            upColor: '#00C076',
            downColor: '#FF3B69',
            noChangeColor: '#888888',
            line: { show: true, style: 'dashed', dashedValue: [4, 4], size: 1 },
          },
        },
      },
      xAxis: {
        axisLine: { show: true, color: borderColor, size: 1 },
        tickLine: { show: true, color: borderColor, size: 1, length: 3 },
        tickText: { color: textColor, size: 11 },
      },
      yAxis: {
        axisLine: { show: true, color: borderColor, size: 1 },
        tickLine: { show: true, color: borderColor, size: 1, length: 3 },
        tickText: { color: textColor, size: 11 },
      },
      crosshair: {
        show: showCrosshair,
        horizontal: {
          show: showCrosshair,
          line: { show: true, style: 'dashed', dashedValue: [4, 4], size: 1, color: isDark ? '#52525B' : '#9CA3AF' },
        },
        vertical: {
          show: showCrosshair,
          line: { show: true, style: 'dashed', dashedValue: [4, 4], size: 1, color: isDark ? '#52525B' : '#9CA3AF' },
        },
      },
      separator: {
        size: 1,
        color: borderColor,
      },
    });
  }, [theme, candleType, showGrid, showCrosshair]);

  // Sync candles, symbol & period into KLineChart v10
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    const mapped = toKLineData(candles);
    const prevBars = barsRef.current;
    const datasetKey = `${symbol}_${timeframe}`;

    // If same symbol/timeframe and only 1 new bar or last bar updated, stream via subscribeBar callback
    const isIncremental =
      lastDatasetKeyRef.current === datasetKey &&
      prevBars.length > 0 &&
      (mapped.length === prevBars.length || mapped.length === prevBars.length + 1) &&
      mapped[0].timestamp === prevBars[0].timestamp;

    barsRef.current = mapped;

    if (isIncremental && subscribeCbRef.current) {
      subscribeCbRef.current(mapped[mapped.length - 1]);
    } else {
      lastDatasetKeyRef.current = datasetKey;
      const prec = getPricePrecision(symbol);
      chart.setSymbol({ ticker: symbol, pricePrecision: prec, volumePrecision: 2 });
      chart.setPeriod(PERIOD_MAP[timeframe] || { type: 'minute', span: 15 });
    }
  }, [candles, symbol, timeframe]);

  // Real-time livePrice tick update on latest bar
  useEffect(() => {
    if (!livePrice || barsRef.current.length === 0 || !subscribeCbRef.current) return;
    const last = { ...barsRef.current[barsRef.current.length - 1] };
    last.close = livePrice;
    if (livePrice > last.high) last.high = livePrice;
    if (livePrice < last.low) last.low = livePrice;
    barsRef.current[barsRef.current.length - 1] = last;
    subscribeCbRef.current(last);
  }, [livePrice]);

  // Sync active indicators
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeIndicator();
    for (const indName of activeIndicators) {
      const meta = INDICATORS_LIST.find((i) => i.id === indName);
      if (meta?.main) {
        chart.createIndicator({ name: indName, paneId: 'candle_pane' }, true);
      } else {
        chart.createIndicator(indName, false);
      }
    }
  }, [activeIndicators, symbol, timeframe]);

  // Draw Open Positions (Entry, TP, SL) directly on the KLineChart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ groupId: 'toptier_positions' });
    if (!showPosLines || openPositions.length === 0 || barsRef.current.length === 0) return;

    const latestTs = barsRef.current[barsRef.current.length - 1].timestamp;
    const prec = getPricePrecision(symbol);

    for (const pos of openPositions) {
      const isLong = pos.side === 'LONG';
      const color = isLong ? '#00C076' : '#FF3B69';
      const mark = livePrice || pos.entry_price;
      const dir = isLong ? 1 : -1;
      const pnl = ((mark - pos.entry_price) / pos.entry_price) * pos.notional_usd * dir;
      const pnlTxt = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;

      chart.createOverlay({
        name: 'toptierPositionLine',
        groupId: 'toptier_positions',
        points: [{ timestamp: latestTs, value: pos.entry_price }],
        extendData: {
          label: `${pos.side} ${pos.leverage}x · $${pos.entry_price.toFixed(prec)} (${pnlTxt})`,
          color,
          dashed: false,
        },
      });

      if (pos.take_profit && pos.take_profit > 0) {
        chart.createOverlay({
          name: 'toptierPositionLine',
          groupId: 'toptier_positions',
          points: [{ timestamp: latestTs, value: pos.take_profit }],
          extendData: {
            label: `TP $${pos.take_profit.toFixed(prec)}`,
            color: '#10B981',
            dashed: true,
          },
        });
      }

      if (pos.stop_loss && pos.stop_loss > 0) {
        chart.createOverlay({
          name: 'toptierPositionLine',
          groupId: 'toptier_positions',
          points: [{ timestamp: latestTs, value: pos.stop_loss }],
          extendData: {
            label: `SL $${pos.stop_loss.toFixed(prec)}`,
            color: '#F59E0B',
            dashed: true,
          },
        });
      }
    }
  }, [openPositions, showPosLines, symbol, livePrice, candles.length]);

  useEffect(() => {
    setTimeout(() => chartRef.current?.resize(), 50);
  }, [isFullscreen]);

  const handleSelectTool = (toolId: string) => {
    setActiveTool(toolId);
    if (toolId !== 'pointer') {
      chartRef.current?.createOverlay({ name: toolId, groupId: 'user_drawings' });
    }
  };

  const handleClearDrawings = () => {
    chartRef.current?.removeOverlay({ groupId: 'user_drawings' });
    setActiveTool('pointer');
  };

  const handleToggleIndicator = (id: string) => {
    setActiveIndicators((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSnapshot = () => {
    const url = chartRef.current?.getConvertPictureUrl(true, 'png', theme === 'dark' ? '#000000' : '#FFFFFF');
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `TOPTIERclub_${symbol}_${timeframe}.png`;
    a.click();
  };

  const lastBar = candles[candles.length - 1];
  const displayPrice = livePrice || lastBar?.close || 0;
  const prec = getPricePrecision(symbol);

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-dvh flex flex-col bg-[var(--bg-card)]'
          : 'relative w-full h-full flex flex-col bg-[var(--bg-card)]'
      }
    >
      {/* Top Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2 min-w-0">
          <AssetIcon symbol={symbol} size={18} />
          <span className="font-bold text-[0.875rem]">{symbol}</span>
          <span className="text-[0.8125rem] font-mono font-bold tabular-nums text-[var(--text-primary)]">
            ${displayPrice.toLocaleString(undefined, { minimumFractionDigits: prec, maximumFractionDigits: prec })}
          </span>
          {replayActive ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[0.6875rem] font-bold">
              {replayBadge || '10m REPLAY 30x'}
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold ${
                wsConnected ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
              {wsConnected ? 'LIVE' : 'FEED'}
            </span>
          )}
        </div>

        {/* Timeframes */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-1 rounded-md text-[0.75rem] font-semibold cursor-pointer transition-colors ${
                timeframe === tf
                  ? 'bg-[var(--text-primary)] text-[var(--bg-card)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Chart Actions: Indicators, Settings, Mobile Tools, Snapshot, Fullscreen */}
        <div className="flex items-center gap-1.5 relative">
          <button
            onClick={() => setShowMobileTools((v) => !v)}
            className={`sm:hidden inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[0.75rem] font-semibold cursor-pointer ${
              showMobileTools
                ? 'border-[var(--text-primary)] bg-[var(--bg-subtle)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Draw</span>
          </button>

          <div className="relative">
            <button
              onClick={() => {
                setShowIndMenu((v) => !v);
                setShowSettingsMenu(false);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[0.75rem] font-semibold cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Indicators ({activeIndicators.length})</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showIndMenu && (
              <div className="absolute right-0 top-9 z-40 w-56 tt-card p-2 rounded-xl shadow-2xl space-y-1">
                <div className="text-[0.6875rem] font-bold text-[var(--text-muted)] px-2 py-1 uppercase">Technical Indicators</div>
                {INDICATORS_LIST.map((ind) => {
                  const active = activeIndicators.includes(ind.id);
                  return (
                    <button
                      key={ind.id}
                      onClick={() => handleToggleIndicator(ind.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[0.75rem] font-medium cursor-pointer ${
                        active ? 'bg-emerald-500/15 text-emerald-500 font-bold' : 'hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <span>{ind.label}</span>
                      <span>{active ? 'ON' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowSettingsMenu((v) => !v);
                setShowIndMenu(false);
              }}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              title="Chart Settings"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            {showSettingsMenu && (
              <div className="absolute right-0 top-9 z-40 w-64 tt-card p-3 rounded-xl shadow-2xl space-y-3 text-[0.75rem]">
                <div className="font-bold text-[0.8125rem] border-b border-[var(--border-subtle)] pb-1.5">Chart Settings</div>
                <div>
                  <div className="text-[var(--text-muted)] mb-1">Candle Style</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'candle_solid', label: 'Solid' },
                        { id: 'candle_stroke', label: 'Hollow' },
                        { id: 'ohlc', label: 'OHLC Bars' },
                        { id: 'area', label: 'Area' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setCandleType(st.id)}
                        className={`py-1 px-2 rounded-lg font-semibold cursor-pointer ${
                          candleType === st.id
                            ? 'bg-[var(--text-primary)] text-[var(--bg-card)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Show Grid Lines</span>
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Show Crosshair</span>
                  <input type="checkbox" checked={showCrosshair} onChange={(e) => setShowCrosshair(e.target.checked)} className="accent-emerald-500" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Show Entry / TP / SL on Chart</span>
                  <input type="checkbox" checked={showPosLines} onChange={(e) => setShowPosLines(e.target.checked)} className="accent-emerald-500" />
                </label>
              </div>
            )}
          </div>

          <button
            onClick={handleSnapshot}
            className="hidden sm:inline-flex p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title="Save Chart PNG"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Mobile Collapsible Drawing Bar */}
      {showMobileTools && (
        <div className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] overflow-x-auto no-scrollbar">
          <button
            onClick={() => handleSelectTool('pointer')}
            className={`px-2.5 py-1 rounded-lg text-[0.75rem] font-semibold shrink-0 cursor-pointer ${
              activeTool === 'pointer' ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'bg-[var(--bg-card)]'
            }`}
          >
            Cursor
          </button>
          {DRAWING_TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectTool(t.id)}
              className={`px-2.5 py-1 rounded-lg text-[0.75rem] font-semibold shrink-0 cursor-pointer ${
                activeTool === t.id ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'bg-[var(--bg-card)]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={handleClearDrawings}
            className="px-2.5 py-1 rounded-lg text-[0.75rem] font-semibold text-rose-500 bg-[var(--bg-card)] shrink-0 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Main Chart Body: Left Drawing Rail (Desktop) + KLineChart Canvas */}
      <div className="flex-1 flex min-h-0">
        <div className="hidden sm:flex flex-col items-center gap-1.5 py-2.5 px-1.5 border-r border-[var(--border-subtle)] bg-[var(--bg-card)] w-10 shrink-0">
          <button
            onClick={() => handleSelectTool('pointer')}
            className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${
              activeTool === 'pointer' ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
            title="Pointer"
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowCrosshair((v) => !v)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${
              showCrosshair ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            } hover:bg-[var(--bg-subtle)]`}
            title="Toggle Crosshair"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <div className="w-5 h-px bg-[var(--border-subtle)] my-0.5" />
          {DRAWING_TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectTool(t.id)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[0.75rem] font-bold cursor-pointer ${
                activeTool === t.id ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
              title={t.label}
            >
              {t.short}
            </button>
          ))}
          <div className="w-5 h-px bg-[var(--border-subtle)] my-0.5" />
          <button
            onClick={handleClearDrawings}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-500/10 cursor-pointer"
            title="Clear Drawings"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* KLineChart Canvas (60dvh on mobile for spacious touch charting, 100% height on desktop) */}
        <div
          ref={hostRef}
          className={`flex-1 w-full ${
            isFullscreen ? 'h-full' : 'min-h-[60dvh] md:min-h-[30rem] h-full'
          }`}
          style={{ backgroundColor: theme === 'dark' ? '#000000' : '#FFFFFF' }}
        />
      </div>
    </div>
  );
};
