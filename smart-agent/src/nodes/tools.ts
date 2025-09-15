import { Tool, type ToolInterface } from "@langchain/core/tools";
import type { SmartAgentEvent, SmartAgentOptions, SmartState } from "../types.js";
import { nanoid } from "nanoid";
import { ToolMessage } from "@langchain/core/messages";

export function createToolsNode(tools: Array<ToolInterface<any, any, any>>, opts?: SmartAgentOptions) {
  const toolByName = new Map<string, ToolInterface>();
  for (const t of tools) toolByName.set((t as any).name, t);

  return async (state: SmartState): Promise<any> => {
    const limits = {
      maxToolCalls: (opts?.limits?.maxToolCalls ?? 10) as number,
      maxParallelTools: Math.max(1, (opts?.limits?.maxParallelTools ?? 1) as number),
    };
    const appended: ToolMessage[] = [];
    const onEvent = (state.ctx as any)?.__onEvent as ((e: SmartAgentEvent) => void) | undefined;
    // Sync latest state into context tools if they carry a stateRef
    for (const t of toolByName.values()) {
      const anyT: any = t as any;
      if (anyT._stateRef && typeof anyT._stateRef === "object") {
        anyT._stateRef.toolHistory = state.toolHistory;
        anyT._stateRef.toolHistoryArchived = state.toolHistoryArchived;
        anyT._stateRef.__onEvent = onEvent;
      }
    }
    const last = state.messages[state.messages.length - 1] as any;
    let toolCount = state.toolCallCount || 0;
    const toolCalls: Array<{ id?: string; name: string; args: any }> = Array.isArray(
      last?.tool_calls
    )
      ? last.tool_calls
      : [];

    
    const toolHistory = state.toolHistory || [];
    // Enforce global maxToolCalls across turns
    const remaining = Math.max(0, limits.maxToolCalls - toolCount);
    const planned = toolCalls.slice(0, remaining);
    const skipped = toolCalls.slice(remaining);

    // Emit immediate messages for any skipped due to limit
    for (const tc of skipped) {
      onEvent?.({ type: "tool_call", phase: "skipped", name: tc.name, id: tc.id, args: tc.args });
      appended.push(new ToolMessage({
        content: `Skipped tool due to tool-call limit: ${tc.name}`,
        tool_call_id: tc.id || `${tc.name}_${appended.length}`,
        name: tc.name,
      }));
    }

    // Helper to run a single tool call
    const runOne = async (tc: { id?: string; name: string; args: any }) => {
      const t = toolByName.get(tc.name);
      if (!t) {
        onEvent?.({ type: "tool_call", phase: "error", name: tc.name, id: tc.id, args: tc.args, error: { message: "Tool not found" } });
        appended.push(
          new ToolMessage({
            content: `Tool not found: ${tc.name}`,
            tool_call_id: tc.id || `${tc.name}_${appended.length}`,
            name: tc.name,
          })
        );
        toolCount += 1;
        return;
      }
      let args: any = tc.args;
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch (_) { /* keep as string */ }
      }
      try {
        const start = Date.now();
        onEvent?.({ type: "tool_call", phase: "start", name: (t as any).name, id: tc.id, args });
        let output: any;
        const anyTool = t as any;
        if (typeof anyTool.func === "function") output = await anyTool.func(args);
        else if (typeof anyTool.invoke === "function") output = await anyTool.invoke(args);
        else if (typeof anyTool.call === "function") output = await anyTool.call(args);
        else if (typeof anyTool._call === "function") output = await anyTool._call(args);
        else if (typeof anyTool.run === "function") output = await anyTool.run(args);
        else throw new Error("Tool is not invokable");
        const content = typeof output === "string" ? output : JSON.stringify(output);
        const executionId = nanoid();
        toolHistory.push({ executionId, toolName: (t as any).name, args, output, rawOutput: output, timestamp: new Date().toISOString(), tool_call_id: tc.id });
        appended.push(new ToolMessage({ content, tool_call_id: tc.id || `${tc.name}_${appended.length}`, name: tc.name }));
        onEvent?.({ type: "tool_call", phase: "success", name: (t as any).name, id: tc.id, args, result: output, durationMs: Date.now() - start });
        toolCount += 1;
      } catch (e: any) {
        const executionId = nanoid();
        toolHistory.push({ executionId, toolName: (t as any).name, args, output: `Error executing tool: ${e?.message || String(e)}`, rawOutput: null, timestamp: new Date().toISOString(), tool_call_id: tc.id });
        appended.push(new ToolMessage({ content: `Error executing tool: ${e?.message || String(e)}`, tool_call_id: tc.id || `${tc.name}_${appended.length}`, name: tc.name }));
        onEvent?.({ type: "tool_call", phase: "error", name: (t as any).name, id: tc.id, args, error: { message: e?.message || String(e) } });
        toolCount += 1;
      }
    };

    // Run with limited parallelism
    const concurrency = Math.max(1, limits.maxParallelTools);
    for (let i = 0; i < planned.length; i += concurrency) {
      const batch = planned.slice(i, i + concurrency);
      await Promise.all(batch.map(runOne));
    }

    return { messages: [...state.messages, ...appended], toolCallCount: toolCount, toolHistory };
  };
}
