import type { ToolInterface } from "@langchain/core/tools";
import type { Message, SmartAgentOptions, SmartState } from "../types.js";
import { buildSystemPrompt } from "../prompts.js";
import { writeStepMarkdown, formatMarkdown, bumpStep, getModelName, serializeAgentTools } from "../utils/debugLogger.js";
import { normalizeUsage } from "../utils/usage.js";

export function createAgentNode(opts: SmartAgentOptions) {
  return async (state: SmartState): Promise<Partial<SmartState>> => {
    // Prefer dynamic runtime config from state.agent, fallback to initial opts
    const runtime = state.agent || {
      name: opts.name,
      model: opts.model,
      tools: (opts.tools as any) || [],
      systemPrompt: opts.systemPrompt,
      limits: opts.limits,
      useTodoList: opts.useTodoList,
      outputSchema: (opts as any).outputSchema,
    };
    const tools: Array<ToolInterface<any, any, any>> = (runtime.tools as any) ?? [];
    const limits = {
      maxToolCalls: runtime.limits?.maxToolCalls ?? 10,
      toolOutputTokenLimit: runtime.limits?.toolOutputTokenLimit ?? 5000,
      contextTokenLimit: runtime.limits?.contextTokenLimit ?? 60000,
      summaryTokenLimit: runtime.limits?.summaryTokenLimit ?? 50000,
    };
    const modelWithTools = (runtime.model)?.bindTools
      ? (runtime.model).bindTools(tools)
      : runtime.model;
    // 3) Prepend a single, fresh system prompt for this turn only
    const structuredOutputHint = runtime.outputSchema
      ? [
          "When you provide the FINAL assistant message, output ONLY a valid JSON value matching the required output schema.",
          "Do not wrap it in code fences. Do not add any prose before or after. Return pure JSON only.",
        ].join("\n")
      : "";

    const systemMsg = {
      role: 'system',
      content: buildSystemPrompt(
        [runtime.systemPrompt, structuredOutputHint].filter(Boolean).join("\n"),
        runtime.useTodoList === true,
        runtime.name || "Agent"
      )
    } as any;
    const messages = [systemMsg, ...state.messages];

    // Debug logging before/after model call
    const debugSession = (state.ctx)?.__debugSession;

  const response = await modelWithTools.invoke([systemMsg, ...state.messages]);
    // For logs, include the system prompt we just used, but do not persist it in state
    const messagesWithResponse: Message[] = [
      ...messages
      ,
      response as any
    ];

    const messagesWithSystem = [
      systemMsg,
      ...messagesWithResponse
    ]

    // ---- Usage tracking (per-request) ----
  const rawUsage = (response as any)?.usage || (response as any)?.response_metadata?.token_usage || (response as any)?.response_metadata?.usage;
  const normalized = normalizeUsage(rawUsage);
  const modelName = getModelName((runtime as any).model || (opts as any).model) || "unknown_model";
    if (normalized) {
      const usageState = state.usage || { perRequest: [], totals: {} };
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const turn = usageState.perRequest.length + 1;
      const timestamp = new Date().toISOString();
      const cachedInputTok = normalized.prompt_tokens_details.cached_tokens;
      usageState.perRequest.push({ id, modelName, usage: normalized, timestamp, turn, cachedInput: cachedInputTok });
      // Normalize token counts to aggregate totals
      const inputTok = normalized.prompt_tokens;
      const outputTok = normalized.completion_tokens;
      const totalTok = normalized.total_tokens;
  const key = modelName as string;
      const agg = usageState.totals[key] || { input: 0, output: 0, total: 0, cachedInput: 0 };
      usageState.totals[key] = {
        input: agg.input + (Number(inputTok) || 0),
        output: agg.output + (Number(outputTok) || 0),
        total: agg.total + (Number(totalTok) || 0),
        cachedInput: agg.cachedInput + (Number(cachedInputTok) || 0),
      };
      // Attach back so next nodes see updated state
      (state as any).usage = usageState;
    }

  if (debugSession) {
      const idx = bumpStep(debugSession);
      const fileName = `${String(idx).padStart(2, "0")}.md`;
      const markdown = formatMarkdown({
  modelName: getModelName((runtime as any).model || (opts as any).model),
        date: new Date().toISOString(),
  limits: runtime.limits,
    // IMPORTANT: log only per-request normalized usage
    usage: normalized,
        tools: serializeAgentTools(tools),
        messages: messagesWithSystem
      });
      await writeStepMarkdown(debugSession, fileName, markdown, {
        messages: messagesWithSystem,
    usage: normalized,
  modelName: getModelName((runtime as any).model || (opts as any).model),
  limits: runtime.limits,
        tools: serializeAgentTools(tools),
      });
    }

    return { messages: messagesWithResponse, usage: (state as any).usage };
  };
}
