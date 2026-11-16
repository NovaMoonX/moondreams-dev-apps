import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createAnthropicProvider } from '../../ai/providers/anthropic.js';
import { isForcedFixture, isRunningInEmulator } from '../../emulator.js';
import { reserveAiCall } from './aiLimits.js';
import { readAssistantName } from './assistantName.js';
import { DEFAULT_ASSISTANT_NAME } from './nomos/commands.js';
import { personalityHash, readPersonality } from './nomos/personality.js';
import {
  SUBMIT_REPLIES_TOOL,
  buildFixturePreview,
  buildPreviewMessage,
  buildPreviewSystem,
  readPreviewReplies,
  reusePreview,
} from './nomos/personalityPreview.js';
import { ANTHROPIC_API_KEY } from './sortHelmCapture.js';
import { askTopicModel } from './topicModel.js';

if (getApps().length === 0) {
  initializeApp();
}

const PREVIEW_LIMITS = { maxTurns: 2, maxToolCalls: 0, maxMillis: 30_000 };

export interface PreviewPersonalityResult {
  replies: string[];
  hash: string;
}

const readApiKey = () => {
  if (isForcedFixture('anthropic')) return '';
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

/** Shows how replies would read in a personality: the stored replies when they were made for this very personality, otherwise one quick-model call answering the fixed prompts. Only the closed set of traits ever reaches the model. */
export const previewHelmPersonality = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    minInstances: 0,
    enforceAppCheck: true,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<PreviewPersonalityResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const personality = readPersonality(
      (request.data as { personality?: unknown } | null)?.personality,
      null,
    );
    const hash = personalityHash(personality);
    const firestore = getFirestore();
    const profileRef = firestore.doc(`apps/helm/users/${uid}`);
    const profile = await profileRef.get();
    const reused = reusePreview(profile.get('personalityPreview'), personality);
    if (reused) return { replies: reused, hash };

    const apiKey = readApiKey();
    const isFixture = !apiKey && isRunningInEmulator();
    if (!apiKey && !isFixture)
      throw new HttpsError('unavailable', 'Try again later.');
    if (!isFixture) {
      const held = await reserveAiCall(firestore, uid, Date.now(), 'quick');
      if (held) throw new HttpsError('resource-exhausted', 'Try again later.');
    }
    const replies = isFixture
      ? readPreviewReplies(buildFixturePreview(personality))
      : readPreviewReplies(
          (
            (await askTopicModel(
              firestore,
              createAnthropicProvider(apiKey),
              'quick',
              {
                system: buildPreviewSystem(
                  readAssistantName(profile.get('assistantName')) ??
                    DEFAULT_ASSISTANT_NAME,
                  personality,
                ),
                message: buildPreviewMessage(),
                terminalTool: SUBMIT_REPLIES_TOOL,
                limits: PREVIEW_LIMITS,
              },
            )) as { replies?: unknown } | null
          )?.replies,
        );
    if (replies === null) {
      logger.warn('helm.personalityPreview.noReply');
      throw new HttpsError('unavailable', 'Try again later.');
    }
    if (profile.exists)
      await profileRef.update({
        personalityPreview: { hash, replies, at: Date.now() },
      });
    return { replies, hash };
  },
);
