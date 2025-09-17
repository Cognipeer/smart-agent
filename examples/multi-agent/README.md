# Multi-agent example

Shows delegating work to a secondary agent via `agent.asTool()`.

Notes:
- Uses adapter-wrapped model (`fromLangchainModel`) when OPENAI_API_KEY present, otherwise fake model.
- Messages are plain `{ role, content }` objects.

Run:
```sh
OPENAI_API_KEY=... npx tsx multi-agent.ts
```
