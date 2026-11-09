import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import {
  deriveSeedDataKey,
  keyCheckPath,
  makeKeyCheck,
  wrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '../../src/apps/helm/constants.ts';
import { sealJson } from '../../src/apps/helm/security.ts';
import type {
  Capture,
  CaptureSealed,
  HelmEncryption,
} from '../../src/apps/helm/types.ts';
import { readEmulatorKeyring } from './runway.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// Alex keeps Pacific Time, so the first open shows a profile that was made earlier; Jamie's zone differs from the emulator's.
const SEED_PROFILES = [
  { user: FIXTURE_USERS.partnerOne, timeZone: 'America/Los_Angeles' },
  { user: FIXTURE_USERS.partnerTwo, timeZone: 'America/New_York' },
];

/** Two sessions: one yesterday, one a few minutes ago (so it is still the session in progress). `seenAt` is null on the turns the Inbox lists as new. */
const SEED_TURNS = [
  {
    session: 'yesterday',
    minutesAgo: 26 * 60,
    text: 'Dana says centerpieces are $2,100 now',
    isSeen: true,
  },
  {
    session: 'yesterday',
    minutesAgo: 26 * 60 - 3,
    text: 'Lunch with Sam Thursday',
    isSeen: false,
  },
  {
    session: 'today',
    minutesAgo: 6,
    text: 'Call Grandpa when I get home about the wedding questions',
    isSeen: false,
  },
  {
    session: 'today',
    minutesAgo: 3,
    text: "Mom's birthday is June 3, buy the rings, call Dana Friday",
    isSeen: false,
  },
] as const;

export async function seedHelm(context: SeedContext): Promise<SeedResult> {
  const createdAt = context.now - 14 * DAY_MS;
  const keyring = readEmulatorKeyring('HELM_MASTER_KEYS');
  const users = context.firestore
    .collection('apps')
    .doc('helm')
    .collection('users');
  const batch = context.firestore.batch();

  const turnCounts = await Promise.all(
    SEED_PROFILES.map(async ({ user, timeZone }) => {
      batch.set(users.doc(user.uid), {
        timeZone,
        dayStartTime: DEFAULT_DAY_START_TIME,
        dayEndTime: DEFAULT_DAY_END_TIME,
        planFillPercent: DEFAULT_PLAN_FILL_PERCENT,
        createdAt,
        lastEditedAt: null,
      });

      const data = deriveSeedDataKey(keyring, user.uid);
      batch.set(
        context.firestore.doc(wrappedKeyPath(user.uid)),
        wrapDataKey(keyring, user.uid, data, createdAt),
      );
      const encryption: HelmEncryption = {
        appId: 'helm',
        keyId: data.keyId,
        keyVersion: 1,
        key: data.key.toString('hex'),
      };

      const turns = await Promise.all(
        SEED_TURNS.map(async (turn, index) => {
          const turnTime = context.now - turn.minutesAgo * MINUTE_MS;
          const capture: Capture = {
            inputMode: 'typed',
            medium: 'web',
            sessionId: `seed-${user.uid}-${turn.session}`,
            turnIndex: SEED_TURNS.filter(
              (entry) => entry.session === turn.session,
            ).indexOf(turn),
            status: 'received',
            seenAt: turn.isSeen ? turnTime + MINUTE_MS : null,
            createdAt: turnTime,
            sealed: await sealJson<CaptureSealed>(
              { text: turn.text, reading: {} },
              encryption,
            ),
          };
          return { id: `seed-turn-${index + 1}`, capture };
        }),
      );
      turns.forEach(({ id, capture }) =>
        batch.set(users.doc(user.uid).collection('captures').doc(id), capture),
      );
      return turns.length;
    }),
  );

  Object.keys(keyring.keys).forEach((masterKeyId) =>
    batch.set(
      context.firestore.doc(keyCheckPath(masterKeyId)),
      makeKeyCheck(keyring, masterKeyId, createdAt),
    ),
  );
  await batch.commit();

  // Per person: the profile and the wrapped key, then their turns; one canary per master key.
  const result = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      SEED_PROFILES.length * 2 +
      turnCounts.reduce((total, count) => total + count, 0) +
      Object.keys(keyring.keys).length,
  };
  return result;
}
