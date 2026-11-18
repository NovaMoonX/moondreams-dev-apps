import { createHash, createHmac, hkdfSync } from 'node:crypto';

import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
  WriteBatch,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

import type { SealedPayload } from '../../../appKeys/seal.js';
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
import { readGrant } from '../../../connections/grants.js';
import { HELM_MASTER_KEYS, loadHelmKeyring } from '../getHelmKey.js';
import { nextReflectionAt } from '../nomos/planObservations.js';
import { toKnownZone } from '../nomos/spoken.js';
import { RELATE_SYNCED_CATEGORIES } from '../reflection/relate/relateRuns.js';
import {
  openForHelm,
  sealForHelm,
  unwrapHelmKey,
  type HelmKey,
} from '../helmKey.js';
import {
  chunk,
  deletePictures,
  readFailedSource,
  readPictureSource,
  readStoredPicture,
  sweepOrphanPictures,
  syncPicture,
  type PictureBucket,
} from './syncedPictures.js';

export const KEPT_COPY_DAYS = 90;
export const TRANSFORM_VERSION = 2;
export const MAX_COPIES_PER_CATEGORY = MAX_RECORDS_PER_CATEGORY;
const DAY_MS = 86_400_000;
const BATCH_SIZE = 400;
const READ_CHUNK = 300;
const HASH_INFO = 'helm-sync-content';
const DETAIL_LIMIT = 500;
const PICTURE_PARALLEL = 5;

const defaultBucket = () => getStorage().bucket() as PictureBucket;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
  // An all-day end is its last day, so it ends a day later.
  const last = endAt ?? dueAt ?? startAt;
  return last === null ? null : last + (data.isAllDay === true ? DAY_MS : 0);
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

