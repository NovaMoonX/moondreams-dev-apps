import type { ModelProvider } from '../../../ai/modelProvider.js';
import { EMPTY_USAGE } from '../../../ai/models.js';
import type { CaptureReading } from './commands.js';

const SPLIT_RE = /\n|,(?!\d)|\band\b/gi;
const FILLER = new Set([
  'the',
  'a',
  'an',
  'thing',
  'things',
  'stuff',
  'with',
  'of',
  'that',
  'this',
  'it',
  'um',
  'uh',
]);

const hasMeaning = (title: string) =>
  /\p{L}/u.test(title) &&
  title
    .toLowerCase()
    .split(/\s+/)
    .some((word) => !FILLER.has(word.replace(/[^\p{L}\p{N}]/gu, '')));

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];

interface ScreenBlock {
  focus: { alias: string } | null;
  visible: { alias: string }[];
}

const readBlock = <T>(message: string, tag: string): T | null => {
  const match = message.match(new RegExp(`<${tag}>(.*)</${tag}>`));
  try {
    return match ? (JSON.parse(match[1]) as T) : null;
  } catch {
    return null;
  }
};

const toUpdate = (
  alias: string,
  dueSpanId: string | null,
  isUrgent: true | null,
) => ({
  kind: 'updateTask',
  ref: null,
  taskAlias: alias,
  title: null,
  dueSpanId,
  isUrgent,
});

/** The follow-ups a page makes possible, read from the context blocks: "move this to Saturday", "make it urgent", "the second one is done", "this is done". Null when the words are none of them or what they point at is missing. */
function readFollowUp(text: string, reading: CaptureReading, message: string) {
  const screen = readBlock<ScreenBlock>(message, 'screen');
  const earlier = readBlock<{ records: string[] }[]>(message, 'earlier_turns');
  const focus = screen?.focus?.alias ?? null;
  const lastMade = earlier?.[earlier.length - 1]?.records.at(-1) ?? null;
  const ordinal = ORDINALS.findIndex((word) =>
    new RegExp(`\\b${word} one is done\\b`, 'i').test(text),
  );
  const span = reading.dates[0];
  if (/\bmove (this|it|that) to\b/i.test(text) && focus && span) {
    return [toUpdate(focus, span.id, null)];
  }
  const urgentTarget = focus ?? lastMade;
  if (/\bmake (this|it|that) urgent\b/i.test(text) && urgentTarget) {
    return [toUpdate(urgentTarget, null, true)];
  }
  const target =
    ordinal >= 0
      ? (screen?.visible[ordinal]?.alias ?? null)
      : /\b(this is done|done with (this|it))\b/i.test(text)
        ? focus
        : null;
  return target
    ? [
        {
          kind: 'completeTask',
          ref: null,
          taskAlias: target,
          title: null,
          dueSpanId: null,
          isUrgent: null,
        },
      ]
    : null;
}

/** Emulator stand-in with no key: one createTask per comma (not one inside a number), "and" or line, each carrying the date span that lies inside it; a piece of only filler words or no letters makes none. */
export function createFixtureProvider(
  text: string,
  reading: CaptureReading,
): ModelProvider {
  return {
    runToolLoop: async ({ messages }) => {
      const followUp = readFollowUp(text, reading, messages[0]?.content ?? '');
      if (followUp) {
        return {
          terminalInput: { commands: followUp },
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const cuts = [...text.matchAll(SPLIT_RE)].map(
        (match): [number, number] => [
          match.index,
          match.index + match[0].length,
        ],
      );
      const bounds: [number, number][] = [
        [0, cuts[0]?.[0] ?? text.length],
        ...cuts.map(([, end], index): [number, number] => [
          end,
          cuts[index + 1]?.[0] ?? text.length,
        ]),
      ];
      const commands = bounds.flatMap(([start, end], index) => {
        const spans = reading.dates.filter(
          (span) => span.start >= start && span.end <= end,
        );
        const title = spans
          .reduce(
            (rest, span) => rest.replace(span.text, ' '),
            text.slice(start, end),
          )
          .replace(/[@#^!]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return hasMeaning(title)
          ? [
              {
                kind: 'createTask',
                ref: `$new${index + 1}`,
                taskAlias: null,
                title: title.charAt(0).toUpperCase() + title.slice(1),
                dueSpanId: spans[0]?.id ?? null,
                isUrgent: null,
              },
            ]
          : [];
      });
      return {
        terminalInput: { commands },
        endedBy: 'terminal',
        errorCode: null,
        usage: EMPTY_USAGE,
        toolCalls: [],
      };
    },
  };
}
