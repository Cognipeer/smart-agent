# Basic example

- Shows passing a model and a simple tool.
- Works with ESM or CJS.
- Demonstrates plain `{ role, content }` messages (no direct LangChain message classes).
- If you have `OPENAI_API_KEY`, the example uses a real model via `fromLangchainModel`; otherwise a fake model simulates tool calling.

Run (ESM):

```sh
node basic.mjs
```

Run (TS via tsx):

```sh
npx tsx basic.ts
```
