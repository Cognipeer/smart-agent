import z from "zod";
import { createSmartAgent, createSmartTool } from "@cognipeer/smart-agent";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().optional() }),
  func: async ({ text }: any) => ({ echoed: text ?? "" }),
});

const apiKey = process.env.OPENAI_API_KEY || "";
const model = new ChatOpenAI({ model: "gpt-4o-mini", apiKey });

const agent = createSmartAgent({
  model,
  tools: [echo],
  limits: { maxToolCalls: 5, maxToken: 500 },
});

const res = await agent.invoke({ messages: [new HumanMessage("Start a very long session to trigger summarization.")] });
console.log(res.content);
