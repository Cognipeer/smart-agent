import { createSmartAgent } from "@cognipeer/smart-agent";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// Define the shape you want back from the agent
const ResultSchema = z.object({
    title: z.string(),
    bullets: z.array(z.string()).min(1),
});

// A tiny fake model fallback for offline testing
let turn = 0;
const fakeModel = {
    bindTools() { return this; },
    async invoke(messages: any[]) {
        turn++;
        if (turn === 1) {
            // Return a valid JSON as final message content
            return new AIMessage({
                content: JSON.stringify({ title: "Structured Output", bullets: ["a", "b", "c"] })
            });
        }
        return new AIMessage({ content: "{}" });
    },
};

const apiKey = process.env.OPENAI_API_KEY || "";
const model = apiKey ? new ChatOpenAI({ model: "gpt-4o-mini", apiKey }) : (fakeModel as any);

async function main() {
    const agent = createSmartAgent({
        model,
        outputSchema: ResultSchema,
    systemPrompt: "Return only JSON for the final answer.",
    });

    const res = await agent.invoke({ messages: [new HumanMessage("Generate 3 bullet points with a title")] });

    if (res.output) {
        // Fully typed output
        console.log("Title:", res.output.title);
        console.log("Bullets:", res.output.bullets);
    } else {
        // Fallback to raw content when parsing fails
        console.log("Raw content:", res.content);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
