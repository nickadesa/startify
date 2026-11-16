import React from "react";
import { MessageSquare, Zap, Shield } from "lucide-react";
import { ChatMessage, CockpitState } from "../types/arena";
import { BrandIcon } from "./BrandIcon";

interface GrokBotChatViewProps {
  messages: ChatMessage[];
  cockpit: CockpitState;
  onTriggerScan: () => void;
  scanning: boolean;
}

const EVENT_COLORS: Record<ChatMessage["event_type"], { bg: string; fg: string; label: string }> = {
  TRADE_OPEN: { bg: "rgba(52,199,89,0.14)", fg: "#34C759", label: "TRADE OPEN" },
  TRADE_CLOSE: { bg: "rgba(10,132,255,0.14)", fg: "#0A84FF", label: "TRADE CLOSE" },
  DEBATE: { bg: "rgba(255,159,10,0.16)", fg: "#FF9F0A", label: "AI DEBATE" },
  HOURLY_PULSE: { bg: "rgba(142,142,147,0.16)", fg: "#8E8E93", label: "HOURLY PULSE" },
  SUNDAY_SUMMIT: { bg: "rgba(175,82,222,0.16)", fg: "#AF52DE", label: "SUNDAY SUMMIT" },
};

export const GrokBotChatView: React.FC<GrokBotChatViewProps> = ({
  messages,
  cockpit,
  onTriggerScan,
  scanning,
}) => {
  const tokenPct = Math.min(100, (cockpit.daily_tokens_used / Math.max(1, cockpit.daily_token_cap)) * 100);

  return (
    <div className="space-y-6">
      <div className="apple-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#007AFF]/15 text-[#007AFF] flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[1.25rem] font-bold tracking-tight">GrokBot 24/7 AI Trading Floor</h2>
            <p className="text-[0.8125rem]" style={{ color: "var(--text-secondary)" }}>
              Event-driven autonomous AI discussions — strictly capped to protect daily token budget
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="w-[14rem]">
            <div className="flex justify-between text-[0.75rem] mb-1">
              <span style={{ color: "var(--text-secondary)" }}>Daily Token Budget</span>
              <span className="font-semibold tabular-nums">
                {cockpit.daily_tokens_used.toLocaleString()} / {cockpit.daily_token_cap.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-subtle)" }}>
              <div className="h-full rounded-full bg-[#007AFF]" style={{ width: `${tokenPct}%` }} />
            </div>
          </div>

          <button
            onClick={onTriggerScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[0.8125rem] font-semibold bg-[#007AFF] text-white hover:opacity-90 transition"
          >
            <Zap className="w-4 h-4" />
            {scanning ? "Scanning..." : "Trigger AI Pulse"}
          </button>
        </div>
      </div>

      <div className="apple-card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-2 text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>
          <Shield className="w-4 h-4 text-[#34C759]" />
          <span>Token Guard Active: Max 140 tokens/msg • 1 Conflict Debate / 2h • 1 Rotating Pulse / 1h • Auto-mirrors to Discord #grokbot-floor</span>
        </div>

        <div className="space-y-3">
          {messages.map((m) => {
            const badge = EVENT_COLORS[m.event_type] || EVENT_COLORS.HOURLY_PULSE;
            return (
              <div key={m.id} className="apple-subcard p-4 flex items-start gap-3.5">
                <img src={m.avatar} alt={m.agent_name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <BrandIcon brand={m.brand_key} size={18} />
                    <span className="font-semibold text-[0.9375rem]">{m.agent_name}</span>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[0.6875rem] font-bold tracking-wide"
                      style={{ backgroundColor: badge.bg, color: badge.fg }}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[0.75rem] ml-auto tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {m.tokens_used} tok • {new Date(m.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[0.875rem] leading-relaxed">{m.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
