import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { ModelProvider } from '../../ai/modelProvider.js';
import type { SealedPayload } from '../../appKeys/seal.js';
import { createAnthropicProvider } from '../../ai/providers/anthropic.js';
import { isRunningInEmulator } from '../../emulator.js';
import { reserveAiCall } from './aiLimits.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import { openForHelm, sealForHelm, unwrapHelmKey } from './helmKey.js';
import { ANTHROPIC_API_KEY, loadKeyringOrFail } from './sortHelmCapture.js';
import {
  MAX_STYLE_SAMPLES,
  MIN_STYLE_SAMPLES,
  STYLE_LEARNER_PROMPT,
  SUBMIT_STYLE_TOOL,
  buildStyleMessage,
  createStyleFixtureProvider,
  mergeStyle,
  readStyleReply,
  toStyleWords,
} from './styleLearner.js';
import { askTopicModel } from './topicModel.js';

if (getApps().length === 0) {
  initializeApp();
}

const STYLE_LIMITS = { maxTurns: 2, maxToolCalls: 0, maxMillis: 45_000 };

export interface LearnStyleResult {
  status: 'learned' | 'notEnough' | 'busy';
  traitCount: number;
}

const readApiKey = () => {
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

const pickStyleProvider = (): ModelProvider | null => {
  const apiKey = readApiKey();
  if (apiKey) return createAnthropicProvider(apiKey);
  return isRunningInEmulator() ? createStyleFixtureProvider() : null;
};

export const learnHelmStyle = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    minInstances: 0,
    timeoutSeconds: 90,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<LearnStyleResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
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
    const styleRef = firestore.doc(`${base}/style/general`);
    const [captures, styleSnap] = await Promise.all([
      firestore
        .collection(`${base}/captures`)
        .where('inputMode', '==', 'typed')
        .orderBy('createdAt', 'desc')
        .limit(MAX_STYLE_SAMPLES)
        .get(),
      styleRef.get(),
    ]);
    const countTraits = (data: FirebaseFirestore.DocumentData | undefined) => {
      try {
        const words = data?.sealed
          ? toStyleWords(openForHelm(key, data.sealed as SealedPayload))
          : null;
        return Object.keys(words?.traits ?? {}).length;
      } catch {
        return 0;
      }
    };
    const samples = captures.docs.flatMap((doc) => {
      try {
        const { text } = openForHelm(key, doc.get('sealed') as SealedPayload);
        return typeof text === 'string' && text.trim() !== ''
          ? [
              {
                text: text.trim(),
                createdAt: Number(doc.get('createdAt') ?? 0),
              },
            ]
          : [];
      } catch {
        return [];
      }
    });
    if (samples.length < MIN_STYLE_SAMPLES) {
      return { status: 'notEnough', traitCount: countTraits(styleSnap.data()) };
    }

    const provider = pickStyleProvider();
    if (!provider) throw new HttpsError('unavailable', 'Try again later.');
    const now = Date.now();
    const held = await reserveAiCall(firestore, uid, now, 'quick');
    if (held) {
      return { status: 'busy', traitCount: countTraits(styleSnap.data()) };
    }
    const texts = samples.map((sample) => sample.text);
    const learned = readStyleReply(
      await askTopicModel(firestore, provider, 'style', {
        system: STYLE_LEARNER_PROMPT,
        message: buildStyleMessage(texts),
        terminalTool: SUBMIT_STYLE_TOOL,
        limits: STYLE_LIMITS,
      }),
      texts,
    );
    if (!learned) {
      logger.warn('helm.style.noReply');
      throw new HttpsError(
        'unavailable',
        "Your writing style couldn't be read just now. Try again later.",
      );
    }
    const throughAt = Math.max(...samples.map((sample) => sample.createdAt));

    const traitCount = await firestore.runTransaction(async (transaction) => {
      const [current, profile] = await Promise.all([
        transaction.get(styleRef),
        transaction.get(firestore.doc(base)),
      ]);
      const data = current.data();
      const existing = data
        ? toStyleWords(openForHelm(key, data.sealed as SealedPayload))
        : null;
      if (data && !existing) throw new Error('styleUnreadable');
      const merged = mergeStyle(
        existing,
        learned,
        typeof data?.personEditedAt === 'number',
      );
      transaction.set(styleRef, {
        scope: 'general',
        audienceWhoId: null,
        learnedFrom: [
          ...new Set([
            ...((data?.learnedFrom as string[] | undefined) ?? []),
            'helmText',
          ]),
        ],
        sampleCount: samples.length,
        personEditedAt:
          typeof data?.personEditedAt === 'number' ? data.personEditedAt : null,
        createdAt: typeof data?.createdAt === 'number' ? data.createdAt : now,
        lastEditedAt: now,
        sealed: sealForHelm(key, { ...merged }),
      });
      if (profile.exists) {
        transaction.update(firestore.doc(base), {
          styleLearnedThroughAt: throughAt,
        });
      }
      return Object.keys(merged.traits).length;
    });
    logger.info('helm.style.learned', {
      samples: samples.length,
      traits: traitCount,
    });
    return { status: 'learned', traitCount };
  },
);
