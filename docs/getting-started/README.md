# Getting Started

This section is for consumers of the package.

## Install
```sh
npm install @cognipeer/smart-agent @langchain/core @langchain/langgraph
# Optional providers/helpers
npm install @langchain/openai zod
```

## Your first agent
```ts
import { createSmartAgent, createSmartTool } from "@cognipeer/smart-agent";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text }),
});

const model = new ChatOpenAI({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY });
const agent = createSmartAgent({ model, tools: [echo], limits: { maxToolCalls: 5 } });

const res = await agent.invoke({ messages: [new HumanMessage("say hi via echo")] });
console.log(res.content);
```

## Running examples
The repository contains several examples under `examples/`. For local development, link the package and run with `tsx`.
