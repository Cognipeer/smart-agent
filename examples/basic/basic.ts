import { createSmartAgent, createSmartTool } from "@cognipeer/smart-agent";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
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
    const last = messages[messages.length - 1];
    if (turn === 1) {
      return new AIMessage({
        content: "",
        tool_calls: [{ id: "call_1", name: "echo", args: { text: "hi" } }],
      });
    }
    return new AIMessage({ content: "done" });
  },
};

const apiKey = process.env.OPENAI_API_KEY || "";
const model = apiKey ? new ChatOpenAI({ model: "gpt-4o-mini", apiKey }) : (fakeModel as any);

const agent = createSmartAgent({
  model,
  tools: [echo],
  limits: { maxToolCalls: 3 },
  params: { additionalSystemPrompt: "Keep answers crisp." },
});

const res = await agent.invoke({ messages: [new HumanMessage("say hi via echo")] });
console.log("Content:", res.content);
