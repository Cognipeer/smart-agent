---
title: Getting Started
nav_order: 3
permalink: /getting-started/
---

# Getting Started

This guide helps you install, configure, and run your first Smart Agent.

## Prerequisites

- Node.js >= 18 (recommended LTS)
- A supported model provider API key (e.g. `OPENAI_API_KEY`) OR you can start with a fake model for offline experimentation.
- Package manager: npm, pnpm, or yarn (examples assume npm).

## Why Smart Agent?

You get: structured output, safe tool limits, optional planning/TODO mode, summarization of oversized context, multi-agent composition, and clear logging – all with a small surface area.

## Install
```sh
npm install @cognipeer/smart-agent @langchain/core
# Optional providers/helpers
npm install @langchain/openai zod
```

If you plan to use MCP or other adapters, also install the necessary packages (see future guides).

## Environment Setup

Expose your model key (OpenAI example):
```sh
export OPENAI_API_KEY=sk-...
```
Add this to your shell profile for persistence (`~/.zshrc` or similar).

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

### What happened?
1. A Zod-backed tool (`echo`) was defined.
2. An agent was created with that tool and a maximum of 5 tool calls per invocation.
3. The model emitted a tool call, the framework executed it, and returned the final assistant content.

### Optional: Offline Fake Model
If you have no key yet, build a trivial fake model:
```ts
const fakeModel = { bindTools() { return this; }, async invoke(messages:any[]) { return { role:'assistant', content:'hello (fake)' }; } };
const agent = createSmartAgent({ model: fakeModel as any });
```

## Adding Structured Output
Provide `outputSchema` to validate & parse the final message:
```ts
const Result = z.object({ title: z.string(), bullets: z.array(z.string()).min(1) });
const agent = createSmartAgent({ model, outputSchema: Result });
const res = await agent.invoke({ messages: [{ role:'user', content:'Give 3 bullets about agents' }] });
if (res.output) console.log(res.output.bullets);
```

## Enabling Planning / TODO Mode
Turn on an internal TODO list and planning prompt rules:
```ts
const agent = createSmartAgent({ model, useTodoList: true, tools: [echo] });
```
Listen for plan events:
```ts
await agent.invoke({ messages:[{ role:'user', content:'Plan and echo hi' }] }, { onEvent: e => { if(e.type==='plan') console.log('Plan size', e.todoList?.length); } });
```

## Handling Tool Limits
Set caps to prevent runaway loops:
```ts
createSmartAgent({ model, tools:[echo], limits: { maxToolCalls: 3, maxParallelTools: 2 } });
```
When the limit is hit, a system finalize message is injected and the next model turn must answer directly.

## Context Summarization
Activate via `limits.maxToken` and adjust summarization targets:
```ts
limits: { maxToolCalls: 8, maxToken: 6000, contextTokenLimit: 4000, summaryTokenLimit: 600 }
```
Disable entirely by `summarization: false`.

## Logging & Debug
Enable structured Markdown logs:
```ts
debug: { enabled: true }
```
Files appear under `logs/<timestamp>/`. Provide `callback` to intercept entries in memory.

## Quick Capability Tour

| Capability | How | Example Folder |
|------------|-----|----------------|
| Multiple Tools | tools array | `examples/tools` |
| Planning / TODO | `useTodoList: true` | `examples/todo-planning` |
| Tool Limits | `limits.maxToolCalls` | `examples/tool-limit` |
| Summarization | `limits.maxToken` | `examples/summarization` |
| Structured Output | `outputSchema` | `examples/structured-output` |
| Multi-Agent | `agent.asTool()` | `examples/multi-agent` |
| Handoff | `agent.asHandoff()` | `examples/handoff` |
| MCP Tools | MCP adapter client | `examples/mcp-tavily` |

## Next Steps

Proceed to:
- Architecture – understand the loop & phases.
- Tools – author richer tools and error handling.
- Limits & Tokens – tune summarization & caps.
- Examples – experiment hands-on.

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| No tool calls emitted | Model lacks tool calling | Use OpenAI-compatible model or fake scenario |
| Summarization not triggering | `maxToken` not reached or disabled | Lower `maxToken` or remove `summarization:false` |
| Parsed output missing | Schema mismatch / invalid JSON | Inspect `res.content`, adjust prompt, broaden schema |
| Handoff ignored | Tool not included | Ensure `handoffs` added in root agent config |

If stuck, enable debug logs and review the last agent + system messages.

## Running examples
The repository contains several examples under `examples/`. For local development, link the package and run with `tsx`.
