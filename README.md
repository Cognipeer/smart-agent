# Smart Agent Monorepo

[Docs Website (GitHub Pages)](https://cognipeer.github.io/smart-agent/)

Lightweight smart agent (no LangGraph dependency) that treats tool calls as messages, supports automatic context summarization, optional planning, and rich debug logs. The NPM package lives under `smart-agent/` (name: `@cognipeer/smart-agent`), and runnable examples are under `examples/`.

- Package: `smart-agent/`
- Examples: `examples/`
- Node: 18.17+ recommended

This README covers usage for consumers of the package and contributors working in this repo.

## Table of contents
- Overview and features
- Install and quick start
- Examples
- Architecture overview
- API and options
- Events and debugging
- Limits and token management
- Development and publishing
- Troubleshooting
- Full documentation

## Overview and features
- Message-first design: assistant tool_calls and tool responses are persisted in LangChain messages.
- Automatic summarization: when history grows beyond a token budget, the agent summarizes and compacts context.
- Optional planning mode: built-in `manage_todo_list` tool and prompt hints to keep a working plan.
- Tool helper: `createSmartTool(schema, func)` with Zod schema, or pass any LangChain ToolInterface.
- ESM + CJS builds via exports map.
- Rich debug logs: per-invoke Markdown with model, limits, usage, tools, and message timeline.

## Install
Install the package and peer deps (LangGraph no longer required):

```sh
npm install @cognipeer/smart-agent @langchain/core
# Optional providers/helpers
npm install @langchain/openai zod
```

### Quick start (ESM)
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
const agent = createSmartAgent({
  name: "ResearchHelper", // optional agent name (appears in system prompt header)
  model,
  tools: [echo],
  limits: { maxToolCalls: 5, maxToken: 8000 },
  debug: { enabled: true },
});

const result = await agent.invoke({ messages: [new HumanMessage("say hi via echo")] });
console.log(result.content);
```

### CommonJS
```js
const { createSmartAgent, createSmartTool } = require("@cognipeer/smart-agent");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");
const { z } = require("zod");

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text }),
});

const model = new ChatOpenAI({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY });
const agent = createSmartAgent({ model, tools: [echo] });

