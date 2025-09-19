import { createAgent, createTool, fromLangchainModel } from "@cognipeer/smart-agent";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// Simple helper tool for secondary agent
const summarize = createTool({
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
  return { role: 'assistant', content: "", tool_calls: [{ id: "sec_call_1", type: 'function', function: { name: "summarize_text", arguments: JSON.stringify({ text: "Multi-agent systems coordinate specialists." }) } }] };
    }
  return { role: 'assistant', content: "Specialist answer ready" };
  }
};

const fakePrimaryModel = {
  bindTools() { return this; },
  async invoke(messages: any[]) {
    turnPrimary++;
    if (turnPrimary === 1) {
      // delegate to secondary agent via tool
  return { role: 'assistant', content: "", tool_calls: [{ id: "prim_call_1", type: 'function', function: { name: "specialist_agent", arguments: JSON.stringify({ input: "Explain briefly the logic of a multi-agent system" }) } }] };
    }
  return { role: 'assistant', content: "Completed" };
  }
};

const apiKey = process.env.OPENAI_API_KEY || "";
const secondaryModel = apiKey ? fromLangchainModel(new ChatOpenAI({ model: "gpt-4o-mini", apiKey })) : (fakeSecondaryModel as any);
const primaryModel = apiKey ? fromLangchainModel(new ChatOpenAI({ model: "gpt-4o-mini", apiKey })) : (fakePrimaryModel as any);

// Secondary (specialist) agent
const specialist = createAgent({
  name: "Specialist",
  model: secondaryModel,
  tools: [summarize],
  limits: { maxToolCalls: 3 }
});

// Convert specialist into a tool for the primary agent
const specialistTool = specialist.asTool({ toolName: "specialist_agent", description: "Delegate complex sub-question to specialist agent" });

// Primary agent uses specialist tool
const primary = createAgent({
  name: "Primary",
  model: primaryModel,
  tools: [specialistTool],
  limits: { maxToolCalls: 4 }
});

async function run() {
  const res = await primary.invoke({ messages: [{ role: 'user', content: "What is a multi-agent system? Use the specialist agent." }] });
  console.log("Final content:", res.content);
}

run().catch(e => console.error(e));
