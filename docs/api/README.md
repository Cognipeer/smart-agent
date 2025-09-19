---
title: API
nav_order: 5
permalink: /api/
---

# API

Exports:
- createAgent(options)
- createSmartAgent(options)
- createTool({ name, description?, schema, func })
- fromLangchainModel(model)
- buildSystemPrompt(params?)
- nodes/*, utils/*, contextTools
- Types: SmartAgentOptions, SmartAgentLimits, SmartState, InvokeConfig, AgentInvokeResult

## AgentOptions / SmartAgentOptions
- model: LangChain LLM/ChatModel
- tools?: ToolInterface[]
- limits?: { maxToolCalls?, maxParallelTools?, maxToken?, contextTokenLimit?, summaryTokenLimit? }
- systemPrompt?: string (SmartAgent adds a composed prompt; base agent ignores this)
- useTodoList?: boolean
- summarization?: boolean (default true) – disable to turn off token-aware context summarization
- usageConverter?: (finalMessage, fullState, model) => any
- debug?: { enabled: boolean, path?: string, callback?: (entry) => void }
- onEvent?: (event) => void

## Return type
invoke -> { content: string, output?: T, metadata: { usage? }, messages: Message[], state? }
