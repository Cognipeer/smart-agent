import { SystemMessage } from "@langchain/core/messages";
import type { ToolInterface } from "@langchain/core/tools";
import type { Message, SmartAgentOptions, SmartState } from "../types.js";
import { buildSystemPrompt } from "../prompts.js";
import { writeStepMarkdown, formatMarkdown, bumpStep, getModelName, serializeAgentTools } from "../utils/debugLogger.js";

export function createAgentNode(opts: SmartAgentOptions) {
  const tools: Array<ToolInterface<any, any, any>> = (opts.tools as any) ?? [];
  const limits = {
    maxToolCalls: opts.limits?.maxToolCalls ?? 10,
    toolOutputTokenLimit: opts.limits?.toolOutputTokenLimit ?? 5000,
    contextTokenLimit: opts.limits?.contextTokenLimit ?? 60000,
    summaryTokenLimit: opts.limits?.summaryTokenLimit ?? 50000,
  };

  // bind tools to model for tool calling
  const modelWithTools = (opts.model)?.bindTools
    ? (opts.model).bindTools(tools)
    : opts.model;

  return async (state: SmartState): Promise<Partial<SmartState>> => {



    // 3) Prepend a single, fresh system prompt for this turn only
    const structuredOutputHint = opts.outputSchema
      ? [
          "When you provide the FINAL assistant message, output ONLY a valid JSON value matching the required output schema.",
          "Do not wrap it in code fences. Do not add any prose before or after. Return pure JSON only.",
        ].join("\n")
      : "";

    const systemMsg = new SystemMessage(
      buildSystemPrompt(
        [opts.systemPrompt, structuredOutputHint].filter(Boolean).join("\n"),
        opts.useTodoList === true,
      )
    );
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

    if (debugSession) {
      const idx = bumpStep(debugSession);
      const fileName = `${String(idx).padStart(2, "0")}.md`;
      const markdown = formatMarkdown({
        modelName: getModelName((opts as any).model),
        date: new Date().toISOString(),
        limits: opts.limits,
        usage: (response as any)?.usage || (response as any)?.response_metadata?.token_usage || (response as any)?.response_metadata?.usage,
        tools: serializeAgentTools(tools),
        messages: messagesWithSystem
      });
      await writeStepMarkdown(debugSession, fileName, markdown, {
        messages: messagesWithSystem,
        usage: (response as any)?.usage || (response as any)?.response_metadata?.token_usage || (response as any)?.response_metadata?.usage,
        modelName: getModelName((opts as any).model),
        limits: opts.limits,
        tools: serializeAgentTools(tools),
      });
    }

    return { messages: messagesWithResponse };
  };
}
