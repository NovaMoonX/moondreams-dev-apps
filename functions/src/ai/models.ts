export type ModelRole = 'interpret' | 'quick' | 'topicWrite' | 'topicOverview';

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface ModelSpec {
  id: string;
  effort: 'low' | 'medium' | 'high';
  /** Whether the model accepts the API's server-side fallback list; a Haiku-class model refuses it with a 400. */
  hasServerFallback: boolean;
  /** US dollars per million tokens. */
  price: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

/** Ids and prices follow Anthropic's model table as given in the claude-api reference on 2026-11-09; the Haiku-class cache prices follow the usual 0.1x read and 1.25x write ratio of the input price. */
const MODELS: Record<ModelRole, ModelSpec> = {
  interpret: {
    id: 'claude-sonnet-5-5',
    effort: 'low',
    hasServerFallback: true,
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  quick: {
    id: 'claude-haiku-5-5',
    effort: 'low',
    hasServerFallback: false,
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
  topicWrite: {
    id: 'claude-sonnet-5-5',
    effort: 'low',
    hasServerFallback: true,
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  topicOverview: {
    id: 'claude-haiku-5-5',
    effort: 'low',
    hasServerFallback: false,
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
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
