import { tool } from "@langchain/core/tools";
import { z } from "zod";
// no message helpers needed here

// Create context tools like get_tool_response, manage_todo_list
export function createContextTools(
  stateRef: { toolHistory?: any[]; toolHistoryArchived?: any[]; todoList?: any[] },
  opts?: { planningEnabled?: boolean }
) {
  const tools = [] as any[];

  if (opts?.planningEnabled) {
    const manageTodo = tool(
      async ({ operation, todoList }) => {
        const onEvent = (manageTodo as any)._stateRef?.__onEvent as undefined | ((e: any) => void);
        if (operation === "read") {
          const list = stateRef.todoList || [];
          onEvent?.({ type: "plan", source: "manage_todo_list", operation: "read", todoList: list });
          return list;
        }
        if (Array.isArray(todoList)) {
          stateRef.todoList = todoList;
        }
        const payload = {
          status: "ok",
          operation,
          count: Array.isArray(todoList) ? todoList.length : undefined,
        } as const;
        onEvent?.({ type: "plan", source: "manage_todo_list", operation: "write", todoList });
        return payload;
      },
      {
        name: "manage_todo_list",
        description:
          "Manage a structured todo list to track progress and plan tasks throughout your coding session. Use this tool VERY frequently to ensure task visibility and proper planning.\n\nWhen to use this tool:\n- Complex multi-step work requiring planning and tracking\n- When user provides multiple tasks or requests (numbered/comma-separated)\n- After receiving new instructions that require multiple steps\n- BEFORE starting work on any todo (mark as in-progress)\n- IMMEDIATELY after completing each todo (mark completed individually)\n- When breaking down larger tasks into smaller actionable steps\n- To give users visibility into your progress and planning\n\nWhen NOT to use:\n- Single, trivial tasks that can be completed in one step\n- Purely conversational/informational requests\n- When just reading files or performing simple searches\n\nCRITICAL workflow:\n1. Plan tasks by writing todo list with specific, actionable items\n2. Complete the work for that specific todo\n3. Mark that todo as completed IMMEDIATELY\n4. Move to next todo and repeat\n\nTodo states:\n- not-started: Todo not yet begun\n- in-progress: Currently working (limit ONE at a time)\n- completed: Finished successfully\n\nIMPORTANT: Mark todos completed as soon as they are done. Do not batch completions.",
        schema: z.object({
          operation: z.enum(["write", "read"]),
          todoList: z.array(z.object({
            id: z.number().int().positive().describe("Sequential id starting from 1"),
            title: z.string().min(1),
            description: z.string().min(1),
            status: z.enum(["not-started", "in-progress", "completed"]),
            evidence: z.string().max(200).optional()
          })).optional()
        })
      }
    );
    (manageTodo as any)._stateRef = stateRef;
    tools.push(manageTodo);
  }

  // get_tool_response retrieves original raw output by executionId
  const getTool = tool(
    async ({ executionId }) => {
      let execution = stateRef.toolHistory?.find((t) => t.executionId === executionId);
      if (!execution) {
        execution = stateRef.toolHistoryArchived?.find((t) => t.executionId === executionId);
      }
      if (execution) {
        return execution.rawOutput || execution.output;
      }
      return "Execution not found. Please check the executionId.";
    },
    {
      name: "get_tool_response",
      description:
        "RETRIEVE tool execution response: Use this to access the full output of a tool execution that shows as 'SUMMARIZED' in the tool history.",
      schema: z.object({ executionId: z.string().describe("Tool execution id") }),
    }
  );
  // mark mutable stateRef for toolsNode sync
  (getTool as any)._stateRef = stateRef;
  tools.push(getTool);

  return tools;
}
