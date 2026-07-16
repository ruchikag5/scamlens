export type ScamCategory =
  | "job"
  | "apartment"
  | "phishing"
  | "marketplace"
  | "social_dm"
  | "giveaway"
  | "banking"
  | "other";

export interface ScamAnalysis {
  riskLevel: "Low Risk" | "Medium Risk" | "High Risk" | "Critical Risk";
  riskScore: number;
  summary: string;
  redFlags: string[];
  explanation: string;
  safeNextSteps: string[];
  safeReply: string;
  isFallback?: boolean;
}

export interface FollowUpMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface DemoSample {
  id: string;
  title: string;
  category: ScamCategory;
  text: string;
}
