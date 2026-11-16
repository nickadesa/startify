import React, { useState } from "react";
import { MessageSquare, Zap, Shield, Send } from "lucide-react";
import { AITrader, ChatMessage, CockpitState } from "../types/arena";
import { BrandIcon } from "./BrandIcon";

interface GrokBotChatViewProps {
  messages: ChatMessage[];
  ais: AITrader[];
  cockpit: CockpitState;
  onTriggerScan: () => void;
  onSendUserMessage: (msg: string, targetAgentId?: string) => Promise<void>;
  scanning: boolean;
}

const EVENT_COLORS: Record<ChatMessage["event_type"], { bg: string; fg: string; label: string }> = {
  TRADE_OPEN: { bg: "rgba(52,199,89,0.14)", fg: "#34C759", label: "TRADE OPEN" },
  TRADE_CLOSE: { bg: "rgba(10,132,255,0.14)", fg: "#0A84FF", label: "TRADE CLOSE" },
  DEBATE: { bg: "rgba(255,159,10,0.16)", fg: "#FF9F0A", label: "AI CHAT" },
  HOURLY_PULSE: { bg: "rgba(142,142,147,0.16)", fg: "#8E8E93", label: "HOURLY PULSE" },
  SUNDAY_SUMMIT: { bg: "rgba(175,82,222,0.16)", fg: "#AF52DE", label: "SUNDAY SUMMIT" },
};

export const GrokBotChatView: React.FC<GrokBotChatViewProps> = ({
  messages,
  ais,
  cockpit,
  onTriggerScan,
  onSendUserMessage,
  scanning,
}) => {
  const [text, setText] = useState("");
  const [targetId, setTargetId] = useState<string>(ais[0]?.agent_id || "ai-1");
  const [sending, setSending] = useState(false);

  const tokenPct = Math.min(100, (cockpit.daily_tokens_used / Math.max(1, cockpit.daily_token_cap)) * 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    await onSendUserMessage(text, targetId);
    setText("");
    setSending(false);
  };

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
              Talk directly to any AI model or monitor autonomous 24/7 token-budgeted discussions
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

      {/* Commander Interactive Chat Input */}
      <form onSubmit={handleSubmit} className="apple-card p-4 flex flex-wrap items-center gap-3">
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="apple-pill px-3.5 py-2 text-[0.8125rem] font-semibold outline-none"
          style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-primary)" }}
        >
          {ais.map((a) => (
            <option key={a.agent_id} value={a.agent_id}>
              @{a.short_name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message an AI trader (e.g., What is your XAUUSD plan for Nov 17 open?)..."
          className="flex-1 min-w-[200px] apple-pill px-4 py-2 text-[0.875rem] outline-none"
          style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-primary)" }}
        />

        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[0.8125rem] font-semibold bg-[#007AFF] text-white disabled:opacity-50 transition"
        >
          <Send className="w-3.5 h-3.5" />
          {sending ? "Sending..." : "Send"}
        </button>
      </form>

      <div className="apple-card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-2 text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>
          <Shield className="w-4 h-4 text-[#34C759]" />
          <span>Token Guard Active: Max 140 tokens/msg • Auto-persisted • Mirrors to Discord #grokbot-floor</span>
        </div>

        <div className="space-y-3">
          {messages.map((m) => {
            const badge = EVENT_COLORS[m.event_type] || EVENT_COLORS.HOURLY_PULSE;
            return (
              <div key={m.id} className="apple-subcard p-4 flex items-start gap-3.5">
                <BrandIcon brand={m.brand_key} size={34} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
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
