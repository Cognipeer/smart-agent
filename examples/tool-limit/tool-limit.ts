import { createSmartAgent, createSmartTool, fromLangchainModel } from "@cognipeer/smart-agent";
// Optional: only if you actually want to run against a real model instead of the fake one below.
import { ChatOpenAI } from "@langchain/openai";
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
    const hasFinalize = messages.some((m: any) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('Tool-call limit reached'));
    if (hasFinalize) {
      return { role: 'assistant', content: "Final answer without further tools." };
    }
    if (turn === 1) {
      return {
        role: 'assistant',
        content: "",
        tool_calls: [
          { id: "c1", type: 'function', function: { name: "echo", arguments: JSON.stringify({ text: "a" }) } },
          { id: "c2", type: 'function', function: { name: "echo", arguments: JSON.stringify({ text: "b" }) } },
          { id: "c3", type: 'function', function: { name: "echo", arguments: JSON.stringify({ text: "c" }) } },
        ],
      } as any;
    }
    return { role: 'assistant', content: "No finalize signal found." };
  },
};

const apiKey = process.env.OPENAI_API_KEY;
// If you want to try with a real model (requires installing @langchain/openai):
const realModel = apiKey ? fromLangchainModel(new ChatOpenAI({ model: 'gpt-4o-mini', apiKey })) : null;

const agent = createSmartAgent({
  model: realModel || (fakeModel as any),
  tools: [echo],
  limits: { maxToolCalls: 2, maxParallelTools: 2 },
});

const res = await agent.invoke({ messages: [{ role: 'user', content: "run tools until limit then finalize" }] });
console.log("Final content:", res.content);
