/** A short stable hash of a line's words (FNV-1a, 8 hex digits), so a line is remembered as answered whichever status comment lists it. */
export function hashLine(text: string) {
  const words = text.trim().replace(/\s+/g, ' ');
  const hash = Array.from(words).reduce(
    (acc, char) => Math.imul(acc ^ char.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
  return hash.toString(16).padStart(8, '0');
}

/** The answered mark of one decision ("d") or follow-up ("f") line on a pull request. */
export const toLineMark = (prNumber: number, kind: 'd' | 'f', text: string) =>
  `${prNumber}:${kind}:${hashLine(text)}`;
