import { createSmartAgent, createSmartTool } from "@cognipeer/smart-agent";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// Preflight env checks to provide clearer errors during local runs
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const TAVILY_API_KEY = "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";
if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY. Set it before running: export OPENAI_API_KEY=sk-...\n(Optional) Set TAVILY_API_KEY if you plan to use tavily_search.");
    process.exit(1);
}
if (!TAVILY_API_KEY) {
    console.warn("[warn] TAVILY_API_KEY not set. The tavily_search tool will fail if the agent tries to use it.");
}

const echo = createSmartTool({
    name: "echo",
    description: "Echo back",
    schema: z.object({ text: z.string().min(1) }),
    func: async ({ text }) => ({ echoed: text }),
});

const tavilySearch = createSmartTool({
    name: "tavily_search",
    description: "Perform a web search via Tavily API and return top results.",
    schema: z.object({
        query: z.string().min(3),
        maxResults: z.number().int().min(1).max(10).nullable(),
        includeRaw: z.boolean().nullable(),
    }),
    func: async (input: unknown) => {
        const { query, maxResults, includeRaw } = input as {
            query: string; maxResults: number | null; includeRaw: boolean | null;
        };
        const effMax = typeof maxResults === "number" ? maxResults : 5;
        const effRaw = typeof includeRaw === "boolean" ? includeRaw : false;
        if (!TAVILY_API_KEY) throw new Error("TAVILY_API_KEY not set in environment");
        const body: any = { query, max_results: effMax, include_raw_content: effRaw ? 'text' : undefined };
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${TAVILY_API_KEY}` },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text().catch(() => "")}`);
        const data: any = await res.json();
        const items = Array.isArray(data?.results)
            ? data.results.map((r: any) => ({ title: r.title, url: r.url, score: r.score, content: r.content, rawContent: r.raw_content }))
            : [];
        return effRaw ? { items, raw: data } : { items };
    },
});

const apiKey = OPENAI_API_KEY;
const model = new ChatOpenAI({ model: "gpt-4o-mini", apiKey });

const agent = createSmartAgent({
    model,
    tools: [echo, ...(TAVILY_API_KEY ? [tavilySearch] : [])],
    useTodoList: true,
    limits: { maxToolCalls: 10, maxToken: 8000 },
    debug: { enabled: true },
});

const res = await agent.invoke(
    { messages: [new HumanMessage("Search latest news about LangChain MCP and summarize.")] },
    {
        onEvent: (e: any) => {
            if (e.type === "tool_call") console.log(`[tool] ${e.phase} ${e.name}`, e.id || "-");
            if (e.type === "plan") console.log(`[plan]`, e.todoList?.length ?? 0);
            if (e.type === "summarization") console.log(`[sum]`, e.archivedCount ?? 0);
            if (e.type === "metadata") console.log(`[meta]`, e.modelName, e.usage);
        }
    }
);
console.log("RES", res.content);
