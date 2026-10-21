/** A tight axis (in cents) around `min` to `max` with round whole-dollar ticks, at most `maxTicks` of them. */
export function getNiceMoneyAxis(min: number, max: number, maxTicks = 4) {
  const pad = Math.max((max - min) * 0.06, 100);
  const low = min - pad;
  const high = max + pad;
  const ticksFor = (step: number) =>
    Array.from(
      { length: Math.floor(high / step) - Math.ceil(low / step) + 1 },
      (_, index) => (Math.ceil(low / step) + index) * step,
    );
  const findStep = (magnitude: number): number => {
    const step = [1, 2, 5]
      .map((unit) => unit * magnitude)
      .find((candidate) => ticksFor(candidate).length <= maxTicks);
    return step ?? findStep(magnitude * 10);
  };
  const result = {
    domain: [low, high] as [number, number],
    ticks: ticksFor(findStep(100)),
  };
  return result;
}
