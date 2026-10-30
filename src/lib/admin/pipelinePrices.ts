/** API list prices in dollars per million tokens. A cache write costs 1.25× input for 5 minutes and 2× for an hour. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

// Longest prefix wins, so a point release is listed before its family.
const PRICES: [prefix: string, price: ModelPrice][] = [
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-1', { input: 15, output: 75, cacheRead: 1.5 }],
  ['claude-opus-4-2025', { input: 15, output: 75, cacheRead: 1.5 }],
  ['claude-opus-4', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-5', { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  ['claude-haiku-4', { input: 1, output: 5, cacheRead: 0.1 }],
];

/** The list price for a model id, or null for one this table doesn't know. */
export function getModelPrice(model: string): ModelPrice | null {
  const match = PRICES.filter(([prefix]) => model.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match ? match[1] : null;
}
