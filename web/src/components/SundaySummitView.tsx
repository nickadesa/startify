import React from "react";
import { Award, Sparkles, Send } from "lucide-react";
import { SummitData } from "../types/arena";

interface SundaySummitViewProps {
  summit: SummitData;
  onRunSummit: () => Promise<void>;
  running: boolean;
}

export const SundaySummitView: React.FC<SundaySummitViewProps> = ({
  summit,
  onRunSummit,
  running,
}) => {
  return (
    <div className="space-y-6">
      <div className="apple-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#FF9F0A]/15 text-[#FF9F0A] flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[1.25rem] font-bold tracking-tight">Sunday AI Summit — Weekly Mentorship & Evolution</h2>
            <p className="text-[0.8125rem]" style={{ color: "var(--text-secondary)" }}>
              Last Summit: {summit.last_summit} • Rank #1–#2 Mentors audit losing AIs & mutate playbooks
            </p>
          </div>
        </div>

        <button
          onClick={onRunSummit}
          disabled={running}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[0.875rem] font-semibold bg-[#FF9F0A] text-black hover:opacity-90 transition"
        >
          <Send className="w-4 h-4" />
          {running ? "Running Summit..." : "Run Sunday Summit Now"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 apple-card p-6 space-y-4">
          <h3 className="text-[1.0625rem] font-semibold">Mentorship Pairing</h3>
          <div className="apple-subcard p-4">
            <div className="text-[0.75rem] uppercase tracking-wider font-semibold text-[#34C759]">Mentors (Top Performers)</div>
            <div className="text-[1rem] font-bold mt-1">{summit.mentors.join(" & ")}</div>
          </div>
          <div className="apple-subcard p-4">
            <div className="text-[0.75rem] uppercase tracking-wider font-semibold text-[#FF3B30]">Mentees (Audited & Mutated)</div>
            <div className="text-[1rem] font-bold mt-1">{summit.mentees.join(" & ")}</div>
          </div>
          <div className="apple-subcard p-4 text-[0.875rem] leading-relaxed">
            <div className="font-semibold mb-1">Executive Summary</div>
            <p style={{ color: "var(--text-secondary)" }}>{summit.summary}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[0.8125rem] font-semibold mb-2">
              <Sparkles className="w-4 h-4 text-[#FF9F0A]" />
              Shared Rules Injected
            </div>
            <ul className="space-y-2">
              {summit.shared_rules.map((r, i) => (
                <li key={i} className="apple-subcard p-3 text-[0.8125rem]">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:col-span-7 apple-card p-6">
          <h3 className="text-[1.0625rem] font-semibold mb-4">Summit Deliberation Transcript</h3>
          <div className="space-y-3">
            {summit.transcript.map((item, idx) => (
              <div key={idx} className="apple-subcard p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[0.9375rem]">{item.speaker}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold bg-[#007AFF]/15 text-[#007AFF]">
                    {item.role}
                  </span>
                </div>
                <p className="text-[0.875rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
