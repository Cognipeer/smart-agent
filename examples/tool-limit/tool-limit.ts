import { createSmartAgent, createSmartTool } from "@cognipeer/smart-agent";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

const echo = createSmartTool({
  name: "echo",
  description: "Echo back",
  schema: z.object({ text: z.string().min(1) }),
  func: async ({ text }) => ({ echoed: text }),
});

let turn = 0;
const fakeModel = {
  bindTools() { return this; },
  async invoke(messages: any[]) {
    turn++;
    const hasFinalize = messages.some((m: any) => m instanceof SystemMessage && typeof m.content === 'string' && m.content.includes('Tool-call limit reached'));
    if (hasFinalize) {
      return new AIMessage({ content: "Final answer without further tools." });
    }
    if (turn === 1) {
      return new AIMessage({
        content: "",
        tool_calls: [
          { id: "c1", name: "echo", args: { text: "a" } },
          { id: "c2", name: "echo", args: { text: "b" } },
          { id: "c3", name: "echo", args: { text: "c" } },
        ],
      });
    }
    return new AIMessage({ content: "No finalize signal found." });
  },
};

const agent = createSmartAgent({
  model: fakeModel as any,
  tools: [echo],
  limits: { maxToolCalls: 2, maxParallelTools: 2 },
});

const res = await agent.invoke({ messages: [new HumanMessage("run tools until limit then finalize")] });
console.log("Final content:", res.content);
