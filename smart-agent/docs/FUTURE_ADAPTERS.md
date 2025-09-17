# Future Adapters (Roadmap)

The core model interface is a simple object with:

```ts
type BaseChatModel = {
  invoke(messages: Array<{ role: string; content: any; [k: string]: any }>): Promise<{ role: string; content: any; [k: string]: any }>;
  bindTools?(tools: any[]): BaseChatModel;
  modelName?: string;
};
```

Adapters can wrap provider SDKs to conform to this shape.

## Candidates

1. OpenAI (official SDK) ✅ Implemented (`fromOpenAIClient`)
   - Supports chat.completions + function calls -> tool_calls mapping.
2. Anthropic (Messages API)
   - Convert tool invocation format (if/when supported) to `tool_calls` list.
3. Google Gemini
4. Mistral AI
5. Ollama (local)
6. Azure OpenAI (same pattern as OpenAI with endpoint override)
7. Bedrock (multi-provider routing)

## Design Notes

- Keep adapters zero-dependency outside optional peer install.
- Favor duck typing over importing provider types.
- Expose helper factory `fromXModel(sdkModel)` per provider.

## Contribution Hints

1. Create `src/adapters/{provider}.ts` implementing `fromProviderModel`.
2. Avoid adding provider packages to dependencies; document install in README.
3. Add unit test (mocking network) that checks minimal invoke behavior.

---
PRs welcome.
