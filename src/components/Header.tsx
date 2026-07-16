import React from "react";
import { ShieldCheck, Eye, Sparkles } from "lucide-react";

export default function Header() {
  return (
    <header className="w-full max-w-6xl mx-auto mb-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row items-center md:justify-between gap-6 p-6 bg-white rounded-2xl border border-pastel-border shadow-sm">
        <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-center">
            <Eye className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <h1 className="font-display font-extrabold text-3xl tracking-tight text-emerald-950 flex items-center gap-1.5">
                Scam<span className="text-emerald-600">Lens</span>
              </h1>
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                AI Powered
              </span>
            </div>
            <p className="font-display text-emerald-800 font-medium text-sm md:text-base mt-1">
              Spot scams before they spot you.
            </p>
          </div>
        </div>

        
      </div>

      <div className="p-5 bg-emerald-50/70 border border-emerald-100/80 rounded-2xl text-emerald-900 leading-relaxed text-sm md:text-base flex items-start gap-3.5 shadow-xs">
        <Sparkles className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
        <p>
          <strong>ScamLens</strong> is an AI-powered scam detector designed specifically for students and everyday internet users. 
          Paste a suspicious message (email, job offer, apartment listing, DM) or upload a screenshot. 
          Our visual scanner identifies hidden red flags, breaks down the risk score, and recommends safe next steps.
        </p>
      </div>
    </header>
  );
}
