export type ModelRole = 'interpret';

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface ModelSpec {
  id: string;
  effort: 'low' | 'medium' | 'high';
  /** US dollars per million tokens. */
  price: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

/** Ids and prices were checked against Anthropic's model table dated 2026-10-06. */
const MODELS: Record<ModelRole, ModelSpec> = {
  interpret: {
    id: 'claude-sonnet-5-5',
    effort: 'low',
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  },
};

export const getModelSpec = (role: ModelRole) => MODELS[role];

export const EMPTY_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export const addUsage = (a: ModelUsage, b: ModelUsage): ModelUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

const HUNDREDTHS_OF_A_CENT_PER_DOLLAR = 10_000;

/** What a call cost, rounded up, in hundredths of a cent. */
export function getUsageCost(role: ModelRole, usage: ModelUsage): number {
  const { price } = MODELS[role];
  const dollars =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000;
  return Math.ceil(dollars * HUNDREDTHS_OF_A_CENT_PER_DOLLAR);
}
