const KEY_PREFIX = 'runway-rule-declined';

/** cyrb53: a small synchronous digest, since crypto.subtle is missing on plain-HTTP pages. */
const digest = (text: string) => {
  const mixed = Array.from(text).reduce(
    ([h1, h2], char) => {
      const code = char.charCodeAt(0);
      return [
        Math.imul(h1 ^ code, 2654435761),
        Math.imul(h2 ^ code, 1597334677),
      ];
    },
    [0xdeadbeef, 0x41c6ce57],
  );
  const a =
    Math.imul(mixed[0] ^ (mixed[0] >>> 16), 2246822507) ^
    Math.imul(mixed[1] ^ (mixed[1] >>> 13), 3266489909);
  const b =
    Math.imul(mixed[1] ^ (mixed[1] >>> 16), 2246822507) ^
    Math.imul(mixed[0] ^ (mixed[0] >>> 13), 3266489909);
  return `${(b >>> 0).toString(16).padStart(8, '0')}${(a >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
};

const keyFor = (uid: string, merchantKey: string) =>
  `${KEY_PREFIX}:${digest(`${uid}:${merchantKey}`)}`;

/** Whether the person said "Not now" to a rule for this place; kept on this device only, as a digest so the place's name is never stored. */
export function isRuleDeclined(uid: string, merchantKey: string): boolean {
  try {
    return localStorage.getItem(keyFor(uid, merchantKey)) === 'true';
  } catch {
    return false;
  }
}

export function declineRule(uid: string, merchantKey: string): void {
  try {
    localStorage.setItem(keyFor(uid, merchantKey), 'true');
  } catch {
    // Storage is unavailable, so the offer simply comes back.
  }
}
