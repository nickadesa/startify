import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';

export interface ShareTradeData {
  id: string;
  timestamp: string;
  direction: string;
  entry: number;
  stop_loss: number;
  tp1?: number;
  tp2?: number;
  lot: number;
  pnl_usd: number;
  status: string;
  execution_mode?: string;
  setup_label?: string;
}

export interface ShareCalendarDay {
  day: number;
  pnl: number;
  trades: number;
}

export interface ShareCalendarData {
  monthLabel: string;
  netPnl: number;
  winRate: number;
  totalTrades: number;
  days: ShareCalendarDay[];
}

type AspectRatio = '16:9' | '1:1' | '4:5' | '9:16';
type ResolutionTier = '1080p' | '2K' | '4K';

const DIMENSIONS: Record<AspectRatio, Record<ResolutionTier, [number, number]>> = {
  '16:9': { '1080p': [1920, 1080], '2K': [2560, 1440], '4K': [3840, 2160] },
  '1:1': { '1080p': [1080, 1080], '2K': [1440, 1440], '4K': [2160, 2160] },
  '4:5': { '1080p': [1080, 1350], '2K': [1440, 1800], '4K': [2160, 2700] },
  '9:16': { '1080p': [1080, 1920], '2K': [1440, 2560], '4K': [2160, 3840] },
};

interface ShareCardModalProps {
  mode: 'trade' | 'calendar';
  trade?: ShareTradeData | null;
  calendar?: ShareCalendarData | null;
  onClose: () => void;
}

