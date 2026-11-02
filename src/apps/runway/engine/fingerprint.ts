/** A 53-bit hash of text (cyrb53): names the inputs of a draft so an unchanged plan reuses it. */
export function hashText(text: string): string {
  const seeds = Array.from(text).reduce(
    (acc, character) => {
      const code = character.codePointAt(0) ?? 0;
      return {
        a: Math.imul(acc.a ^ code, 2_654_435_761),
        b: Math.imul(acc.b ^ code, 1_597_334_677),
      };
    },
    { a: 0xdeadbeef, b: 0x41c6ce57 },
  );
  const a =
    Math.imul(seeds.a ^ (seeds.a >>> 16), 2_246_822_507) ^
    Math.imul(seeds.b ^ (seeds.b >>> 13), 3_266_489_909);
  const b =
    Math.imul(seeds.b ^ (seeds.b >>> 16), 2_246_822_507) ^
    Math.imul(seeds.a ^ (seeds.a >>> 13), 3_266_489_909);
  const result = (4_294_967_296 * (2_097_151 & b) + (a >>> 0)).toString(36);
  return result;
}

/** Names what the person set for one day, whatever order the sealed payload wrote its keys in. */
export function hashOverride(override: {
  pairings: unknown;
  holdResolutions: Record<string, string>;
  payloads?: Record<string, unknown>;
  billCents?: Record<string, number>;
}): string {
  const holds = Object.entries(override.holdResolutions).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const payloads = Object.entries(override.payloads ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const bills = Object.entries(override.billCents ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const result = hashText(
    JSON.stringify(
      bills.length > 0
        ? [override.pairings, holds, payloads, bills]
        : payloads.length === 0
          ? [override.pairings, holds]
          : [override.pairings, holds, payloads],
    ),
  );
  return result;
}
