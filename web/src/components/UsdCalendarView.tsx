import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ShieldAlert, Clock } from 'lucide-react';
import { UsdNewsEvent } from '../types/arena';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface Props {
  events: UsdNewsEvent[];
}

export const UsdCalendarView: React.FC<Props> = ({ events }) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.category));
    return ['all', ...Array.from(set)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (categoryFilter === 'all') return events;
    return events.filter((e) => e.category === categoryFilter);
  }, [events, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="w-4 h-4 text-[#00adff]" strokeWidth={1.6} />
            <h1 className="apple-title text-[#F5F5F7]">
              USD macroeconomic calendar & blackout rules
            </h1>
            <Badge variant="positive">USD only</Badge>
          </div>
          <p className="text-[13px] text-[#8E8E93]">
            Filtered strictly to US Dollar high-impact releases (FOMC, NFP, US CPI, Core PCE, ISM PMI) with automatic ±30m trade blackout protection
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono-tabular">
            {events.length} scheduled releases
          </Badge>
          <Badge variant="accent" className="font-mono-tabular">
            ±30m blackout guard
          </Badge>
        </div>
      </Card>

      {/* 3 Rule Cards (MyFundedFutures Rules Style) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8E8E93]">Currency scope</span>
            <ShieldAlert className="w-4 h-4 text-[#00adff]" strokeWidth={1.5} />
          </div>
          <div className="text-[20px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
            USD releases only
          </div>
          <p className="text-[12px] text-[#8E8E93]">
            EUR, GBP, JPY, and AUD events are ignored to prevent noisy false blackouts on XAUUSD
          </p>
        </Card>

        <Card className="p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8E8E93]">Blackout window</span>
            <Clock className="w-4 h-4 text-[#30D158]" strokeWidth={1.5} />
          </div>
          <div className="text-[20px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
            30 min before & after
          </div>
          <p className="text-[12px] text-[#8E8E93]">
            All 8 AI models hold new entries during high-impact USD news spikes and log shadow counterfactuals
          </p>
        </Card>

        <Card className="p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8E8E93]">Feed source</span>
            <Badge variant="positive">Active</Badge>
          </div>
          <div className="text-[20px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
            Finnhub + DXY / US10Y
          </div>
          <p className="text-[12px] text-[#8E8E93]">
            Surprise delta and 15m / 60m Gold price reaction are recorded into each AI post-mortem
          </p>
        </Card>
      </div>

      {/* Category Filter + Full Calendar Table */}
      <Card className="overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="apple-title text-[#F5F5F7]">Economic release schedule</h2>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">
              Actual vs consensus forecast and measured XAUUSD spot reaction
            </p>
          </div>

          <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
            <TabsList>
              {categories.slice(0, 5).map((cat) => (
                <TabsTrigger key={cat} value={cat}>
                  {cat === 'all' ? 'All events' : cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date & time (UTC)</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead className="text-right">Prior</TableHead>
              <TableHead className="text-right">15m Gold</TableHead>
              <TableHead className="text-right">60m Gold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.map((ev) => (
              <TableRow key={ev.event_id}>
                <TableCell className="font-mono-tabular whitespace-nowrap text-[#A1A1AA]">
                  {ev.time.slice(0, 16).replace('T', ' ')}
                </TableCell>
                <TableCell>
                  <Badge variant="accent">{ev.currency}</Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-[#F5F5F7]">{ev.name}</div>
                  <div className="text-[12px] text-[#8E8E93] mt-0.5">{ev.neutral_summary}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="negative">{ev.impact}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono-tabular font-medium text-[#F5F5F7]">
                  {ev.actual}
                </TableCell>
                <TableCell className="text-right font-mono-tabular text-[#A1A1AA]">
                  {ev.forecast}
                </TableCell>
                <TableCell className="text-right font-mono-tabular text-[#71717A]">
                  {ev.prior}
                </TableCell>
                <TableCell
                  className={`text-right font-mono-tabular ${
                    ev.gold_15m_move_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                  }`}
                >
                  {ev.gold_15m_move_usd >= 0 ? '+' : ''}${ev.gold_15m_move_usd.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono-tabular">
                  <Badge variant={ev.gold_60m_move_usd >= 0 ? 'positive' : 'negative'}>
                    {ev.gold_60m_move_usd >= 0 ? '+' : ''}${ev.gold_60m_move_usd.toFixed(2)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
