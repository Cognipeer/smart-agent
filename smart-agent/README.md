# @cognipeer/smart-agent

Composable LangGraph-based smart agent with message-based tool turns, summarization, and built-in helpers. Ships ESM + CJS and works with LangChain tools (including MCP tools).

- Message-first design: assistant tool_calls and tool responses live in `messages`.
- Summarization pipeline to keep long histories under token budgets.
- Planning mode (optional) with a built-in `manage_todo_list` tool and events.
- Simple tool helper `createSmartTool(schema, func)`; pass any LangChain ToolInterface too.
- ESM and CommonJS usage supported via `exports`.

## Install

```sh
npm install @cognipeer/smart-agent @langchain/core @langchain/langgraph
```

Optional: providers you plan to use, e.g. OpenAI

```sh
npm install @langchain/openai zod tiktoken
```

## Usage

### ESM

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

### CommonJS

```js
const { createSmartAgent, createSmartTool } = require("@cognipeer/smart-agent");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");
const z = require("zod");

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text }),
});

const model = new ChatOpenAI({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY });
const agent = createSmartAgent({ model, tools: [echo], limits: { maxToolCalls: 5 } });

agent.invoke({ messages: [new HumanMessage("say hi via echo")] }).then(r => console.log(r.content));
```

## API
- createSmartAgent(options)
- createSmartTool({ name, description?, schema, func })
- withTools(model, tools)

### Options
- model: LangChain LLM/ChatModel; if it supports tool calling, tools are bound automatically.
- tools?: ToolInterface[] (LangChain tools or MCP tools via adapters)
- limits?: { maxToolCalls?, maxParallelTools?, maxToken?, contextTokenLimit?, summaryTokenLimit? }
- systemPrompt?: { additionalSystemPrompt?, planning? }
- useTodoList?: boolean (enables manage_todo_list tool + planning hints)
- summarization?: boolean (default: true). Set to false to disable token-aware context summarization; when disabled, `limits.maxToken` won't trigger summarization.
- usageConverter?: (finalMessage, fullState, model) => any
- debug?: { enabled: boolean, path?: string, callback?: (entry) => void }

### Events
Provide `onEvent` in options or per-invoke. Events include:
- tool_call: { phase: start|success|error|skipped, name, id?, args?, result?, error? }
- plan: { source: manage_todo_list|system, operation, todoList }
- summarization: { summary, archivedCount }
- finalAnswer: { content }
- metadata: { usage, modelName, limits }

## Examples
All examples live in the repository root under `examples/` with per-example READMEs:
- basic/
- tools/
- todo-planning/
- tool-limit/
- summarize-context/
- summarization/
- rewrite-summary/
- mcp-tavily/

See each folder for how to run.

### Disable summarization

Pass `summarization: false` to turn off automatic context summarization (default is on):

```ts
const agent = createSmartAgent({
  model,
  tools: [echo],
  summarization: false, // disable summarization
  limits: { maxToolCalls: 5, maxToken: 500 }, // maxToken won't trigger summarization when disabled
});
```

## Build
- ESM + CJS builds via tsup. Exports map ensures both import and require work.
- TypeScript types included.

## License
MIT
