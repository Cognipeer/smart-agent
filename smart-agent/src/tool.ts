import { tool, type ToolInterface } from "@langchain/core/tools";
import { ZodSchema } from "zod";

export type SmartToolFn = (args: any) => Promise<any> | any;

export function createSmartTool({
    name,
    description,
    schema,
    func,
}: {
    name: string;
    description?: string;
    schema: ZodSchema,
    func: SmartToolFn;
}): ToolInterface {
    return tool(async (input) => {
        return func(input);
    }, {
        name,
        description,
        schema
    })
}
