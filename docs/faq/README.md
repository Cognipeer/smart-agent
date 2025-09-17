---
title: FAQ
nav_order: 12
permalink: /faq/
---

# FAQ

## Why are my tool calls not triggering?
Your model may not support `.bindTools`. `withTools(model, tools)` is a pass-through; the model may not emit tool calls. Use a model that supports tool calling.

## When does summarization run?
When `limits.maxToken` would be exceeded before the next model call, the `contextSummarize` node compacts history.

## How do I disable summarization?
It is enabled by default. Pass `summarization: false` to `createSmartAgent({ ... })` to turn it off. When disabled, `limits.maxToken` will not trigger compaction.

## Can I use MCP tools?
Yes. MCP adapter tools can be provided in the `tools` array like any LangChain tool.
