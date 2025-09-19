---
layout: home
title: Smart Agent Docs
nav_order: 1
---

# Smart Agent

Lightweight agent loop with tool limits and structured output (createAgent). A SmartAgent layer adds planning (TODO) and context summarization.

## Key Capabilities

- Planning mode & TODO list (SmartAgent): let the agent build and evolve an internal action plan.
- Structured output: enforce and parse final JSON results using a Zod schema.
- Multi-agent composition: turn any agent into a tool for another agent.
- Handoffs: explicitly transfer control to a specialized agent mid-conversation.
- Tool limits: total + parallel call caps with automatic finalize message injection.
- Context & token management (SmartAgent): summarize and archive large tool outputs when thresholds are exceeded.
- MCP tools: dynamically discover and use remote MCP-hosted tools.
- Logging & observability: per-invoke Markdown logs and event streaming hooks.
- Flexible model layer: works with LangChain ChatModels or custom/fake models for offline tests.

## Quick Start

See [Getting Started](getting-started/) for installation and your first agent. The sections below dive deeper by capability.

## Documentation Map

Foundations:
- [Getting Started](getting-started/) – Install & first agent.
- [Core Concepts](core-concepts/) – State, nodes, tools, limits, events.
- [Architecture](architecture/) – Loop phases and decision flow.

API & Building Blocks:
- [API](api/) – Exported functions & types.
- [Nodes](nodes/) – Functional phases of the loop.
- [Tools](tools/) – Simple tool definitions.
- (Planned) Tool Development Advanced – Advanced authoring, perf, retries.
- [Prompts](prompts/) – System prompt + planning rules.

Capability Guides (to be added):
- Structured Output (structured-output/) – Typed JSON outputs with fallback strategies.
- Planning & TODO (planning-todo/) – Maintaining and evolving plans.
- Context Management (context-management/) – Summarization strategy & raw retrieval.
- Multi-Agent (multi-agent/) – Embedding agents as tools.
- Handoff (handoff/) – Delegation vs tool usage.
- MCP Integration (mcp/) – Remote tool discovery.

Operations:
- [Limits & Tokens](limits-tokens/) – Limit parameters & effects.
- [Debugging](debugging/) – Log structure & event hooks.

Reference & Help:
- [Examples](examples/) – Practical folders for each capability.
- [FAQ](faq/) – Common issues.

## Example Coverage Mapping

| Folder | Capability | Notes |
|--------|------------|-------|
| basic | Basic loop & tool call | Includes fake model fallback |
| tools | Multiple tools & events | Optional Tavily search |
| todo-planning | Planning / TODO list | `useTodoList: true` |
| tool-limit | Limit trigger & finalize | System notice injection |
| summarize-context | Heavy output + summarization + raw recovery | Uses `get_tool_response` |
| summarization | Token-threshold summarization | `maxToken` behavior |
| rewrite-summary | Continue after summarized history | Summary + new user turn |
| structured-output | JSON parsing via schema | `outputSchema` |
| multi-agent | Agent as tool | `asTool()` |
| handoff | Explicit handoff control | `asHandoff()` |
| mcp-tavily | MCP remote tools | `MultiServerMCPClient` |

## Design Principles

- Minimal: no heavy external graph lib; a transparent while-loop.
- Developer-first: safe defaults, quick logging, predictable events.
- Flexible: offline testing with a fake model path.
- Observable: event emission (`onEvent`) + Markdown logs.

> Tip: Open the example folder first to see a concrete run, then read the corresponding guide for deeper context.

Use the left sidebar & search for full navigation.
