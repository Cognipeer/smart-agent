import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { ToolInterface } from "@langchain/core/tools";
import type { ZodSchema } from "zod";

export type Message = BaseMessage;

export type SmartAgentLimits = {
  maxToolCalls?: number;
  toolOutputTokenLimit?: number;
  contextTokenLimit?: number;
  summaryTokenLimit?: number;
  // Back-compat snake_case alias; if provided, used as summary token limit
  summary_token_limit?: number;
  // If provided, before the next agent call we will estimate the token length
  // of the upcoming AI input with tiktoken and, if it exceeds this limit,
  // we will trigger a summarization pass over prior tool calls/responses.
  maxToken?: number;
  // Maximum number of tools to execute in parallel per turn
  maxParallelTools?: number;
};

export type SmartAgentOptions = {
  model: any; // a LangChain LLM or ChatModel with .bindTools
  // Accept any LangChain tool implementation, including MCP dynamic tools with non-string schemas
  tools?: Array<ToolInterface<any, any, any>>;
  limits?: SmartAgentLimits;
  // System prompt configuration
  systemPrompt?: string; // Plain string system prompt to append to defaults
  // Enable internal planning workflow (todo list tool + prompt hints)
  useTodoList?: boolean;
  // Optional: normalize provider-specific usage into a common shape
  usageConverter?: (finalMessage: AIMessage, fullState: SmartState, model: any) => any;
  // Debug logging options
  debug?: {
    enabled: boolean;
    path?: string; // base directory for logs; defaults to <project_root>/logs
    callback?: (entry: { sessionId: string; stepIndex: number; fileName: string; markdown: string }) => void;
  };
  // Event hook for runtime insights (can be overridden per invoke)
  onEvent?: (event: SmartAgentEvent) => void;
  // Optional Zod schema for structured output; when provided, invoke() will attempt to parse
  // the final assistant content as JSON and validate it. Parsed value is returned as result.output
  // with full TypeScript inference.
  outputSchema?: ZodSchema<any>;
};

export type SmartState = {
  messages: Message[];
  summaries?: string[];
  toolHistory?: Array<{
    executionId: string;
    toolName: string;
    args: any;
    output: any;
    rawOutput?: any;
    timestamp?: string;
    summarized?: boolean;
    originalTokenCount?: number | null;
    messageId?: string;
    tool_call_id?: string;
    fromCache?: boolean;
  }>;
  toolHistoryArchived?: Array<{
    executionId: string;
    toolName: string;
    args: any;
    output: any;
    rawOutput?: any;
    timestamp?: string;
    summarized?: boolean;
    originalTokenCount?: number | null;
    messageId?: string;
    tool_call_id?: string;
    fromCache?: boolean;
  }>;
  toolCache?: Record<string, any>;
  toolCallCount?: number;
  plan?: { version: number; steps: Array<{ index: number; title: string; status: string }>; lastUpdated?: string } | null;
  planVersion?: number;
  metadata?: Record<string, any>;
  ctx?: Record<string, any>;
};

// Event types for observability and future streaming support
export type ToolCallEvent = {
  type: "tool_call";
  phase: "start" | "success" | "error" | "skipped";
  name: string;
  id?: string;
  args?: any;
  result?: any;
  error?: { message: string } | undefined;
  durationMs?: number;
};

export type PlanEvent = {
  type: "plan";
  source: "manage_todo_list" | "system";
  operation?: "write" | "read";
  todoList?: Array<{ id: number; title: string; description: string; status: string; evidence?: string }>;
  version?: number;
};

export type SummarizationEvent = {
  type: "summarization";
  summary: string;
  archivedCount?: number;
};

export type FinalAnswerEvent = {
  type: "finalAnswer";
  content: string;
};

export type MetadataEvent = {
  type: "metadata";
  usage?: any;
  modelName?: string;
  limits?: SmartAgentLimits;
  [key: string]: any;
};

export type SmartAgentEvent = ToolCallEvent | PlanEvent | SummarizationEvent | FinalAnswerEvent | MetadataEvent;

export type InvokeConfig = RunnableConfig & {
  // Optional per-call event hook (overrides SmartAgentOptions.onEvent if provided)
  onEvent?: (event: SmartAgentEvent) => void;
};

// Structured agent result returned by invoke
export type AgentInvokeResult<TOutput = unknown> = {
  content: string;
  // If SmartAgentOptions.outputSchema is set, this will contain the parsed and validated output.
  // TOutput will be inferred from the provided Zod schema.
  output?: TOutput;
  metadata: { usage?: any };
  messages: Message[];
  state?: SmartState;
};
