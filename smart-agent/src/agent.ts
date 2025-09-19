// A minimal agent builder: no system prompt, no summarization, with tool limit and optional structured output finalize.
import type { AgentResult as AgentInvokeResult, InvokeConfig, AgentEvent as SmartAgentEvent, AgentOptions as SmartAgentOptions, AgentState as SmartState, AgentInstance as SmartAgentInstance, AgentRuntimeConfig, HandoffDescriptor } from "./types.js";
import { z, ZodSchema } from "zod";
import { createResolverNode } from "./nodes/resolver.js";
import { createAgentCoreNode } from "./nodes/agentCore.js";
import { createToolsNode } from "./nodes/tools.js";
import { createToolLimitFinalizeNode } from "./nodes/toolLimitFinalize.js";
import { createSmartTool } from "./tool.js";

type LiteMessage = { role: string; content: any; name?: string; [k: string]: any };
const human = (content: any): LiteMessage => ({ role: 'user', content });

export function createAgent<TOutput = unknown>(opts: SmartAgentOptions & { outputSchema?: ZodSchema<TOutput> }): SmartAgentInstance<TOutput> {
  const resolver = createResolverNode();
  const agentCore = createAgentCoreNode(opts);
  // Prepare tools list: base tools + structured output finalize if schema provided
  const toolsBase = [...((opts.tools as any) ?? [])];
  if (opts.outputSchema) {
    const responseTool = createSmartTool({
      name: 'response',
      description: 'Finalize the answer by returning the final structured JSON matching the required schema. Call exactly once when you are fully done, then stop.',
      schema: opts.outputSchema as any,
      func: async (data: any) => ({ __finalStructuredOutput: true, data }),
    });
    toolsBase.push(responseTool);
  }
  const toolsNode = createToolsNode(toolsBase, opts);
  const finalizeNode = createToolLimitFinalizeNode(opts);

  async function runLoop(initial: SmartState, config?: InvokeConfig): Promise<SmartState> {
    let state = await resolver(initial);
    const maxToolCalls = (opts.limits?.maxToolCalls ?? 10) as number;
    const iterationLimit = Math.max(maxToolCalls * 3 + 10, 40);
    let iterations = 0;

    while (iterations < iterationLimit) {
      iterations++;

      // Agent step
      state = { ...state, ...(await agentCore(state)) } as SmartState;
      const lastMsg: any = state.messages[state.messages.length - 1];
      const toolCalls: any[] = Array.isArray(lastMsg?.tool_calls) ? lastMsg.tool_calls : [];
      const toolCallCount = state.toolCallCount || 0;

      // Tool limit finalize gate
      if (state.ctx?.__finalizedDueToToolLimit) {
        break;
      }
      if (toolCallCount >= maxToolCalls && toolCalls.length > 0) {
        state = { ...state, ...(await finalizeNode(state)) } as SmartState;
        // One more assistant turn will occur, but without more tools ideally
        continue;
      }

      if (toolCalls.length === 0) break;

      // Run tools
      state = { ...state, ...(await toolsNode(state)) } as SmartState;
      if (state.ctx?.__finalizedDueToStructuredOutput) break;
    }

    return state;
  }

  const runtime: AgentRuntimeConfig = {
    name: opts.name,
    model: opts.model,
    tools: toolsBase,
    systemPrompt: undefined,
    limits: opts.limits,
    useTodoList: undefined,
    outputSchema: opts.outputSchema as any,
  };

  const instance: SmartAgentInstance<TOutput> = {
    invoke: async (input: SmartState, config?: InvokeConfig): Promise<AgentInvokeResult<TOutput>> => {
      const onEvent = config?.onEvent;
      const emit = (e: SmartAgentEvent) => { try { onEvent?.(e); } catch {} };
      const initial: SmartState = {
        messages: input.messages || [],
        summaries: input.summaries || [],
        toolCallCount: input.toolCallCount || 0,
        toolCache: input.toolCache || {},
        toolHistory: input.toolHistory || [],
        toolHistoryArchived: input.toolHistoryArchived || [],
        metadata: input.metadata,
        ctx: { ...(input.ctx || {}), __onEvent: onEvent },
        plan: input.plan || null,
        planVersion: input.planVersion || 0,
        agent: input.agent || runtime,
        usage: input.usage || { perRequest: [], totals: {} },
      };

      const res: any = await runLoop(initial, config);
      const finalMsg = res.messages[res.messages.length - 1];
      let content = "";
      if (typeof finalMsg?.content === "string") content = finalMsg.content;
      else if (Array.isArray(finalMsg?.content)) content = finalMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? c?.content ?? "")).join("");

      let parsed: TOutput | undefined = undefined;
      const schema = opts.outputSchema as ZodSchema<TOutput> | undefined;
      if (schema && (res as any).ctx?.__structuredOutputParsed) {
        parsed = (res as any).ctx.__structuredOutputParsed as TOutput;
      } else if (schema && content) {
        // Fallback: try to parse JSON from assistant message
        let jsonText: string | null = null;
        const fenced = content.match(/```(?:json)?\n([\s\S]*?)```/i);
        if (fenced && fenced[1]) jsonText = fenced[1].trim();
        else {
          const braceIdx = content.indexOf("{");
          const bracketIdx = content.indexOf("[");
          const start = [braceIdx, bracketIdx].filter(i => i >= 0).sort((a, b) => a - b)[0];
          if (start !== undefined) jsonText = content.slice(start).trim();
        }
        try {
          const raw = JSON.parse(jsonText ?? content);
          parsed = schema.parse(raw) as TOutput;
        } catch {}
      }

      emit({ type: "finalAnswer", content: typeof finalMsg?.content === 'string' ? finalMsg.content : content });

      return {
        content,
        output: parsed as TOutput | undefined,
        metadata: { usage: (res as any).usage },
        messages: res.messages,
        state: res as SmartState,
      };
    },
    asTool: ({ toolName, description, inputDescription }: { toolName: string; description?: string; inputDescription?: string }) => {
      const schema = z.object({ input: z.string().describe(inputDescription || "Input for delegated agent") });
      return createSmartTool({
        name: toolName,
        description: description || `Delegate task to agent ${opts.name || 'Agent'}`,
        schema,
        func: async ({ input }) => {
          const res = await instance.invoke({ messages: [{ role: 'user', content: input } as any] });
          return { content: res.content };
        }
      });
    },
    asHandoff: ({ toolName, description, schema }: { toolName?: string; description?: string; schema?: ZodSchema<any>; }): HandoffDescriptor => {
      const finalName = toolName || `handoff_to_${runtime.name || 'agent'}`;
      const zschema = schema || z.object({ reason: z.string().describe('Reason for handoff') });
      const tool = createSmartTool({
        name: finalName,
        description: description || `Handoff control to agent ${runtime.name || 'Agent'}`,
        schema: zschema,
        func: async (_args: any) => ({ __handoff: { runtime } })
      });
      return { type: 'handoff', toolName: finalName, description: description || '', schema: zschema, target: instance } as any;
    },
    __runtime: runtime,
  };

  if (opts.handoffs && Array.isArray(opts.handoffs)) {
    const handoffTools = opts.handoffs.map(h => {
      const schema = h.schema || z.object({ reason: z.string().describe('Reason for handoff') });
      return createSmartTool({
        name: h.toolName,
        description: h.description || `Handoff to ${h.target.__runtime.name || 'agent'}`,
        schema,
        func: async (_args: any) => ({ __handoff: { runtime: h.target.__runtime } })
      });
    });
    runtime.tools = [...runtime.tools, ...handoffTools];
  }

  return instance;
}
