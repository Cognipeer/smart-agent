import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { AgentInvokeResult, InvokeConfig, SmartAgentEvent, SmartAgentOptions, SmartState } from "./types.js";
import { createResolverNode } from "./nodes/resolver.js";
import { createAgentNode } from "./nodes/agent.js";
import { createToolsNode } from "./nodes/tools.js";
import { createShouldContinueNode } from "./nodes/shouldContinue.js";
import { createToolLimitFinalizeNode } from "./nodes/toolLimitFinalize.js";
import { createDebugSession, formatMarkdown, getModelName, serializeAgentTools, writeStepMarkdown } from "./utils/debugLogger.js";
import { createContextSummarizeNode } from "./nodes/contextSummarize.js";
import { createContextTools } from "./contextTools.js";
import { countApproxTokens } from "./utils/utilTokens.js";

// system prompt is provided by prompts.ts

export function createSmartAgent(opts: SmartAgentOptions) {
    const resolver = createResolverNode();
    // include default context tools in addition to user tools
    const stateRef: any = { toolHistory: undefined, toolHistoryArchived: undefined, todoList: undefined };
    const planningEnabled = opts.useTodoList === true || opts.systemPrompt?.planning === true;
    const contextTools = createContextTools(stateRef, { planningEnabled });
    const mergedTools = [...((opts.tools as any) ?? []), ...contextTools];
    const agent = createAgentNode({ ...opts, tools: mergedTools });
    const tools = createToolsNode(mergedTools, opts);
    const toolLimitFinalize = createToolLimitFinalizeNode(opts);
    const shouldContinue = createShouldContinueNode(opts);
    const contextSummarize = createContextSummarizeNode(opts);

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
    });

    // Nodes
    const graph = new StateGraph(stateAnn as any)
        .addNode("resolver", resolver)
        .addNode("agent", agent)
        .addNode("tools", tools)
        .addNode("toolLimitFinalize", toolLimitFinalize)
        .addNode("contextSummarize", contextSummarize)
        .addEdge(START as any, "resolver")
        .addConditionalEdges("agent", shouldContinue, ["tools", "toolLimitFinalize", END])
    .addConditionalEdges("resolver", (state: SmartState) => {
            // Pre-agent token limit check: estimate tokens for the next agent input.
            const maxTok = opts.limits?.maxToken;
            if (!maxTok) return "agent";
            try {
                // We only consider visible messages; system prompt is injected later and may be large.
                const allText = (state.messages || [])
                    .map((m: any) => typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => (typeof c === 'string' ? c : c?.text ?? c?.content ?? '')).join('') : '')
                    .join("\n");
                // Approximate token count to avoid heavy/wrong-context WASM deps.
                const tokenCount = countApproxTokens(allText);
                return tokenCount > maxTok ? "contextSummarize" : "agent";
            } catch {
                // Fallback to agent if encoding fails
                return "agent";
            }
        }, ["agent", "contextSummarize"])
        // After tools run, if we've reached or exceeded maxToolCalls, go to finalize; else loop to agent
        .addConditionalEdges("tools", (state: SmartState) => {
            const max = (opts.limits?.maxToolCalls ?? 10) as number;
            const count = state.toolCallCount || 0;
            if (count >= max) return "toolLimitFinalize";
            const maxTok = opts.limits?.maxToken;
            if (!maxTok) return "agent";
            try {
                const allText = (state.messages || [])
                    .map((m: any) => typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => (typeof c === 'string' ? c : c?.text ?? c?.content ?? '')).join('') : '')
                    .join("\n");
                const tokenCount = countApproxTokens(allText);
                return tokenCount > maxTok ? "contextSummarize" : "agent";
            } catch {
                return "agent";
            }
        }, ["agent", "toolLimitFinalize", "contextSummarize"]);
    // From finalize -> precheck (summarize if needed) -> agent
    graph.addConditionalEdges("toolLimitFinalize", (state: SmartState) => {
        const maxTok = opts.limits?.maxToken;
        if (!maxTok) return "agent";
        try {
            const allText = (state.messages || [])
                .map((m: any) => typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => (typeof c === 'string' ? c : c?.text ?? c?.content ?? '')).join('') : '')
                .join("\n");
            const tokenCount = countApproxTokens(allText);
            return tokenCount > maxTok ? "contextSummarize" : "agent";
        } catch {
            return "agent";
        }
    }, ["agent", "contextSummarize"]);
    // After summarization, go to agent
    graph.addEdge("contextSummarize", "agent");

    const app = graph.compile();

    return {
        invoke: async (input: SmartState, config?: InvokeConfig): Promise<AgentInvokeResult> => {
            // Initialize debug session per invoke and stash on ctx
            const debugSession = createDebugSession(opts);
            const onEvent = config?.onEvent || opts.onEvent;
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
            };
            // keep stateRef pointers up to date for context tools
            stateRef.toolHistory = initial.toolHistory;
            stateRef.toolHistoryArchived = initial.toolHistoryArchived;
            const res = await app.invoke(initial, { ...config, recursionLimit: (input.toolCallCount ? input.toolCallCount * 2 : 50) });

            const finalMsg = res.messages[res.messages.length - 1];

            let content = "";
            if (typeof finalMsg?.content === "string") content = finalMsg.content;
            else if (Array.isArray(finalMsg?.content)) {
                content = finalMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? c?.content ?? "")).join("");
            }

            // Default usage converter attempts OpenAI-style usage on message or model
            const defaultUsageConverter = (message: any, _state: any, model: any) => {
                // Try LangChain OpenAI: message.usage or model.getNumTokens? Not guaranteed; keep flexible.
                const usage = message?.usage || message?.response_metadata?.token_usage || message?.response_metadata?.usage;
                if (usage) return usage;
                // Some models expose last usage via model?.lastUsage
                return model?.lastUsage || undefined;
            };
            const usage = (opts.usageConverter || defaultUsageConverter)(finalMsg, res as any, opts.model);

            // Emit metadata + final answer events
            emit({ type: "metadata", usage, modelName: getModelName((opts as any).model), limits: opts.limits });

            let contentEvent = "";
            if (typeof finalMsg?.content === "string") contentEvent = finalMsg.content;
            else if (Array.isArray(finalMsg?.content)) {
                contentEvent = finalMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? c?.content ?? "")).join("");
            }
            emit({ type: "finalAnswer", content: contentEvent });

            // Per-call logs are emitted from the agent node; avoid duplicating here.

            return {
                content,
                metadata: { usage },
                messages: res.messages,
            };
        },
    };
}

// (Types are exported from src/index.ts via ./types.js)