/** The ids of the documents that name a sealed picture copy. */
const toPictureIds = (
  docs: { id: string; get: (field: string) => unknown }[],
) =>
  docs
    .filter((doc) => readStoredPicture(doc.get('picture')) !== null)
    .map((doc) => doc.id);

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
  private readonly ownCounts = new Map<string, number>();

  constructor(
    private readonly firestore: Firestore,
    private readonly uid: string,
    private readonly bucket: () => PictureBucket,
  ) {}

  /** The copies' objects go before their records, so a failed delete leaves the record to name them on the next run. */
  private async dropPictures(
    docs: { id: string; get: (field: string) => unknown }[],
  ) {
    const ids = toPictureIds(docs);
    if (ids.length > 0) await deletePictures(this.bucket(), this.uid, ids);
  }

  private sweepPictures() {
    return sweepOrphanPictures(this.bucket(), this.firestore, this.uid);
  }

  private async isStillWanted(grantId: string, category: string) {
    const grant = readGrant(
      (
        await this.firestore
          .doc(`connections/${this.uid}/grants/${grantId}`)
          .get()
      ).data(),
    );
    return (
      grant.status !== 'ended' && grant.categories[category]?.isOn === true
    );
  }

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

  private async markRelateDue(now: number) {
    const ref = this.firestore.doc(`apps/helm/users/${this.uid}`);
    await this.firestore.runTransaction(async (transaction) => {
      const profile = await transaction.get(ref);
      if (
        !profile.exists ||
        profile.get('isLearningOn') === false ||
        (profile.get('relateDueAt') ?? null) !== null
      )
        return;
      transaction.update(ref, {
        relateDueAt: nextReflectionAt(
          now,
          toKnownZone(String(profile.get('timeZone') ?? 'UTC')),
        ),
      });
    });
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
    const countKey = `${grantId}|${category}`;
    const isOwn = (record: SharedRecord) =>
      typeof record.extra.siteRef === 'string';
    const ownBefore = this.ownCounts.get(countKey) ?? 0;
    const room = Math.max(0, MAX_COPIES_PER_CATEGORY - (seen.size - ownBefore));
    const inWindow = records.filter(
      (record) => !hasEndedBefore(record, windowStart),
    );
    const kept = [
      ...[
        ...inWindow
          .filter((record) => record.kind === 'event' && !isOwn(record))
          .sort((a, b) => toAnchor(a) - toAnchor(b)),
        ...inWindow
          .filter((record) => record.kind !== 'event')
          .sort((a, b) => toAnchor(b) - toAnchor(a)),
      ].slice(0, room),
      ...inWindow.filter((record) => record.kind === 'event' && isOwn(record)),
    ];
    if (kept.length === 0) return;

    const key = await this.openKey();
    const subkey = hashSubkey(key);
    const toPictureHash = (version: string) =>
      createHmac('sha256', subkey).update(`picture|${version}`).digest('hex');
    const entries = kept.map((original) => {
      const { photoPath, ...extra } = original.extra;
      const record = { ...original, extra };
      const deepLink = args.deepLink(record.sourceRef);
      return {
        record,
        photoSource:
          record.kind === 'pet'
            ? readPictureSource(connectorId, photoPath)
            : null,
        deepLink,
        id: toSyncedId(grantId, category, record.sourceRef),
        hash: toContentHash(subkey, record, deepLink),
      };
    });
    const ownNew = entries.filter(
      (entry) => isOwn(entry.record) && !seen.has(entry.id),
    ).length;
    this.ownCounts.set(countKey, ownBefore + ownNew);
    entries.forEach((entry) => seen.add(entry.id));

    const refs = entries.map((entry) =>
      this.firestore.doc(`${syncedPath(this.uid)}/${entry.id}`),
    );
    const existing = (
      await Promise.all(
        chunk(refs, READ_CHUNK).map((group) => this.firestore.getAll(...group)),
      )
    ).flat();
    const pictures = await chunk(entries, PICTURE_PARALLEL).reduce(
      async (done, group) => {
        const soFar = await done;
        const settled = await Promise.all(
          group.map(async (entry) => {
            const index = soFar.length + group.indexOf(entry);
            const data = existing[index].data();
            const stored = readStoredPicture(data?.picture);
            const failedSource = readFailedSource(data?.pictureFailedSource);
            return entry.record.kind === 'pet' &&
              (entry.photoSource !== null ||
                stored !== null ||
                failedSource !== null)
              ? syncPicture({
                  bucket: this.bucket(),
                  uid: this.uid,
                  id: entry.id,
                  key,
                  sourcePath: entry.photoSource,
                  stored,
                  failedSource,
                  toHash: toPictureHash,
                })
              : { picture: stored, failedSource, isChanged: false };
          }),
        );
        return [...soFar, ...settled];
      },
      Promise.resolve([] as Awaited<ReturnType<typeof syncPicture>>[]),
    );
    const isContentChanged = (
      entry: (typeof entries)[number],
      index: number,
    ) => {
      const stored = existing[index].data();
      return !(
        stored &&
        stored.contentHash === entry.hash &&
        stored.transformVersion === TRANSFORM_VERSION &&
        stored.connectionEndedAt === null
      );
    };
    const changed = entries.flatMap((entry, index) =>
      isContentChanged(entry, index) || pictures[index].isChanged
        ? [
            {
              ...entry,
              picture: pictures[index].picture,
              pictureFailedSource: pictures[index].failedSource,
            },
          ]
        : [],
    );
    const contentChangedCount = entries.filter(isContentChanged).length;

    await chunk(changed, BATCH_SIZE).reduce(async (done, group) => {
      await done;
      const batch = this.firestore.batch();
      group.forEach(
        ({ record, deepLink, id, hash, picture, pictureFailedSource }) =>
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
            helmRef:
              typeof record.extra.siteRef === 'string'
                ? record.extra.siteRef
                : null,
            contentHash: hash,
            syncedAt: now,
            transformVersion: TRANSFORM_VERSION,
            connectionEndedAt: null,
            deleteAfter: null,
            picture,
            pictureFailedSource,
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
    if (
      changed.some((entry) => entry.picture !== null) &&
      !(await this.isStillWanted(grantId, category))
    )
      await deletePictures(
        this.bucket(),
        this.uid,
        changed
          .filter((entry) => entry.picture !== null)
          .map((entry) => entry.id),
      );
    if (
      contentChangedCount > 0 &&
      RELATE_SYNCED_CATEGORIES.some(
        (entry) => entry === `${connectorId}/${category}`,
      )
    )
      await this.markRelateDue(now);
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
    await this.dropPictures(gone);
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
    await this.dropPictures(docs);
    await commitAll(this.firestore, docs, (batch, doc) =>
      batch.delete(doc.ref),
    );
    return docs.length;
  }

  private async deleteAndSweep(grantId: string, category: string | null) {
    const count = await this.deleteWhere(grantId, category, () => true);
    await this.sweepPictures();
    return count;
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
    await this.dropPictures(docs);
    await chunk(docs, BATCH_SIZE).reduce(async (done, group) => {
      await done;
      const batch = this.firestore.batch();
      group.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }, Promise.resolve());
    return docs.length;
  }

  deleteCategory(grantId: string, category: string) {
    return this.deleteAndSweep(grantId, category);
  }

  deleteGrant(grantId: string) {
    return this.deleteAndSweep(grantId, null);
  }

  deleteKept(grantId: string) {
    return this.deleteWhere(
      grantId,
      null,
      (doc) => doc.get('deleteAfter') !== null,
    );
  }

  async blankQuoted(grantId: string, now: number) {
    const [, connectorId, accountId] = grantId.split('__');
    if (!connectorId || !accountId) return;
    const snapshot = await this.firestore
      .collection(`apps/helm/users/${this.uid}/captures`)
      .where(
        'quotedSourceKeys',
        'array-contains',
        `${connectorId}|${accountId}`,
      )
      .get();
    if (snapshot.empty) return;
    const key = await this.openKey();
    const isQuoteOfIt = (quote: unknown) =>
      isRecord(quote) &&
      quote.connectorId === connectorId &&
      quote.accountId === accountId;
    const blanked = snapshot.docs.flatMap((doc) => {
      try {
        const opened = openForHelm(key, doc.get('sealed') as SealedPayload);
        const answer = opened.answer;
        if (!isRecord(answer) || !Array.isArray(answer.quotes)) return [];
        if (!answer.quotes.some(isQuoteOfIt)) return [];
        const quotes = answer.quotes.map((quote: unknown) =>
          isQuoteOfIt(quote)
            ? {
                ...(quote as Record<string, unknown>),
                text: null,
                record: null,
                deepLink: null,
                deletedAt: (quote as Record<string, unknown>).deletedAt ?? now,
              }
            : quote,
        );
        return [
          {
            ref: doc.ref,
            sealed: sealForHelm(key, {
              ...opened,
              answer: { ...answer, quotes },
            }),
          },
        ];
      } catch {
        logger.warn('helm.connections.blankUnreadable');
        return [];
      }
    });
    await chunk(blanked, BATCH_SIZE).reduce(async (done, group) => {
      await done;
      const batch = this.firestore.batch();
      group.forEach((entry) =>
        batch.update(entry.ref, { sealed: entry.sealed }),
      );
      await batch.commit();
    }, Promise.resolve());
  }

  async countKept(grantId: string) {
    return (
      await toCategoryDocs(this.firestore, this.uid, grantId, null)
    ).filter((doc) => doc.get('deleteAfter') !== null).length;
  }

  async keepGrant(grantId: string, endedAt: number, deleteAfter: number) {
    const docs = await toCategoryDocs(this.firestore, this.uid, grantId, null);
    await this.dropPictures(docs);
    await commitAll(this.firestore, docs, (batch, doc) => {
      const stored = doc.get('deleteAfter');
      const isKept = typeof stored === 'number';
      batch.update(doc.ref, {
        picture: null,
        pictureFailedSource: null,
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
  bucket: () => PictureBucket,
): Promise<QueryDocumentSnapshot[]> => {
  const snapshot = await firestore
    .collectionGroup('synced')
    .where('deleteAfter', '<=', now)
    .limit(EXPIRE_LIMIT)
    .get();
  const docs = snapshot.docs.filter(
    (doc) => doc.ref.path.startsWith('apps/helm/users/') && toUid(doc) !== '',
  );
  const results = await Promise.allSettled(
    Array.from(new Set(docs.map(toUid))).map(async (uid) => {
      const ids = toPictureIds(docs.filter((doc) => toUid(doc) === uid));
      if (ids.length > 0) await deletePictures(bucket(), uid, ids);
      return uid;
    }),
  );
  const failed = new Set(
    results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [];
      logger.warn('helm.syncedPicture.expireFailed', {
        cause: result.reason instanceof Error ? result.reason.name : 'error',
      });
      return [Array.from(new Set(docs.map(toUid)))[index]];
    }),
  );
  const expiring = docs.filter((doc) => !failed.has(toUid(doc)));
  await commitAll(firestore, expiring, (batch, doc) => batch.delete(doc.ref));
  if (snapshot.size < EXPIRE_LIMIT || expiring.length === 0) return expiring;
  return [...expiring, ...(await expirePages(firestore, now, bucket))];
};

const expire = async (
  firestore: Firestore,
  now: number,
  bucket: () => PictureBucket,
): Promise<ExpiredGrant[]> => {
  const docs = await expirePages(firestore, now, bucket);
  const sweeps = await Promise.allSettled(
    Array.from(new Set(docs.map(toUid))).map((uid) =>
      sweepOrphanPictures(bucket(), firestore, uid),
    ),
  );
  sweeps.forEach((result) => {
    if (result.status === 'rejected')
      logger.warn('helm.syncedPicture.sweepFailed', {
        cause: result.reason instanceof Error ? result.reason.name : 'error',
      });
  });
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

export const openHelmSession = (
  firestore: Firestore,
  uid: string,
  bucket: () => PictureBucket = defaultBucket,
): SinkSession => new HelmSinkSession(firestore, uid, bucket);

export const createHelmSink = (
  bucket: () => PictureBucket = defaultBucket,
): ReaderSink => ({
  secrets: [HELM_MASTER_KEYS],
  keptCopyDays: KEPT_COPY_DAYS,
  openSession: (firestore, uid) => openHelmSession(firestore, uid, bucket),
  expire: (firestore, now) => expire(firestore, now, bucket),
});
