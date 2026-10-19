import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  copyCoverFile,
  describeError,
  removeShareFiles,
  shareRef,
  shareSnapshotRef,
} from './pinchShareStore.js';
import {
  SHARE_LIMITS,
  getCopyRecipes,
  isRecord,
  isShareId,
  isSourceId,
  kitchenCoverPath,
  mintShareId,
  readStoredCopy,
  shareCoverPath,
  toCoverRefs,
  toCoveredCopy,
  toSharedMeal,
  toSharedRecipe,
  type ShareCoverRef,
  type ShareKind,
  type SharedCopy,
} from './pinchShareView.js';

interface ChangeInput {
  kind: ShareKind;
  sourceId: string;
  copy: SharedCopy;
  covers: ShareCoverRef[];
  sourceUpdatedAt: number;
}

interface OwnShare {
  id: string;
  kind: ShareKind;
  data: DocumentData;
}

const notFound = () =>
  new HttpsError(
    'not-found',
    "We couldn't find this link. It may already have been stopped.",
  );

function readInput(data: Record<string, unknown>): ChangeInput {
  const kind =
    data.kind === 'RECIPE' || data.kind === 'MEAL' ? data.kind : null;
  if (kind === null || !isSourceId(data.sourceId)) {
    throw new HttpsError(
      'invalid-argument',
      'Say which recipe or meal to share.',
    );
  }

  const recipe = kind === 'RECIPE' ? toSharedRecipe(data.recipe) : null;
  const meal = kind === 'MEAL' ? toSharedMeal(data.meal) : null;
  if (recipe === null && meal === null) {
    throw new HttpsError(
      'invalid-argument',
      kind === 'RECIPE'
        ? "This recipe can't be shared yet. It needs a title and at least one ingredient or step."
        : `This meal can't be shared. It needs a name and at least one item, and holds up to ${SHARE_LIMITS.MAX_SHARED_MEAL_RECIPES} recipes and ${SHARE_LIMITS.MAX_SHARED_MEAL_LINES} ingredient lines in all.`,
    );
  }

  const covers = toCoverRefs(
    data.covers,
    recipe === null ? (meal?.recipes.length ?? 0) : 1,
  );
  const sourceUpdatedAt = data.sourceUpdatedAt;
  if (
    covers === null ||
    typeof sourceUpdatedAt !== 'number' ||
    !Number.isSafeInteger(sourceUpdatedAt) ||
    sourceUpdatedAt < 0
  ) {
    throw new HttpsError(
      'invalid-argument',
      'The pictures or the time sent with this share are not valid.',
    );
  }

  const result: ChangeInput = {
    kind,
    sourceId: data.sourceId,
    copy: { recipe, meal },
    covers,
    sourceUpdatedAt,
  };
  return result;
}

/** One answer for a share that is missing, someone else's or malformed. */
async function readOwnShare(uid: string, shareId: unknown): Promise<OwnShare> {
  if (!isShareId(shareId)) {
    throw notFound();
  }

  const share = await shareRef(shareId).get();
  const kind = share.get('kind');
  if (
    !share.exists ||
    share.get('ownerUid') !== uid ||
    (kind !== 'RECIPE' && kind !== 'MEAL')
  ) {
    throw notFound();
  }

  return { id: shareId, kind, data: share.data() ?? {} };
}

async function findOwnShare(
  uid: string,
  input: ChangeInput,
): Promise<OwnShare | null> {
  const found = await getFirestore()
    .collection('apps/pinch/shares')
    .where('ownerUid', '==', uid)
    .where('sourceId', '==', input.sourceId)
    .get();
  const match = found.docs.find((doc) => doc.get('kind') === input.kind);
  return match ? { id: match.id, kind: input.kind, data: match.data() } : null;
}

async function copyCovers(
  uid: string,
  shareId: string,
  covers: ShareCoverRef[],
) {
  const copied = await Promise.all(
    covers.map(async ({ index, recipeId }) => {
      const isCopied = await copyCoverFile(
        kitchenCoverPath(uid, recipeId),
        shareCoverPath(shareId, index),
        shareId,
      );
      return isCopied ? index : null;
    }),
  );
  return new Set(copied.filter((index) => index !== null));
}

const getTitle = (copy: SharedCopy) =>
  copy.recipe?.title ?? copy.meal?.name ?? '';

async function removeShareFilesQuietly(
  shareId: string,
  keep: ReadonlySet<string> = new Set(),
) {
  await removeShareFiles(shareId, keep).catch((error) =>
    console.error('pinch share file cleanup failed', {
      share: shareId.slice(0, 4),
      code: describeError(error),
    }),
  );
}

async function updateShare(uid: string, share: OwnShare, input: ChangeInput) {
  const covered = await copyCovers(uid, share.id, input.covers);
  const copy = toCoveredCopy(input.copy, covered);
  const now = Date.now();
  const ref = shareRef(share.id);
  const outcome = await getFirestore().runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists || current.get('ownerUid') !== uid) {
      return 'gone';
    }

    transaction.update(ref, {
      title: getTitle(copy),
      sourceUpdatedAt: input.sourceUpdatedAt,
      updatedAt: now,
    });
    transaction.update(shareSnapshotRef(share.id), {
      recipe: copy.recipe,
      meal: copy.meal,
      updatedAt: now,
    });
    return 'done';
  });
  if (outcome === 'gone') {
    await removeShareFilesQuietly(share.id);
    throw notFound();
  }

  await removeShareFilesQuietly(
    share.id,
    new Set([...covered].map((index) => shareCoverPath(share.id, index))),
  );
  return { shareId: share.id };
}

