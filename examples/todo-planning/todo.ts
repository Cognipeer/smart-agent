import { createSmartAgent, createSmartTool } from "@cognipeer/smart-agent";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text })
});

const apiKey = process.env.OPENAI_API_KEY || "";
const model = new ChatOpenAI({ model: "gpt-4o-mini", apiKey });

const agent = createSmartAgent({
  model,
  tools: [echo],
  useTodoList: true,
  limits: { maxToolCalls: 5 },
  debug: { enabled: true }
});

const res = await agent.invoke({ messages: [new HumanMessage("Plan and execute: echo 'hi' then confirm done.")] });
console.log(res.content);
