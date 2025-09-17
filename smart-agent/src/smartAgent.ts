import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import type { AgentInvokeResult, InvokeConfig, SmartAgentEvent, SmartAgentOptions, SmartState, SmartAgentInstance, AgentRuntimeConfig, HandoffDescriptor } from "./types.js";
import { ZodSchema } from "zod";
import { createResolverNode } from "./nodes/resolver.js";
import { createAgentNode } from "./nodes/agent.js";
import { createToolsNode } from "./nodes/tools.js";
import { createShouldContinueNode } from "./nodes/shouldContinue.js";
import { createToolLimitFinalizeNode } from "./nodes/toolLimitFinalize.js";
import { createDebugSession, formatMarkdown, getModelName, serializeAgentTools, writeStepMarkdown } from "./utils/debugLogger.js";
import { createContextSummarizeNode } from "./nodes/contextSummarize.js";
import { createContextTools } from "./contextTools.js";
import { createSmartTool } from "./tool.js";
import { z } from "zod";
import { countApproxTokens } from "./utils/utilTokens.js"; // kept for potential external use; internal decisions refactored
import { resolverDecisionFactory, toolsDecisionFactory, finalizeDecisionFactory } from "./graph/decisions.js";
import { normalizeUsage } from "./utils/usage.js";

// system prompt is provided by prompts.ts

