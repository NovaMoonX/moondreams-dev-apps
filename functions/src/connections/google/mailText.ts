const MAX_SENT_TEXT = 1_500;
const WROTE_LINES = 3;
const ADDRESS = /[^\s<>,;"'()]+@[^\s<>,;"'()]+/g;

/** Lowercased addresses in a To or Cc header, without names. */
export const readAddresses = (value: string) =>
  Array.from(
    new Set(
      (value.match(ADDRESS) ?? []).map((address) =>
        address.replace(/[.:]+$/, '').toLowerCase(),
      ),
    ),
  );

const isWroteLine = (lines: string[], index: number) => {
  if (!/^On\s/i.test(lines[index])) return false;
  const window = lines.slice(index, index + WROTE_LINES);
  const last = window.findIndex((line) => /wrote:\s*$/i.test(line));
  return last !== -1 && window.slice(0, last + 1).join(' ').length <= 300;
};

/** What a person wrote in a message: the quoted reply and the signature are left out, and the rest is cut to 1,500 characters. */
export const toWrittenText = (text: string) => {
  const lines = text.split('\n');
  const end = lines.findIndex(
    (line, index) => /^--\s*$/.test(line) || isWroteLine(lines, index),
  );
  return (end === -1 ? lines : lines.slice(0, end))
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
    .trim()
    .slice(0, MAX_SENT_TEXT);
};
