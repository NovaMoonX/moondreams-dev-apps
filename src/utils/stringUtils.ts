export function normalizeString(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** `text` cut to at most `max` characters at a word boundary, so a clipped value never ends mid-word; a single word longer than `max` is cut where it stands. */
export function clipAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const head = trimmed.slice(0, max);
  const boundary = /\s/.test(trimmed.charAt(max))
    ? head.length
    : head.search(/\s\S*$/);
  const result = (boundary > 0 ? head.slice(0, boundary) : head).replace(
    /[\s,;:]+$/,
    '',
  );

  return result;
}

/** Levenshtein similarity between two strings, from 0 (nothing alike) to 1 (equal). */
export function getWordSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? previous[rightIndex - 1]
          : 1 + Math.min(previous[rightIndex], current[rightIndex - 1], previous[rightIndex - 1]);
    }
    previous.splice(0, previous.length, ...current);
  }

  return 1 - previous[right.length] / Math.max(left.length, right.length, 1);
}
