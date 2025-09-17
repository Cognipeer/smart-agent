# Tools example

Demonstrates multiple tools including a web search tool. Requires environment variables.

Uses `fromLangchainModel` to adapt a LangChain `ChatOpenAI` model. Messages are plain objects (`{ role, content }`).

Run:

```sh
TAVILY_API_KEY=... OPENAI_API_KEY=... npx tsx tools.ts
```
