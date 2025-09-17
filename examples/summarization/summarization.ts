import z from "zod";
import { createSmartAgent, createSmartTool, fromLangchainModel } from "@cognipeer/smart-agent";
import { ChatOpenAI } from "@langchain/openai";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().optional() }),
  func: async ({ text }: any) => ({ echoed: text ?? "" }),
});

const apiKey = process.env.OPENAI_API_KEY || "";
const model = fromLangchainModel(new ChatOpenAI({ model: "gpt-4o-mini", apiKey }));

const agent = createSmartAgent({
  model,
  tools: [echo],
  limits: { maxToolCalls: 5, maxToken: 500 },
  // summarization: false, // Uncomment to disable summarization entirely
});

const res = await agent.invoke({ messages: [{ role: 'user', content: "Start a very long session to trigger summarization." }] });
console.log(res.content);