export function createSmartAgent<TOutput = unknown>(opts: SmartAgentOptions & { outputSchema?: ZodSchema<TOutput> }): SmartAgentInstance<TOutput> {
    const resolver = createResolverNode();
    // include default context tools in addition to user tools
    const stateRef: any = { toolHistory: undefined, toolHistoryArchived: undefined, todoList: undefined };
    const planningEnabled = opts.useTodoList === true;
    const contextTools = createContextTools(stateRef, { planningEnabled });
    const mergedToolsBase = [...((opts.tools as any) ?? []), ...contextTools];
    // Placeholder; real tool list will include handoff tools after instance constructed
    const agent = createAgentNode({ ...opts, tools: mergedToolsBase });
    const tools = createToolsNode(mergedToolsBase, opts);
    const toolLimitFinalize = createToolLimitFinalizeNode(opts);
    const shouldContinue = createShouldContinueNode(opts);
    const summarizationEnabled = opts.summarization !== false; // default true
    const contextSummarize = summarizationEnabled ? createContextSummarizeNode(opts) : undefined as any;

    // Define state annotation
    const stateAnn = Annotation.Root({
        messages: Annotation,
        summaries: Annotation,
        toolCallCount: Annotation,
        toolCache: Annotation,
        metadata: Annotation,
        ctx: Annotation,
        plan: Annotation,
        planVersion: Annotation,
    usage: Annotation,
    });

    // Nodes
    const graph = new StateGraph(stateAnn as any);
    graph.addNode("resolver", resolver);
    graph.addNode("agent", agent);
    graph.addNode("tools", tools);
    graph.addNode("toolLimitFinalize", toolLimitFinalize);
    if (summarizationEnabled) {
        graph.addNode("contextSummarize", contextSummarize);
    }
    (graph as any).addEdge(START as any, "resolver");
    (graph as any).addConditionalEdges("agent", shouldContinue, ["tools", "toolLimitFinalize", END]);
    const resolverDecision = resolverDecisionFactory(opts, summarizationEnabled);
    if (summarizationEnabled) {
        (graph as any).addConditionalEdges("resolver", resolverDecision as any, ["agent", "contextSummarize"]);
    } else {
        (graph as any).addConditionalEdges("resolver", (_state: SmartState) => "agent", ["agent"]);
    }
    // After tools run, if we've reached or exceeded maxToolCalls, go to finalize; else loop to agent
    const toolsDecision = toolsDecisionFactory(opts, summarizationEnabled);
    if (summarizationEnabled) {
        (graph as any).addConditionalEdges("tools", toolsDecision as any, ["agent", "toolLimitFinalize", "contextSummarize"]);
    } else {
        (graph as any).addConditionalEdges("tools", (state: SmartState) => {
            const max = (opts.limits?.maxToolCalls ?? 10) as number;
            const count = state.toolCallCount || 0;
            if (count >= max) return "toolLimitFinalize";
            return "agent";
        }, ["agent", "toolLimitFinalize"]);
    }
    // From finalize -> precheck (summarize if needed) -> agent
    const finalizeDecision = finalizeDecisionFactory(opts, summarizationEnabled);
    if (summarizationEnabled) {
        (graph as any).addConditionalEdges("toolLimitFinalize", finalizeDecision as any, ["agent", "contextSummarize"]);
        // After summarization, go to agent if enabled
        (graph as any).addEdge("contextSummarize", "agent");
    } else {
        (graph as any).addConditionalEdges("toolLimitFinalize", (_state: SmartState) => "agent", ["agent"]);
    }

    const app = graph.compile();

    const runtime: AgentRuntimeConfig = {
        name: opts.name,
        model: opts.model,
        tools: mergedToolsBase,
        systemPrompt: opts.systemPrompt,
        limits: opts.limits,
        useTodoList: opts.useTodoList,
        outputSchema: opts.outputSchema as any,
    };

    const instance: SmartAgentInstance<TOutput> = {
        invoke: async (input: SmartState, config?: InvokeConfig): Promise<AgentInvokeResult<TOutput>> => {
            // Initialize debug session per invoke and stash on ctx
            const debugSession = createDebugSession(opts);
            const onEvent = config?.onEvent;
            const emit = (e: SmartAgentEvent) => {
                try { onEvent?.(e); } catch (_) { /* ignore */ }
            };
            const initial: SmartState = {
                messages: input.messages || [],
                summaries: input.summaries || [],
                toolCallCount: input.toolCallCount || 0,
                toolCache: input.toolCache || {},
                toolHistory: input.toolHistory || [],
                toolHistoryArchived: input.toolHistoryArchived || [],
                metadata: input.metadata,
                ctx: { ...(input.ctx || {}), __debugSession: debugSession, __onEvent: onEvent },
                plan: input.plan || null,
                planVersion: input.planVersion || 0,
                agent: input.agent || runtime,
                usage: input.usage || { perRequest: [], totals: {} },
            };
            // keep stateRef pointers up to date for context tools
            stateRef.toolHistory = initial.toolHistory;
            stateRef.toolHistoryArchived = initial.toolHistoryArchived;
            const res: any = await app.invoke(initial, { ...config, recursionLimit: (input.toolCallCount ? input.toolCallCount * 2 : 50) });

            const finalMsg = res.messages[res.messages.length - 1];

            let content = "";
            if (typeof finalMsg?.content === "string") content = finalMsg.content;
            else if (Array.isArray(finalMsg?.content)) {
                content = finalMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? c?.content ?? "")).join("");
            }
            // If an output schema is provided, try to parse structured output
            let parsed: TOutput | undefined = undefined;
            const schema = opts.outputSchema as ZodSchema<TOutput> | undefined;
            if (schema && content) {
                // Heuristic: try to locate a JSON block in content, else attempt direct parse
                let jsonText: string | null = null;
                const fenced = content.match(/```(?:json)?\n([\s\S]*?)```/i);
                if (fenced && fenced[1]) {
                    jsonText = fenced[1].trim();
                } else {
                    // try to extract first {...} or [...] block
                    const braceIdx = content.indexOf("{");
                    const bracketIdx = content.indexOf("[");
                    const start = [braceIdx, bracketIdx].filter(i => i >= 0).sort((a, b) => a - b)[0];
                    if (start !== undefined) jsonText = content.slice(start).trim();
                }
                try {
                    const raw = JSON.parse(jsonText ?? content);
                    const resParsed = schema.parse(raw);
                    parsed = resParsed as TOutput;
                } catch {
                    // ignore parse errors; user can inspect content
                }
            }

            // Default usage converter attempts OpenAI-style usage on message or model
            const defaultUsageConverter = (message: any, _state: any, model: any) => {
                // Try LangChain OpenAI: message.usage or model.getNumTokens? Not guaranteed; keep flexible.
                const usage = message?.usage || message?.response_metadata?.token_usage || message?.response_metadata?.usage;
                if (usage) return usage;
                // Some models expose last usage via model?.lastUsage
                return model?.lastUsage || undefined;
            };
            const rawUsage = (opts.usageConverter || defaultUsageConverter)(finalMsg, res as any, opts.model);
            const normalized = normalizeUsage(rawUsage) || rawUsage;
            // Attach per-request normalized usage already handled in agent node; here we expose the evolving state usage aggregation
            const stateUsage = (res as any).usage;

            // Emit metadata + final answer events
            emit({ type: "metadata", usage: stateUsage, modelName: getModelName((opts as any).model), limits: opts.limits });

            let contentEvent = "";
            if (typeof finalMsg?.content === "string") contentEvent = finalMsg.content;
            else if (Array.isArray(finalMsg?.content)) {
                contentEvent = finalMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? c?.content ?? "")).join("");
            }
            emit({ type: "finalAnswer", content: contentEvent });

            // Per-call logs are emitted from the agent node; avoid duplicating here.

            return {
                content,
                output: parsed as TOutput | undefined,
                metadata: { usage: stateUsage },
                messages: res.messages,
                state: res as SmartState,
            };
        },
        asTool: ({ toolName, description, inputDescription }: { toolName: string; description?: string; inputDescription?: string }) => {
            // Simple schema: single string input. Accept either { input: string } or raw string coerced.
            const schema = z.object({ input: z.string().describe(inputDescription || "Input message for delegated agent") });
            return createSmartTool({
                name: toolName,
                description: description || `Delegate task to agent ${opts.name || 'Agent'}`,
                schema,
                func: async ({ input }) => {
                    const res = await instance.invoke({ messages: [new HumanMessage(input)] });
                    return { content: res.content };
                }
            });
        },
        asHandoff: ({ toolName, description, schema }: { toolName?: string; description?: string; schema?: ZodSchema<any>; }): HandoffDescriptor => {
            const finalName = toolName || `handoff_to_${runtime.name || 'agent'}`;
            const zschema = schema || z.object({ reason: z.string().describe('Reason for handing off') });
            const tool = createSmartTool({
                name: finalName,
                description: description || `Handoff control to agent ${runtime.name || 'Agent'}`,
                schema: zschema,
                func: async (_args: any) => {
                    return { __handoff: { runtime } };
                }
            });
            return { type: 'handoff', toolName: finalName, description: description || '', schema: zschema, target: instance } as any;
        },
        __runtime: runtime,
    };
    // If root agent has handoffs, we should append their tools to runtime.tools AFTER we have instance (so child asHandoff can reference)
    if (opts.handoffs && Array.isArray(opts.handoffs)) {
        // Each handoff descriptor has target with __runtime; create tool that triggers switching to that runtime
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

// (Types are exported from src/index.ts via ./types.js)
