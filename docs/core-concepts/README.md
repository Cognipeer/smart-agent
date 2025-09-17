---
title: Core Concepts
nav_order: 4
permalink: /core-concepts/
---

# Core Concepts

This page distills the mental model of Smart Agent before you dive into deep guides.

## 1. State
A `SmartState` object flows through the loop. Key fields:
- `messages`: Conversation list (user, assistant, tool, system)
- `toolCallCount`: Aggregate count across the invocation
- `toolHistory` / `toolHistoryArchived`: Raw + summarized tool outputs
- `summaries`: Summarization messages (compressed context)
- `plan` / `planVersion`: Planning/TODO metadata
- `usage`: Aggregated usage (provider‐normalized where possible)

## 2. Nodes (Phases)
Each node is a pure-ish async function taking and returning a partial state diff:
- resolver – normalization
- agent – model invocation
- tools – execute proposed tool calls
- contextSummarize – (conditional) compaction
- toolLimitFinalize – inject finalize system message

## 3. Tools
Created via `createSmartTool({ name, schema, func })`. Schema is Zod; return value is serialized to a tool message. Tools should:
- Validate inputs strictly
- Fail fast (throw) on unrecoverable issues
- Return small, meaningful objects (the framework can summarize large blobs later)

## 4. Planning Tools
When enabled:
- `manage_todo_list` – The model manipulates a structured TODO plan
- `get_tool_response` – Retrieve raw archived tool output by `executionId`

## 5. Structured Output
Provide `outputSchema`. The final assistant message is parsed. If JSON fenced code block present it is also attempted. Parsed result -> `res.output`.

## 6. Multi-Agent Composition
- `agent.asTool()` wraps an agent to answer a sub-question
- `agent.asHandoff()` yields control to another agent runtime

## 7. Limits
`limits` may include:
- `maxToolCalls` (global per invocation)
- `maxParallelTools` (per turn)
- `maxToken` (trigger summarization attempt before model call)
- `contextTokenLimit` (target size for retained context)
- `summaryTokenLimit` (target size per summarized chunk)

## 8. Summarization Lifecycle
1. Detect pressure (estimated token size > `maxToken`)
2. Select oldest / heaviest tool outputs
3. Rewrite into summary message, archive original
4. Model can later fetch raw via `get_tool_response`

## 9. Events
`onEvent` surfaces:
- `tool_call`
- `plan`
- `summarization`
- `metadata`
- `finalAnswer`
- `handoff`

## 10. Debug Logging
If `debug.enabled`, each invoke writes Markdown frames: configuration, tool schemas, timeline, usage.

---
Continue with **Architecture** for a deeper structural view or **Tools** to start authoring capabilities.
