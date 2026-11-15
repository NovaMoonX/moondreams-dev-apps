import { openForHelm, type HelmKey } from './helmKey.js';
import type { SealedPayload } from '../../appKeys/seal.js';
import {
  CONNECTION_KINDS,
  CONNECTION_STATUSES,
  type ConnectionKind,
  type ConnectionRelation,
  type ConnectionSource,
  type ConnectionWords,
} from './nomos/connections.js';
import type { ContextConnection } from './nomos/contextPeople.js';
import { toKinKind } from './nomos/kin.js';
import type { ImpliedConnectionState } from './nomos/connections.js';
import type { StoredConnection } from './nomos/planConnections.js';

interface ConnectionDocLike {
  id: string;
  exists: boolean;
  get: (field: string) => unknown;
}

const SOURCES: ConnectionSource[] = ['said', 'page', 'confirmed', 'refused'];

const toRelation = (value: unknown): ConnectionRelation | null =>
  value === 'friend' || value === 'coworker' ? value : toKinKind(value);

const openWords = (key: HelmKey, sealed: unknown): ConnectionWords | null => {
  try {
    const opened = openForHelm(key, sealed as SealedPayload);
    return {
      fromFirst: toRelation(opened.fromFirst),
      fromSecond: toRelation(opened.fromSecond),
      status:
        CONNECTION_STATUSES.find((entry) => entry === opened.status) ?? null,
      since: typeof opened.since === 'number' ? opened.since : null,
    };
  } catch {
    return null;
  }
};

const readHead = (doc: ConnectionDocLike) => {
  const whoIds: unknown = doc.get('whoIds');
  const kind: ConnectionKind | undefined = CONNECTION_KINDS.find(
    (entry) => entry === doc.get('kind'),
  );
  const source = SOURCES.find((entry) => entry === doc.get('source'));
  return Array.isArray(whoIds) &&
    whoIds.length === 2 &&
    whoIds.every((id) => typeof id === 'string') &&
    kind &&
    source
    ? { whoIds: [whoIds[0], whoIds[1]] as [string, string], kind, source }
    : null;
};

/** The connection documents a turn read, by id, with their words opened; a document that is absent is null, and one that is not a connection is left out. */
export const readStoredConnections = (
  key: HelmKey,
  docs: ConnectionDocLike[],
): Map<string, StoredConnection | null> =>
  new Map(
    docs.flatMap((doc): [string, StoredConnection | null][] => {
      if (!doc.exists) return [[doc.id, null]];
      const head = readHead(doc);
      return head
        ? [
            [
              doc.id,
              {
                ...head,
                createdBy: String(doc.get('createdBy') ?? 'nomos'),
                createdAt: Number(doc.get('createdAt') ?? 0),
                words: openWords(key, doc.get('sealed')),
              },
            ],
          ]
        : [];
    }),
  );

/** Every connection with readable words, as the people lines and the inference read them. */
export const readContextConnections = (
  key: HelmKey,
  docs: ConnectionDocLike[],
): ContextConnection[] =>
  docs.flatMap((doc): ContextConnection[] => {
    const head = readHead(doc);
    const words = head ? openWords(key, doc.get('sealed')) : null;
    return head && words ? [{ ...head, ...words }] : [];
  });

/** Every connection document as the inference reads it: the pair, the kind, whether it was refused and a couple's status; a document whose words would not open still counts, so a refusal is never lost. */
export const readConnectionStates = (
  key: HelmKey,
  docs: ConnectionDocLike[],
): ImpliedConnectionState[] =>
  docs.flatMap((doc): ImpliedConnectionState[] => {
    const head = readHead(doc);
    return head
      ? [{ ...head, status: openWords(key, doc.get('sealed'))?.status ?? null }]
      : [];
  });
