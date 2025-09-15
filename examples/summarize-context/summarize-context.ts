import { ChatOpenAI } from "@langchain/openai";
import { createSmartAgent, createSmartTool, createContextTools } from "@cognipeer/smart-agent";
import { AIMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

let turn = 0;
const fakeModel = {
  bindTools() { return this; },
  async invoke(messages: any[]) {
    turn++;
    if (turn === 1) {
      return new AIMessage({ content: "", tool_calls: [{ id: "call_1", name: "heavy_tool", args: { id: 42 } }] });
    }
    return new AIMessage({ content: "final answer after possible summary" });
  },
};

const apiKey = process.env.OPENAI_API_KEY || "";
const model = apiKey ? new ChatOpenAI({ model: "gpt-4o-mini", apiKey }) : (fakeModel as any);

const heavyTool = createSmartTool({
  name: "heavy_tool",
  description: "Returns heavy content",
  schema: z.object({ id: z.number().min(1) }),
  func: async ({ id }) => ({ data: "X".repeat(50000), id }),
});

const stateRef = { toolHistory: [], toolHistoryArchived: [] } as any;
const contextTools = createContextTools(stateRef);

const agent = createSmartAgent({
  model,
  tools: [heavyTool, ...contextTools],
  limits: { maxToolCalls: 3, contextTokenLimit: 2000, summaryTokenLimit: 500 },
});

const res = await agent.invoke({ messages: [new HumanMessage("please run heavy_tool then answer")] });
console.log("Final messages:", res.messages.map(m => ({ type: (m as any).type, len: String((m as any).content).length, name: (m as any).name })).slice(0, 6));

const summarizedTool = (res.messages as any[]).find((m) => (m as any).type === 'tool' && (m as any).summarized);
if (summarizedTool && (summarizedTool as any).executionId) {
  const getTool = contextTools.find((t: any) => t.name === 'get_tool_response');
  const raw = await (getTool as any).func({ executionId: (summarizedTool as any).executionId });
  console.log("Recovered raw tool output length:", JSON.stringify(raw).length);
}
