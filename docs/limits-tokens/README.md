---
title: Limits & Tokens
nav_order: 11
permalink: /limits-tokens/
---

# Limits and Token Management

- maxToolCalls: total tool call limit per invoke
- maxParallelTools: per-turn parallel tool limit
- maxToken: before an agent call, if the estimated input exceeds this, summarization triggers
- contextTokenLimit, summaryTokenLimit: compaction targets

Tool-limit finalize: when the model proposes tool calls and the global `maxToolCalls` is already reached, the framework injects a system finalize message. The next assistant turn must produce a direct answer without more tool calls.

Summarization (SmartAgent) is enabled by default. To disable it entirely (so `maxToken` will not trigger compaction), pass `summarization: false` to `createSmartAgent`.

Token counting uses a lightweight heuristic by default (1 token ~ 4 characters), keeping performance high.
