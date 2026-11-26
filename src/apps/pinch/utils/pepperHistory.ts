export type PepperLine = { role: 'user' | 'assistant'; text: string };

const MAX_PAIRS = 20;
const MAX_CHARS = 160_000;

/** Adds one finished exchange to the history, the lines exactly as the server returned them so the next turn's cached prefix still matches. */
export const appendExchange = (
  history: PepperLine[],
  done: { user: string; assistant: string },
): PepperLine[] => [
  ...history,
  { role: 'user', text: done.user },
  { role: 'assistant', text: done.assistant },
];

const countChars = (lines: PepperLine[]) =>
  lines.reduce((total, line) => total + line.text.length, 0);

/** Drops the oldest whole exchanges until the history fits what the server accepts: 20 exchanges and 160,000 characters. */
export const trimHistory = (history: PepperLine[]): PepperLine[] => {
  const kept = history.slice(history.length % 2);
  if (kept.length <= MAX_PAIRS * 2 && countChars(kept) <= MAX_CHARS) {
    return kept;
  }
  return trimHistory(kept.slice(2));
};
