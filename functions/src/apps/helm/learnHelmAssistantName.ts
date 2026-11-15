import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { ModelProvider } from '../../ai/modelProvider.js';
import { createAnthropicProvider } from '../../ai/providers/anthropic.js';
import { isForcedFixture, isRunningInEmulator } from '../../emulator.js';
import { reserveAiCall } from './aiLimits.js';
import { readAssistantName } from './assistantName.js';
import {
  NAME_VARIANTS_PROMPT,
  SUBMIT_VARIANTS_TOOL,
  createNameVariantsFixtureProvider,
  readNameVariants,
} from './assistantNameVariants.js';
import { ANTHROPIC_API_KEY } from './sortHelmCapture.js';
import { askTopicModel } from './topicModel.js';

if (getApps().length === 0) {
  initializeApp();
}

const VARIANT_LIMITS = { maxTurns: 2, maxToolCalls: 0, maxMillis: 30_000 };

export interface LearnAssistantNameResult {
  status: 'learned' | 'cleared' | 'busy' | 'unchanged';
  count: number;
}

const readApiKey = () => {
  if (isForcedFixture('anthropic')) return '';
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

const pickProvider = (): ModelProvider | null => {
  const apiKey = readApiKey();
  if (apiKey) return createAnthropicProvider(apiKey);
  return isRunningInEmulator() ? createNameVariantsFixtureProvider() : null;
};

/** Asks for the ways a speech recognizer might write the person's saved assistant name and stores the ones that pass code's checks on their profile. */
export const learnHelmAssistantName = onCall(
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
  async (request): Promise<LearnAssistantNameResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const firestore = getFirestore();
    const profileRef = firestore.doc(`apps/helm/users/${uid}`);
    const profile = await profileRef.get();
    if (!profile.exists) return { status: 'unchanged', count: 0 };
    const name = readAssistantName(profile.data()?.assistantName);
    if (!name) {
      await profileRef.update({ assistantNameVariants: null });
      return { status: 'cleared', count: 0 };
    }

    const provider = pickProvider();
    if (!provider) throw new HttpsError('unavailable', 'Try again later.');
    const held = await reserveAiCall(firestore, uid, Date.now(), 'quick');
    if (held) return { status: 'busy', count: 0 };

    const reply = await askTopicModel(firestore, provider, 'quick', {
      system: NAME_VARIANTS_PROMPT,
      message: name,
      terminalTool: SUBMIT_VARIANTS_TOOL,
      limits: VARIANT_LIMITS,
    });
    const variants = readNameVariants(
      (reply as { variants?: unknown } | null)?.variants,
      name,
    );
    if (reply === null) {
      logger.warn('helm.assistantName.noReply');
      throw new HttpsError('unavailable', 'Try again later.');
    }

    const written = await firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(profileRef);
      if (readAssistantName(current.data()?.assistantName) !== name) {
        return false;
      }
      transaction.update(profileRef, {
        assistantNameVariants: variants.length > 0 ? variants : null,
      });
      return true;
    });
    logger.info('helm.assistantName.learned', { count: variants.length });
    return {
      status: written ? 'learned' : 'unchanged',
      count: written ? variants.length : 0,
    };
  },
);
