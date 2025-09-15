import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { countApproxTokens } from "./utilTokens.js";
import { Message } from "../types.js";

export type TokenLimits = {
  contextTokenLimit: number;
  summaryTokenLimit: number;
};

export async function applyTokenLimits({
  state,
  model,
  limits,
}: {
  state: { messages: Message[]; summaries?: string[] };
  model: any;
  limits: {
    contextTokenLimit: number;
    summaryTokenLimit: number;
  };
}) {
  const messages = state.messages || [];
  const budget = limits.contextTokenLimit;
  let total = messages.reduce((acc, m) => acc + countApproxTokens(String((m as any).content || "")), 0);
  if (total <= budget) return state;

  const newMessages: Message[] = [...messages];

  return { ...state, messages: newMessages };
}

function safeJson(v: any) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
