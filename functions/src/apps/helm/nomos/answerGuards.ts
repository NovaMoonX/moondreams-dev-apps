import type { AnswerCommand, AnswerScope, SourceRef } from './commands.js';
import { cutAtWord } from './normalizeNomosReply.js';
import { SPOKEN_MAX_CHARS } from './spoken.js';

export const GENERAL_LABEL = 'Not from your records:';
export const HEALTH_CAUTION_SPOKEN =
  'General information, not medical advice. Check with a doctor or pharmacist before acting on it.';
const MAX_SOURCES = 12;
const MIN_RECORDS_SPOKEN = 60;

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
  quotes: unknown[];
  searched: unknown[];
}

export type AnswerDrop = 'answer-unsourced' | 'answer-general-refused';

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Said whatever the question's grammar, so the line never has to be bent around it. */
export const NOTHING_LINE = 'Nothing in your records answers that.';

const dedupe = (sources: SourceRef[]) =>
  sources.filter(
    (source, index) =>
      sources.findIndex((other) => other.id === source.id) === index,
  );

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

/** Applies section 6's guards to the model's answer and builds what is stored and what is said: records first, the general part only where its scope and the records allow it, and its label always written by code. */
export function buildAnswer(
  command: AnswerCommand,
  onDrop: (code: AnswerDrop) => void = () => undefined,
) {
  const sources = dedupe(command.sources).slice(0, MAX_SOURCES);
  const hasRecordsText = !!command.fromRecordsText;
  const fromRecords =
    command.fromRecordsText && sources.length > 0
      ? oneLine(command.fromRecordsText)
      : null;
  if (hasRecordsText && !fromRecords) onDrop('answer-unsourced');
  const mayAddGeneral =
    command.scope === 'both' ||
    (command.scope === 'theWorld' && fromRecords === null);
  const general =
    command.generalText && mayAddGeneral ? oneLine(command.generalText) : null;
  if (command.generalText && !general) onDrop('answer-general-refused');

  const recordsSpoken = fromRecords
    ? oneLine(command.recordsSpoken || fromRecords)
    : NOTHING_LINE;
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
    searched: [],
  };
  return {
    answer,
    spoken: toSpoken({
      records: recordsSpoken,
      general: generalSpoken,
      isHealth: command.isHealth,
    }),
  };
}

/** The Activity line for an answer: from general knowledge only when no record part was kept. */
export const summarizeAnswer = (answer: CaptureAnswer) =>
  `${answer.fromRecords === null && answer.general !== null ? 'Answered from general knowledge' : 'Answered'}: ${answer.question}`;
