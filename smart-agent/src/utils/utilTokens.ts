export function countApproxTokens(text: string) {
  if (!text) return 0;
  // Rough heuristic: 1 token ~ 4 chars
  return Math.ceil(text.length / 4);
}
