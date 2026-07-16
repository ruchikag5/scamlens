import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Sparkles, AlertCircle } from "lucide-react";
import { FollowUpMessage, ScamAnalysis } from "../types";

interface FollowUpAssistantProps {
  analysis: ScamAnalysis;
  originalText: string;
  originalCategory: string;
  messages: FollowUpMessage[];
  onSendMessage: (text: string) => Promise<void>;
  isGenerating: boolean;
}

export default function FollowUpAssistant({
  analysis,
  originalText,
  originalCategory,
  messages,
  onSendMessage,
  isGenerating
}: FollowUpAssistantProps) {
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
  useEffect(() => {
    if (messages.length > 0 || isGenerating) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isGenerating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isGenerating) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  return (
    <div className="p-6 bg-white rounded-2xl border border-pastel-border shadow-xs flex flex-col h-[520px] animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-pastel-border/60 mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-display font-extrabold text-base text-emerald-950">
              Ask ScamLens a follow-up
            </h4>
            <p className="text-[11px] font-mono text-pastel-text/50">
              Contextual threat assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/60 font-mono font-medium text-emerald-800">
          <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" />
          <span>Active Context</span>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0 select-text">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="p-3 bg-pastel-bg rounded-2xl text-pastel-text/30 border border-pastel-border/40">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div className="max-w-[280px]">
              <p className="font-display font-bold text-sm text-pastel-text/80">
                No follow-up questions yet
              </p>
              <p className="text-xs text-pastel-text/50 mt-1">
                Ask how to double check the sender, why it looks suspicious, or what specific precautions to take next.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    isUser
                      ? "bg-emerald-600 text-white rounded-br-none shadow-2xs font-medium"
                      : "bg-pastel-bg text-pastel-text rounded-bl-none border border-pastel-border/40"
                  }`}
                >
                  <p className="whitespace-pre-line break-words">{msg.text}</p>
                </div>
                <span className="text-[10px] font-mono text-pastel-text/40 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            );
          })
        )}

        {isGenerating && (
          <div className="flex flex-col items-start">
            <div className="px-4 py-3 bg-pastel-bg text-pastel-text rounded-2xl rounded-bl-none border border-pastel-border/40 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
            </div>
            <span className="text-[10px] font-mono text-pastel-text/40 mt-1 px-1">
              Analyzing query...
            </span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-pastel-border/60 flex-shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask follow-up (e.g. Is this safe to reply to?)"
            disabled={isGenerating}
            className="w-full pl-4 pr-12 py-3 bg-pastel-bg hover:bg-pastel-bg/80 focus:bg-white text-sm text-pastel-text placeholder:text-pastel-text/40 rounded-xl border border-pastel-border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isGenerating}
            className={`absolute right-1.5 p-2 rounded-lg transition-all ${
              inputText.trim() && !isGenerating
                ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                : "bg-pastel-border text-pastel-text/30 cursor-not-allowed"
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-pastel-text/40 text-center mt-2.5 font-mono flex items-center justify-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          Answers are specific to this message analysis.
        </p>
      </form>
    </div>
  );
}
