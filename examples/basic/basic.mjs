// ESM basic example
import { createAgent, createTool, fromLangchainModel } from "../smart-agent/dist/index.js";
import { ChatOpenAI } from "@langchain/openai";
import z from "zod";

const echo = createTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text })
});

let turn = 0;
const fakeModel = {
  bindTools() { return this; },
  async invoke(messages) {
    turn++;
    if (turn === 1) {
      return { role: 'assistant', content: "", tool_calls: [{ id: "call_1", type: 'function', function: { name: 'echo', arguments: JSON.stringify({ text: 'hi' }) } }] };
    }
    return { role: 'assistant', content: "done" };
  }
};

const apiKey = process.env.OPENAI_API_KEY;
const model = apiKey ? fromLangchainModel(new ChatOpenAI({ model: "gpt-4o-mini", apiKey })) : fakeModel;

const agent = createAgent({ model, tools: [echo], limits: { maxToolCalls: 3 } });
const res = await agent.invoke({ messages: [{ role: 'user', content: "say hi via echo" }] });
console.log("Final:", res.messages.at(-1));
