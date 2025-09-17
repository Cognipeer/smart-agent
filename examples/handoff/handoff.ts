import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createSmartAgent } from "@cognipeer/smart-agent";

async function main() {
  // Base model (replace with env OPENAI_API_KEY configured)
  const model = new ChatOpenAI({ modelName: "gpt-4o-mini" });

  const financeAgent = createSmartAgent({
    name: "Finance",
    model,
    tools: [],
    systemPrompt: "You are an expert financial analyst."
  });

  const codingAgent = createSmartAgent({
    name: "Coder",
    model,
    tools: [],
    systemPrompt: "Produce concise and clean code."
  });

  // Root agent can hand off to codingAgent when code implementation is required.
  const rootAgent = createSmartAgent({
    name: "Root",
    model,
    tools: [],
    handoffs: [ codingAgent.asHandoff({ toolName: "delegate_code", description: "Delegate if code implementation is needed" }) ]
  });

  const events: any[] = [];
  const res = await rootAgent.invoke({ messages: [ new HumanMessage("Calculate a ROI and then write a small TypeScript function for it.") ] }, {
    onEvent: (e) => { events.push(e); }
  });

  console.log("Final content:\n", res.content);
  console.log("Handoff events: ", events.filter(e => e.type === 'handoff'));
}

main().catch(e => console.error(e));
