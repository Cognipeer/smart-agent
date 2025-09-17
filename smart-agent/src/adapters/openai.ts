// OpenAI SDK adapter
// Usage:
//   import OpenAI from 'openai';
//   const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
//   const model = fromOpenAIClient(client, { model: 'gpt-4o-mini' });
//   const agent = createSmartAgent({ model, tools: [...] });
//
// Supports function/tool calls by translating smart-agent tool definitions to OpenAI functions schema.
// Requires: openai >= 4.x (official SDK)

import type OpenAI from 'openai';
import type { SmartState } from '../types.js';
import type { BaseChatModel, BaseChatMessage } from '../model.js';

export interface OpenAIAdapterOptions {
  model: string;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  response_format?: any; // e.g. { type: 'json_schema', json_schema: {...} }
}

// Minimal tool/function schema extractor (expects tools with .name, .description, .schema (zod or json schema-ish))
function toOpenAIFunction(tool: any) {
  const schema = tool?.schema || tool?.parameters || {};
  // Attempt to convert zod via ._def if user passed directly (best-effort: leave as-is if not a plain object)
  const parameters = typeof schema === 'object' ? schema : {};
  return {
    name: tool.name,
    description: tool.description || '',
    parameters,
  };
}

function normalizeContent(msg: BaseChatMessage) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map(p => typeof p === 'string' ? p : (p?.text ?? p?.content ?? '')).join('');
  }
  return String(msg.content ?? '');
}

export function fromOpenAIClient(client: OpenAI, defaultOpts: OpenAIAdapterOptions): BaseChatModel {
  let boundTools: any[] = [];

  const adapter: BaseChatModel = {
    async invoke(messages: BaseChatMessage[]): Promise<BaseChatMessage> {
      // Convert messages to OpenAI format
      const oaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(m => {
        if (m.role === 'tool') {
          // Tool response -> OpenAI format uses role=tool + tool_call_id
          return { role: 'tool', content: normalizeContent(m), tool_call_id: (m as any).tool_call_id } as any;
        }
        if (m.role === 'assistant') {
          // Carry forward tool_calls if present
            return {
              role: 'assistant',
              content: normalizeContent(m),
              tool_calls: (m as any).tool_calls,
            } as any;
        }
        if (m.role === 'system' || m.role === 'user') {
          return { role: m.role as any, content: normalizeContent(m) };
        }
        return { role: 'user', content: normalizeContent(m) };
      });

      // Map bound tools to functions array (legacy style) or tools (new unified) depending on compatibility
      const functions = boundTools.length
        ? boundTools.map(toOpenAIFunction)
        : undefined;

      const completion = await client.chat.completions.create({
        model: defaultOpts.model,
        temperature: defaultOpts.temperature,
        top_p: defaultOpts.top_p,
        max_output_tokens: (defaultOpts as any).max_tokens || defaultOpts.max_output_tokens,
        messages: oaiMessages,
        functions,
        function_call: 'auto',
        response_format: (defaultOpts as any).response_format,
      } as any);

      const choice = completion.choices?.[0];
      const msg = choice?.message || { role: 'assistant', content: '' };

      // Adapt function calls to tool_calls shape (OpenAI new vs old bridging)
      let tool_calls: any[] | undefined = undefined;
      if (Array.isArray((msg as any).tool_calls)) {
        tool_calls = (msg as any).tool_calls.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: tc.function,
        }));
      } else if ((msg as any).function_call) {
        // Legacy single function_call
        const fc = (msg as any).function_call;
        tool_calls = [{ id: 'call_' + Math.random().toString(36).slice(2,8), type: 'function', function: fc }];
      }

      return {
        role: 'assistant',
        content: msg.content || '',
        tool_calls,
        usage: completion.usage,
        response_metadata: completion,
      };
    },
    bindTools(tools: any[]) {
      boundTools = tools || [];
      return adapter;
    },
    modelName: defaultOpts.model,
  };

  return adapter;
}
