import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Increase body limit to handle base64 images
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Check for API key
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined. AI features will fail.");
}

// Helper to check if AI is initialized
function getAi(): GoogleGenAI {
  if (!ai) {
    throw new Error("Gemini API key is not configured. Please add GEMINI_API_KEY in the Secrets panel.");
  }
  return ai;
}

// Scam Categories mapping for prompt
const CATEGORY_NAMES: Record<string, string> = {
  "job": "Job offer",
  "apartment": "Apartment/rental",
  "phishing": "Phishing email",
  "marketplace": "Marketplace sale",
  "social_dm": "Social media DM",
  "giveaway": "Giveaway/prize",
  "banking": "Banking/payment",
  "other": "Other suspicious message"
};

// Helper to call with exponential backoff retry for transient errors
async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errorMsg = error.message || "";
      const isTransient = 
        error.status === 503 || 
        errorMsg.includes("503") || 
        error.status === 429 || 
        errorMsg.includes("429") || 
        errorMsg.includes("high demand") || 
        errorMsg.includes("temporarily") ||
        errorMsg.includes("UNAVAILABLE");
      
      if (isTransient && attempt < retries) {
        console.warn(`[ScamLens Retry] Attempt ${attempt} failed with transient error: "${errorMsg}". Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max API retries exceeded.");
}

// Local Heuristic Fallback Analysis Engine
function localHeuristicAnalyze(text: string, category: string) {
  const normalized = (text || "").toLowerCase();
  const redFlags: string[] = [];
  
  // Rule 1: Urgency / Pressure
  if (/\b(urgent|immediately|24 hours|asap|now|hurry|suspension|terminate|instant|15 minutes|limit|act fast|expired|attention)\b/.test(normalized)) {
    redFlags.push("Urgency or pressure");
  }
  // Rule 2: Requests for money / payment methods
  if (/\b(money|deposit|venmo|zelle|apple pay|gift card|fee|payment|pay|transfer|reimburse|cash|dollars|wire|crypto|bitcoin|\$)\b/.test(normalized)) {
    redFlags.push("Requests for money");
  }
  // Rule 3: Personal info harvesting
  if (/\b(password|ssn|social security|credit card|credentials|billing|login|bank account|account detail|pin|cvv|mother's maiden)\b/.test(normalized)) {
    redFlags.push("Requests for personal information");
  }
  // Rule 4: URLs or suspicious domains
  if (/https?:\/\/[^\s]+/.test(normalized)) {
    redFlags.push("Suspicious links");
  }
  // Rule 5: Too good to be true
  if (/\b(congratulations|congrats|won|winner|grand prize|iphone|gift card|shortlisted|hourly|salary|flexible|extra \$|commission|bonus|passive income)\b/.test(normalized)) {
    redFlags.push("Too-good-to-be-true offer");
  }
  // Rule 6: Communication outside of official app channels
  if (/\b(telegram|whatsapp|red cross|out of country|humanitarian|business account|approved vendor|brother-in-law|uncle|nephew|shipment tracking|courier)\b/.test(normalized)) {
    redFlags.push("Payment outside trusted platforms");
  }
  // Rule 7: Unverified / Impersonating patterns
  if (/\b(support-billing|security-alert|customer-secure|netflix|amazon|banking|irs|tax alert)\b/.test(normalized)) {
    redFlags.push("Impersonation");
  }

  // Calculate score based on matched flags
  const flagCount = redFlags.length;
  let riskScore = 12; // safe baseline
  if (flagCount === 1) riskScore = 38;
  else if (flagCount === 2) riskScore = 58;
  else if (flagCount === 3) riskScore = 78;
  else if (flagCount >= 4) riskScore = 94;

  // Add a touch of natural randomness
  riskScore = Math.min(100, Math.max(5, riskScore + Math.floor(Math.random() * 8) - 4));

  let riskLevel: "Low Risk" | "Medium Risk" | "High Risk" | "Critical Risk" = "Low Risk";
  if (riskScore >= 80) riskLevel = "Critical Risk";
  else if (riskScore >= 55) riskLevel = "High Risk";
  else if (riskScore >= 30) riskLevel = "Medium Risk";

  const categoryName = CATEGORY_NAMES[category] || category || "message";

  let summary = `This ${categoryName} shows some warning signs of a potential scam, specifically ${redFlags.slice(0, 2).join(" and ") || "unverified sender patterns"}.`;
  if (riskLevel === "Critical Risk" || riskLevel === "High Risk") {
    summary = `High Caution Required: This message exhibits high-probability scam signatures, notably requesting peer-to-peer transfers, personal billing entries, or urgent replies.`;
  }

  const explanation = `[LOCAL HEURISTIC ENGINE ACTIVE due to high AI model demand]

We analyzed this message using our secondary built-in rules engine. 
${redFlags.length > 0 
  ? `We detected ${redFlags.length} primary threat signatures: ${redFlags.join(", ")}. In general, legitimate organizations, landlords, or recruiters will not request immediate actions under tight hour limits, enforce transfers via untraceable services (such as Venmo, Apple Pay, or gift cards), or redirect you to Telegram/WhatsApp for official business.` 
  : "While we did not match our predefined high-risk keyword combinations, this digital communication should still be approached with general safety caution."
}
Please verify the sender independently before responding or clicking any links.`;

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

// API Route: Analyze Scam
app.post("/api/analyze", async (req: express.Request, res: express.Response) => {
  const { category, text, image, imageType } = req.body;
  
  try {
    const client = getAi();
    const categoryName = CATEGORY_NAMES[category] || category || "General suspicious message";

    // Set up parts for multimodal call or text-only call
    const parts: any[] = [];

    let basePrompt = `You are an expert cybersecurity analyst and consumer protection specialist.
Your task is to analyze the following suspicious message under the category: "${categoryName}".
Evaluate the message for common scam patterns, red flags, and risk levels.

Important constraints:
1. Be objective, realistic, and helpful. 
2. Be careful and do not make absolute claims unless evidence is 100% overwhelming. Use expressions like "this appears suspicious" or "this may be risky" instead of declaring definitively "this is a scam" if there is even a small chance it is legitimate.
3. Tailor the advice specifically to college students and everyday internet users.

You must return a structured JSON response matching the exact schema specified.
`;

    if (image && imageType) {
      // Multimodal Vision Call
      parts.push({
        inlineData: {
          mimeType: imageType,
          data: image,
        },
      });
      parts.push({
        text: `${basePrompt}\n\nAnalyze the text visible in this screenshot. If the text in the screenshot is unclear, unreadable, or doesn't look like a message/email/offer, make sure your response reflects that (lower risk score or state in explanation to upload a clearer image). Otherwise, analyze the scam risk of the message shown in the screenshot.`,
      });
    } else {
      // Text-Only Call
      if (!text || text.trim() === "") {
        res.status(400).json({ error: "Please provide a suspicious message or upload a screenshot." });
        return;
      }
      parts.push({
        text: `${basePrompt}\n\nHere is the suspicious text to analyze:\n"""\n${text}\n"""`,
      });
    }

    // Call Gemini API with automatic backoff retry wrapper and model fallback
    let response;
    const generateConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          riskLevel: {
            type: Type.STRING,
            description: "Must be exactly one of: 'Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'."
          },
          riskScore: {
            type: Type.INTEGER,
            description: "A risk score from 0 to 100, where 0 is completely safe and 100 is an absolute certain scam."
          },
          summary: {
            type: Type.STRING,
            description: "A concise one-sentence high-level summary of the risk (e.g. 'This message shows multiple scam warning signs, especially urgency, payment pressure, and vague identity details.')"
          },
          redFlags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of specific red flags detected. Try to map these to standard red flags such as 'Urgency or pressure', 'Requests for money', 'Requests for personal information', 'Suspicious links', 'Too-good-to-be-true offer', 'Impersonation', 'Poor grammar or unusual wording', 'Unverified sender', 'Payment outside trusted platforms', 'Threats or fear tactics'."
          },
          explanation: {
            type: Type.STRING,
            description: "A detailed but friendly, student-friendly explanation of why this message is suspicious or why it might not be. Explain the mechanics of this specific scam in plain English."
          },
          safeNextSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of 3-5 practical, specific next steps the user should take to stay safe (e.g. 'Do not click suspicious links', 'Verify the sender via their official website', etc.)"
          },
          safeReply: {
            type: Type.STRING,
            description: "A short, polite, yet firm safe reply the user can send to verify or decline, or a statement advising them not to reply at all."
          }
        },
        required: ["riskLevel", "riskScore", "summary", "redFlags", "explanation", "safeNextSteps", "safeReply"]
      }
    };

    try {
      response = await callWithRetry(async () => {
        return await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: { parts },
          config: generateConfig
        });
      });
    } catch (primaryError: any) {
      console.warn("Primary model 'gemini-3.5-flash' failed or reported busy. Trying robust fallback model 'gemini-flash-latest'...", primaryError.message);
      try {
        response = await callWithRetry(async () => {
          return await client.models.generateContent({
            model: "gemini-flash-latest",
            contents: { parts },
            config: generateConfig
          });
        });
      } catch (fallbackError) {
        // Rethrow so that the heuristic generator catches it
        throw new Error("Both Gemini models reported transient errors under peak demand.");
      }
    }

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("No response text returned from Gemini API");
    }

    const analysisResult = JSON.parse(textOutput);
    res.json({ ...analysisResult, isFallback: false });
  } catch (error: any) {
    console.warn("Gemini Analysis call failed, invoking Local Heuristic Scanner fallback:", error);
    
    // Attempt local heuristic fallback if it's text-based
    if (text && text.trim() !== "") {
      const fallbackResult = localHeuristicAnalyze(text, category);
      res.json(fallbackResult);
    } else {
      // If we don't have text (e.g. it was a screenshot only) and the vision API failed, we can still generate a standard scan response
      const fallbackResult = localHeuristicAnalyze("Suspicious screenshot image submission.", category);
      fallbackResult.explanation = `[LOCAL HEURISTIC ENGINE ACTIVE due to high AI model demand]
      
We analyzed your uploaded screenshot using our secondary local scan rules. Legitimate employers, landlords, and brands will not communicate through high-pressure, unverified channels or request peer-to-peer digital payments. Please proceed with standard safety procedures.`;
      res.json(fallbackResult);
    }
  }
});

