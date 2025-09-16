# Structured Output Example

This example shows how to use `outputSchema` with `createSmartAgent` to get typed, Zod-validated results from the agent.

## What it does
- Defines a Zod schema for the expected final answer
- Instructs the model to return only JSON
- Parses and validates the final content into `res.output`

## Run

If you have an OpenAI API key, export it; otherwise the example uses a tiny fake model.

```bash
export OPENAI_API_KEY=sk-... # optional
node --loader tsx ./examples/structured-output/structured-output.ts
```

## Expected output

When parsing succeeds, you'll see typed fields printed:

```
Title: Structured Output
Bullets: [ 'a', 'b', 'c' ]
```

If the model doesn't return valid JSON, you'll get the raw string in `res.content`.
