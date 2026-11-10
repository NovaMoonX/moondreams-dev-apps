import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { gcmEncrypt } from '../../appKeys/gcm.js';
import type { SealedPayload } from '../../appKeys/seal.js';
import { GoogleHttpError } from '../../connections/google/client.js';
import {
  MAX_BATCH,
  isContactRef,
  readContactPhoto,
  readContacts,
} from '../../connections/google/contacts.js';
import {
  GOOGLE_SECRETS,
  ReconnectNeeded,
  getGoogleAccessToken,
} from '../../connections/tokens.js';
import { toWebpCopy } from '../../share/imageCopies.js';
import { toGrantId } from '../../vendor/connectionsContract.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import { openForHelm, sealForHelm, unwrapHelmKey } from './helmKey.js';
import {
  buildImportExecution,
  buildImportSummary,
  buildImportWrites,
  createDigest,
  planContactImport,
  planContactUpdate,
  type ExistingWho,
  type ImportedFrom,
  type PhotoSeal,
} from './nomos/contactImport.js';
import { loadKeyringOrFail } from './sortHelmCapture.js';

if (getApps().length === 0) {
  initializeApp();
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const PHOTO_SIZE = 512;
const THUMB_SIZE = 256;
const PHOTO_CHUNK = 8;

interface ImportResult {
  executionId: string | null;
  brought: number;
  filled: number;
  alreadyIn: number;
  summary: string | null;
}

type Request =
  | { kind: 'import'; accountId: string; resourceNames: string[] }
  | { kind: 'update'; whoId: string };

const invalid = () =>
  new HttpsError('invalid-argument', "That request wasn't understood.");

const readInput = (data: unknown): Request => {
  const raw = (data ?? {}) as Record<string, unknown>;
  const { accountId, resourceNames, whoId } = raw;
  if (typeof whoId === 'string' && resourceNames === undefined) {
    if (!ID_RE.test(whoId)) throw invalid();
    return { kind: 'update', whoId };
  }
  if (
    typeof accountId !== 'string' ||
    !ID_RE.test(accountId) ||
    !Array.isArray(resourceNames) ||
    resourceNames.length === 0 ||
    resourceNames.length > MAX_BATCH ||
    !resourceNames.every(
      (name): name is string => typeof name === 'string' && isContactRef(name),
    )
  )
    throw invalid();
  return { kind: 'import', accountId, resourceNames };
};

const reconnect = () =>
  new HttpsError('failed-precondition', 'Reconnect Google to continue.', {
    reason: 'reconnect',
  });

const readImportedFrom = (value: unknown): ImportedFrom | null => {
  const from = (value ?? null) as Record<string, unknown> | null;
  return from &&
    from.connectorId === 'google:contacts' &&
    typeof from.accountId === 'string' &&
    typeof from.resourceName === 'string' &&
    typeof from.importedAt === 'number'
    ? {
        connectorId: 'google:contacts',
        accountId: from.accountId,
        resourceName: from.resourceName,
        importedAt: from.importedAt,
      }
    : null;
};

const text = (value: unknown) => (typeof value === 'string' ? value : null);

const toExisting = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  key: Parameters<typeof openForHelm>[0],
): ExistingWho | null => {
  const data = snapshot.data();
  if (!data || !data.sealed) return null;
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    const name = text(words.name);
    const kind = data.kind;
    if (
      name === null ||
      (kind !== 'person' && kind !== 'pet' && kind !== 'organization')
    )
      return null;
    return {
      id: snapshot.id,
      kind,
      isSelf: data.isSelf === true,
      name,
      aliases: Array.isArray(words.aliases)
        ? words.aliases.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : [],
      email: text(words.email),
      phone: text(words.phone),
      photoMediaId: text(data.photoMediaId),
      mediaIds: Array.isArray(data.mediaIds)
        ? data.mediaIds.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : [],
      importedFrom: readImportedFrom(data.importedFrom),
      importedFields:
        data.importedFields && typeof data.importedFields === 'object'
          ? (data.importedFields as Record<string, string>)
          : {},
      lastMentionedAt:
        typeof data.lastMentionedAt === 'number' ? data.lastMentionedAt : null,
      sealed: words,
      sealedNonce: (data.sealed as SealedPayload).nonce,
    };
  } catch {
    return null;
  }
};

