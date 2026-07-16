import React, { useState } from "react";
import { 
  ShieldCheck, 
  AlertTriangle, 
  ShieldAlert, 
  HelpCircle, 
  Copy, 
  Check, 
  ArrowRight,
  Info,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { ScamAnalysis } from "../types";

export const PRESET_FOLLOWUPS = [
  "Why is this risky?",
  "What should I check?",
  "How should I reply?",
  "Is this safe to click?",
  "What are the top 3 red flags?"
];

interface ScamAnalysisResultProps {
  analysis: ScamAnalysis;
  onAskFollowUp: (presetQuestion: string) => void;
  hidePresetsOnDesktop?: boolean;
}

export default function ScamAnalysisResult({ 
  analysis, 
  onAskFollowUp,
  hidePresetsOnDesktop = false
}: ScamAnalysisResultProps) {
  const [copied, setCopied] = useState(false);

  const { riskLevel, riskScore, summary, redFlags, explanation, safeNextSteps, safeReply } = analysis;

  // Color mappings for Risk Level
  const getRiskStyles = (level: string) => {
    const normLevel = level.toLowerCase();
    if (normLevel.includes("low")) {
      return {
        bg: "bg-emerald-50 border-emerald-200 text-emerald-800",
        badge: "bg-emerald-500 text-white",
        text: "text-emerald-600",
        barColor: "bg-emerald-500",
        icon: <ShieldCheck className="w-8 h-8 text-emerald-600" />
      };
    } else if (normLevel.includes("medium")) {
      return {
        bg: "bg-amber-50 border-amber-200 text-amber-800",
        badge: "bg-amber-500 text-amber-950",
        text: "text-amber-600",
        barColor: "bg-amber-500",
        icon: <AlertTriangle className="w-8 h-8 text-amber-600" />
      };
    } else if (normLevel.includes("high")) {
      return {
        bg: "bg-orange-50 border-orange-200 text-orange-900",
        badge: "bg-orange-500 text-white",
        text: "text-orange-600",
        barColor: "bg-orange-500",
        icon: <ShieldAlert className="w-8 h-8 text-orange-600" />
      };
    } else {
      // Critical Risk
      return {
        bg: "bg-rose-50 border-rose-200 text-rose-950",
        badge: "bg-rose-600 text-white animate-pulse",
        text: "text-rose-600",
        barColor: "bg-rose-600",
        icon: <ShieldAlert className="w-8 h-8 text-rose-600" />
      };
    }
  };

  const styles = getRiskStyles(riskLevel);

  const handleCopyReply = () => {
    navigator.clipboard.writeText(safeReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Preset follow-up helper triggers are now defined as a module-level export

  return (
    <div className="space-y-6 animate-fade-in-up">
      {analysis.isFallback && (
        <div className="p-4 bg-amber-50/95 border border-amber-200 text-amber-900 rounded-2xl text-xs flex items-start gap-3 shadow-3xs">
          <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="leading-relaxed">
            <span className="font-bold block text-amber-950 mb-0.5">Local Heuristic Mode Active</span>
            Gemini AI model is currently experiencing high global demand. ScamLens has automatically scanned your message using our integrated local threat heuristics engine.
          </div>
        </div>
      )}

      {/* Risk Assessment Card */}
      <div className={`p-6 rounded-2xl border ${styles.bg} shadow-sm`}>
        <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white rounded-xl shadow-xs border border-white/40">
              {styles.icon}
            </div>
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60">
                Threat Assessment
              </span>
              <h3 className="font-display font-extrabold text-2xl flex items-center gap-2 mt-0.5">
                {riskLevel}
              </h3>
            </div>
          </div>

          <div className="text-right sm:text-right flex sm:flex-col items-baseline sm:items-end gap-2 justify-between w-full sm:w-auto">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60">
              Risk Score
            </span>
            <div className="flex items-baseline gap-1 bg-white/60 px-3 py-1 rounded-xl border border-white/80 shadow-2xs">
              <span className="font-mono font-extrabold text-3xl tracking-tight">
                {riskScore}
              </span>
              <span className="text-xs font-mono text-pastel-text/60">/100</span>
            </div>
          </div>
        </div>

        {/* Dynamic Risk Gauge bar */}
        <div className="mt-5">
          <div className="w-full bg-black/5 rounded-full h-3.5 overflow-hidden border border-black/5">
            <div 
              className={`h-full ${styles.barColor} transition-all duration-1000 ease-out rounded-full`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono mt-1.5 opacity-60 px-0.5">
            <span>0 (Safe)</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100 (Critical)</span>
          </div>
        </div>

        {/* One-Sentence Summary */}
        <div className="mt-5 pt-5 border-t border-black/5">
          <p className="font-display font-semibold text-base leading-relaxed text-pastel-text">
            "{summary}"
          </p>
        </div>
      </div>

      {/* Red Flags Card */}
      <div className="p-6 bg-white rounded-2xl border border-pastel-border shadow-xs">
        <h4 className="font-display font-bold text-lg text-emerald-950 flex items-center gap-2 mb-4">
          <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
          Red Flags Detected
        </h4>

        {redFlags && redFlags.length > 0 ? (
          <div className="flex flex-wrap gap-2.5">
            {redFlags.map((flag, idx) => (
              <span 
                key={idx}
                className="px-3.5 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-xl border border-red-100 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0 animate-pulse" />
                {flag}
              </span>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-emerald-50/40 text-emerald-800 text-xs rounded-xl border border-emerald-100/60 flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>No immediate severe red flags detected. This message appears standard, but remain cautious.</span>
          </div>
        )}
      </div>

      {/* Explanation breakdown */}
      <div className="p-6 bg-white rounded-2xl border border-pastel-border shadow-xs">
        <h4 className="font-display font-bold text-lg text-emerald-950 flex items-center gap-2 mb-3">
          <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
          Analysis &amp; Explanation
        </h4>
        <div className="text-pastel-text/90 text-sm leading-relaxed space-y-3">
          <p className="whitespace-pre-line">{explanation}</p>
        </div>
      </div>

      {/* Practical next steps */}
      <div className="p-6 bg-emerald-950 text-emerald-50 rounded-2xl border border-emerald-900 shadow-md">
        <h4 className="font-display font-bold text-lg text-white flex items-center gap-2.5 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          Safe Next Steps
        </h4>
        <ul className="space-y-3.5">
          {safeNextSteps && safeNextSteps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-3 text-sm">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-900 text-emerald-300 font-mono text-xs font-bold mt-0.5 flex-shrink-0 border border-emerald-800">
                {idx + 1}
              </span>
              <span className="text-emerald-100 font-medium leading-normal">{step}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Safe reply generator */}
      <div className="p-6 bg-white rounded-2xl border border-pastel-border shadow-xs">
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h4 className="font-display font-bold text-lg text-emerald-950 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
            Safe Reply Generator
          </h4>
          <button
            onClick={handleCopyReply}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors cursor-pointer"
            title="Copy reply text"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Reply</span>
              </>
            )}
          </button>
        </div>

        <div className="p-4 bg-pastel-bg rounded-xl border border-pastel-border/60 font-serif italic text-sm text-pastel-text/90 leading-relaxed relative">
          <span className="absolute -top-2.5 left-4 px-2 bg-white text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-600 border border-emerald-100 rounded-md">
            Draft Response
          </span>
          "{safeReply}"
        </div>
        <p className="text-[11px] text-pastel-text/50 font-mono mt-2.5 flex items-center gap-1">
          <Info className="w-3 h-3 flex-shrink-0" />
          Always think carefully before replying to unknown contacts.
        </p>
      </div>

      {/* Contextual Q&A prompt presets */}
      <div className={`p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-2xs ${hidePresetsOnDesktop ? "lg:hidden" : ""}`}>
        <h4 className="font-display font-bold text-sm text-emerald-950 flex items-center gap-2 mb-3">
          <HelpCircle className="w-4 h-4 text-emerald-600" />
          Need a quick answer? Select a follow-up:
        </h4>
        <div className="flex flex-wrap gap-2">
          {PRESET_FOLLOWUPS.map((q, idx) => (
            <button
              key={idx}
              onClick={() => onAskFollowUp(q)}
              className="px-3 py-1.5 bg-white hover:bg-emerald-50 hover:text-emerald-800 text-pastel-text/80 text-xs font-medium rounded-xl border border-pastel-border/80 hover:border-emerald-200 shadow-3xs hover:shadow-2xs transition-all duration-200 text-left flex items-center justify-between gap-2 group cursor-pointer"
            >
              <span>{q}</span>
              <ChevronRight className="w-3 h-3 text-emerald-400 group-hover:text-emerald-600 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
