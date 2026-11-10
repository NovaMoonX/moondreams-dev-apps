import { createHash, createHmac, hkdfSync } from 'node:crypto';

import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
  WriteBatch,
} from 'firebase-admin/firestore';

import type {
  ExpiredGrant,
  ReaderSink,
  SinkSession,
  WritePageArgs,
} from '../../../connections/sink.js';
import {
  MAX_RECORDS_PER_CATEGORY,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import { HELM_MASTER_KEYS, loadHelmKeyring } from '../getHelmKey.js';
import { sealForHelm, unwrapHelmKey, type HelmKey } from '../helmKey.js';

export const KEPT_COPY_DAYS = 90;
export const TRANSFORM_VERSION = 1;
export const MAX_COPIES_PER_CATEGORY = MAX_RECORDS_PER_CATEGORY;
const DAY_MS = 86_400_000;
const BATCH_SIZE = 400;
const READ_CHUNK = 300;
const HASH_INFO = 'helm-sync-content';
const DETAIL_LIMIT = 500;

const syncedPath = (uid: string) => `apps/helm/users/${uid}/synced`;

export const toSyncedId = (
  grantId: string,
  category: string,
  sourceRef: string,
) =>
  createHash('sha256')
    .update(`${grantId}|${category}|${sourceRef}`)
    .digest('hex')
    .slice(0, 40);

const hashSubkey = (key: HelmKey) =>
  Buffer.from(hkdfSync('sha256', key.key, Buffer.alloc(0), HASH_INFO, 32));

const sortKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : typeof value === 'object' && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([name, entry]) => [name, sortKeys(entry)]),
        )
      : value;

const toContentHash = (
  subkey: Buffer,
  record: SharedRecord,
  deepLink: string | null,
) =>
  createHmac('sha256', subkey)
    .update(JSON.stringify(sortKeys({ ...record, deepLink })))
    .digest('hex');

const toEnd = (data: DocumentData) => {
  const startAt = typeof data.startAt === 'number' ? data.startAt : null;
  const endAt = typeof data.endAt === 'number' ? data.endAt : null;
  const dueAt = typeof data.dueAt === 'number' ? data.dueAt : null;
  const startEnd =
    startAt === null ? null : startAt + (data.isAllDay === true ? DAY_MS : 0);
  return endAt ?? dueAt ?? startEnd;
};

const hasEndedBefore = (data: DocumentData, cutoff: number) => {
  const end = toEnd(data);
  return end !== null && end < cutoff;
};

const toAnchor = (record: SharedRecord) =>
  record.startAt ?? record.dueAt ?? record.sourceUpdatedAt ?? 0;

const toCalendarKey = (accountId: string, record: SharedRecord) =>
  typeof record.extra.calendarId === 'string'
    ? `${accountId}/${record.extra.calendarId}`
    : null;

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const commitAll = (
  firestore: Firestore,
  items: QueryDocumentSnapshot[],
  apply: (batch: WriteBatch, doc: QueryDocumentSnapshot) => void,
) =>
  chunk(items, BATCH_SIZE).reduce(async (done, group) => {
    await done;
    const batch = firestore.batch();
    group.forEach((doc) => apply(batch, doc));
    await batch.commit();
  }, Promise.resolve());

const toCategoryDocs = async (
  firestore: Firestore,
  uid: string,
  grantId: string,
  category: string | null,
) => {
  const base = firestore
    .collection(syncedPath(uid))
    .where('grantId', '==', grantId);
  const snapshot = await (
    category === null ? base : base.where('category', '==', category)
  ).get();
  return snapshot.docs;
};

class HelmSinkSession implements SinkSession {
  private key: Promise<HelmKey> | null = null;
  private readonly seen = new Map<string, Set<string>>();

  constructor(
    private readonly firestore: Firestore,
    private readonly uid: string,
  ) {}

  private openKey() {
    this.key ??= unwrapHelmKey(this.firestore, loadHelmKeyring(), this.uid);
    return this.key;
  }

