/** `Math.floor(cents * bps / 10_000)`: a percentage of integer cents, never a float. */
export function percentOf(cents: number, bps: number): number {
  const result = Math.floor((cents * bps) / 10_000);
  return result;
}

/**
 * What each of several percentage lines on one day gets: `percentOf(money, total bps)` shared out by
 * `allocate`, so the lines add to that one rounded figure and never to more than the money. Over
 * 100% in all, each rounds on its own and the walk of the pool cuts the later lines short.
 */
export function percentShares(
  money: number,
  bps: readonly number[],
  ids: readonly string[],
): number[] {
  const total = bps.reduce((sum, value) => sum + value, 0);
  if (total > 10_000) return bps.map((value) => percentOf(money, value));
  const result = allocate(percentOf(money, total), bps, ids);
  return result;
}

/**
 * Splits `total` cents across `weights` by largest remainder, ties broken by ascending id, so the
 * shares always add up to the total and always come out the same. Shares are returned in input order.
 */
export function allocate(
  total: number,
  weights: readonly number[],
  ids: readonly string[],
): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.length === 0 || weightSum <= 0) return weights.map(() => 0);

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const parts = weights.map((weight, index) => ({
    index,
    id: ids[index],
    floor: Math.floor((magnitude * weight) / weightSum),
    remainder: (magnitude * weight) % weightSum,
  }));
  const leftover = magnitude - parts.reduce((sum, part) => sum + part.floor, 0);
  const winners = new Set(
    [...parts]
      .sort(
        (a, b) =>
          b.remainder - a.remainder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .slice(0, leftover)
      .map((part) => part.index),
  );

  const result = parts.map(
    (part) => sign * (part.floor + (winners.has(part.index) ? 1 : 0)),
  );
  return result;
}
