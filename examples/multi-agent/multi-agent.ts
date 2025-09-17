import { createSmartAgent, createSmartTool } from "@cognipeer/smart-agent";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// Simple helper tool for secondary agent
const summarize = createSmartTool({
  name: "summarize_text",
  description: "Summarize given text briefly",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => {
    return text.length < 60 ? text : text.slice(0, 57) + "...";
  }
});

// Fake model to avoid real API usage when OPENAI_API_KEY missing
let turnPrimary = 0;
let turnSecondary = 0;

const fakeSecondaryModel = {
  bindTools() { return this; },
  async invoke(messages: any[]) {
    turnSecondary++;
    const last = messages[messages.length - 1];
    if (turnSecondary === 1) {
      // Call summarize tool
      return new AIMessage({ content: "", tool_calls: [{ id: "sec_call_1", name: "summarize_text", args: { text: "Multi-agent systems coordinate specialists." } }] });
    }
    return new AIMessage({ content: "Specialist answer ready" });
  }
};

const fakePrimaryModel = {
  bindTools() { return this; },
  async invoke(messages: any[]) {
    turnPrimary++;
    if (turnPrimary === 1) {
      // delegate to secondary agent via tool
      return new AIMessage({ content: "", tool_calls: [{ id: "prim_call_1", name: "specialist_agent", args: { input: "Explain briefly the logic of a multi-agent system" } }] });
    }
    return new AIMessage({ content: "Completed" });
  }
};

const apiKey = process.env.OPENAI_API_KEY || "";
const secondaryModel = apiKey ? new ChatOpenAI({ model: "gpt-4o-mini", apiKey }) : (fakeSecondaryModel as any);
const primaryModel = apiKey ? new ChatOpenAI({ model: "gpt-4o-mini", apiKey }) : (fakePrimaryModel as any);

// Secondary (specialist) agent
const specialist = createSmartAgent({
  name: "Specialist",
  model: secondaryModel,
  tools: [summarize],
  limits: { maxToolCalls: 3 }
});

// Convert specialist into a tool for the primary agent
const specialistTool = specialist.asTool({ toolName: "specialist_agent", description: "Delegate complex sub-question to specialist agent" });

// Primary agent uses specialist tool
const primary = createSmartAgent({
  name: "Primary",
  model: primaryModel,
  tools: [specialistTool],
  limits: { maxToolCalls: 4 }
});

async function run() {
  const res = await primary.invoke({ messages: [new HumanMessage("What is a multi-agent system? Use the specialist agent.")] });
  console.log("Final content:", res.content);
}

run().catch(e => console.error(e));
