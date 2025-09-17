---
title: Architecture
nav_order: 4
permalink: /architecture/
---

# Architecture

The agent is a LangGraph StateGraph composed of these nodes:

- resolver: input checks and flow start
- agent: model call (with tool binding)
- tools: executes tool calls (observes parallel limits)
- shouldContinue: decides next step after tools
- toolLimitFinalize: finalization when tool limit is reached
- contextSummarize: summarization when token limit would be exceeded

Summarization is triggered via `limits.maxToken` (default behavior). You can disable this by setting `summarization: false` in `createSmartAgent` options. Planning mode enables contextual tools (`manage_todo_list`, `get_tool_response`).
