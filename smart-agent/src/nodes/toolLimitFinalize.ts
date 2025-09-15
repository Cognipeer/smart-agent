import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { SmartAgentOptions, SmartState } from "../types.js";

// This node is reached when tool-call limit is hit. It appends a short instruction
// telling the agent to produce an answer with the current information and avoid further tools.
export function createToolLimitFinalizeNode(_opts: SmartAgentOptions) {
  return async (state: SmartState): Promise<Partial<SmartState>> => {
    const notice = new SystemMessage(
      "Tool-call limit reached. Produce the best possible final answer using the available context and prior tool outputs. Do not call any more tools."
    );
  const ctx = { ...(state.ctx || {}), __finalizedDueToToolLimit: true };
  return { messages: [...state.messages, notice], ctx };
  };
}
