/** The tokens a model turn used, as the server reports them. */
export interface ModelUsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
