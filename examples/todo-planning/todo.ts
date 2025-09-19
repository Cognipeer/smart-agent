import { createSmartAgent, createSmartTool, fromLangchainModel } from "@cognipeer/smart-agent";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text })
});

const apiKey = process.env.OPENAI_API_KEY || "";
const fallbackModel = {
  bindTools() { return this; },
  async invoke(_messages: any[]) {
    // Ask to call echo tool once, then respond.
    return { role: 'assistant', content: "", tool_calls: [{ id: "call_1", type: 'function', function: { name: "echo", arguments: JSON.stringify({ text: "hi" }) } }] } as any;
  },
};
const model = apiKey
  ? fromLangchainModel(new ChatOpenAI({ model: "gpt-4o-mini", apiKey }))
  : (fallbackModel as any);

const agent = createSmartAgent({
  model,
  tools: [echo],
  useTodoList: true,
  limits: { maxToolCalls: 5 },
  debug: { enabled: true }
});

const res = await agent.invoke({ messages: [{ role: 'user', content: "Plan and execute: echo 'hi' then confirm done." }] });
console.log(res.content);
