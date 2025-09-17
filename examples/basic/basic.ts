import { createSmartAgent, createSmartTool, fromLangchainModel } from "@cognipeer/smart-agent";
import { ChatOpenAI } from "@langchain/openai"; // optional
import { z } from "zod";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text }),
});

let turn = 0;
const fakeModel = {
  bindTools() { return this; },
  async invoke(messages: any[]) {
    turn++;
    if (turn === 1) {
      return {
        role: 'assistant',
        content: "",
        tool_calls: [{ id: "call_1", type: 'function', function: { name: "echo", arguments: JSON.stringify({ text: "hi" }) } }],
      };
    }
    return { role: 'assistant', content: "done" };
  },
};

const apiKey = process.env.OPENAI_API_KEY || "";
const model = apiKey ? fromLangchainModel(new ChatOpenAI({ model: "gpt-4o-mini", apiKey })) : (fakeModel as any);

const agent = createSmartAgent({
  model,
  tools: [echo],
  limits: { maxToolCalls: 3 },
  systemPrompt: "Keep answers crisp.",
});

const res = await agent.invoke({ messages: [{ role: 'user', content: "say hi via echo" }] });
console.log("Content:", res.content);
console.log("Usage:", JSON.stringify(res.metadata));
