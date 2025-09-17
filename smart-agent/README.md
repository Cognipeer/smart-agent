# @cognipeer/smart-agent

Composable lightweight smart agent core (no LangGraph) with message-based tool turns, summarization, and built-in helpers. Ships ESM + CJS. LangChain is OPTIONAL via an adapter.

- Message-first design: assistant tool_calls and tool responses live in `messages`.
- Summarization pipeline to keep long histories under token budgets.
- Planning mode (optional) with a built-in `manage_todo_list` tool and events.
- Simple tool helper `createSmartTool(schema, func)`; pass any LangChain ToolInterface too.
- ESM and CommonJS usage supported via `exports`.

## Install

```sh
npm install @cognipeer/smart-agent zod
```

If you want to use LangChain models/tools:
```sh
npm install @langchain/core @langchain/openai
```

If you want to use the official OpenAI SDK directly:
```sh
npm install openai
```

## Usage

### ESM

```ts
import { createSmartAgent, createSmartTool, fromLangchainModel, fromOpenAIClient } from "@cognipeer/smart-agent";
import { ChatOpenAI } from "@langchain/openai"; // optional dependency
import OpenAI from "openai"; // optional official SDK
import { z } from "zod";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text }),
});

// Option A: LangChain model via adapter
const lcModel = new ChatOpenAI({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY });
const modelA = fromLangchainModel(lcModel);

// Option B: Official OpenAI SDK client via adapter
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const modelB = fromOpenAIClient(client, { model: 'gpt-4o-mini', temperature: 0 });

const agent = createSmartAgent({ model: modelB, tools: [echo], limits: { maxToolCalls: 5 } });

const res = await agent.invoke({ messages: [{ role: 'user', content: "say hi via echo" }] });
console.log(res.content);
```

### CommonJS

```js
const { createSmartAgent, createSmartTool, fromLangchainModel, fromOpenAIClient } = require("@cognipeer/smart-agent");
const { ChatOpenAI } = require("@langchain/openai"); // optional
const OpenAI = require("openai"); // optional
const z = require("zod");

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text }),
});

const lcModel = new ChatOpenAI({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY });
const modelA = fromLangchainModel(lcModel);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const modelB = fromOpenAIClient(client, { model: 'gpt-4o-mini' });
const agent = createSmartAgent({ model: modelB, tools: [echo], limits: { maxToolCalls: 5 } });

agent.invoke({ messages: [{ role: 'user', content: "say hi via echo" }] }).then(r => console.log(r.content));
```

## API
- createSmartAgent(options)
- createSmartTool({ name, description?, schema, func })
- withTools(model, tools)

### Options
- model: Any object implementing `invoke(messages[]) => assistantMessage`. Use helper `fromLangchainModel(model)` for LangChain.
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

---
### Change Note
LangChain is now an optional peer. Use `fromLangchainModel` to adapt a LangChain ChatModel. Core no longer depends on LangChain message classes.
