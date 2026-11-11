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
  mergeLearned,
  toMailBatches,
  toMailGroups,
  createStyleFixtureProvider,
  mergeStyle,
  readStyleReply,
  toStyleWords,
  type MailGroup,
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

const STYLE_CALLABLE = {
  region: 'us-central1',
  maxInstances: 5,
  minInstances: 0,
  enforceAppCheck: true,
  secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
  cors: [
    'https://apps.moondreams.dev',
    /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
  ],
};

export const learnHelmStyle = onCall(
  { ...STYLE_CALLABLE, timeoutSeconds: 90 },
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
          "Your things can't be opened right now.",
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
    if (learned.traits.length === 0 && learned.avoid.length === 0) {
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
      const readExisting = () => {
        try {
          return data
            ? toStyleWords(openForHelm(key, data.sealed as SealedPayload))
            : null;
        } catch {
          return null;
        }
      };
      const existing = readExisting();
      if (data && !existing) {
        logger.error('helm.style.unreadable', { uid });
        throw new HttpsError(
          'failed-precondition',
          "Your style notes can't be opened right now, so they were left as they are.",
        );
      }
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

export interface LearnMailStyleResult {
  status: 'learned' | 'notEnough' | 'busy';
  groups: number;
}

const MAX_SENT_MAIL = 300;
const MIN_SENT_MAIL = 10;
const MAIL_STYLE_BATCH_LIMITS = { ...STYLE_LIMITS, maxMillis: 60_000 };

const MAIL_LABELS: Record<string, string> = {
  'mail-work': 'Work email',
  'mail-personal': 'Personal email',
};

const readWhoAddresses = async (
  firestore: FirebaseFirestore.Firestore,
  base: string,
  key: Parameters<typeof openForHelm>[0],
) => {
  const snapshot = await firestore.collection(`${base}/who`).get();
  return snapshot.docs.flatMap((doc) => {
    if (doc.get('isSelf') === true || !doc.get('sealed')) return [];
    try {
      const words = openForHelm(key, doc.get('sealed') as SealedPayload);
      const { name, email } = words;
      return typeof name === 'string' &&
        typeof email === 'string' &&
        email.trim() !== ''
        ? [{ whoId: doc.id, name, address: email.trim().toLowerCase() }]
        : [];
    } catch {
      return [];
    }
  });
};

export const learnHelmMailStyle = onCall(
  { ...STYLE_CALLABLE, timeoutSeconds: 180 },
  async (request): Promise<LearnMailStyleResult> => {
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
          "Your things can't be opened right now.",
          { reason: 'noKey' },
        );
      },
    );
    const { listLiveGrants, withLiveAccess } =
      await import('../../connections/liveRouter.js');
    const { listSentMail } = await import('../../connections/google/gmail.js');
    const grant = (await listLiveGrants(firestore, uid, 'helm')).find(
      (entry) => entry.connectorId === 'google:gmail',
    );
    if (!grant) {
      throw new HttpsError(
        'failed-precondition',
        'Connect Gmail first, then try again.',
        { reason: 'needsGmail' },
      );
    }
    const provider = pickStyleProvider();
    if (!provider) throw new HttpsError('unavailable', 'Try again later.');

    const read = await withLiveAccess(
      firestore,
      {
        uid,
        readerAppId: 'helm',
        connectorId: grant.connectorId,
        accountId: grant.accountId,
      },
      (token, email) => listSentMail(token, email, { max: MAX_SENT_MAIL }),
    );
    if (!read.ok) {
      throw read.reason === 'failed'
        ? new HttpsError(
            'unavailable',
            "Your sent mail couldn't be read just now. Try again later.",
          )
        : new HttpsError(
            'failed-precondition',
            'Gmail needs reconnecting before your sent mail can be read.',
            { reason: 'reconnect' },
          );
    }
    const mails = read.value;
    if (mails.length < MIN_SENT_MAIL) {
      logger.info('helm.style.mail.notEnough', { messages: mails.length });
      return { status: 'notEnough', groups: 0 };
    }

    const whos = await readWhoAddresses(firestore, base, key);
    const groups = toMailGroups(
      mails,
      new Map(whos.map((who) => [who.address, who.whoId])),
    );
    if (groups.length === 0) {
      logger.info('helm.style.mail.notEnough', { messages: mails.length });
      return { status: 'notEnough', groups: 0 };
    }
    const batchesByGroup = toMailBatches(groups);
    const batchCount = batchesByGroup.reduce(
      (total, batches) => total + batches.length,
      0,
    );
    const now = Date.now();
    const holds = await Array.from({ length: batchCount }).reduce<
      Promise<(string | null)[]>
    >(async (done) => {
      const held = await done;
      return held.some(Boolean)
        ? held
        : [...held, await reserveAiCall(firestore, uid, now, 'quick')];
    }, Promise.resolve([]));
    if (holds.some(Boolean)) return { status: 'busy', groups: 0 };

    const replies = await Promise.all(
      batchesByGroup.map((batches) =>
        Promise.all(
          batches.map(async (texts) =>
            readStyleReply(
              await askTopicModel(firestore, provider, 'style', {
                system: STYLE_LEARNER_PROMPT,
                message: buildStyleMessage(texts),
                terminalTool: SUBMIT_STYLE_TOOL,
                limits: MAIL_STYLE_BATCH_LIMITS,
              }),
              texts,
            ),
          ),
        ),
      ),
    );
    const learned = groups.flatMap((group, index) => {
      const read = replies[index].flatMap((reply) => (reply ? [reply] : []));
      const merged = mergeLearned(read);
      return read.length > 0 &&
        (merged.traits.length > 0 || merged.avoid.length > 0)
        ? [
            {
              group,
              learned: merged,
              sampleCount: batchesByGroup[index].flat().length,
            },
          ]
        : [];
    });
    if (replies.flat().every((reply) => !reply)) {
      logger.warn('helm.style.noReply');
      throw new HttpsError(
        'unavailable',
        "Your writing style couldn't be read just now. Try again later.",
      );
    }

    const labelOf = (group: MailGroup) =>
      MAIL_LABELS[group.id] ??
      whos.find((who) => who.whoId === group.audienceWhoId)?.name ??
      'Someone';
    const openStyleOrNull = (sealed: unknown) => {
      try {
        return toStyleWords(openForHelm(key, sealed as SealedPayload));
      } catch {
        return null;
      }
    };
    const written = await firestore.runTransaction(async (transaction) => {
      const refs = learned.map(({ group }) =>
        firestore.doc(`${base}/style/${group.id}`),
      );
      const current = await Promise.all(
        refs.map((ref) => transaction.get(ref)),
      );
      const prepared = learned.map(
        ({ group, learned: notes, sampleCount }, index) => {
          const data = current[index].data();
          const existing = data ? openStyleOrNull(data.sealed) : null;
          if (data && !existing) {
            logger.error('helm.style.unreadable', { uid });
            throw new HttpsError(
              'failed-precondition',
              "Your style notes can't be opened right now, so they were left as they are.",
              { reason: 'unreadable' },
            );
          }
          const merged = mergeStyle(
            existing,
            notes,
            typeof data?.personEditedAt === 'number',
          );
          return {
            ref: refs[index],
            doc: {
              scope: group.scope,
              audienceWhoId: group.audienceWhoId,
              learnedFrom: [
                ...new Set([
                  ...((data?.learnedFrom as string[] | undefined) ?? []),
                  'sentMail',
                ]),
              ],
              sampleCount,
              personEditedAt:
                typeof data?.personEditedAt === 'number'
                  ? data.personEditedAt
                  : null,
              createdAt:
                typeof data?.createdAt === 'number' ? data.createdAt : now,
              lastEditedAt: now,
              sealed: sealForHelm(key, { ...merged, label: labelOf(group) }),
            },
          };
        },
      );
      prepared.forEach(({ ref, doc }) => transaction.set(ref, doc));
      return prepared.length;
    });
    logger.info('helm.style.mail.learned', {
      messages: mails.length,
      batches: batchCount,
      groups: written,
    });
    return { status: 'learned', groups: written };
  },
);
