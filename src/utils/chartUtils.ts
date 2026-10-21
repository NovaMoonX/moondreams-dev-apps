const STEPS = [
  100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000, 250_000,
  500_000, 1_000_000,
];

/** A tight axis (in cents) around `min` to `max` with round ticks, at most `maxTicks` of them. */
export function getNiceMoneyAxis(min: number, max: number, maxTicks = 4) {
  const pad = Math.max((max - min) * 0.06, 100);
  const low = min - pad;
  const high = max + pad;
  const ticksFor = (step: number) =>
    Array.from(
      { length: Math.floor(high / step) - Math.ceil(low / step) + 1 },
      (_, index) => (Math.ceil(low / step) + index) * step,
    );
  const step =
    STEPS.find((candidate) => ticksFor(candidate).length <= maxTicks) ??
    STEPS[STEPS.length - 1];
  const result = {
    domain: [low, high] as [number, number],
    ticks: ticksFor(step),
  };
  return result;
}
