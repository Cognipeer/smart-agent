import type { ToolInterface } from "@langchain/core/tools";
import type { Message, SmartAgentOptions, SmartState } from "../types.js";
import { normalizeUsage } from "../utils/usage.js";
import { getModelName } from "../utils/debugLogger.js";

// Minimal agent node: no system prompt injection. Invokes model with messages as-is.
export function createAgentCoreNode(opts: SmartAgentOptions) {
  return async (state: SmartState): Promise<Partial<SmartState>> => {
    const runtime = state.agent || {
      name: opts.name,
      model: opts.model,
      tools: (opts.tools as any) || [],
      systemPrompt: undefined,
      limits: opts.limits,
      useTodoList: undefined,
      outputSchema: (opts as any).outputSchema,
    };

    const tools: Array<ToolInterface<any, any, any>> = (runtime.tools as any) ?? [];
    const modelWithTools = (runtime.model)?.bindTools
      ? (runtime.model).bindTools(tools)
      : runtime.model;

    const response = await modelWithTools.invoke([...state.messages]);
    const messagesWithResponse: Message[] = [
      ...state.messages,
      response as any,
    ];

    // Usage tracking (per-request, aggregated by model)
    const rawUsage = (response as any)?.usage || (response as any)?.response_metadata?.token_usage || (response as any)?.response_metadata?.usage;
    const normalized = normalizeUsage(rawUsage);
    const modelName = getModelName((runtime as any).model || (opts as any).model) || "unknown_model";
    if (normalized) {
      const usageState = state.usage || { perRequest: [], totals: {} };
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const turn = usageState.perRequest.length + 1;
      const timestamp = new Date().toISOString();
      const cachedInputTok = normalized.prompt_tokens_details?.cached_tokens;
      usageState.perRequest.push({ id, modelName, usage: normalized, timestamp, turn, cachedInput: cachedInputTok });
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
      (state as any).usage = usageState;
    }

    return { messages: messagesWithResponse, usage: (state as any).usage };
  };
}