function renderCardToCanvas(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  mode: 'trade' | 'calendar',
  trade?: ShareTradeData | null,
  calendar?: ShareCalendarData | null
) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scale = Math.min(w, h) / 1080;
  const pad = Math.round(72 * scale);

  // Pure black architectural background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Outer sharp frame
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(2, Math.round(2 * scale));
  ctx.strokeRect(pad * 0.5, pad * 0.5, w - pad, h - pad);

  // Header
  ctx.fillStyle = '#00ADFF';
  ctx.font = `700 ${Math.round(24 * scale)}px Inter, sans-serif`;
  ctx.fillText('STARTIFY · XAUUSD 8-AI QUANT DESK', pad, pad + Math.round(32 * scale));

  ctx.fillStyle = '#71717A';
  ctx.font = `500 ${Math.round(20 * scale)}px Inter, sans-serif`;
  ctx.fillText('$1,000.00 UNIFIED PORTFOLIO', pad, pad + Math.round(68 * scale));

  if (mode === 'trade' && trade) {
    const isWin = trade.pnl_usd >= 0;
    const pnlColor = isWin ? '#30D158' : '#FF453A';
    const side = trade.direction.toUpperCase();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.round(56 * scale)}px Inter, sans-serif`;
    ctx.fillText(`XAUUSD ${side}`, pad, pad + Math.round(160 * scale));

    ctx.fillStyle = pnlColor;
    ctx.font = `700 ${Math.round(108 * scale)}px Inter, sans-serif`;
    ctx.fillText(`${trade.pnl_usd >= 0 ? '+' : ''}$${trade.pnl_usd.toFixed(2)}`, pad, pad + Math.round(290 * scale));

    ctx.fillStyle = '#A1A1AA';
    ctx.font = `500 ${Math.round(26 * scale)}px Inter, sans-serif`;
    ctx.fillText(
      `Status: ${trade.status}  ·  ${trade.lot.toFixed(2)} lot  ·  ${trade.setup_label || 'Fib OTE + Orderflow'}`,
      pad,
      pad + Math.round(350 * scale)
    );

    // Metrics grid
    const boxY = pad + Math.round(420 * scale);
    const boxH = Math.round(150 * scale);
    const cols = [
      { label: 'ENTRY PRICE', value: `$${trade.entry.toFixed(2)}` },
      { label: 'STOP LOSS', value: `$${trade.stop_loss.toFixed(2)}` },
      { label: 'TP1 / TP2', value: `$${(trade.tp1 || trade.entry).toFixed(2)} / $${(trade.tp2 || trade.entry).toFixed(2)}` },
    ];
    const colW = (w - pad * 2) / 3;
    cols.forEach((c, idx) => {
      const cx = pad + idx * colW;
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(cx, boxY, colW - Math.round(16 * scale), boxH);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.strokeRect(cx, boxY, colW - Math.round(16 * scale), boxH);

      ctx.fillStyle = '#71717A';
      ctx.font = `600 ${Math.round(18 * scale)}px Inter, sans-serif`;
      ctx.fillText(c.label, cx + Math.round(24 * scale), boxY + Math.round(48 * scale));

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 ${Math.round(34 * scale)}px Inter, sans-serif`;
      ctx.fillText(c.value, cx + Math.round(24 * scale), boxY + Math.round(105 * scale));
    });

    ctx.fillStyle = '#71717A';
    ctx.font = `500 ${Math.round(20 * scale)}px Inter, sans-serif`;
    ctx.fillText(`Trade ID: ${trade.id}  ·  ${trade.timestamp.slice(0, 16).replace('T', ' ')} UTC`, pad, h - pad);
  } else if (mode === 'calendar' && calendar) {
    const pnlColor = calendar.netPnl >= 0 ? '#30D158' : '#FF453A';

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.round(48 * scale)}px Inter, sans-serif`;
    ctx.fillText(`${calendar.monthLabel} P&L`, pad, pad + Math.round(148 * scale));

    ctx.fillStyle = pnlColor;
    ctx.font = `700 ${Math.round(88 * scale)}px Inter, sans-serif`;
    ctx.fillText(`${calendar.netPnl >= 0 ? '+' : ''}$${calendar.netPnl.toFixed(2)}`, pad, pad + Math.round(252 * scale));

    ctx.fillStyle = '#A1A1AA';
    ctx.font = `500 ${Math.round(24 * scale)}px Inter, sans-serif`;
    ctx.fillText(`Win Rate: ${calendar.winRate.toFixed(1)}%  ·  Total Trades: ${calendar.totalTrades}`, pad, pad + Math.round(300 * scale));

    // Calendar 7-column grid
    const gridTop = pad + Math.round(350 * scale);
    const gridW = w - pad * 2;
    const gridH = h - gridTop - pad * 1.3;
    const cellW = gridW / 7;
    const rows = Math.ceil(Math.max(calendar.days.length, 28) / 7);
    const cellH = gridH / rows;

    calendar.days.forEach((d, idx) => {
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const x = pad + col * cellW;
      const y = gridTop + row * cellH;
      const gap = Math.round(6 * scale);

      ctx.fillStyle =
        d.trades === 0
          ? '#0A0A0A'
          : d.pnl >= 0
          ? 'rgba(48, 209, 88, 0.14)'
          : 'rgba(255, 69, 58, 0.14)';
      ctx.fillRect(x, y, cellW - gap, cellH - gap);
      ctx.strokeStyle =
        d.trades === 0 ? 'rgba(255,255,255,0.08)' : d.pnl >= 0 ? 'rgba(48,209,88,0.45)' : 'rgba(255,69,58,0.45)';
      ctx.strokeRect(x, y, cellW - gap, cellH - gap);

      ctx.fillStyle = '#71717A';
      ctx.font = `600 ${Math.round(16 * scale)}px Inter, sans-serif`;
      ctx.fillText(`${d.day}`, x + Math.round(12 * scale), y + Math.round(28 * scale));

      if (d.trades > 0) {
        ctx.fillStyle = d.pnl >= 0 ? '#30D158' : '#FF453A';
        ctx.font = `700 ${Math.round(20 * scale)}px Inter, sans-serif`;
        ctx.fillText(`${d.pnl >= 0 ? '+' : ''}$${d.pnl.toFixed(0)}`, x + Math.round(12 * scale), y + cellH - Math.round(22 * scale));
      }
    });

    ctx.fillStyle = '#71717A';
    ctx.font = `500 ${Math.round(18 * scale)}px Inter, sans-serif`;
    ctx.fillText('Generated by Startify XAUUSD Quant Desk', pad, h - pad * 0.75);
  }
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({ mode, trade, calendar, onClose }) => {
  const [ratio, setRatio] = useState<AspectRatio>('16:9');
  const [resTier, setResTier] = useState<ResolutionTier>('1080p');
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [targetW, targetH] = useMemo(() => DIMENSIONS[ratio][resTier], [ratio, resTier]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    // Render preview at <= 1280px so mobile GPUs never hit canvas size limits; download uses full 1080p/2K/4K
    const previewScale = Math.min(1, 1280 / Math.max(targetW, targetH));
    renderCardToCanvas(
      canvas,
      Math.round(targetW * previewScale),
      Math.round(targetH * previewScale),
      mode,
      trade,
      calendar
    );
  }, [targetW, targetH, mode, trade, calendar]);

  const handleDownload = () => {
    const offscreen = document.createElement('canvas');
    renderCardToCanvas(offscreen, targetW, targetH, mode, trade, calendar);
    const link = document.createElement('a');
    link.download = `startify-${mode}-${ratio.replace(':', 'x')}-${resTier}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-[#0A0A0A] border border-white/[0.16] w-full max-w-3xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.1] pb-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#00ADFF] font-semibold">
              Export Share Card
            </div>
            <div className="text-base font-bold text-white mt-0.5">
              {mode === 'trade' ? `Trade ${trade?.id || ''}` : `${calendar?.monthLabel || 'Monthly'} Calendar`}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 border border-white/[0.12] text-[#A1A1AA] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[#71717A] mr-1">Aspect</span>
            {(['16:9', '1:1', '4:5', '9:16'] as AspectRatio[]).map((r) => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                className={`px-2.5 py-1 text-[11px] font-semibold border ${
                  ratio === r ? 'bg-white text-black border-white' : 'border-white/[0.12] text-[#A1A1AA] hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[#71717A] mr-1">Resolution</span>
            {(['1080p', '2K', '4K'] as ResolutionTier[]).map((q) => (
              <button
                key={q}
                onClick={() => setResTier(q)}
                className={`px-2.5 py-1 text-[11px] font-semibold border ${
                  resTier === q ? 'bg-[#00ADFF] text-black border-[#00ADFF]' : 'border-white/[0.12] text-[#A1A1AA] hover:text-white'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-black border border-white/[0.1] p-3 flex items-center justify-center max-h-[55vh] overflow-hidden">
          <canvas
            ref={previewCanvasRef}
            className="max-w-full max-h-[50vh] w-auto h-auto object-contain border border-white/[0.1]"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-[#71717A] tabular-nums">
            Output: {targetW} × {targetH} px (PNG)
          </div>
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-[#E4E4E7] flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" /> Download {resTier} PNG
          </button>
        </div>
      </div>
    </div>
  );
};
