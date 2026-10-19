import { onCall } from 'firebase-functions/v2/https';

import { shareRef, shareSnapshotRef } from './pinchShareStore.js';
import {
  isRecord,
  isShareId,
  toShareResult,
  type ShareResult,
} from './pinchShareView.js';

export const getPinchShare = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 15,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<ShareResult> => {
    const shareId = isRecord(request.data) ? request.data.shareId : null;
    if (!isShareId(shareId)) {
      return { status: 'not_found' };
    }

    const [share, snapshot] = await Promise.all([
      shareRef(shareId).get(),
      shareSnapshotRef(shareId).get(),
    ]);
    return toShareResult(share.data(), snapshot.data(), request.auth?.uid);
  },
);
