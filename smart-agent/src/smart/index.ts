import type { AgentResult as AgentInvokeResult, InvokeConfig, AgentOptions as SmartAgentOptions, AgentState as SmartState, AgentInstance as SmartAgentInstance } from "../types.js";
import { ZodSchema, z } from "zod";
import { createAgent } from "../agent.js";
import { createContextTools } from "../contextTools.js";
import { createContextSummarizeNode } from "../nodes/contextSummarize.js";
import { buildSystemPrompt } from "../prompts.js";
import { resolverDecisionFactory, toolsDecisionFactory } from "../graph/decisions.js";

// SmartAgent on top of core createAgent: adds system prompt, optional planning context tools, and token-aware summarization.
export function createSmartAgent<TOutput = unknown>(opts: SmartAgentOptions & { outputSchema?: ZodSchema<TOutput> }): SmartAgentInstance<TOutput> {
  // Prepare context tools (todo + get_tool_response). Avoid duplicating response tool; base agent will add it if schema provided.
  const stateRef: any = { toolHistory: undefined, toolHistoryArchived: undefined, todoList: undefined };
  const planningEnabled = opts.useTodoList === true;
  const contextTools = createContextTools(stateRef, { planningEnabled, outputSchema: undefined });
  const mergedTools = [...((opts.tools as any) ?? []), ...contextTools];

  // Compose base agent
  const base = createAgent<TOutput>({ ...opts, tools: mergedTools });

  const summarizationEnabled = opts.summarization !== false; // default true
  const summarizer = summarizationEnabled ? createContextSummarizeNode(opts) : undefined;
  const decideBefore = resolverDecisionFactory(opts, summarizationEnabled);
  const decideAfter = toolsDecisionFactory(opts, summarizationEnabled);

  const structuredOutputHint = opts.outputSchema
    ? [
      'A structured output schema is active.',
      'Do NOT output the final JSON directly as an assistant message.',
      'When completely finished, call tool `response` passing the final JSON matching the schema as its arguments (direct object).',
      'Call it exactly once then STOP producing further assistant messages.'
    ].join('\n')
    : '';

  function systemMessage(): any {
    const sys = buildSystemPrompt(
      [opts.systemPrompt, structuredOutputHint].filter(Boolean).join("\n"),
      opts.useTodoList === true,
      opts.name || "Agent"
    );
    return { role: 'system', content: sys } as any;
  }

  const instance: SmartAgentInstance<TOutput> = {
    invoke: async (input: SmartState, config?: InvokeConfig): Promise<AgentInvokeResult<TOutput>> => {
      // wire stateRef for context tools
      stateRef.toolHistory = input.toolHistory;
      stateRef.toolHistoryArchived = input.toolHistoryArchived;

      // Prepend a single system message once
      const alreadyHasSystem = Array.isArray(input.messages) && input.messages[0]?.role === 'system';
      const seedMessages = alreadyHasSystem ? [...(input.messages || [])] : [systemMessage(), ...(input.messages || [])];
      let state: SmartState = { ...input, messages: seedMessages } as SmartState;
      let lastResult: AgentInvokeResult<TOutput> | null = null;
      const iterationLimit = Math.max((opts.limits?.maxToolCalls ?? 10) * 3 + 5, 30);

      for (let i = 0; i < iterationLimit; i++) {
        // Pre-agent summarization decision
        const next = summarizationEnabled ? decideBefore(state) : 'agent';
        if (next === 'contextSummarize' && summarizer) {
          const delta = await summarizer(state);
          state = { ...state, ...delta } as SmartState;
          continue; // run decision again before calling base
        }

        // Delegate a full turn to base agent (includes tools + tool-limit finalize + structured output finalize)
        const res = await base.invoke(state, config);
        lastResult = res as AgentInvokeResult<TOutput>;
        state = (res.state as SmartState) || { ...state, messages: res.messages };

        // If structured output finalize triggered, base already stopped with parsed output
        if ((state as any).ctx?.__finalizedDueToStructuredOutput) break;

        // Post-tools summarization decision
        if (summarizationEnabled) {
          const after = decideAfter(state);
          if (after === 'contextSummarize' && summarizer) {
            const delta = await summarizer(state);
            state = { ...state, ...delta } as SmartState;
            // Loop will attempt another agent pass
            continue;
          }
        }

        // If base produced an assistant message without tool calls (its normal stop), we're done.
        break;
      }

      // Fall back if base was never invoked (edge case)
      if (!lastResult) {
        const res = await base.invoke(state, config);
        lastResult = res as AgentInvokeResult<TOutput>;
      }

      return lastResult as AgentInvokeResult<TOutput>;
    },
    asTool: base.asTool,
    asHandoff: base.asHandoff,
    __runtime: base.__runtime,
  };

  return instance;
}
