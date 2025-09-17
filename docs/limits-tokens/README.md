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

Summarization is enabled by default. To disable it entirely (so `maxToken` will not trigger compaction), pass `summarization: false` to `createSmartAgent`.

Token counting uses a lightweight heuristic by default (1 token ~ 4 characters), keeping performance high.
