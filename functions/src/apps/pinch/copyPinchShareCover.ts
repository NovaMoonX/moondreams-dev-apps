import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { copyCoverFile, shareSnapshotRef } from './pinchShareStore.js';
import {
  SHARE_LIMITS,
  getCopyRecipes,
  isRecord,
  isRecipeId,
  isShareId,
  kitchenCoverPath,
  readStoredCopy,
  shareCoverPath,
} from './pinchShareView.js';

interface CoverResult {
  coverPath: string | null;
}

export const copyPinchShareCover = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 15,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<CoverResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to save a shared recipe.',
      );
    }

    const data = isRecord(request.data) ? request.data : {};
    const { shareId, index, recipeId } = data;
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= SHARE_LIMITS.MAX_SHARED_MEAL_RECIPES ||
      !isRecipeId(recipeId)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Say which recipe the picture is for.',
      );
    }

    if (!isShareId(shareId)) {
      return { coverPath: null };
    }

    const snapshot = await shareSnapshotRef(shareId).get();
    const stored = readStoredCopy(snapshot.get('kind'), snapshot.data());
    const hasCover =
      stored !== null && getCopyRecipes(stored)[index]?.hasCover === true;
    if (!hasCover) {
      return { coverPath: null };
    }

    const recipe = await getFirestore()
      .doc(`apps/pinch/kitchens/${uid}/recipes/${recipeId}`)
      .get();
    const hasPicture =
      (recipe.get('coverPath') ?? null) !== null ||
      (recipe.get('coverUrl') ?? null) !== null;
    if (!recipe.exists || hasPicture) {
      return { coverPath: null };
    }

    const coverPath = kitchenCoverPath(uid, recipeId);
    const isCopied = await copyCoverFile(
      shareCoverPath(shareId, index),
      coverPath,
      shareId,
    );
    return { coverPath: isCopied ? coverPath : null };
  },
);
