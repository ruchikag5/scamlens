import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

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
      const isTransient = errorMsg.includes("high demand") || errorMsg.includes("temporarily");

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

  const { question, originalText, originalCategory, previousAnalysis } = req.body || {};

  // Local fallback path when the client explicitly requests it (e.g., after a client abort)
  if (req.body?.forceLocalFallback) {
    const fallbackText = (function genLocal(questionText: string, prev: any) {
      const q = (questionText || "").toLowerCase();
      const prevSafeReply = prev?.safeReply || "";
      const prevSafeNextSteps = Array.isArray(prev?.safeNextSteps) ? prev.safeNextSteps : [];
      const prevRedFlags = Array.isArray(prev?.redFlags) ? prev.redFlags : [];
      const prevSummary = prev?.summary || "";
      const prevRiskLevel = prev?.riskLevel || "";

      if (q.includes("how should i reply") || q.includes("reply") || q.includes("respond")) {
        return prevSafeReply || "We recommend a cautious, minimal reply: don't disclose personal details, verify the sender independently, and avoid sending money or codes.";
      }
      if (q.includes("top 3") || q.includes("flags") || q.includes("warning")) {
        return prevRedFlags.length > 0 ? `Top flags: ${prevRedFlags.slice(0,3).join(', ')}.` : "Common red flags: urgency, requests for money, and suspicious links or channels.";
      }
      if (q.includes("why is this risky") || q.includes("why risky") || q.includes("risk")) {
        return (prevSummary || "This message shows multiple scam indicators.") + (prevRiskLevel ? ` (${prevRiskLevel})` : "") + (prev?.explanation ? `\n\n${prev.explanation}` : "");
      }
      if (q.includes("what should i check") || q.includes("verify") || q.includes("check")) {
        return prevSafeNextSteps.length > 0 ? `Suggested checks:\n- ${prevSafeNextSteps.join('\n- ')}` : "Check the sender's official website, verify phone numbers from official channels, and avoid using contact information supplied in the suspicious message.";
      }

      return prevSummary || `You asked: \"${questionText}\". Treat the message as suspicious: don't click links, don't send money, and verify the sender independently.`;
    })(question, previousAnalysis);

    res.json({ answer: `${fallbackText}\n\n*(Note: Local fallback provided due to AI service unavailability.)*`, isFallback: true });
    return;
  }

  try {
    const client = getAi();

    if (!question) {
      res.status(400).json({ error: "Please provide a follow-up question." });
      return;
    }

    const contextPrompt = `You are "ScamLens Follow-up Assistant", a student-friendly cybersecurity mentor.\nYou previously analyzed a message. Here is the context of that message and your analysis:\n\nCategory: ${originalCategory || "Suspicious Message"}\nOriginal Input Text/Screenshot Description: ${originalText || "Analyzed via screenshot"}\n\nPrevious Analysis:\n- Risk Level: ${previousAnalysis?.riskLevel || "Unknown"}\n- Risk Score: ${previousAnalysis?.riskScore || 0}/100\n- Summary: ${previousAnalysis?.summary || "N/A"}\n- Red Flags: ${(previousAnalysis?.redFlags || []).join(", ")}\n- Explanation: ${previousAnalysis?.explanation || "N/A"}\n\nThe user is asking a follow-up question:\n"${question}"\n\nYour instructions:\n1. Only answer questions related to this analyzed message, cybersecurity, or scams in general. Do not answer general programming or off-topic questions.\n2. Provide a helpful, clean, easy-to-understand response in plain text or simple Markdown format.\n3. Be reassuring but realistic. Maintain the trustworthy, empathetic tone.\n4. Keep the answer concise (2-3 short paragraphs maximum).\n`;

    let response: any;
    try {
      response = await callWithRetry(() => withTimeout(client.models.generateContent({ model: "gemini-3.5-flash", contents: contextPrompt }), 50000));
    } catch (primaryError: any) {
      console.warn("Primary model 'gemini-3.5-flash' busy for follow-up. Trying robust fallback model 'gemini-flash-latest'...", primaryError?.message || primaryError);
      try {
        response = await callWithRetry(() => withTimeout(client.models.generateContent({ model: "gemini-flash-latest", contents: contextPrompt }), 50000));
      } catch (fallbackError: any) {
        throw new Error("Both Gemini models reported transient errors under peak demand for follow-up.");
      }
    }

    const textOutput = response?.text;
    if (!textOutput) {
      throw new Error("No response text returned from Gemini API");
    }

    res.json({ answer: textOutput, isFallback: false });
  } catch (error: any) {
    console.warn("Follow-up handler failed, generating local fallback:", error?.message || error);

    const qNorm = (question || "").toLowerCase();
    let localAnswer = "";
    const prev = previousAnalysis || {};
    const prevSafeReply = prev.safeReply || "";
    const prevSafeNextSteps = Array.isArray(prev.safeNextSteps) ? prev.safeNextSteps : [];
    const prevRedFlags = Array.isArray(prev.redFlags) ? prev.redFlags : [];
    const prevSummary = prev.summary || "";
    const prevRiskLevel = prev.riskLevel || "";

    if (qNorm.includes("how should i reply") || qNorm.includes("how do i reply") || qNorm.includes("reply") || qNorm.includes("respond")) {
      localAnswer = prevSafeReply || "We recommend a cautious, minimal reply that does not disclose any personal details. Verify the sender independently before engaging and avoid sending money or codes.";
    } else if (qNorm.includes("top 3 red flags") || qNorm.includes("top 3") || qNorm.includes("flags") || qNorm.includes("warning")) {
      localAnswer = prevRedFlags.length > 0 ? `Top flags: ${prevRedFlags.slice(0, 3).join(', ')}.` : "Common red flags include urgency/pressure, requests for money, and unverified external links or channels.";
    } else if (qNorm.includes("why is this risky") || qNorm.includes("why risky") || qNorm.includes("risk")) {
      if (prevSummary || prevRiskLevel) {
        localAnswer = `${prevSummary} (${prevRiskLevel || 'Risk info not specified'}).\n\n${prev.explanation || ''}`.trim();
      } else {
        localAnswer = "This message appears risky due to urgency, requests for payment, or requests for personal information—classic indicators of scams.";
      }
    } else if (qNorm.includes("what should i check") || qNorm.includes("what to check") || qNorm.includes("verify") || qNorm.includes("check")) {
      localAnswer = prevSafeNextSteps.length > 0 ? `Suggested checks:\n- ${prevSafeNextSteps.join('\n- ')}` : "Check the sender's official website, verify phone numbers from official channels, and avoid using contact information supplied in the suspicious message.";
    }

    if (!localAnswer) {
      if (qNorm.includes("zelle") || qNorm.includes("venmo") || qNorm.includes("apple") || qNorm.includes("money") || qNorm.includes("pay") || qNorm.includes("fee") || qNorm.includes("gift card")) {
        localAnswer = "When it comes to payments, keep these golden rules in mind:\n- Peer-to-peer apps (Venmo, Zelle, Apple Cash) act like physical cash. Once sent, there is no buyer protection or refund policy.\n- A common scam is sending a 'fake check' for equipment, asking you to wire the remaining amount. The bank eventually flags the check as fraudulent, and you are held legally responsible for the lost funds.\n- Legitimate brands and platforms will never request payment via gift cards or business upgrades.";
      } else if (qNorm.includes("telegram") || qNorm.includes("whatsapp") || qNorm.includes("chat") || qNorm.includes("number") || qNorm.includes("text") || qNorm.includes("skype")) {
        localAnswer = "Scammers often shift conversations to personal messaging apps to avoid platform moderation. Refuse out-of-channel communication and verify identities via official channels.";
      } else {
        localAnswer = prevSummary || `You asked: "${question}". When in doubt, treat the message as suspicious: don't click links, don't send money, and verify the sender independently.`;
      }
    }

    res.json({ answer: `${localAnswer}\n\n*(Note: This tailored response was prepared by ScamLens Local Knowledge Base due to peak AI service demand.)*`, isFallback: true });
  }
}
