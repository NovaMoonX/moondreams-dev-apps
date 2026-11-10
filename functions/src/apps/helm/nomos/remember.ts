import type { SealedPayload } from '../../../appKeys/seal.js';
import type { QuoteEntry } from './aliases.js';
import type { CaptureAnswer } from './answerGuards.js';
import type { RememberCommand, RememberField } from './commands.js';
import type { SyncedCopy } from '../syncedCopies.js';

export type RememberRefusal =
  | 'remember-no-answer'
  | 'remember-second'
  | 'remember-quote-unresolved'
  | 'remember-general-kept'
  | 'remember-not-an-event'
  | 'remember-incomplete'
  | 'remember-same-as-calendar'
  | 'remember-not-in-quote'
  | 'remember-already-noted'
  | 'remember-quote-not-email';

/** A fact already kept about the same copy, as far as a repeat check reads it. */
export interface ExistingFact {
  status: string;
  aboutField: string | null;
  keptOverSource: { syncedId: string; contentHash: string } | null;
}

/** A remember that passed every guard, its words and records settled. */
export interface AcceptedFact {
  statement: string;
  value: string;
  aboutField: RememberField;
  about: SyncedCopy;
  quote: QuoteEntry;
  quoteId: string;
}

const toClock = (text: string) => {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(text.trim());
  return match
    ? `${Number(match[1])}:${match[2] ?? '00'} ${match[3].toUpperCase()}M`
    : null;
};

const CLOCK_IN_TEXT = /\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?/gi;

const isValueInQuote = (field: RememberField, value: string, text: string) =>
  field === 'place'
    ? (value.match(/\p{L}{3,}/gu) ?? []).every((word) =>
        text.toLowerCase().includes(word.toLowerCase()),
      )
    : (text.match(CLOCK_IN_TEXT) ?? []).some(
        (token) => toClock(token) === toClock(value),
      );

const isAlreadyNoted = (
  facts: ExistingFact[],
  field: RememberField,
  copyId: string,
  contentHash: string | null,
) =>
  facts.some(
    (fact) =>
      fact.aboutField === field &&
      (fact.status === 'inferred' ||
        (fact.status === 'confirmed' &&
          contentHash !== null &&
          fact.keptOverSource?.syncedId === copyId &&
          fact.keptOverSource.contentHash === contentHash)),
  );

const toComparable = (field: RememberField, text: string) =>
  (field === 'place' ? null : toClock(text)) ??
  text.trim().replace(/\s+/g, ' ').toLowerCase();

const toCopyValue = (
  copy: SyncedCopy,
  field: RememberField,
  timeZone: string,
) => {
  if (field === 'place') return copy.subtitle;
  const at = field === 'startAt' ? copy.startAt : copy.endAt;
  return at === null || copy.isAllDay
    ? null
    : new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
      }).format(at);
};

const toShownValue = (field: RememberField, value: string) =>
  (field === 'place' ? null : toClock(value)) ?? value.trim();

/** Decides the one noted fact an answer may carry; every refusal says why, and nothing outside an answer that keeps its records part, its email and no general part is written. */
export function settleRemember(input: {
  remember: RememberCommand[];
  built: { answer: CaptureAnswer; quoteIds: Record<string, string> } | null;
  timeZone: string;
  existingFacts: ExistingFact[];
  contentHash: string | null;
}): { fact: AcceptedFact | null; refused: RememberRefusal[] } {
  const [first, ...later] = input.remember;
  const refusedLater = later.map((): RememberRefusal => 'remember-second');
  if (!first) return { fact: null, refused: [] };
  const refuse = (code: RememberRefusal) => ({
    fact: null,
    refused: [code, ...refusedLater],
  });
  const { built } = input;
  if (!built) return refuse('remember-no-answer');
  const quoteId = first.quote ? built.quoteIds[first.quote.alias] : undefined;
  if (!first.quote || !quoteId) return refuse('remember-quote-unresolved');
  if (first.quote.connectorId !== 'google:gmail') {
    return refuse('remember-quote-not-email');
  }
  if (built.answer.general !== null) return refuse('remember-general-kept');
  if (!first.about || first.about.kind !== 'event') {
    return refuse('remember-not-an-event');
  }
  const { statement, value, aboutField } = first;
  if (!statement || !value || !aboutField) return refuse('remember-incomplete');
  if (aboutField !== 'place' && toClock(value) === null) {
    return refuse('remember-incomplete');
  }
  if (!isValueInQuote(aboutField, value, first.quote.snippet)) {
    return refuse('remember-not-in-quote');
  }
  const own = toCopyValue(first.about, aboutField, input.timeZone);
  if (
    own !== null &&
    toComparable(aboutField, own) === toComparable(aboutField, value)
  ) {
    return refuse('remember-same-as-calendar');
  }
  if (
    isAlreadyNoted(
      input.existingFacts,
      aboutField,
      first.about.id,
      input.contentHash,
    )
  ) {
    return refuse('remember-already-noted');
  }
  return {
    fact: {
      statement,
      value: toShownValue(aboutField, value),
      aboutField,
      about: first.about,
      quote: first.quote,
      quoteId,
    },
    refused: refusedLater,
  };
}

/** The fact's document, the Execution's record of creating it and what Undo needs to read back. */
export function buildFactWrite(input: {
  fact: AcceptedFact;
  captureId: string;
  executionId: string;
  factId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}) {
  const { fact, now } = input;
  const syncedIds = [fact.about.id];
  return {
    data: {
      status: 'inferred',
      stated: 'nomosInferred',
      sourceCaptureId: input.captureId,
      sourceExecutionId: input.executionId,
      sourceConnection: {
        connectorId: fact.quote.connectorId,
        accountId: fact.quote.accountId,
        quoteId: fact.quoteId,
      },
      aboutField: fact.aboutField,
      whoIds: [],
      placeIds: [],
      projectIds: [],
      syncedIds,
      subjectIds: syncedIds,
      keptOverSource: null,
      supersedesId: null,
      supersededById: null,
      supersededAt: null,
      disputedWithId: null,
      createdAt: now,
      confirmedAt: null,
      lastEditedAt: null,
      sealed: input.seal({
        statement: fact.statement,
        quote: null,
        value: fact.value,
      }),
    },
    effectRef: {
      op: 'create' as const,
      collection: 'facts' as const,
      docId: input.factId,
    },
    effect: {
      written: {
        status: 'inferred',
        stated: 'nomosInferred',
        aboutField: fact.aboutField,
        syncedIds,
        'sealed.title': `Noted the ${fact.value} on ${fact.about.title}`,
        'sealed.statement': fact.statement,
        'sealed.value': fact.value,
      },
      previous: null,
    },
    note: `Noted the ${fact.value} on ${fact.about.title}.`,
  };
}
