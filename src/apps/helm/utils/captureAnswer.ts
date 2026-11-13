import { readConnectorAppId } from '@/lib/connections/contract';
import type {
  AnswerQuote,
  AnswerRecord,
  AnswerScope,
  CaptureAnswer,
  SearchedSource,
  SourceRef,
} from '@apps/helm/types';

const SCOPES: AnswerScope[] = ['yourThings', 'theWorld', 'both'];
const PLAIN_KINDS = [
  'fact',
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
  if (value.kind === 'note') {
    const id = toText(value.id);
    const title = toText(value.title) ?? '';
    return id
      ? [
          {
            kind: 'note',
            id,
            title,
            topicPath: toText(value.topicPath),
            topicEmoji: toText(value.topicEmoji),
          },
        ]
      : [];
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
  if (value.kind === 'connection') {
    const connectorId = toText(value.connectorId);
    const accountId = toText(value.accountId);
    const name = toText(value.name);
    return connectorId && accountId && name
      ? [
          {
            kind: 'connection',
            connectorId,
            accountId,
            name,
            label: toText(value.label),
          },
        ]
      : [];
  }
  return [];
};

const toRecord = (value: unknown): AnswerRecord | null => {
  if (!isRecord(value)) return null;
  const name = toText(value.name);
  const amount = toText(value.amount);
  return name && amount ? { name, detail: toText(value.detail), amount } : null;
};

/** Records kept before they were stored apart were written `App · Name` and `$88.00 · Category`. */
const toLegacyRecord = (
  sourceLabel: string,
  text: string | null,
): AnswerRecord | null => {
  const name = sourceLabel.split(' \u00b7 ').slice(1).join(' \u00b7 ');
  const [amount, ...rest] = (text ?? '').split(' \u00b7 ');
  return name && amount
    ? { name, detail: rest.join(' \u00b7 ') || null, amount }
    : null;
};

const toQuote = (value: unknown): AnswerQuote[] => {
  if (!isRecord(value)) return [];
  const id = toText(value.id);
  const connectorId = toText(value.connectorId);
  const accountId = toText(value.accountId);
  const sourceLabel = toText(value.sourceLabel);
  const text = toText(value.text);
  return id && connectorId && accountId && sourceLabel
    ? [
        {
          id,
          connectorId,
          accountId,
          sourceLabel,
          at: toNumber(value.at),
          text,
          record:
            toRecord(value.record) ??
            (readConnectorAppId(connectorId) === null
              ? null
              : toLegacyRecord(sourceLabel, text)),
          deepLink: toText(value.deepLink),
          deletedAt: toNumber(value.deletedAt),
        },
      ]
    : [];
};

const toSearched = (value: unknown): SearchedSource[] => {
  if (!isRecord(value)) return [];
  const connectorId = toText(value.connectorId);
  const accountId = toText(value.accountId);
  const label = toText(value.label);
  const at = toNumber(value.at);
  return connectorId && accountId && label && at !== null
    ? [
        {
          connectorId,
          accountId,
          label,
          at,
          found: toNumber(value.found) ?? 0,
          failed: toText(value.failed),
        },
      ]
    : [];
};

/** Opens a stored answer; an older turn's missing key, and anything not shaped like the contract, opens as none. */
export function normalizeAnswer(value: unknown): CaptureAnswer | null {
  if (!isRecord(value)) return null;
  const question = toText(value.question);
  if (!question || !SCOPES.includes(value.scope as AnswerScope)) return null;
  const differs = value.generalDiffersFrom;
  const differsNoteId = isRecord(differs) ? toText(differs.noteId) : null;
  const differsSays = isRecord(differs) ? toText(differs.says) : null;
  const differsTitle = isRecord(differs) ? toText(differs.title) : null;
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
        ? {
            noteId: differsNoteId,
            title: differsTitle ?? '',
            says: differsSays,
          }
        : null,
    suggestedTopicId: toText(value.suggestedTopicId),
    quotes: Array.isArray(value.quotes) ? value.quotes.flatMap(toQuote) : [],
    searched: Array.isArray(value.searched)
      ? value.searched.flatMap(toSearched)
      : [],
  };
}
