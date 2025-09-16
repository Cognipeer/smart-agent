---
title: Prompts & Planning
nav_order: 8
permalink: /prompts/
---

# Prompts and Planning

Use `buildSystemPrompt(params)` to construct the system prompt. When `planning: true` is provided, strict planning rules are included.

Example with additional instructions:
```ts
buildSystemPrompt({ planning: true, additionalSystemPrompt: "Keep answers short" });
```
