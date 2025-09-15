import fs from "node:fs";
import path from "node:path";
import type { Message, SmartAgentOptions, SmartState } from "../types.js";
export type DebugSession = {
  sessionId: string;
  baseDir: string; // base logs dir
  sessionDir: string; // per-invoke folder
  stepIndex: number;
  callback?: (entry: {
    sessionId: string;
    stepIndex: number;
    fileName: string;
    markdown: string;
    messages: Message[];
    usage?: any;
    modelName?: string;
    limits?: any;
    tools?: any[];
  }) => void;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function resolveLogsBaseDir(customPath?: string) {
  // Default: project root logs folder
  const root = process.cwd();
  const base = customPath && customPath.trim().length > 0 ? customPath : path.join(root, "logs");
  ensureDir(base);
  return base;
}

export function createDebugSession(opts: SmartAgentOptions): DebugSession | undefined {
  const dbg = opts.debug;
  if (!dbg?.enabled) return undefined;
  const baseDir = resolveLogsBaseDir(dbg.path);
  const sessionId = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(baseDir, sessionId);
  if (!dbg.callback) ensureDir(sessionDir);
  return { sessionId, baseDir, sessionDir, stepIndex: 0, callback: dbg.callback };
}

export function bumpStep(session: DebugSession): number {
  session.stepIndex += 1;
  return session.stepIndex - 1;
}

type UsageLike = any;

export function getModelName(model: any): string | undefined {
  return (
    model?.model ??
    model?.modelName ??
    model?.options?.model ??
    model?.lc_alias ??
    model?.constructor?.name ??
    undefined
  );
}

export function serializeAgentTools(tools: any[]): any[] {
  return (tools || []).map((t) => {
    const name = (t as any).name ?? (t as any).lc_alias ?? (t as any).constructor?.name ?? "tool";
    const description = (t as any).description ?? (t as any).lc_description ?? undefined;
    const params = (t as any).schema ?? (t as any).lc_kwargs?.schema ?? (t as any).argsSchema ?? undefined;
    return {
      function: {
        name,
        description,
        parameters: params,
      },
      type: "function",
    };
  });
}

function formatTools(tools: any[]): string {
  try {
    return JSON.stringify(
      tools.map((t) => ({
        function: t?.function ? {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        } : undefined,
        type: t?.type,
      })),
      null,
      4
    );
  } catch {
    return "[]";
  }
}

function formatMessages(messages: Message[]): string {
  const lines: string[] = [];
  const push = (s: string = "") => lines.push(s);
  for (const m of messages) {
    if (m.getType() === 'system') {
      push("### System\n");
      push(String(m.content));
      push("");
    } else if (m.getType() === "human") {
      push("### User\n");
      push(typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2));
      push("");
    } else if (m.getType() === "ai") {
      push("### AI\n");
      const anyM: any = m as any;
      const toolCalls = Array.isArray(anyM.tool_calls) ? anyM.tool_calls : [];
      if (toolCalls.length) {
        push("Tool Calls:");
        for (const tc of toolCalls) {
          push("```");
          push(JSON.stringify(tc, null, 2));
          push("```");
        }
      }
      push(typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2));
      push("");
    } else if (m.getType() === "tool") {
      push("### ToolResponse\n");
      const anyT: any = m as any;
      const hdr = { name: anyT.name, tool_call_id: anyT.tool_call_id, executionId: anyT.executionId };
      push("```");
      push(JSON.stringify(hdr, null, 2));
      push("```");
      push(typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2));
      push("");
    }
  }
  return lines.join("\n");
}

export function formatMarkdown(params: {
  modelName: string | undefined;
  date: string;
  limits?: any;
  usage?: UsageLike;
  tools?: any[];
  messages: Message[];
}): string {
  const { modelName, date, limits, usage, tools = [], messages } = params;
  const sections: string[] = [];
  const add = (s: string = "") => sections.push(s);

  add(`# modelName`);
  add(String(modelName ?? "unknown"));
  add("");

  add(`# date`);
  add(date);
  add("");

  add(`# limitler`);
  add("```");
  add(JSON.stringify(limits ?? {}, null, 2));
  add("```");
  add("");

  add(`# usage`);
  if (usage) {
    add("```");
    add(JSON.stringify(usage));
    add("```");
  } else {
    add("(none)");
  }
  add("");

  add(`# tools`);
  add("```");
  add(formatTools(tools));
  add("```");
  add("");

  add(`# Messages`);
  add(formatMessages(messages));

  return sections.join("\n");
}

export async function writeStepMarkdown(session: DebugSession, fileName: string, markdown: string, payload?: { messages: Message[]; usage?: any; modelName?: string; limits?: any; tools?: any[] }) {
  if (session.callback) {
    session.callback({
      sessionId: session.sessionId,
      stepIndex: session.stepIndex,
      fileName,
      markdown,
      messages: payload?.messages ?? [],
      usage: payload?.usage,
      modelName: payload?.modelName,
      limits: payload?.limits,
      tools: payload?.tools,
    });
    return;
  }
  const fp = path.join(session.sessionDir, fileName);
  await fs.promises.writeFile(fp, markdown, "utf8");
}
