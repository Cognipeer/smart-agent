---
title: API
nav_order: 5
permalink: /api/
---

# API

Exports:
- createSmartAgent(options)
- createSmartTool({ name, description?, schema, func })
- withTools(model, tools)
- buildSystemPrompt(params?)
- nodes/*, utils/*, contextTools
- Types: SmartAgentOptions, SmartAgentLimits, SmartState, InvokeConfig, AgentInvokeResult

## SmartAgentOptions
- model: LangChain LLM/ChatModel
- tools?: ToolInterface[]
- limits?: { maxToolCalls?, maxParallelTools?, maxToken?, contextTokenLimit?, summaryTokenLimit? }
- systemPrompt?: { additionalSystemPrompt?, planning? }
- useTodoList?: boolean
- summarization?: boolean (default true) – disable to turn off token-aware context summarization
- usageConverter?: (finalMessage, fullState, model) => any
- debug?: { enabled: boolean, path?: string, callback?: (entry) => void }
- onEvent?: (event) => void

## Return type
invoke -> { content: string, metadata: { usage? }, messages: Message[] }
