import { END } from "@langchain/langgraph";
import type { SmartAgentOptions, SmartState } from "../types.js";

export function createShouldContinueNode(opts: SmartAgentOptions) {
  const max = (opts.limits?.maxToolCalls ?? 10) as number; // profile strings not supported here
  return (state: SmartState): string | typeof END => {
  const { messages, toolCallCount = 0 } = state;
  if (state.ctx?.__finalizedDueToToolLimit) return END;
    const last = messages[messages.length - 1] as any;
  if (toolCallCount >= max) return "toolLimitFinalize" as any;
    if (Array.isArray(last?.tool_calls) && last.tool_calls.length > 0) {
      return "tools";
    }
    return END;
  };
}
