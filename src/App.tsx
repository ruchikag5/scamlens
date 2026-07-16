import React, { useState, useRef, useEffect } from "react";
import { 
  FileText, 
  Image as ImageIcon, 
  Upload, 
  AlertCircle, 
  Sparkles, 
  RefreshCw, 
  Trash2, 
  ChevronRight,
  ShieldCheck,
  Zap,
  BookOpen,
  HelpCircle,
  MessageSquareText,
  X
} from "lucide-react";
import Header from "./components/Header";
import ScamAnalysisResult, { PRESET_FOLLOWUPS } from "./components/ScamAnalysisResult";
import FollowUpAssistant from "./components/FollowUpAssistant";
import { DEMO_SAMPLES } from "./demoData";
import { ScamCategory, ScamAnalysis, FollowUpMessage } from "./types";

export default function App() {
  const [inputMode, setInputMode] = useState<"text" | "screenshot">("text");
  const [category, setCategory] = useState<ScamCategory>("job");
  const [textInput, setTextInput] = useState("");
  
  // Screenshot states
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Analysis states
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ScamAnalysis | null>(null);

  // Follow-up states
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>([]);
  const [isFollowUpGenerating, setIsFollowUpGenerating] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  // Smooth scroll to results once analysis is ready
  useEffect(() => {
    if (analysis) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [analysis]);

  // Feedback states
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackWho, setFeedbackWho] = useState("student");
  const [feedbackAbout, setFeedbackAbout] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    const feedbackObj = {
      who: feedbackWho,
      about: feedbackAbout,
      text: feedbackText,
      timestamp: new Date().toISOString()
    };

    const existing = JSON.parse(localStorage.getItem("scamlens_feedback") || "[]");
    existing.push(feedbackObj);
    localStorage.setItem("scamlens_feedback", JSON.stringify(existing));

    setFeedbackSubmitted(true);
  };

  const handleCloseFeedback = () => {
    setShowFeedbackModal(false);
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setFeedbackWho("student");
      setFeedbackAbout("");
      setFeedbackText("");
    }, 300);
  };

  // Categories list
  const CATEGORIES: { value: ScamCategory; label: string; icon: string; desc: string }[] = [
    { value: "job", label: "Job Offer", icon: "💼", desc: "Remote work, quick tasks, paid training checks" },
    { value: "apartment", label: "Apartment/Rental", icon: "🏠", desc: "Out of town landlord, upfront deposits" },
    { value: "phishing", label: "Phishing Email", icon: "✉️", desc: "Suspicious alerts, fake customer support" },
    { value: "marketplace", label: "Marketplace Sale", icon: "🛍️", desc: "Zelle business upgrades, non-cash hold fees" },
    { value: "social_dm", label: "Social Media DM", icon: "💬", desc: "Crypto advice, sponsor offers, unknown links" },
    { value: "giveaway", label: "Giveaway/Prize", icon: "🎉", desc: "Courier courier handling fee, timer limits" },
    { value: "banking", label: "Banking/Payment", icon: "🏦", desc: "Account freeze warnings, wire transfers" },
    { value: "other", label: "Other Risk", icon: "🔍", desc: "Unusual pressure, unverified digital contact" }
  ];

  // Load a demo sample
  const handleLoadSample = (sampleId: string) => {
    const sample = DEMO_SAMPLES.find(s => s.id === sampleId);
    if (sample) {
      setInputMode("text");
      setCategory(sample.category);
      setTextInput(sample.text);
      // Reset any previous results
      setAnalysis(null);
      setFollowUpMessages([]);
      setError(null);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processImageFile(file);
    } else {
      setError("Please drop a valid image file (PNG, JPG, JPEG).");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  // Perform Gemini analysis
  const handleAnalyze = async () => {
    setError(null);
    setAnalysis(null);
    setFollowUpMessages([]);

    if (inputMode === "text" && !textInput.trim()) {
      setError("Please paste a suspicious message or load a sample.");
      return;
    }

    if (inputMode === "screenshot" && !imagePreview) {
      setError("Please upload or drop a screenshot of the message.");
      return;
    }

    setLoading(true);
    setLoadingStep("Extracting text and scanning context...");

    try {
      let requestBody: any = {
        category,
      };

      if (inputMode === "text") {
        requestBody.text = textInput;
      } else if (inputMode === "screenshot" && imagePreview) {
        setLoadingStep("Processing screenshot with Gemini Vision...");
        const match = imagePreview.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          requestBody.imageType = match[1];
          requestBody.image = match[2];
        } else {
          throw new Error("Invalid screenshot format. Please try another image.");
        }
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Server failed to analyze the message.");
      }

      setLoadingStep("Identifying hidden red flags...");
      const data = await response.json();

      setLoadingStep("Finalizing safety report...");
      await new Promise(resolve => setTimeout(resolve, 600)); // smooth experience transition

      setAnalysis(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle conversational follow-up questions
  const handleSendFollowUp = async (questionText: string) => {
    if (!analysis) return;

    const userMsg: FollowUpMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setFollowUpMessages(prev => [...prev, userMsg]);
    setIsFollowUpGenerating(true);

    try {
      const response = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          originalText: inputMode === "text" ? textInput : "(Analyzed via screenshot)",
          originalCategory: category,
          previousAnalysis: analysis
        })
      });

      if (!response.ok) {
        throw new Error("Failed to reach assistant.");
      }

      const data = await response.json();

      const assistantMsg: FollowUpMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setFollowUpMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: FollowUpMessage = {
        id: `assistant-error-${Date.now()}`,
        sender: "assistant",
        text: "Sorry, I had trouble responding. Please ensure your API key is correctly configured.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setFollowUpMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsFollowUpGenerating(false);
    }
  };

  return (
    <div className="min-h-screen pb-16 bg-gradient-to-b from-mint-50/50 via-pastel-bg to-pastel-bg">
      <div className="max-w-6xl mx-auto px-4 pt-8">
        {/* Header component */}
        <Header />

        {/* Demo Preset Panel */}
        <div className="mb-8 p-5 bg-white rounded-2xl border border-pastel-border shadow-xs animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4.5 h-4.5 text-emerald-600" />
            <h3 className="font-display font-bold text-sm text-emerald-950">
              Quick Test: Click a fictional suspicious sample below
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            {DEMO_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                onClick={() => handleLoadSample(sample.id)}
                className="p-2.5 text-center text-xs font-semibold bg-emerald-50/50 hover:bg-emerald-100/70 border border-emerald-100 rounded-xl text-emerald-800 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer shadow-3xs"
              >
                {sample.title}
              </button>
            ))}
          </div>
        </div>

        {/* Two-Column App Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Inputs (span 7) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 bg-white rounded-2xl border border-pastel-border shadow-xs">
              
              {/* Input Mode Tabs */}
              <div className="flex p-1 bg-pastel-bg rounded-xl border border-pastel-border/60 mb-6">
                <button
                  onClick={() => { setInputMode("text"); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    inputMode === "text"
                      ? "bg-white text-emerald-950 shadow-xs border border-pastel-border"
                      : "text-pastel-text/60 hover:text-pastel-text"
                  }`}
                >
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Text Mode</span>
                </button>
                <button
                  onClick={() => { setInputMode("screenshot"); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    inputMode === "screenshot"
                      ? "bg-white text-emerald-950 shadow-xs border border-pastel-border"
                      : "text-pastel-text/60 hover:text-pastel-text"
                  }`}
                >
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span>Screenshot Mode</span>
                </button>
              </div>

              {/* Category selector */}
              <div className="mb-6">
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60 mb-2.5">
                  Select Scam Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.value;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setCategory(cat.value)}
                        className={`p-3 text-left rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-24 ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-500 shadow-2xs"
                            : "bg-pastel-bg/50 border-pastel-border hover:bg-pastel-bg hover:border-pastel-text/20"
                        }`}
                      >
                        <span className="text-xl">{cat.icon}</span>
                        <div>
                          <div className="font-display font-bold text-xs leading-none">
                            {cat.label}
                          </div>
                          <span className="text-[9px] text-pastel-text/50 block leading-tight mt-1 line-clamp-2">
                            {cat.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode-Specific Input Area */}
              {inputMode === "text" ? (
                <div className="space-y-2">
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60">
                    Paste Suspicious Message
                  </label>
                  <div className="relative">
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Paste the suspicious text message, email, DM, job description, or apartment listing details here..."
                      rows={8}
                      className="w-full p-4 bg-pastel-bg hover:bg-pastel-bg/80 focus:bg-white text-sm text-pastel-text placeholder:text-pastel-text/40 rounded-xl border border-pastel-border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all resize-none leading-relaxed"
                    />
                    {textInput && (
                      <button
                        onClick={() => setTextInput("")}
                        className="absolute right-3 top-3 p-1.5 bg-white hover:bg-red-50 text-pastel-text/40 hover:text-red-600 rounded-lg border border-pastel-border/60 transition-colors cursor-pointer"
                        title="Clear input"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono text-pastel-text/40 px-1">
                    <span>Be objective &amp; descriptive</span>
                    <span>{textInput.length} characters</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60">
                    Upload Screenshot
                  </label>

                  {!imagePreview ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[220px] ${
                        isDragging
                          ? "border-emerald-500 bg-emerald-50/50"
                          : "border-pastel-border bg-pastel-bg/40 hover:bg-pastel-bg/80 hover:border-pastel-text/25"
                      }`}
                    >
                      <input
                        type="file"
                        id="screenshot-upload"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="screenshot-upload"
                        className="cursor-pointer flex flex-col items-center"
                      >
                        <div className="p-4 bg-white rounded-2xl shadow-xs border border-pastel-border mb-3.5 text-emerald-600">
                          <Upload className="w-6 h-6" />
                        </div>
                        <p className="font-display font-bold text-sm text-emerald-950">
                          Drag and drop screenshot here, or <span className="text-emerald-600 underline">browse</span>
                        </p>
                        <p className="text-[11px] text-pastel-text/50 mt-1 font-mono">
                          Supports PNG, JPG, JPEG up to 10MB
                        </p>
                      </label>
                    </div>
                  ) : (
                    <div className="relative border border-pastel-border rounded-xl p-3 bg-pastel-bg/50">
                      <div className="aspect-video w-full rounded-lg overflow-hidden bg-white border border-pastel-border/80 flex items-center justify-center max-h-[260px]">
                        <img
                          src={imagePreview}
                          alt="Screenshot preview"
                          className="object-contain h-full w-full"
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                          <span className="text-xs font-semibold text-emerald-950 truncate max-w-[200px]">
                            {imageFile ? imageFile.name : "Screenshot Loaded"}
                          </span>
                        </div>
                        <button
                          onClick={handleRemoveImage}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg border border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="mt-4 p-3.5 bg-red-50 text-red-800 text-xs font-medium rounded-xl border border-red-100 flex items-start gap-2.5 animate-fade-in-up">
                  <AlertCircle className="w-4.5 h-4.5 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}

              {/* Primary Analyze button */}
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={loading}
                className={`w-full mt-6 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 shadow-sm flex items-center justify-center gap-2 cursor-pointer ${
                  loading
                    ? "bg-pastel-bg text-pastel-text/40 border border-pastel-border cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>{loadingStep}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4.5 h-4.5" />
                    <span>Analyze Risk Level</span>
                  </>
                )}
              </button>

            </div>

            {/* Conditionally place presets and follow-up chat above safety disclaimer on large screen (fullscreen option selected) */}
            {analysis && (
              <div className="hidden lg:block space-y-6">
                {/* Contextual Q&A prompt presets */}
                <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-2xs">
                  <h4 className="font-display font-bold text-sm text-emerald-950 flex items-center gap-2 mb-3">
                    <HelpCircle className="w-4 h-4 text-emerald-600" />
                    Need a quick answer? Select a follow-up:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_FOLLOWUPS.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendFollowUp(q)}
                        className="px-3 py-1.5 bg-white hover:bg-emerald-50 hover:text-emerald-800 text-pastel-text/80 text-xs font-medium rounded-xl border border-pastel-border/80 hover:border-emerald-200 shadow-3xs hover:shadow-2xs transition-all duration-200 text-left flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <span>{q}</span>
                        <ChevronRight className="w-3 h-3 text-emerald-400 group-hover:text-emerald-600 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>

                <FollowUpAssistant 
                  analysis={analysis}
                  originalText={textInput}
                  originalCategory={category}
                  messages={followUpMessages}
                  onSendMessage={handleSendFollowUp}
                  isGenerating={isFollowUpGenerating}
                />
              </div>
            )}

            {/* Safety Disclaimer */}
            <div className="p-4 bg-pastel-bg/70 border border-pastel-border/60 rounded-xl text-[11px] leading-relaxed text-pastel-text/50 font-mono text-center">
              🛡️ <strong>Safety Disclaimer:</strong> ScamLens is an AI assistant model and cannot guarantee absolute accuracy on safety or fraud. Always verify important digital communications, suspicious links, and payment claims through official corporate sources and verified domain channels.
            </div>
          </div>

          {/* RIGHT COLUMN: Results & Follow up assistant (span 5) */}
          <div ref={resultsRef} className="lg:col-span-5 space-y-6">

            {loading ? (
              /* Loading Screen state */
              <div className="p-8 bg-white rounded-2xl border border-pastel-border shadow-xs text-center space-y-4 py-16 animate-pulse">
                <div className="relative inline-flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                  </div>
                </div>
                <div>
                  <h4 className="font-display font-extrabold text-base text-emerald-950">
                    Scanning Threat Signals
                  </h4>
                  <p className="text-xs text-pastel-text/50 mt-1 font-mono">
                    {loadingStep}
                  </p>
                </div>
              </div>
            ) : analysis ? (
              /* Live Results view and follow-up container */
              <>
                <ScamAnalysisResult 
                  analysis={analysis} 
                  onAskFollowUp={handleSendFollowUp} 
                  hidePresetsOnDesktop={true}
                />
                
                {/* On mobile / stacked layouts, show the follow-up chat here underneath results */}
                <div className="block lg:hidden">
                  <FollowUpAssistant 
                    analysis={analysis}
                    originalText={textInput}
                    originalCategory={category}
                    messages={followUpMessages}
                    onSendMessage={handleSendFollowUp}
                    isGenerating={isFollowUpGenerating}
                  />
                </div>
              </>
            ) : (
              /* Empty state before any analysis is run */
              <div className="p-8 bg-white rounded-2xl border border-pastel-border shadow-xs text-center py-16 space-y-4">
                <div className="w-14 h-14 bg-pastel-bg rounded-2xl border border-pastel-border/60 flex items-center justify-center mx-auto text-pastel-text/30">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div className="max-w-[280px] mx-auto">
                  <h4 className="font-display font-bold text-sm text-emerald-950">
                    Awaiting Suspicious Message
                  </h4>
                  <p className="text-xs text-pastel-text/50 mt-1 leading-relaxed">
                    Paste a suspicious text or drop a screenshot above to run real-time AI risk analysis.
                  </p>
                </div>
              </div>
            )}

          </div>

        </div>

        {/* Share Your Feedback section */}
        <div className="mt-12 flex justify-center pb-8 animate-fade-in-up">
          <button 
            onClick={() => setShowFeedbackModal(true)}
            className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-950 text-xs font-semibold rounded-full border border-emerald-100/60 shadow-3xs hover:shadow-2xs transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
          >
            <MessageSquareText className="w-4 h-4 text-emerald-600" />
            <span>Please share your valuable feedback</span>
          </button>
        </div>

      </div>

      {/* Feedback Modal Overlay */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/40 backdrop-blur-xs transition-all duration-300">
          <div className="relative bg-white rounded-2xl border border-pastel-border max-w-md w-full shadow-2xl p-6 overflow-hidden animate-fade-in-up">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-pastel-border/60 mb-5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                  <MessageSquareText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-display font-extrabold text-base text-emerald-950">
                    Share Your Feedback
                  </h4>
                  <p className="text-[10px] font-mono text-pastel-text/50">
                    Help us improve ScamLens
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseFeedback}
                className="p-1.5 hover:bg-red-50 hover:text-red-600 text-pastel-text/40 rounded-lg transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {feedbackSubmitted ? (
              /* Success view */
              <div className="text-center py-6 space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-display font-bold text-emerald-950 text-sm">
                    Feedback Received!
                  </h5>
                  <p className="text-xs text-pastel-text/60 mt-2 leading-relaxed">
                    Thank you for sharing your valuable input. Your perspective helps us build a more secure internet for students and community members.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseFeedback}
                  className="w-full mt-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs"
                >
                  Close Panel
                </button>
              </div>
            ) : (
              /* Feedback form */
              <form onSubmit={handleFeedbackSubmit} className="space-y-4.5">
                
                {/* Who you are */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60">
                    Who are you?
                  </label>
                  <select
                    value={feedbackWho}
                    onChange={(e) => setFeedbackWho(e.target.value)}
                    className="w-full px-3 py-2.5 bg-pastel-bg hover:bg-pastel-bg/85 text-xs text-pastel-text rounded-xl border border-pastel-border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all cursor-pointer"
                  >
                    <option value="Student">Student</option>
                    <option value="Working Individual">Working Individual</option>
                    <option value="Regular Internet User">Regular Internet User</option>
                    <option value="Older Individual">Older Individual</option>
                    <option value="Other user">Other User</option>
                  </select>
                </div>

                {/* What is this about */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60">
                    What is this about?
                  </label>
                  <input
                    type="text"
                    value={feedbackAbout}
                    onChange={(e) => setFeedbackAbout(e.target.value)}
                    placeholder="e.g. Remote work scam check, visual UI feedback..."
                    required
                    className="w-full px-3 py-2.5 bg-pastel-bg hover:bg-pastel-bg/80 focus:bg-white text-xs text-pastel-text placeholder:text-pastel-text/40 rounded-xl border border-pastel-border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                {/* Feedback Box */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-pastel-text/60">
                    Feedback
                  </label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Write your feedback details here. What features should we add? Is anything broken?"
                    rows={4}
                    required
                    className="w-full p-3 bg-pastel-bg hover:bg-pastel-bg/80 focus:bg-white text-xs text-pastel-text placeholder:text-pastel-text/40 rounded-xl border border-pastel-border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all resize-none leading-relaxed"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2.5 pt-3 border-t border-pastel-border/60 mt-4">
                  <button
                    type="button"
                    onClick={handleCloseFeedback}
                    className="flex-1 py-2.5 bg-pastel-bg hover:bg-pastel-bg/80 text-pastel-text text-xs font-bold rounded-xl border border-pastel-border transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-3xs hover:shadow-2xs"
                  >
                    Submit Feedback
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