  private seenIds(grantId: string, category: string) {
    const id = `${grantId}|${category}`;
    const existing = this.seen.get(id);
    if (existing) return existing;
    const created = new Set<string>();
    this.seen.set(id, created);
    return created;
  }

  async writePage(args: WritePageArgs) {
    const {
      grantId,
      connectorId,
      accountId,
      category,
      records,
      windowStart,
      now,
    } = args;
    const seen = this.seenIds(grantId, category);
    const room = Math.max(0, MAX_COPIES_PER_CATEGORY - seen.size);
    const inWindow = records.filter(
      (record) => !hasEndedBefore(record, windowStart),
    );
    const kept = [
      ...inWindow
        .filter((record) => record.kind === 'event')
        .sort((a, b) => toAnchor(a) - toAnchor(b)),
      ...inWindow
        .filter((record) => record.kind !== 'event')
        .sort((a, b) => toAnchor(b) - toAnchor(a)),
    ].slice(0, room);
    if (kept.length === 0) return;

    const key = await this.openKey();
    const subkey = hashSubkey(key);
    const entries = kept.map((record) => {
      const deepLink = args.deepLink(record.sourceRef);
      return {
        record,
        deepLink,
        id: toSyncedId(grantId, category, record.sourceRef),
        hash: toContentHash(subkey, record, deepLink),
      };
    });
    entries.forEach((entry) => seen.add(entry.id));

    const refs = entries.map((entry) =>
      this.firestore.doc(`${syncedPath(this.uid)}/${entry.id}`),
    );
    const existing = (
      await Promise.all(
        chunk(refs, READ_CHUNK).map((group) => this.firestore.getAll(...group)),
      )
    ).flat();
    const changed = entries.filter((entry, index) => {
      const stored = existing[index].data();
      return !(
        stored &&
        stored.contentHash === entry.hash &&
        stored.transformVersion === TRANSFORM_VERSION &&
        stored.connectionEndedAt === null
      );
    });

    await chunk(changed, BATCH_SIZE).reduce(async (done, group) => {
      await done;
      const batch = this.firestore.batch();
      group.forEach(({ record, deepLink, id, hash }) =>
        batch.set(this.firestore.doc(`${syncedPath(this.uid)}/${id}`), {
          connectorId,
          accountId,
          grantId,
          category,
          kind: record.kind,
          sourceRef: record.sourceRef,
          startAt: record.startAt,
          endAt: record.endAt,
          isAllDay: record.isAllDay,
          dueAt: record.dueAt,
          calendarKey: toCalendarKey(accountId, record),
          isBusy:
            typeof record.extra.calendarId === 'string'
              ? record.extra.isFree !== true
              : null,
          sourceUpdatedAt: record.sourceUpdatedAt,
          contentHash: hash,
          syncedAt: now,
          transformVersion: TRANSFORM_VERSION,
          connectionEndedAt: null,
          deleteAfter: null,
          sealed: sealForHelm(key, {
            title: record.title,
            subtitle: record.subtitle,
            detail: record.detail?.slice(0, DETAIL_LIMIT) ?? null,
            placeLabel: record.placeLabel,
            amountCents: record.amountCents,
            currency: record.currency,
            deepLink,
            extra: record.extra,
          }),
        }),
      );
      await batch.commit();
    }, Promise.resolve());
  }

  async finishCategory(args: {
    grantId: string;
    category: string;
    isFull: boolean;
    windowStart: number;
  }) {
    const seen = this.seenIds(args.grantId, args.category);
    const docs = await toCategoryDocs(
      this.firestore,
      this.uid,
      args.grantId,
      args.category,
    );
    const isGone = (doc: QueryDocumentSnapshot) =>
      (args.isFull && !seen.has(doc.id)) ||
      hasEndedBefore(doc.data(), args.windowStart);
    const gone = docs.filter(isGone);
    await commitAll(this.firestore, gone, (batch, doc) =>
      batch.delete(doc.ref),
    );
    const left = docs.filter((doc) => !isGone(doc));
    return {
      count: left.length,
      keptCount: left.filter((doc) => doc.get('deleteAfter') !== null).length,
    };
  }