async function createShare(uid: string, input: ChangeInput) {
  const existing = await findOwnShare(uid, input);
  if (existing) {
    return updateShare(uid, existing, input);
  }

  // Two creates at the same moment can both read a count just under the cap and both write, so one link past it is possible.
  const counted = await getFirestore()
    .collection('apps/pinch/shares')
    .where('ownerUid', '==', uid)
    .count()
    .get();
  if (counted.data().count >= SHARE_LIMITS.MAX_PINCH_SHARES) {
    throw new HttpsError(
      'resource-exhausted',
      `You're sharing ${SHARE_LIMITS.MAX_PINCH_SHARES} things already. Stop sharing one to make room for another.`,
    );
  }

  const shareId = mintShareId();
  const covered = await copyCovers(uid, shareId, input.covers);
  const copy = toCoveredCopy(input.copy, covered);
  const now = Date.now();
  const batch = getFirestore().batch();
  batch.create(shareRef(shareId), {
    id: shareId,
    ownerUid: uid,
    kind: input.kind,
    sourceId: input.sourceId,
    title: getTitle(copy),
    sourceUpdatedAt: input.sourceUpdatedAt,
    createdAt: now,
    updatedAt: now,
  });
  batch.create(shareSnapshotRef(shareId), {
    id: shareId,
    kind: input.kind,
    recipe: copy.recipe,
    meal: copy.meal,
    updatedAt: now,
  });
  try {
    await batch.commit();
  } catch (error) {
    await removeShareFilesQuietly(shareId);
    throw error;
  }

  return { shareId };
}

/** Covers first, then the two documents: the address stops working only once nothing is left behind it. */
async function endShare(shareId: string) {
  await removeShareFiles(shareId);
  const batch = getFirestore().batch();
  batch.delete(shareRef(shareId));
  batch.delete(shareSnapshotRef(shareId));
  await batch.commit();
}

/** The new link is written before the old one is ended, so there is never a moment with no valid link; a failure to end the old one takes the new one back. */
async function renewShare(uid: string, requestedId: unknown) {
  const old = await readOwnShare(uid, requestedId);
  const oldSnapshot = await shareSnapshotRef(old.id).get();
  const stored = readStoredCopy(old.kind, oldSnapshot.data());
  if (stored === null) {
    throw notFound();
  }

  const newId = mintShareId();
  const copied = await Promise.all(
    getCopyRecipes(stored).map(async (recipe, index) => {
      const isCopied =
        recipe.hasCover &&
        (await copyCoverFile(
          shareCoverPath(old.id, index),
          shareCoverPath(newId, index),
          newId,
        ));
      return isCopied ? index : null;
    }),
  );
  const copy = toCoveredCopy(
    stored,
    new Set(copied.filter((index) => index !== null)),
  );
  const batch = getFirestore().batch();
  batch.create(shareRef(newId), {
    id: newId,
    ownerUid: uid,
    kind: old.kind,
    sourceId: old.data.sourceId,
    title: getTitle(copy),
    sourceUpdatedAt: old.data.sourceUpdatedAt,
    createdAt: old.data.createdAt,
    updatedAt: old.data.updatedAt,
  });
  batch.create(shareSnapshotRef(newId), {
    id: newId,
    kind: old.kind,
    recipe: copy.recipe,
    meal: copy.meal,
    updatedAt: old.data.updatedAt,
  });
  try {
    await batch.commit();
  } catch (error) {
    await removeShareFilesQuietly(newId);
    throw error;
  }

  try {
    await endShare(old.id);
  } catch (error) {
    await endShare(newId).catch(() => undefined);
    throw error;
  }

  return { shareId: newId };
}

/** Someone else's share and a missing one answer alike, so ids can't be probed through a delete. */
async function deleteShare(uid: string, shareId: unknown) {
  if (!isShareId(shareId)) {
    return { shareId: null };
  }

  const share = await shareRef(shareId).get();
  if (!share.exists || share.get('ownerUid') !== uid) {
    return { shareId: null };
  }

  await endShare(shareId);
  return { shareId: null };
}

export const changePinchShare = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 30,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to share a recipe or a meal.',
      );
    }

    const data = isRecord(request.data) ? request.data : {};
    if (data.action === 'create') {
      return createShare(uid, readInput(data));
    }
    if (data.action === 'update') {
      const input = readInput(data);
      const share = await readOwnShare(uid, data.shareId);
      if (share.kind !== input.kind) {
        throw new HttpsError(
          'invalid-argument',
          'This link is for a different kind of share.',
        );
      }

      return updateShare(uid, share, input);
    }
    if (data.action === 'renew') {
      return renewShare(uid, data.shareId);
    }
    if (data.action === 'delete') {
      return deleteShare(uid, data.shareId);
    }

    throw new HttpsError(
      'invalid-argument',
      'Choose what to do with this share.',
    );
  },
);
