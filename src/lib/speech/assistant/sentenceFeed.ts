// After the first line, short sentences are joined so each spoken request carries enough to sound natural.
const MIN_LATER_CHARS = 40;
const SENTENCE_END = /[.!?…]["'”’)]*\s+/g;

const findSentenceEnds = (text: string) =>
  Array.from(text.matchAll(SENTENCE_END)).map(
    (match) => (match.index ?? 0) + match[0].length,
  );

/** Turns streamed text into whole sentences as they complete: the first as soon as it ends, later ones in lines of a sensible length, the rest on `flush`. */
export function createSentenceFeed(onLine: (line: string) => void) {
  const state = { buffer: '', lines: 0 };
  const emit = (line: string) => {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed === '') return;
    state.lines += 1;
    onLine(trimmed);
  };
  const findCut = (text: string) => {
    const ends = findSentenceEnds(text);
    if (state.lines === 0) return ends[0] ?? null;
    return (
      ends
        .filter((end) => text.slice(0, end).trim().length >= MIN_LATER_CHARS)
        .at(-1) ?? null
    );
  };
  return {
    push: (text: string) => {
      state.buffer += text;
      const cut = findCut(state.buffer);
      if (cut === null) return;
      emit(state.buffer.slice(0, cut));
      state.buffer = state.buffer.slice(cut);
    },
    flush: () => {
      emit(state.buffer);
      state.buffer = '';
    },
    /** Lines handed on so far. */
    count: () => state.lines,
  };
}
