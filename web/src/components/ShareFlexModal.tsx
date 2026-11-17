import React, { useState } from "react";
import { Crown, Send, X, Check } from "lucide-react";
import { ArenaState } from "../types/arena";
import { BrandIcon } from "./BrandIcon";

interface ShareFlexModalProps {
  state: ArenaState;
  onClose: () => void;
  onSendDiscord: () => Promise<void>;
}

export const ShareFlexModal: React.FC<ShareFlexModalProps> = ({ state, onClose, onSendDiscord }) => {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const totalProfit = state.ais.reduce((acc, a) => acc + a.total_pnl, 0);
  const totalBalance = state.cockpit.total_balance;

  const handleDiscord = async () => {
    setSending(true);
    await onSendDiscord();
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md">
      <div className="w-full max-w-[34rem] relative">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white text-black shadow-lg hover:scale-105 transition"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className="rounded-[20px] p-6 md:p-7 text-[#F2F2F5] overflow-hidden relative"
          style={{
            backgroundColor: "#131417",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[1.125rem] font-semibold tracking-tight">TOPTIERclub</div>
              <div className="text-[0.75rem] text-[#9A9AA3]">Autonomous Multi-AI Quant Arena</div>
            </div>
            <div className="text-right text-[0.75rem] text-[#9A9AA3] tabular-nums">
              <div>{new Date(state.updated_at).toLocaleDateString()}</div>
              <div className="text-[#F2F2F5] font-medium">@TOPTIERclub</div>
            </div>
          </div>

          <div className="mb-5">
            <div className="text-[0.75rem] text-[#9A9AA3] font-medium">Total Arena Profit</div>
            <div className="text-[2.5rem] leading-tight font-semibold tabular-nums text-[#30D158]">
              {totalProfit >= 0 ? `+$${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `-$${Math.abs(totalProfit).toFixed(2)}`}
            </div>
            <div className="flex items-center gap-6 mt-2 text-[0.8125rem]">
              <div>
                <span className="text-[#9A9AA3]">Total balance </span>
                <span className="font-medium tabular-nums">${totalBalance.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[#9A9AA3]">Active AIs </span>
                <span className="font-medium tabular-nums">{state.ais.length}</span>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-4 mb-5"
            style={{ backgroundColor: "#1B1C20", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="grid grid-cols-12 text-[0.75rem] text-[#9A9AA3] pb-2 border-b border-white/10">
              <div className="col-span-6">AI trader</div>
              <div className="col-span-3 text-right">Balance</div>
              <div className="col-span-3 text-right">Day PnL</div>
            </div>
            <div className="divide-y divide-white/10">
              {state.ais.slice(0, 5).map((ai) => (
                <div key={ai.agent_id} className="grid grid-cols-12 items-center py-2 text-[0.8125rem] tabular-nums">
                  <div className="col-span-6 flex items-center gap-2 truncate">
                    <BrandIcon brand={ai.brand_key} size={22} />
                    <span className="font-medium truncate">{ai.short_name}</span>
                    {ai.is_leader && <Crown className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />}
                  </div>
                  <div className="col-span-3 text-right">${ai.equity.toLocaleString()}</div>
                  <div className={`col-span-3 text-right font-medium ${ai.day_pnl >= 0 ? "text-[#30D158]" : "text-[#FF453A]"}`}>
                    {ai.day_pnl >= 0 ? `+$${ai.day_pnl.toFixed(0)}` : `-$${Math.abs(ai.day_pnl).toFixed(0)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-[0.75rem] text-[#9A9AA3]">
              XAUUSD <span className="font-medium text-[#F2F2F5] tabular-nums">${state.cockpit.xauusd_price.toFixed(2)}</span>
            </div>
            <button
              onClick={handleDiscord}
              disabled={sending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[0.8125rem] font-medium bg-[#F2F2F5] text-[#0B0C0E] hover:opacity-90 transition-opacity"
            >
              {sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {sent ? "Sent to Discord" : sending ? "Sending..." : "Post to Discord"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
