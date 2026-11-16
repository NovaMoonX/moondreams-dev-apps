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
  /** Each line's words by id, for the check that a removal still names it once closing phrases are taken out. */
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
]);

const contentWords = (text: string) =>
  new Set(
    toComparable(text)
      .split(' ')
      .filter((word) => word.length >= MIN_WORD && !GENERIC.has(word)),
  );

/** Whether the turn's words, with every closing phrase taken out, still name the line: the whole of it, or a word that carries its meaning. A removal rests on this, so "forget it" can never remove a line. */
export const isSeenAsNamed = (turnText: string | undefined, line: string) => {
  const said = ` ${toComparable(withoutClosingPhrases(turnText ?? ''))} `;
  const whole = toComparable(line);
  return (
    (whole !== '' && said.includes(` ${whole} `)) ||
    [...contentWords(line)].some((word) => said.includes(` ${word} `))
  );
};

/** Reads the reply's `correctSeenAs` and `removeSeenAs` commands from their own list. A line the context never listed drops the command; the correction's words are cut from the capture, never the model's; a removal needs the turn to still name the line. */
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
          return isSeenAsNamed(text, context.lineWords?.get(lineId) ?? '')
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
