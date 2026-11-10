import type {
  AnswerQuote,
  AnswerScope,
  CaptureAnswer,
  SearchedSource,
  SourceRef,
} from '@apps/helm/types';

const SCOPES: AnswerScope[] = ['yourThings', 'theWorld', 'both'];
const PLAIN_KINDS = [
  'fact',
  'note',
  'task',
  'project',
  'who',
  'place',
  'procedure',
  'media',
  'topic',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : null;

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toSource = (value: unknown): SourceRef[] => {
  if (!isRecord(value) || typeof value.kind !== 'string') return [];
  if (PLAIN_KINDS.includes(value.kind)) {
    const id = toText(value.id);
    return id ? [{ kind: value.kind as 'task', id }] : [];
  }
  if (value.kind === 'event') {
    const eventRef = toText(value.eventRef);
    const title = toText(value.title);
    const startAt = toNumber(value.startAt);
    return eventRef && title && startAt !== null
      ? [{ kind: 'event', eventRef, title, startAt }]
      : [];
  }
  if (value.kind === 'synced') {
    const id = toText(value.id);
    const connectorId = toText(value.connectorId);
    return id && connectorId
      ? [
          {
            kind: 'synced',
            id,
            connectorId,
            title: toText(value.title),
            startAt: toNumber(value.startAt),
          },
        ]
      : [];
  }
  return [];
};

const toRecords = <T>(value: unknown) =>
  Array.isArray(value) ? (value.filter(isRecord) as unknown as T[]) : [];

/** Opens a stored answer; an older turn's missing key, and anything not shaped like the contract, opens as none. */
export function normalizeAnswer(value: unknown): CaptureAnswer | null {
  if (!isRecord(value)) return null;
  const question = toText(value.question);
  if (!question || !SCOPES.includes(value.scope as AnswerScope)) return null;
  const differs = value.generalDiffersFrom;
  const differsNoteId = isRecord(differs) ? toText(differs.noteId) : null;
  const differsSays = isRecord(differs) ? toText(differs.says) : null;
  return {
    question,
    scope: value.scope as AnswerScope,
    fromRecords: toText(value.fromRecords),
    sources: Array.isArray(value.sources)
      ? value.sources.flatMap(toSource)
      : [],
    general: toText(value.general),
    isHealth: value.isHealth === true,
    generalDiffersFrom:
      differsNoteId && differsSays
        ? { noteId: differsNoteId, says: differsSays }
        : null,
    suggestedTopicId: toText(value.suggestedTopicId),
    quotes: toRecords<AnswerQuote>(value.quotes),
    searched: toRecords<SearchedSource>(value.searched),
  };
}
