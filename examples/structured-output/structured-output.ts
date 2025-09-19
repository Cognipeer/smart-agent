import { createAgent, fromLangchainModel } from "@cognipeer/smart-agent";
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
            return { role: 'assistant', content: JSON.stringify({ title: "Structured Output", bullets: ["a", "b", "c"] }) };
        }
        return { role: 'assistant', content: "{}" };
    },
};

const apiKey = process.env.OPENAI_API_KEY || "";
const model = apiKey ? fromLangchainModel(new ChatOpenAI({ model: "gpt-4o-mini", apiKey })) : (fakeModel as any);

async function main() {
    const agent = createAgent({
        model,
        outputSchema: ResultSchema,
    });

    const res = await agent.invoke({ messages: [{ role: 'user', content: "Generate 3 bullet points with a title about AI" }] });

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
