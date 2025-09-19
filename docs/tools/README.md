---
title: Tools
nav_order: 7
permalink: /tools/
---

# Tools

## createTool
Define tools quickly with a Zod schema and a function.

```ts
import { createTool } from "@cognipeer/smart-agent";
import { z } from "zod";

const search = createTool({
  name: "search",
  description: "Simple search",
  schema: z.object({ q: z.string() }),
  func: async ({ q }) => ({ results: [`You searched: ${q}`] }),
});
```

## MCP and LangChain tools
Any LangChain ToolInterface implementation is supported. MCP adapter tools can also be passed in the same list.

## Context tools (SmartAgent)
- manage_todo_list (available in planning mode)
- get_tool_response (retrieve raw output of summarized tool runs by executionId)
