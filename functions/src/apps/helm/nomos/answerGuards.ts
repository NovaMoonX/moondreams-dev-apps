import type { SearchedEntry } from './aliases.js';
import {
  QUOTE_CAP,
  type AnswerCommand,
  type AnswerScope,
  type SourceRef,
} from './commands.js';
import { cutAtWord } from './normalizeNomosReply.js';
import { SPOKEN_MAX_CHARS } from './spoken.js';

export const GENERAL_LABEL = 'Not from your records:';
export const HEALTH_CAUTION_SPOKEN =
  'General information, not medical advice. Check with a doctor or pharmacist before acting on it.';
const MAX_SOURCES = 12;
const MIN_RECORDS_SPOKEN = 60;

export interface AnswerQuote {
  id: string;
  connectorId: string;
  accountId: string;
  sourceLabel: string;
  at: number | null;
  text: string | null;
  deepLink: string | null;
  deletedAt: number | null;
}

export type SearchedSource = SearchedEntry;

/** What is stored on the capture, sealed; `general` is never shown or read without its label. */
export interface CaptureAnswer {
  question: string;
  scope: AnswerScope;
  fromRecords: string | null;
  sources: SourceRef[];
  general: string | null;
  isHealth: boolean;
  generalDiffersFrom: { noteId: string; says: string } | null;
  suggestedTopicId: string | null;
  quotes: AnswerQuote[];
  searched: SearchedSource[];
}

export type AnswerDrop = 'answer-unsourced' | 'answer-general-refused';

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Said whatever the question's grammar, so the line never has to be bent around it. */
export const NOTHING_LINE = 'Nothing in your records answers that.';

const toSourceKey = (source: SourceRef) =>
  source.kind === 'connection'
    ? `connection:${source.connectorId}:${source.accountId}`
    : `${source.kind}:${source.id}`;

const dedupe = (sources: SourceRef[]) =>
  sources.filter(
    (source, index) =>
      sources.findIndex(
        (other) => toSourceKey(other) === toSourceKey(source),
      ) === index,
  );

/** The sender's name from a From line: `"Sweet Layer Bakery" <hello@x.example>` is `Sweet Layer Bakery`; with no name, the address. */
export const toSenderName = (from: string) => {
  const name = from
    .replace(/<[^>]*>/g, '')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .replace(/\s+/g, ' ');
  return name || from.trim();
};

const toSpoken = (input: {
  records: string | null;
  general: string | null;
  isHealth: boolean;
}) => {
  const caution = input.isHealth ? ` ${HEALTH_CAUTION_SPOKEN}` : '';
  const room = SPOKEN_MAX_CHARS - caution.length;
  const generalLength = input.general
    ? GENERAL_LABEL.length + 1 + input.general.length
    : 0;
  const records = input.records
    ? cutAtWord(
        input.records,
        input.general
          ? Math.max(MIN_RECORDS_SPOKEN, room - generalLength - 1)
          : room,
      )
    : '';
  const general = input.general
    ? `${GENERAL_LABEL} ${cutAtWord(
        input.general,
        Math.max(0, room - records.length - 1 - GENERAL_LABEL.length - 1),
      )}`.trim()
    : '';
  return `${[records, general].filter(Boolean).join(' ')}${caution}`;
};

/** What is stored and said of the model's answer: records only with a source, general knowledge only where its scope allows, its label always written by code. */
export function buildAnswer(
  command: AnswerCommand,
  onDrop: (code: AnswerDrop) => void = () => undefined,
  searched: SearchedSource[] = [],
  newId: () => string = () => crypto.randomUUID(),
) {
  const sources = dedupe(command.sources).slice(0, MAX_SOURCES);
  const quotes = command.quotes.filter(
    (quote, index) =>
      command.quotes.findIndex((other) => other.alias === quote.alias) ===
      index,
  );
  const hasRecordsText = !!command.fromRecordsText;
  const fromRecords =
    command.fromRecordsText && sources.length + quotes.length > 0
      ? oneLine(command.fromRecordsText)
      : null;
  if (hasRecordsText && !fromRecords) onDrop('answer-unsourced');
  const mayAddGeneral =
    command.scope === 'both' ||
    (command.scope === 'theWorld' && fromRecords === null);
  const general =
    command.generalText && mayAddGeneral ? oneLine(command.generalText) : null;
  if (command.generalText && !general) onDrop('answer-general-refused');

  const recordsSpoken = fromRecords ?? NOTHING_LINE;
  const generalSpoken = general
    ? oneLine(command.generalSpoken || general)
    : null;
  const answer: CaptureAnswer = {
    question: command.question,
    scope: command.scope,
    fromRecords,
    sources: fromRecords ? sources : [],
    general,
    isHealth: command.isHealth,
    generalDiffersFrom: null,
    suggestedTopicId: null,
    quotes: [],
    searched,
  };
  const kept = fromRecords ? quotes : [];
  const quoteIds = Object.fromEntries(
    kept.map((quote) => [quote.alias, newId()]),
  );
  answer.quotes = kept.map((quote) => ({
    id: quoteIds[quote.alias],
    connectorId: quote.connectorId,
    accountId: quote.accountId,
    sourceLabel: `Email from ${toSenderName(quote.from)}`,
    at: quote.at,
    text: quote.snippet.slice(0, QUOTE_CAP),
    deepLink: quote.deepLink,
    deletedAt: null,
  }));
  const quotedSourceKeys = fromRecords
    ? [
        ...new Set([
          ...kept.map((quote) => `${quote.connectorId}|${quote.accountId}`),
          ...command.syncedKeys,
        ]),
      ]
    : [];
  return {
    answer,
    quoteIds,
    quotedSourceKeys,
    spoken: toSpoken({
      records: recordsSpoken,
      general: generalSpoken,
      isHealth: command.isHealth,
    }),
  };
}

/** The Activity line for an answer: from general knowledge only when no record part was kept. */
export const summarizeAnswer = (answer: CaptureAnswer) => {
  if (answer.fromRecords !== null) {
    return answer.quotes.length > 0
      ? `Answered from an email: ${answer.question}`
      : `Answered: ${answer.question}`;
  }
  return answer.general !== null
    ? `Answered from general knowledge: ${answer.question}`
    : `No answer in your records: ${answer.question}`;
};
