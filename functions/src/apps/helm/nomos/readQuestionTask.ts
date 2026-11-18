import { createHash } from 'node:crypto';

import type { QuoteBook, SyncedBook } from './aliases.js';
import type {
  MentionRead,
  OfferQuestionsCommand,
  QuestionsMeeting,
} from './commands.js';
import { QUESTIONS_MAX, QUESTION_CAP } from './questionsTask.js';

const TITLE_CAP = 120;
const LABEL_CAP = 80;
const WHO_MAX = 4;

const flat = (value: unknown, cap: number) => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, cap).trim();
  return text === '' ? null : text;
};

/** The questions a reply lists, each flattened and capped, blanks and repeats dropped, at most `QUESTIONS_MAX`. */
export const readQuestionList = (value: unknown): string[] =>
  [
    ...new Set(
      (Array.isArray(value) ? value : []).flatMap((entry) => {
        const text = flat(entry, QUESTION_CAP);
        return text === null ? [] : [text];
      }),
    ),
  ].slice(0, QUESTIONS_MAX);

/** The meeting an alias names: a calendar event that starts later, never a part of a trip; anything else is no meeting. */
export const readQuestionsMeeting = (
  alias: unknown,
  synced: SyncedBook | undefined,
  now: number,
): QuestionsMeeting | null => {
  const copy = typeof alias === 'string' ? synced?.get(alias) : null;
  if (
    !copy ||
    copy.kind !== 'event' ||
    copy.category === 'itinerary' ||
    copy.startAt === null ||
    copy.startAt <= now
  ) {
    return null;
  }
  return {
    syncedId: copy.id,
    startAt: copy.startAt,
    label: copy.title.slice(0, LABEL_CAP).trim(),
  };
};

/** The stable key of a Drive document read this turn, from the quote alias read_document gave one of its passages, hashed so the profile never holds a file or account id; null for anything but a Drive file. */
export const readDocumentKey = (
  alias: unknown,
  quotes: QuoteBook | undefined,
) => {
  const quote = typeof alias === 'string' ? quotes?.get(alias) : null;
  return quote && quote.connectorId === 'google:drive'
    ? createHash('sha256')
        .update(`${quote.accountId}|${quote.ref}`)
        .digest('hex')
        .slice(0, 24)
    : null;
};

/** The questions a document lists for someone, offered as a task: it needs a document read this turn, at least one question and a title; at most one offer a turn. */
export const readOfferQuestions = (
  items: Record<string, unknown>[],
  context: {
    quotes?: QuoteBook;
    synced?: SyncedBook;
    mentions: MentionRead[];
    /** The ref the reply wrote for each mention, and the ref code settled it as. */
    whoRefs: Map<string, string>;
    now: number;
  },
): OfferQuestionsCommand[] =>
  items
    .filter((item) => item.kind === 'offerQuestionTask')
    .flatMap((item): OfferQuestionsCommand[] => {
      const title = flat(item.title, TITLE_CAP);
      const questions = readQuestionList(item.questions);
      const documentKey = readDocumentKey(item.quoteAlias, context.quotes);
      if (title === null || questions.length === 0 || documentKey === null) {
        return [];
      }
      const refs = new Set(
        (Array.isArray(item.whoRefs) ? item.whoRefs : []).flatMap((ref) => {
          const settled =
            typeof ref === 'string' ? context.whoRefs.get(ref) : undefined;
          return settled ? [settled] : [];
        }),
      );
      return [
        {
          kind: 'offerQuestionTask',
          title,
          questions,
          who: context.mentions
            .filter((mention) => refs.has(mention.ref))
            .map((mention) => mention.name)
            .slice(0, WHO_MAX),
          whoIds: [],
          meeting: readQuestionsMeeting(
            item.aboutAlias,
            context.synced,
            context.now,
          ),
          documentKey,
        },
      ];
    })
    .slice(0, 1);
