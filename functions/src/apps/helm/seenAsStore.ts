import type {
  DocumentData,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import type { ContextSeenAs } from './nomos/buildContext.js';
import {
  orderSeenAsForModel,
  SEEN_AS_KINDS,
  type SeenAsExisting,
  type SeenAsKind,
  type SeenAsState,
} from './nomos/seenAs.js';
import { readPrivacy, type PrivacyClass } from './privacy.js';

const RECORDS_READ = 100;

export interface SeenAsSealedWords {
  line: string;
  basis: string;
  corrected: string | null;
}

/** A line of how the assistant sees the person as stored: the readable fields, and the sealed words when they open (null on a removed line past the cap, or one that will not open). */
export interface SeenAsRecord extends SeenAsExisting {
  writtenBy: 'reflection' | 'person';
  derivedAt: number;
  createdAt: number;
  privacy: PrivacyClass;
  words: SeenAsSealedWords | null;
}

const toStrings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const toNumberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const openWords = (key: HelmKey, sealed: unknown): SeenAsSealedWords | null => {
  if (!sealed) return null;
  try {
    const opened = openForHelm(key, sealed as SealedPayload);
    return typeof opened.line === 'string'
      ? {
          line: opened.line,
          basis: typeof opened.basis === 'string' ? opened.basis : '',
          corrected:
            typeof opened.corrected === 'string' ? opened.corrected : null,
        }
      : null;
  } catch {
    return null;
  }
};

/** A stored line read as a record; null when its kind or state is not one this build knows. */
export const toSeenAsRecord = (
  key: HelmKey,
  id: string,
  data: DocumentData,
): SeenAsRecord | null => {
  const kind = SEEN_AS_KINDS.find((entry) => entry === data.kind);
  const state = (['shown', 'corrected', 'removed'] as const).find(
    (entry) => entry === data.state,
  );
  if (!kind || !state) return null;
  return {
    id,
    kind,
    state,
    sourceKeys: toStrings(data.sourceKeys),
    subjectRefs: toStrings(data.subjectRefs),
    dontDrawFrom: toStrings(data.dontDrawFrom),
    correctedAt: toNumberOrNull(data.correctedAt),
    removedAt: toNumberOrNull(data.removedAt),
    writtenBy: data.writtenBy === 'person' ? 'person' : 'reflection',
    derivedAt: toNumberOrNull(data.derivedAt) ?? 0,
    createdAt: toNumberOrNull(data.createdAt) ?? 0,
    privacy: readPrivacy(data.privacy),
    words: openWords(key, data.sealed),
  };
};

/** The lines a turn names, read in the turn's transaction; one that is gone or unknown is left out. */
export async function readSeenAsRecordsIn(
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
  ids: readonly string[],
): Promise<Map<string, SeenAsRecord>> {
  const unique = [...new Set(ids)];
  const snapshots =
    unique.length === 0
      ? []
      : await transaction.getAll(
          ...unique.map((id) => firestore.doc(`${base}/seenAs/${id}`)),
        );
  return new Map(
    snapshots.flatMap((snapshot) => {
      const record = snapshot.exists
        ? toSeenAsRecord(key, snapshot.id, snapshot.data() ?? {})
        : null;
      return record ? [[snapshot.id, record] as [string, SeenAsRecord]] : [];
    }),
  );
}

/** The lines the model is shown, corrected first, at most `SEEN_AS_LIMITS.toModel`: shown and corrected only, the correction in place of the line, and none made before the person's last Forget. A private line is left out while nobody is looking. */
export async function readSeenAsForContext(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  options: { forgottenAt: number | null; isMasked: boolean },
): Promise<ContextSeenAs[]> {
  const snapshot = await firestore
    .collection(`${base}/seenAs`)
    .where('state', 'in', ['shown', 'corrected'])
    .limit(RECORDS_READ)
    .get();
  const lines = snapshot.docs.flatMap((doc) => {
    const record = toSeenAsRecord(key, doc.id, doc.data());
    const text =
      record?.state === 'corrected'
        ? (record.words?.corrected ?? '')
        : (record?.words?.line ?? '');
    if (
      !record ||
      text === '' ||
      record.createdAt <= (options.forgottenAt ?? 0) ||
      (options.isMasked && record.privacy === 'private')
    )
      return [];
    return [
      {
        id: record.id,
        kind: record.kind as SeenAsKind,
        state: record.state as SeenAsState,
        at: record.correctedAt ?? record.derivedAt,
        text,
      },
    ];
  });
  return orderSeenAsForModel(lines).map(({ id, kind, state, text }) => ({
    id,
    kind,
    text,
    isCorrected: state === 'corrected',
  }));
}