agent.invoke({ messages: [new HumanMessage("say hi via echo")] }).then(r => console.log(r.content));
```

## Examples
All examples live under `examples/`, each with its own README. Highlights:
- `basic/`
- `tools/`
- `todo-planning/`
- `tool-limit/`
- `summarize-context/`
- `summarization/`
- `rewrite-summary/`
- `mcp-tavily/`

To run examples against a local build, link the package:
```sh
# link the package dir
cd smart-agent && npm link
# link the package name from repo root
cd .. && npm link @cognipeer/smart-agent
# run an example (ensure required env vars)
OPENAI_API_KEY=... npx tsx examples/tools/tools.ts
```

## Architecture overview
The agent runs an internal iterative loop (previously a LangGraph graph) with these conceptual phases:
- resolver: input gate and normalization
- optional contextSummarize phase when token budget would be exceeded
- agent: model call (tools bound when supported)
- tools: executes tool calls (enforces parallel + total limits)
- toolLimitFinalize: injects a final system notice when tool-call cap hit (then a last agent turn)

Loop exits when the agent produces an assistant message without tool calls or after finalization. Planning mode adds `manage_todo_list`. A helper tool `get_tool_response` lets prompts reference archived/summarized tool outputs by executionId. Debug sessions write Markdown to `logs/` with timestamped directories.

More details: docs/architecture/README.md

## API and options
Exports come from `smart-agent/src/index.ts`:
- createSmartAgent(options)
- createSmartTool({ name, description?, schema, func })
- withTools(model, tools)
- buildSystemPrompt(params?)
- Nodes and helpers: `nodes/*`, `utils/*`, `contextTools`
- Types: `SmartAgentOptions`, `SmartAgentLimits`, `SmartState`, `InvokeConfig`, `AgentInvokeResult`

### Key options (SmartAgentOptions)
- name?: string – Human-friendly agent name. Added at top of system prompt (default: "Agent").
- model: LangChain LLM/ChatModel (ideally supports `.bindTools`)
- tools?: ToolInterface[] (LangChain tools or MCP tools via adapters)
- limits?: { maxToolCalls?, maxParallelTools?, maxToken?, contextTokenLimit?, summaryTokenLimit? }
- systemPrompt?: { additionalSystemPrompt?, planning? }
- useTodoList?: boolean (enables planning mode and `manage_todo_list` tool)
- usageConverter?: (finalMessage, fullState, model) => any
- debug?: { enabled: boolean, path?: string, callback?: (entry) => void }
- onEvent?: (event) => void

### Events
- tool_call: { phase: start|success|error|skipped, name, id?, args?, result?, error? }
- plan: { source: manage_todo_list|system, operation, todoList }
- summarization: { summary, archivedCount }
- finalAnswer: { content }
- metadata: { usage, modelName, limits }

## Debugging
With `debug.enabled: true`, each invoke writes a Markdown snapshot to `logs/<ISO_DATE>/` including:
- model, date, limits, usage
- tools serialization (names, descriptions, schemas when available)
- full message timeline with tool calls and tool responses

Alternatively provide a `callback` to receive log entries in-memory and persist elsewhere.

More: docs/debugging/README.md

## Limits and token management
- `maxToolCalls`: total number of tool calls per invoke
- `maxParallelTools`: max tools executed concurrently per turn
- `maxToken`: before the next agent call, if estimated tokens would exceed this, summarization runs
- `contextTokenLimit`, `summaryTokenLimit`: targets for compaction

Token estimation is a lightweight heuristic by default (approx. 1 token ~ 4 chars). You can replace it if needed.

More: docs/limits-tokens/README.md

### Token usage tracking (per-request)

Her LLM çağrısı (agent turn) sonrası sağlayıcının döndürdüğü ham `usage` objesi state'e eklenir:

```ts
const result = await agent.invoke({ messages: [new HumanMessage("Hello")] });
console.log(result.state?.usage);
/* {
  perRequest: [
    { id: "1726578123_ab12cd", modelName: "gpt-4o-mini", usage: { input_tokens: 12, output_tokens: 25, total_tokens: 37, cached_input_tokens: 5 }, timestamp: "...", turn: 1 }
  ],
  totals: { "gpt-4o-mini": { input: 12, output: 25, total: 37, cachedInput: 5 } }
} */
```

Toplamlar model adına göre normalize edilmeye çalışılır; desteklenen alan adları:
`input_tokens|prompt_tokens|promptTokens|total_prompt_tokens`, `output_tokens|completion_tokens|completionTokens|total_completion_tokens`, `total_tokens|totalTokens`. Ek olarak cache/shared prompt token alanları `cached_input_tokens|cached_prompt_tokens` isimleri ile toplanıp `cachedInput` altında birikir.

Debug log dosyalarına sadece ilgili isteğin ham usage değeri yazılır; aggregate toplamlar yazılmaz.

## Development
This repo is a mono layout with a package folder and examples.

Build the package:
```sh
cd smart-agent && npm install && npm run build
```

Run examples from the repo root using `tsx`. Provide any required provider API keys via env vars.

### Publishing
Only publish the package folder:
```sh
cd smart-agent
# bump version in package.json
npm publish --access public
```
`prepublishOnly` ensures a fresh dist before publish.

## Troubleshooting
- Node version: use 18.17+ to avoid ESM/CJS footguns.
- Tool schemas: use Zod schemas; model-produced args must pass validation.
- Tool binding: if your model doesn’t support `.bindTools`, `withTools(model, tools)` passes through and the model may not emit tool calls.
- Long histories: set `maxToken` to enable summarization between turns.

## Full documentation
Visit the website: https://cognipeer.github.io/smart-agent/

Repo copies of the guides live under `docs/`:
- docs/README.md (nav)
- docs/getting-started/README.md
- docs/architecture/README.md
- docs/api/README.md
- docs/nodes/README.md
- docs/tools/README.md
- docs/prompts/README.md
- docs/examples/README.md
- docs/debugging/README.md
- docs/limits-tokens/README.md
- docs/faq/README.md

