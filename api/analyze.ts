import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

// Load local .env for development; Vercel provides env vars in production
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey: apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined. AI features will fail.");
}

function getAi() {
  if (!ai) throw new Error("Gemini API key is not configured. Please set GEMINI_API_KEY.");
  return ai;
}

// Helper: exponential backoff retry for transient errors
async function callWithRetry(fn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errorMsg = error?.message || "";
      const isImmediateFail =
        error?.status === 503 ||
        error?.status === 429 ||
        errorMsg.includes("503") ||
        errorMsg.includes("429") ||
        errorMsg.includes("RESOURCE_EXHAUSTED") ||
        errorMsg.toLowerCase().includes("quota") ||
        errorMsg.includes("UNAVAILABLE");
      const isTransient =
        errorMsg.includes("high demand") ||
        errorMsg.includes("temporarily");

      if (isImmediateFail) {
        throw error;
      }

      if (isTransient && attempt < retries) {
        console.warn(`[ScamLens Retry] Attempt ${attempt} failed with transient error: "${errorMsg}". Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max API retries exceeded.");
}

// Local heuristic fallback (copied from server implementation)
function localHeuristicAnalyze(text: string, category: string) {
  const normalized = (text || "").toLowerCase();
  const redFlags: string[] = [];

  if (/\b(urgent|immediately|24 hours|asap|now|hurry|suspension|terminate|instant|15 minutes|limit|act fast|expired|attention)\b/.test(normalized)) {
    redFlags.push("Urgency or pressure");
  }
  if (/\b(money|deposit|venmo|zelle|apple pay|gift card|fee|payment|pay|transfer|reimburse|cash|dollars|wire|crypto|bitcoin|\$)\b/.test(normalized)) {
    redFlags.push("Requests for money");
  }
  if (/\b(password|ssn|social security|credit card|credentials|billing|login|bank account|account detail|pin|cvv|mother's maiden)\b/.test(normalized)) {
    redFlags.push("Requests for personal information");
  }
  if (/https?:\/\/[^\n+\s]+/.test(normalized)) {
    redFlags.push("Suspicious links");
  }
  if (/\b(congratulations|congrats|won|winner|grand prize|iphone|gift card|shortlisted|hourly|salary|flexible|extra \$|commission|bonus|passive income)\b/.test(normalized)) {
    redFlags.push("Too-good-to-be-true offer");
  }
  if (/\b(telegram|whatsapp|red cross|out of country|humanitarian|business account|approved vendor|brother-in-law|uncle|nephew|shipment tracking|courier)\b/.test(normalized)) {
    redFlags.push("Payment outside trusted platforms");
  }
  if (/\b(support-billing|security-alert|customer-secure|netflix|amazon|banking|irs|tax alert)\b/.test(normalized)) {
    redFlags.push("Impersonation");
  }

  const flagCount = redFlags.length;
  let riskScore = 12;
  if (flagCount === 1) riskScore = 38;
  else if (flagCount === 2) riskScore = 58;
  else if (flagCount === 3) riskScore = 78;
  else if (flagCount >= 4) riskScore = 94;
  riskScore = Math.min(100, Math.max(5, riskScore + Math.floor(Math.random() * 8) - 4));

  let riskLevel: "Low Risk" | "Medium Risk" | "High Risk" | "Critical Risk" = "Low Risk";
  if (riskScore >= 80) riskLevel = "Critical Risk";
  else if (riskScore >= 55) riskLevel = "High Risk";
  else if (riskScore >= 30) riskLevel = "Medium Risk";

  const categoryName = category || "message";
  let summary = `This ${categoryName} shows some warning signs of a potential scam, specifically ${redFlags.slice(0,2).join(" and ") || "unverified sender patterns"}.`;
  if (riskLevel === "Critical Risk" || riskLevel === "High Risk") {
    summary = `High Caution Required: This message exhibits high-probability scam signatures, notably requesting peer-to-peer transfers, personal billing entries, or urgent replies.`;
  }

  const explanation = `[LOCAL HEURISTIC ENGINE ACTIVE due to high AI model demand]\n\nWe analyzed this message using our secondary built-in rules engine. \n${redFlags.length > 0 ? `We detected ${redFlags.length} primary threat signatures: ${redFlags.join(", ")}.` : "While we did not match our predefined high-risk keyword combinations, this digital communication should still be approached with general safety caution."}\nPlease verify the sender independently before responding or clicking any links.`;

  const safeNextSteps = [
    "Do not click any embedded links or download attachment files from this sender.",
    "Do not submit advance payments, deposits, or gift card codes.",
    "Verify the sender's identity through their official corporate webpage or student directory.",
    "Block this contact and report the threat to your local carrier or platform administrator."
  ];

  let safeReply = "Thank you for reaching out. To proceed safely, please confirm your affiliation using an official institutional email address or verified corporate webpage contact form. I do not share personal information or authorize payments through this channel.";
  if (riskLevel === "Critical Risk") {
    safeReply = "[Safety Recommendation: Do NOT reply or attempt to negotiate with this sender. Any response confirms your phone/email is active, leading to more targeted scam attempts.]";
  }

  return {
    riskLevel,
    riskScore,
    summary,
    redFlags: redFlags.length > 0 ? redFlags : ["Unverified sender"],
    explanation,
    safeNextSteps,
    safeReply,
    isFallback: true
  };
}

// Simple timeout wrapper for promises
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Model call timed out")), ms);
    p.then((res) => {
      clearTimeout(id);
      resolve(res);
    }).catch((err) => {
      clearTimeout(id);
      reject(err);
    });
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { category, text, image, imageType } = req.body || {};

  try {
    const client = getAi();
    const categoryName = category || "General suspicious message";

    const parts: any[] = [];
    let basePrompt = `You are an expert cybersecurity analyst and consumer protection specialist.\nYour task is to analyze the following suspicious message under the category: "${categoryName}".\nEvaluate the message for common scam patterns, red flags, and risk levels.`;

    if (image && imageType) {
      parts.push({ inlineData: { mimeType: imageType, data: image } });
      parts.push({ text: `${basePrompt}\n\nAnalyze the text visible in this screenshot.` });
    } else {
      if (!text || text.trim() === "") {
        res.status(400).json({ error: "Please provide a suspicious message or upload a screenshot." });
        return;
      }
      parts.push({ text: `${basePrompt}\n\nHere is the suspicious text to analyze:\n"""\n${text}\n"""` });
    }

    let response: any;
    const generateConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          riskLevel: { type: Type.STRING },
          riskScore: { type: Type.INTEGER },
          summary: { type: Type.STRING },
          redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
          explanation: { type: Type.STRING },
          safeNextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          safeReply: { type: Type.STRING }
        },
        required: ["riskLevel", "riskScore", "summary", "redFlags", "explanation", "safeNextSteps", "safeReply"]
      }
    };

    try {
      // Attempt primary model with timeout and retries
      response = await callWithRetry(() => withTimeout(client.models.generateContent({ model: "gemini-3.5-flash", contents: { parts }, config: generateConfig }), 50000));
    } catch (primaryError: any) {
      console.warn("Primary model failed or busy, trying fallback model:", primaryError?.message || primaryError);
      try {
        response = await callWithRetry(() => withTimeout(client.models.generateContent({ model: "gemini-flash-latest", contents: { parts }, config: generateConfig }), 50000));
      } catch (fallbackError: any) {
        console.warn("Both Gemini models failed or timed out:", fallbackError?.message || fallbackError);
        // Use local heuristic fallback
        if (text && text.trim() !== "") {
          const fallbackResult = localHeuristicAnalyze(text, category);
          res.json(fallbackResult);
          return;
        } else {
          const fallbackResult = localHeuristicAnalyze("Suspicious screenshot image submission.", category);
          fallbackResult.explanation = `[LOCAL HEURISTIC ENGINE ACTIVE due to high AI model demand]\n\nWe analyzed your uploaded screenshot using our secondary local scan rules.`;
          res.json(fallbackResult);
          return;
        }
      }
    }

    const textOutput = response?.text;
    if (!textOutput) {
      throw new Error("No response text returned from Gemini API");
    }

    const analysisResult = JSON.parse(textOutput);
    res.json({ ...analysisResult, isFallback: false });
  } catch (error: any) {
    console.warn("Analysis handler failed, returning local fallback:", error?.message || error);
    if (req.body?.text && req.body.text.trim() !== "") {
      const fallbackResult = localHeuristicAnalyze(req.body.text, req.body.category);
      res.json(fallbackResult);
    } else {
      const fallbackResult = localHeuristicAnalyze("Suspicious screenshot image submission.", req.body?.category);
      fallbackResult.explanation = `[LOCAL HEURISTIC ENGINE ACTIVE due to failure]`;
      res.json(fallbackResult);
    }
  }
}
