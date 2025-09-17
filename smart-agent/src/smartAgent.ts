// Internal light message helpers (avoid hard dependency on LangChain message classes)
type LiteMessage = { role: string; content: any; name?: string; [k: string]: any };
const human = (content: any): LiteMessage => ({ role: 'user', content });
// AI/system messages created ad-hoc where needed
// If user supplies LangChain message objects they still pass through (we treat them opaquely)
import type { AgentInvokeResult, InvokeConfig, SmartAgentEvent, SmartAgentOptions, SmartState, SmartAgentInstance, AgentRuntimeConfig, HandoffDescriptor } from "./types.js";
import { ZodSchema } from "zod";
import { createResolverNode } from "./nodes/resolver.js";
import { createAgentNode } from "./nodes/agent.js";
import { createToolsNode } from "./nodes/tools.js";
// shouldContinue node removed; logic is embedded in manual loop
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
    const stateRef: any = { toolHistory: undefined, toolHistoryArchived: undefined, todoList: undefined };
    const planningEnabled = opts.useTodoList === true;
    const contextTools = createContextTools(stateRef, { planningEnabled, outputSchema: opts.outputSchema });
    const mergedToolsBase = [...((opts.tools as any) ?? []), ...contextTools];
    const agentNode = createAgentNode({ ...opts, tools: mergedToolsBase });
    const toolsNode = createToolsNode(mergedToolsBase, opts);
    const toolLimitFinalizeNode = createToolLimitFinalizeNode(opts);
    const summarizationEnabled = opts.summarization !== false; // default true
    const contextSummarizeNode = summarizationEnabled ? createContextSummarizeNode(opts) : undefined;
    // Decision helpers (reuse existing logic)
    const resolverDecision = resolverDecisionFactory(opts, summarizationEnabled);
    const toolsDecision = toolsDecisionFactory(opts, summarizationEnabled);
    const finalizeDecision = finalizeDecisionFactory(opts, summarizationEnabled);

    async function runLoop(initial: SmartState, config?: InvokeConfig): Promise<SmartState> {
        // Normalize via resolver first
        let state = await resolver(initial);
        let iterations = 0;
        const maxToolCalls = (opts.limits?.maxToolCalls ?? 10) as number;
        const iterationLimit = Math.max(maxToolCalls * 4 + 10, 60); // generous upper bound
        let lastAction: string | null = "resolver";
        let justSummarized = false;

        while (iterations < iterationLimit) {
            iterations++;
            // Summarization gate (pre-agent) if coming from resolver or after tools/finalize
            if (summarizationEnabled && !justSummarized && lastAction !== 'agent') {
                const next = resolverDecision(state);
                if (next === 'contextSummarize' && contextSummarizeNode) {
                    state = { ...state, ...(await contextSummarizeNode(state)) } as SmartState;
                    lastAction = 'contextSummarize';
                    justSummarized = true;
                    continue; // loop back to attempt agent
                }
            }

            // Agent turn
            state = { ...state, ...(await agentNode(state)) } as SmartState;
            lastAction = 'agent';
            justSummarized = false; // reset after agent

            const lastMsg: any = state.messages[state.messages.length - 1];
            const toolCalls: any[] = Array.isArray(lastMsg?.tool_calls) ? lastMsg.tool_calls : [];
            const toolCallCount = state.toolCallCount || 0;
            const max = maxToolCalls;

            // Check finalize due to prior finalize flag
            if (state.ctx?.__finalizedDueToToolLimit) {
                break;
            }

            // If exceeded or reached tool limit AFTER agent proposed more
            if (toolCallCount >= max) {
                // finalize node (system notice) then re-run agent once more (handled next loop)
                state = { ...state, ...(await toolLimitFinalizeNode(state)) } as SmartState;
                lastAction = 'toolLimitFinalize';
                // After finalize, maybe summarization needed (handled at top)
                continue;
            }

            // If no tool calls -> we're done
            if (toolCalls.length === 0) {
                break;
            }

            // Run tools
            state = { ...state, ...(await toolsNode(state)) } as SmartState;
            if (state.ctx?.__finalizedDueToStructuredOutput) {
                break;
            }
            lastAction = 'tools';

            // Post-tools decision: summarization vs agent vs finalize
            if (summarizationEnabled) {
                const decision = toolsDecision(state);
                if (decision === 'contextSummarize' && contextSummarizeNode) {
                    state = { ...state, ...(await contextSummarizeNode(state)) } as SmartState;
                    lastAction = 'contextSummarize';
                    justSummarized = true;
                    continue;
                } else if (decision === 'toolLimitFinalize') {
                    state = { ...state, ...(await toolLimitFinalizeNode(state)) } as SmartState;
                    lastAction = 'toolLimitFinalize';
                    continue; // next loop will reach agent or exit if no tools
                }
            } else {
                // Non-summarization mode simple finalize check already done above
            }
        }

        return state;
    }

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
            const res: any = await runLoop(initial, config);

            const finalMsg = res.messages[res.messages.length - 1];

            let content = "";
            if (typeof finalMsg?.content === "string") content = finalMsg.content;
            else if (Array.isArray(finalMsg?.content)) {
                content = finalMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? c?.content ?? "")).join("");
            }
            // Structured output preference: if finalize tool used, pick parsed result from ctx
            let parsed: TOutput | undefined = undefined;
            const schema = opts.outputSchema as ZodSchema<TOutput> | undefined;
            if (schema && (res as any).ctx?.__structuredOutputParsed) {
                parsed = (res as any).ctx.__structuredOutputParsed as TOutput;
            } else if (schema && content) {
                // Fallback legacy heuristic (no finalize tool path taken)
                let jsonText: string | null = null;
                const fenced = content.match(/```(?:json)?\n([\s\S]*?)```/i);
                if (fenced && fenced[1]) {
                    jsonText = fenced[1].trim();
                } else {
                    const braceIdx = content.indexOf("{");
                    const bracketIdx = content.indexOf("[");
                    const start = [braceIdx, bracketIdx].filter(i => i >= 0).sort((a, b) => a - b)[0];
                    if (start !== undefined) jsonText = content.slice(start).trim();
                }
                try {
                    const raw = JSON.parse(jsonText ?? content);
                    const resParsed = schema.parse(raw);
                    parsed = resParsed as TOutput;
                } catch { /* ignore parse errors */ }
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
                    const res = await instance.invoke({ messages: [human(input) as any] });
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
