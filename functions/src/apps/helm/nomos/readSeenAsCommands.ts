import { withoutClosingPhrases } from '../../../vendor/closingPhrase.js';
import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { AliasBook } from './aliases.js';
import { MAX_SEEN_AS_PER_TURN, type SeenAsCommand } from './commands.js';
import { sliceOfCapture } from './readHabitCommands.js';
import { cutCorrection } from './seenAs.js';

export type SeenAsDrop =
  'seenAs-unknown' | 'seenAs-unasked' | 'seenAs-extra' | 'seenAs-shape';

export interface SeenAsReadContext {
  lines?: AliasBook;
  lineWords?: Map<string, string>;
  captureText?: string;
}

const MIN_WORD = 4;
const GENERIC = new Set([
  'remove',
  'delete',
  'forget',
  'drop',
  'stop',
  'line',
  'lines',
  'that',
  'this',
  'these',
  'those',
  'about',
  'what',
  'when',
  'with',
  'from',
  'your',
  'have',
  'them',
  'they',
  'just',
  'please',
  'wrong',
  'right',
  'true',
  'went',
  'good',
  'well',
  'really',
  'thanks',
  'done',
  'more',
  'time',
  'work',
  'today',
]);

const contentWords = (text: string) =>
  new Set(
    toComparable(text)
      .split(' ')
      .filter((word) => word.length >= MIN_WORD && !GENERIC.has(word)),
  );

/** Whether the words that ask for a removal, with every closing phrase taken out, still name the line: the whole of it, or two of its content words (its only one when it has just one). A removal rests on this, so "forget it" can never remove a line. */
export const isSeenAsNamed = (quote: string | undefined, line: string) => {
  const said = ` ${toComparable(withoutClosingPhrases(quote ?? ''))} `;
  const whole = toComparable(line);
  const words = [...contentWords(line)];
  const shared = words.filter((word) => said.includes(` ${word} `)).length;
  return (
    (whole !== '' && said.includes(` ${whole} `)) ||
    (words.length > 0 && shared >= Math.min(2, words.length))
  );
};

/** Reads the reply's corrections and removals of lines about the person. A line the context never listed drops the command; the correction's words are cut from the capture, never the model's; a removal needs its own quoted words, found in the capture, to still name the line. */
export const readSeenAsCommands = (
  items: Record<string, unknown>[],
  context: SeenAsReadContext,
): { commands: SeenAsCommand[]; dropped: SeenAsDrop[] } => {
  const text = context.captureText ?? '';
  return items
    .filter(
      (item) => item.kind === 'correctSeenAs' || item.kind === 'removeSeenAs',
    )
    .reduce<{ commands: SeenAsCommand[]; dropped: SeenAsDrop[] }>(
      (acc, item) => {
        const drop = (code: SeenAsDrop) => ({
          ...acc,
          dropped: [...acc.dropped, code],
        });
        const lineId =
          typeof item.seenAsAlias === 'string'
            ? (context.lines?.idOf(item.seenAsAlias) ?? null)
            : null;
        if (lineId === null) return drop('seenAs-unknown');
        if (acc.commands.length >= MAX_SEEN_AS_PER_TURN)
          return drop('seenAs-extra');
        if (item.kind === 'removeSeenAs') {
          const quote =
            typeof item.requestQuote === 'string'
              ? sliceOfCapture(text, item.requestQuote)
              : null;
          return quote !== null &&
            isSeenAsNamed(quote, context.lineWords?.get(lineId) ?? '')
            ? {
                ...acc,
                commands: [...acc.commands, { kind: 'removeSeenAs', lineId }],
              }
            : drop('seenAs-unasked');
        }
        const said =
          typeof item.seenAsWords === 'string' &&
          toComparable(item.seenAsWords) !== ''
            ? sliceOfCapture(text, item.seenAsWords)
            : null;
        if (said === null) return drop('seenAs-unasked');
        const words = cutCorrection(said);
        return words === ''
          ? drop('seenAs-shape')
          : {
              ...acc,
              commands: [
                ...acc.commands,
                { kind: 'correctSeenAs', lineId, words },
              ],
            };
      },
      { commands: [], dropped: [] },
    );
};