const mediaPath = (uid: string, mediaId: string, isThumb: boolean) =>
  `apps/helm/media/${uid}/${mediaId}${isThumb ? '.thumb' : ''}`;

const toSealedObject = (key: Buffer, bytes: Buffer) => {
  const { ciphertext, nonce } = gcmEncrypt(key, bytes, null);
  return { bytes: Buffer.from(ciphertext, 'base64'), nonce };
};

const inChunks = async <T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> =>
  items.reduce<Promise<R[]>>(
    async (done, _item, index) =>
      index % size === 0
        ? [
            ...(await done),
            ...(await Promise.all(items.slice(index, index + size).map(run))),
          ]
        : done,
    Promise.resolve([]),
  );

const assertGrantLive = async (
  firestore: Firestore,
  uid: string,
  accountId: string,
) => {
  const grant = await firestore
    .doc(
      `connections/${uid}/grants/${toGrantId('helm', 'google:contacts', accountId)}`,
    )
    .get();
  if (!grant.exists || grant.get('categories.contacts.isOn') !== true)
    throw new HttpsError(
      'failed-precondition',
      'Connect Google Contacts first.',
      { reason: 'notConnected' },
    );
  if (grant.get('status') !== 'live') throw reconnect();
};

export const importHelmContacts = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    minInstances: 0,
    timeoutSeconds: 120,
    memory: '512MiB',
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS, ...GOOGLE_SECRETS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<ImportResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const input = readInput(request.data);
    const firestore = getFirestore();
    const base = `apps/helm/users/${uid}`;
    const key = await unwrapHelmKey(firestore, loadKeyringOrFail(), uid).catch(
      () => {
        throw new HttpsError(
          'failed-precondition',
          "Helm can't open your things right now.",
        );
      },
    );
    const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);
    const digest = createDigest(key.key);

    const target =
      input.kind === 'update'
        ? await firestore.doc(`${base}/who/${input.whoId}`).get()
        : null;
    const targetWho = target ? toExisting(target, key) : null;
    if (input.kind === 'update' && !targetWho?.importedFrom)
      throw new HttpsError(
        'failed-precondition',
        'That person was not brought in from Google.',
        {
          reason: 'notImported',
        },
      );
    const accountId =
      input.kind === 'import'
        ? input.accountId
        : (targetWho?.importedFrom?.accountId ?? '');
    const requested =
      input.kind === 'import'
        ? input.resourceNames
        : [targetWho?.importedFrom?.resourceName ?? ''];

    await assertGrantLive(firestore, uid, accountId);
    const account = await firestore
      .doc(`connections/${uid}/accounts/${accountId}`)
      .get();
    const email = text(account.get('email'));
    const token = await getGoogleAccessToken(firestore, uid, accountId).catch(
      (error: unknown) => {
        throw error instanceof ReconnectNeeded
          ? reconnect()
          : new HttpsError(
              'unavailable',
              "Google couldn't be reached. Try again.",
            );
      },
    );
    const fetched = await readContacts(token, email, requested).catch(
      (error: unknown) => {
        throw error instanceof GoogleHttpError &&
          (error.status === 401 || error.status === 403)
          ? reconnect()
          : new HttpsError(
              'unavailable',
              "Google couldn't be reached. Try again.",
            );
      },
    );
    const now = Date.now();
    const newId = (collection: 'who' | 'media') =>
      firestore.collection(`${base}/${collection}`).doc().id;

    const planned =
      input.kind === 'update' && targetWho
        ? (() => {
            const contact = fetched[0];
            if (!contact)
              throw new HttpsError(
                'not-found',
                "That contact isn't in Google Contacts anymore.",
                { reason: 'goneAtGoogle' },
              );
            const change = planContactUpdate({
              contact,
              who: targetWho,
              digest,
              newId,
            });
            return {
              changes: change ? [change] : [],
              alreadyIn: change ? 0 : 1,
            };
          })()
        : planContactImport({
            requested,
            fetched,
            existing: (
              await firestore.collection(`${base}/who`).get()
            ).docs.flatMap((snapshot) => toExisting(snapshot, key) ?? []),
            newId,
          });
    const { changes } = planned;
    const empty: ImportResult = {
      executionId: null,
      brought: 0,
      filled: 0,
      alreadyIn: planned.alreadyIn,
      summary: null,
    };
    if (changes.length === 0) return empty;

    const bucket = getStorage().bucket();
    const photoResults = await inChunks(
      changes.flatMap((change) => (change.photo ? [change.photo] : [])),
      PHOTO_CHUNK,
      async (photo): Promise<[string, PhotoSeal] | null> => {
        const original = await readContactPhoto(token, email, photo.url);
        if (!original) return null;
        try {
          const [main, thumb] = await Promise.all([
            toWebpCopy(Buffer.from(original), PHOTO_SIZE),
            toWebpCopy(Buffer.from(original), THUMB_SIZE),
          ]);
          const sealedMain = toSealedObject(key.key, main);
          const sealedThumb = toSealedObject(key.key, thumb);
          await Promise.all([
            bucket
              .file(mediaPath(uid, photo.mediaId, false))
              .save(sealedMain.bytes, {
                contentType: 'application/octet-stream',
              }),
            bucket
              .file(mediaPath(uid, photo.mediaId, true))
              .save(sealedThumb.bytes, {
                contentType: 'application/octet-stream',
              }),
          ]);
          return [
            photo.mediaId,
            { bytesNonce: sealedMain.nonce, thumbNonce: sealedThumb.nonce },
          ];
        } catch {
          return null;
        }
      },
    );
    const photos = new Map(
      photoResults.flatMap((entry) => (entry ? [entry] : [])),
    );
    const uploadedPaths = [...photos.keys()].flatMap((id) => [
      mediaPath(uid, id, false),
      mediaPath(uid, id, true),
    ]);
    const letGo = () =>
      Promise.allSettled(
        uploadedPaths.map((path) =>
          bucket.file(path).delete({ ignoreNotFound: true }),
        ),
      );

    const executionRef = firestore.collection(`${base}/executions`).doc();
    const writes = buildImportWrites({
      changes,
      photos,
      accountId,
      now,
      executionId: executionRef.id,
      keyId: key.keyId,
      digest,
      seal,
    });
    const filled = changes.length - writes.createdCount;
    const summary = buildImportSummary({
      created: writes.createdCount,
      filled,
      updatedName: input.kind === 'update' ? (targetWho?.name ?? null) : null,
    });
    const before = new Map(
      changes.flatMap((change) =>
        change.before ? [[change.id, change.before] as const] : [],
      ),
    );
    try {
      await firestore.runTransaction(async (transaction) => {
        const current = await Promise.all(
          [...before.keys()].map((id) =>
            transaction.get(firestore.doc(`${base}/who/${id}`)),
          ),
        );
        const isChanged = current.some(
          (snapshot) =>
            !snapshot.exists ||
            (snapshot.get('sealed') as SealedPayload).nonce !==
              before.get(snapshot.id)?.sealedNonce,
        );
        if (isChanged)
          throw new HttpsError('aborted', 'That person changed. Try again.');
        writes.whoCreates.forEach(({ id, data }) =>
          transaction.create(firestore.doc(`${base}/who/${id}`), data),
        );
        writes.whoUpdates.forEach(({ id, data }) =>
          transaction.update(firestore.doc(`${base}/who/${id}`), data),
        );
        writes.media.forEach(({ id, data }) =>
          transaction.create(firestore.doc(`${base}/media/${id}`), data),
        );
        transaction.create(
          executionRef,
          buildImportExecution({ writes, summary, now, seal }),
        );
      });
    } catch (error) {
      await letGo();
      if (error instanceof HttpsError) throw error;
      logger.error('helm.contacts.writeFailed');
      throw new HttpsError('internal', "That couldn't be saved. Try again.");
    }
    logger.info('helm.contacts.imported', {
      created: writes.createdCount,
      filled,
      photos: photos.size,
    });
    return {
      executionId: executionRef.id,
      brought: writes.createdCount,
      filled,
      alreadyIn: planned.alreadyIn,
      summary,
    };
  },
);