  private async deleteWhere(
    grantId: string,
    category: string | null,
    isMatch: (doc: QueryDocumentSnapshot) => boolean,
  ) {
    const docs = (
      await toCategoryDocs(this.firestore, this.uid, grantId, category)
    ).filter(isMatch);
    await commitAll(this.firestore, docs, (batch, doc) =>
      batch.delete(doc.ref),
    );
    return docs.length;
  }

  async deleteRefs(grantId: string, category: string, refs: string[]) {
    const docs = (
      await Promise.all(
        chunk(
          refs.map((ref) =>
            this.firestore.doc(
              `${syncedPath(this.uid)}/${toSyncedId(grantId, category, ref)}`,
            ),
          ),
          READ_CHUNK,
        ).map((group) => this.firestore.getAll(...group)),
      )
    )
      .flat()
      .filter((doc) => doc.exists);
    await chunk(docs, BATCH_SIZE).reduce(async (done, group) => {
      await done;
      const batch = this.firestore.batch();
      group.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }, Promise.resolve());
    return docs.length;
  }

  deleteCategory(grantId: string, category: string) {
    return this.deleteWhere(grantId, category, () => true);
  }

  deleteGrant(grantId: string) {
    return this.deleteWhere(grantId, null, () => true);
  }

  deleteKept(grantId: string) {
    return this.deleteWhere(
      grantId,
      null,
      (doc) => doc.get('deleteAfter') !== null,
    );
  }

  async countKept(grantId: string) {
    return (
      await toCategoryDocs(this.firestore, this.uid, grantId, null)
    ).filter((doc) => doc.get('deleteAfter') !== null).length;
  }

  async keepGrant(grantId: string, endedAt: number, deleteAfter: number) {
    const docs = await toCategoryDocs(this.firestore, this.uid, grantId, null);
    await commitAll(this.firestore, docs, (batch, doc) => {
      const stored = doc.get('deleteAfter');
      const isKept = typeof stored === 'number';
      batch.update(doc.ref, {
        connectionEndedAt: isKept ? doc.get('connectionEndedAt') : endedAt,
        deleteAfter: isKept ? Math.min(stored, deleteAfter) : deleteAfter,
      });
    });
    return docs.length;
  }
}

// A page of the sweep; it keeps going until a page comes back short.
const EXPIRE_LIMIT = 2_000;

const toUid = (doc: QueryDocumentSnapshot) => doc.ref.parent.parent?.id ?? '';

const expirePages = async (
  firestore: Firestore,
  now: number,
): Promise<QueryDocumentSnapshot[]> => {
  const snapshot = await firestore
    .collectionGroup('synced')
    .where('deleteAfter', '<=', now)
    .limit(EXPIRE_LIMIT)
    .get();
  const docs = snapshot.docs.filter(
    (doc) => doc.ref.path.startsWith('apps/helm/users/') && toUid(doc) !== '',
  );
  await commitAll(firestore, docs, (batch, doc) => batch.delete(doc.ref));
  if (snapshot.size < EXPIRE_LIMIT || docs.length === 0) return docs;
  return [...docs, ...(await expirePages(firestore, now))];
};

const expire = async (
  firestore: Firestore,
  now: number,
): Promise<ExpiredGrant[]> => {
  const docs = await expirePages(firestore, now);
  const grants = Array.from(
    new Map(
      docs.map((doc) => [
        `${toUid(doc)}|${String(doc.get('grantId'))}`,
        { uid: toUid(doc), grantId: String(doc.get('grantId')) },
      ]),
    ).values(),
  );
  return Promise.all(
    grants.map(async ({ uid, grantId }) => ({
      uid,
      grantId,
      remainingKept: (
        await toCategoryDocs(firestore, uid, grantId, null)
      ).filter((doc) => doc.get('deleteAfter') !== null).length,
    })),
  );
};

export const createHelmSink = (): ReaderSink => ({
  secrets: [HELM_MASTER_KEYS],
  keptCopyDays: KEPT_COPY_DAYS,
  openSession: (firestore, uid) => new HelmSinkSession(firestore, uid),
  expire,
});
