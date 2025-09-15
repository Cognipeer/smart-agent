import { z } from "zod";

export type SmartModel = any; // keep flexible; user supplies a LangChain model

export function isSmartModel(m: any): m is SmartModel {
  return m && (typeof m.invoke === "function" || typeof m.bindTools === "function");
}

export function withTools(model: any, tools: any[]) {
  if (model?.bindTools) return model.bindTools(tools);
  return model;
}
