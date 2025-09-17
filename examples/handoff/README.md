# Handoff Example

This example shows a control handoff between two smart agents (Root -> Coder).

## Scenario
The user asks for a financial calculation and then a small TypeScript function. The Root agent handles the finance part; when it detects coding is required it calls the `delegate_code` tool to hand off control to the Coder agent. The same state is preserved; only the active agent runtime switches.

## Highlights
- Provide other agent handoffs via the `handoffs` array when constructing the root agent.
- When a handoff occurs the tools node emits a `handoff` event: `{ type: 'handoff', from, to, toolName }`.
- The handoff tool returns `ok`, and from the next turn onward the new agent proceeds.

## Run
First build the package:

```bash
npm run build
node examples/handoff/handoff.ts
```

Ensure the `OPENAI_API_KEY` environment variable is set.

## Output
- Final answer printed to console
- List of emitted handoff events (at least one)

## Notes
You can supply a custom argument schema using e.g. `codingAgent.asHandoff({ schema: z.object({ reason: z.string(), extra: z.string().optional() }) })`. If omitted, the default `{ reason: string }` schema is used.
