---
title: Architecture
nav_order: 4
permalink: /architecture/
---

# Architecture

The agent uses a lightweight iterative loop (previously a graph) with conceptual phases:

- resolver: input checks / normalization
- contextSummarize (conditional): token budget guard compacts prior tool output
- agent: model call (tools bound if supported)
- tools: executes emitted tool calls (enforces parallel + total limits)
- toolLimitFinalize: injects a system notice when tool-cap reached; next agent turn produces final answer

Loop ends when agent produces an assistant message without tool calls or after finalization. Summarization triggers via `limits.maxToken` unless `summarization: false` is set. Planning mode enables contextual tools (`manage_todo_list`, `get_tool_response`).
