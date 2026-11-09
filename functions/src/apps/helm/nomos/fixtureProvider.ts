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

/** Emulator stand-in with no key: one createTask per comma (not one inside a number), "and" or line, each carrying the date span that lies inside it; a piece of only filler words or no letters makes none. */
export function createFixtureProvider(
  text: string,
  reading: CaptureReading,
): ModelProvider {
  return {
    runToolLoop: async () => {
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