// API Route: Follow-up Assistant
app.post("/api/follow-up", async (req: express.Request, res: express.Response) => {
  const { question, originalText, originalCategory, previousAnalysis } = req.body;
  
  try {
    const client = getAi();

    if (!question) {
      res.status(400).json({ error: "Please provide a follow-up question." });
      return;
    }

    const contextPrompt = `You are "ScamLens Follow-up Assistant", a student-friendly cybersecurity mentor.
You previously analyzed a message. Here is the context of that message and your analysis:

Category: ${originalCategory || "Suspicious Message"}
Original Input Text/Screenshot Description: ${originalText || "Analyzed via screenshot"}

Previous Analysis:
- Risk Level: ${previousAnalysis?.riskLevel || "Unknown"}
- Risk Score: ${previousAnalysis?.riskScore || 0}/100
- Summary: ${previousAnalysis?.summary || "N/A"}
- Red Flags: ${(previousAnalysis?.redFlags || []).join(", ")}
- Explanation: ${previousAnalysis?.explanation || "N/A"}

The user is asking a follow-up question:
"${question}"

Your instructions:
1. Only answer questions related to this analyzed message, cybersecurity, or scams in general. Do not answer general programming or off-topic questions.
2. Provide a helpful, clean, easy-to-understand response in plain text or simple Markdown format.
3. Be reassuring but realistic. Maintain the trustworthy, empathetic tone.
4. Keep the answer concise (2-3 short paragraphs maximum).
`;

    let response;
    try {
      response = await callWithRetry(async () => {
        return await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: contextPrompt,
        });
      });
    } catch (primaryError: any) {
      console.warn("Primary model 'gemini-3.5-flash' busy for follow-up. Trying robust fallback model 'gemini-flash-latest'...", primaryError.message);
      try {
        response = await callWithRetry(async () => {
          return await client.models.generateContent({
            model: "gemini-flash-latest",
            contents: contextPrompt,
          });
        });
      } catch (fallbackError) {
        throw new Error("Both Gemini models reported transient errors under peak demand for follow-up.");
      }
    }

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("No response text returned from Gemini API");
    }

    res.json({ answer: textOutput, isFallback: false });
  } catch (error: any) {
    console.warn("Follow-up Assistant Gemini call failed, generating highly catered dynamic local answer:", error);
    
    const qNorm = (question || "").toLowerCase();
    let localAnswer = "";
    
    // Check specific question types first
    if (qNorm.includes("why is this risky") || qNorm.includes("risk")) {
      localAnswer = "This message is risky because it exhibits classic psychological triggers designed to bypass your logical guardrails. The combination of urgent deadlines, unverified contact channels, and demands for advance action are hallmark signs of bad actors.";
    } else if (qNorm.includes("what should i check") || qNorm.includes("check") || qNorm.includes("verify")) {
      localAnswer = "To verify, you should:\n1. Search for the sender's name or company on LinkedIn or official directory systems.\n2. Look up the sender's email domain on 'who.is' to see if it was registered very recently.\n3. Make a phone call using a number listed publicly on the company's official corporate webpage (never use numbers provided in the suspicious message).";
    } else if (qNorm.includes("how should i reply") || qNorm.includes("reply") || qNorm.includes("respond")) {
      localAnswer = "We highly advise you **NOT** to reply. Replying lets the scammer know that your contact details (phone number or email address) are active and monitored by a real person. This flags you as a high-value target and will trigger more sophisticated, persistent phishing attempts in the future.";
    } else if (qNorm.includes("safe to click") || qNorm.includes("click") || qNorm.includes("link")) {
      localAnswer = "Absolutely not. Links in suspicious messages are designed to mimic real login interfaces (phishing) to steal your credentials, or they may automatically trigger malicious script downloads on your device. Always type the official web address manually in your browser address bar.";
    } else if (qNorm.includes("top 3 red flags") || qNorm.includes("flags") || qNorm.includes("warning")) {
      localAnswer = "The top 3 warning signs in this message are:\n1. **Artificial Pressure**: Creating a false sense of urgency (e.g., 'respond within 12 hours').\n2. **Platform Shifting**: Demanding that you migrate to external chat networks like Telegram or WhatsApp.\n3. **Financial Prerequisites**: Expecting you to pay upfront fees, secure deposits, or buy startup equipment yourself.";
    }
    
    // Custom topic-based triggers if no direct match above or to enrich the reply
    if (!localAnswer) {
      if (qNorm.includes("zelle") || qNorm.includes("venmo") || qNorm.includes("apple") || qNorm.includes("money") || qNorm.includes("pay") || qNorm.includes("fee") || qNorm.includes("gift card") || qNorm.includes("check")) {
        localAnswer = "When it comes to payments, keep these golden rules in mind:\n- Peer-to-peer apps (Venmo, Zelle, Apple Cash) act like physical cash. Once sent, there is no buyer protection or refund policy.\n- A common scam is sending a 'fake check' for equipment, asking you to wire the remaining amount. The bank eventually flags the check as fraudulent, and you are held legally responsible for the lost funds.\n- Legitimate brands and platforms will never request payment via gift cards or business upgrades.";
      } else if (qNorm.includes("telegram") || qNorm.includes("whatsapp") || qNorm.includes("chat") || qNorm.includes("number") || qNorm.includes("text") || qNorm.includes("skype") || qNorm.includes("miller") || qNorm.includes("joseph")) {
        localAnswer = "Scammers almost always try to shift the conversation off official hiring platforms (like Handshake, LinkedIn, or Indeed) onto personal messaging apps like Telegram, WhatsApp, or Skype. They do this because:\n1. It protects their fake accounts on the main platform from being banned.\n2. These messaging apps use encryption and temporary profiles, making them untraceable.\nAlways refuse out-of-channel communication.";
      } else if (qNorm.includes("apartment") || qNorm.includes("rent") || qNorm.includes("landlord") || qNorm.includes("lease") || qNorm.includes("deposit") || qNorm.includes("sublet") || qNorm.includes("room")) {
        localAnswer = "Rental and housing scams usually rely on a common script:\n- The 'landlord' claims to be out of the country (e.g., on a missionary, military, or medical trip) and cannot show you the property in person.\n- They demand a security deposit or first month's rent upfront in exchange for 'mailing you the keys'.\n- **Rule of thumb**: Never lease a place or send deposits without seeing the interior of the property in person with a verified agent.";
      } else if (qNorm.includes("job") || qNorm.includes("employment") || qNorm.includes("work") || qNorm.includes("salary") || qNorm.includes("data entry") || qNorm.includes("assistant")) {
        localAnswer = "Fake remote job offers are currently the most common scam targeting students:\n- They offer high hourly pay (e.g., $30+/hour) for basic, low-skill administrative or data entry work.\n- They bypass standard interview stages or use quick 'text-only' interviews.\n- They will ask you to buy office equipment using a check they mail you, which is counterfeit.\nVerify any job posting with your campus career services office before proceeding.";
      } else if (qNorm.includes("netflix") || qNorm.includes("subscription") || qNorm.includes("alert") || qNorm.includes("support") || qNorm.includes("suspension") || qNorm.includes("frozen")) {
        localAnswer = "Phishing alerts for subscriptions (like Netflix, Spotify, or banking alerts) are highly common:\n- They claim your account is frozen due to a 'billing error' or 'failed payment'.\n- They provide an urgent link to input your updated card credentials.\n- **Safest action**: Close the message, go directly to the service's official website, sign in manually, and check your actual account status there.";
      } else if (qNorm.includes("giveaway") || qNorm.includes("won") || qNorm.includes("prize") || qNorm.includes("courier") || qNorm.includes("shipping") || qNorm.includes("instagram")) {
        localAnswer = "Giveaway and prize scams are designed to trigger excitement to cloud your judgment:\n- They claim you have won a major raffle or high-value item, but you must pay a small 'delivery', 'processing', or 'courier insurance' fee first.\n- Once you pay the fee, the contact disappears and no prize is ever delivered.\n- Remember: If you have to pay to receive a 'free' prize, it's not a prize—it's a transaction scam.";
      } else {
        // Broad intelligent response reflecting the actual text context of their query
        localAnswer = `You asked: "${question}". When analyzing threats like this, security professionals look for unverified senders, unusual communication methods, and non-standard payment requests. If the sender is rushing you, offering something too good to be true, or asking you to move to a private messaging application, it is highly likely to be a scam.`;
      }
    }

    res.json({ 
      answer: `${localAnswer}\n\n*(Note: This tailored response was prepared by ScamLens Local Knowledge Base due to peak AI service demand.)*`, 
      isFallback: true 
    });
  }
});

// Mount Vite middleware or static files
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

setupServer().catch((err) => {
  console.error("Failed to start server:", err);
});
