import { APP_REGISTRY } from '../../src/lib/app/app.registry.ts';

import {
  EMPTY_SEED_RESULT,
  FIXTURE_PASSWORD,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

async function upsertFixtureUser(
  context: SeedContext,
  fixture: (typeof FIXTURE_USERS)[keyof typeof FIXTURE_USERS],
  isAdmin: boolean,
) {
  try {
    await context.auth.updateUser(fixture.uid, {
      displayName: fixture.displayName,
      email: fixture.email,
      password: FIXTURE_PASSWORD,
    });
  } catch (error) {
    const firebaseError = error as { code?: string };

    if (firebaseError.code !== 'auth/user-not-found') {
      throw error;
    }

    await context.auth.createUser({
      uid: fixture.uid,
      displayName: fixture.displayName,
      email: fixture.email,
      password: FIXTURE_PASSWORD,
      emailVerified: true,
    });
  }

  await context.auth.setCustomUserClaims(
    fixture.uid,
    isAdmin ? { admin: true, dev: true } : { dev: true },
  );
}

export async function seedCore(context: SeedContext): Promise<SeedResult> {
  const fixtures = Object.values(FIXTURE_USERS);

  await Promise.all(
    fixtures.map((fixture) =>
      upsertFixtureUser(context, fixture, fixture.uid === FIXTURE_USERS.admin.uid),
    ),
  );

  const batch = context.firestore.batch();

  fixtures.forEach((fixture) => {
    const userRef = context.firestore.collection('users').doc(fixture.uid);
    batch.set(
      userRef,
      {
        uid: fixture.uid,
        email: fixture.email,
        displayName: fixture.displayName,
        photoURL: '',
        isAdmin: fixture.uid === FIXTURE_USERS.admin.uid,
      },
      { merge: true },
    );
  });

  // Two people asking for apps they don't use yet, so the admin's "Asked for access" list has rows.
  [
    { appId: 'nine-lives', fixture: FIXTURE_USERS.partnerOne, daysAgo: 3 },
    { appId: 'waypoint', fixture: FIXTURE_USERS.partnerTwo, daysAgo: 1 },
  ].forEach(({ appId, fixture, daysAgo }) => {
    batch.set(context.firestore.collection('apps').doc(appId).collection('accessRequests').doc(fixture.uid), {
      uid: fixture.uid,
      email: fixture.email,
      displayName: fixture.displayName,
      requestedAt: context.now - daysAgo * 86_400_000,
      dismissedAt: null,
    });
  });

  APP_REGISTRY.forEach((app) => {
    const appRef = context.firestore.collection('apps').doc(app.id);
    const createdAt = app.createdAt
      ? new Date(app.createdAt).toISOString()
      : new Date(context.now).toISOString();

    batch.set(
      appRef,
      {
        id: app.id,
        name: app.name,
        description: app.description,
        path: app.path,
        status: 'public',
        isRestricted: false,
        isRequestable: false,
        allowedUsers: [],
        createdAt,
        updatedAt: new Date(context.now).toISOString(),
      },
      { merge: true },
    );
  });

  const DAY_MS = 24 * 60 * 60 * 1000;
  const usageEntries = fixtures
    .filter((fixture) => fixture.uid !== FIXTURE_USERS.admin.uid)
    .flatMap((fixture) =>
      fixture.apps.flatMap((appName) => {
        const app = APP_REGISTRY.find((candidate) => candidate.name === appName);
        // Taylor opened Waypoint long ago, so the admin view shows a started-but-not-active member.
        const isLapsed =
          fixture.uid === FIXTURE_USERS.nineLivesCaretaker.uid && app?.id === 'waypoint';
        return app
          ? [
              {
                appId: app.id,
                usage: {
                  uid: fixture.uid,
                  startedAt: context.now - 150 * DAY_MS,
                  lastActiveAt: context.now - (isLapsed ? 120 : 1) * DAY_MS,
                },
              },
            ]
          : [];
      }),
    );

  const visitedFixtures = fixtures.filter((fixture) => fixture.uid !== FIXTURE_USERS.admin.uid);
  visitedFixtures.forEach((fixture) => {
    batch.set(context.firestore.doc(`siteVisits/${fixture.uid}`), {
      uid: fixture.uid,
      lastVisitedAt:
        context.now - (fixture.uid === FIXTURE_USERS.nineLivesCaretaker.uid ? 120 : 1) * DAY_MS,
    });
  });

  usageEntries.forEach(({ appId, usage }) => {
    batch.set(
      context.firestore.doc(`apps/${appId}/usage/${usage.uid}`),
      usage,
    );
  });

  // One session in each state the admin's Pipeline view draws, and the PRs they drive.
  const MINUTE_MS = 60_000;
  const pipelineSessions = [
    {
      sessionId: 'session_seedWaiting',
      branch: 'claude/runway-cards',
      state: 'waiting',
      raisedHands: [
        'Pick the History header: A keeps Back on the title line, B stacks it above.',
        'Add the `PIPELINE_KEY` secret before merging.',
      ],
      minutesAgo: 6,
    },
    {
      sessionId: 'session_seedWaitingTwo',
      branch: 'claude/pinch-meal-plan',
      state: 'waiting',
      raisedHands: ['Should the meal plan repeat weekly by default?'],
      minutesAgo: 25,
    },
    {
      sessionId: 'session_seedWaitingThree',
      branch: 'claude/waypoint-packing',
      state: 'waiting',
      raisedHands: [
        'Packing lists copy to the next trip, or start empty?',
        'Add the `MAPS_KEY` secret before merging.',
        'The empty state says "Nothing to pack yet", fine?',
      ],
      minutesAgo: 70,
    },
    { sessionId: 'session_seedWorking', branch: 'claude/pinch-voice', state: 'working', raisedHands: [], minutesAgo: 2 },
    { sessionId: 'session_seedQuiet', branch: 'claude/a-list-calendar', state: 'working', raisedHands: [], minutesAgo: 95 },
    { sessionId: 'session_seedIdle', branch: 'claude/waypoint-expenses', state: 'idle', raisedHands: [], minutesAgo: 300 },
  ].map(({ minutesAgo, ...session }) => ({
    ...session,
    url: `https://claude.ai/code/${session.sessionId}`,
    startedAt: context.now - (minutesAgo + 40) * MINUTE_MS,
    turnStartedAt: context.now - (minutesAgo + 5) * MINUTE_MS,
    updatedAt: context.now - minutesAgo * MINUTE_MS,
  }));
  pipelineSessions.forEach((session) => {
    batch.set(context.firestore.doc(`pipelineSessions/${session.sessionId}`), session);
  });
  const toInboxPr = (number: number, title: string, head: string, sessionUrl: string | null, sessionTitle: string) => ({
    number,
    title,
    url: `https://github.com/NovaMoonX/moondreams-dev-apps/pull/${number}`,
    head,
    base: 'main',
    isDraft: true,
    labels: ['minor'],
    ci: 'green',
    bodySessionUrl: sessionUrl,
    gallery: [] as { label: string; images: { src: string; role: 'before' | 'after' | null }[] }[],
    status: {
      sessionUrl,
      sessionTitle,
      state: 'in progress',
      ownerItems: [] as { text: string; options: { label: string; images: string[] }[]; isMulti: boolean }[],
      goodToKnow: [] as string[],
      screenshots: [] as string[],
      updatedAt: context.now - 10 * MINUTE_MS,
    },
  });
  const runwayPr = toInboxPr(901, 'Runway: history sheet', 'claude/runway-cards', pipelineSessions[0].url, 'Runway cards');
  const orphanPr = toInboxPr(902, 'Nine Lives: visit reminders', 'claude/nine-lives-visits', null, 'Visit reminders');
  batch.set(context.firestore.doc('pipeline/inbox'), {
    prs: [
      {
        ...runwayPr,
        status: {
          ...runwayPr.status,
          ownerItems: [
            {
              text: "History's header: A or B?",
              options: [
                { label: 'A, Back on the title line', images: ['https://placehold.co/390x844.png?text=A'] },
                { label: 'B, Back above the title', images: ['https://placehold.co/390x844.png?text=B'] },
              ],
              isMulti: false,
            },
            {
              text: 'Which cards should show the history count?',
              options: [
                { label: 'Bills (Recommended)', images: [] },
                { label: 'Envelopes', images: [] },
                { label: 'Goals', images: [] },
              ],
              isMulti: true,
            },
          ],
          goodToKnow: ['The undo sheet was only checked at 390px.'],
          screenshots: ['https://placehold.co/390x844.png?text=History'],
        },
        gallery: [
          {
            label: '1 · Open a card',
            images: [
              { src: 'https://placehold.co/390x844.png?text=Card+before', role: 'before' as const },
              { src: 'https://placehold.co/390x844.png?text=Card+after', role: 'after' as const },
            ],
          },
          {
            label: '2 · History opens',
            images: [{ src: 'https://placehold.co/390x844.png?text=History', role: null }],
          },
          {
            label: '3 · Undo a move',
            images: [{ src: 'https://placehold.co/390x844.png?text=Undo', role: null }],
          },
          {
            label: '4 · Undone',
            images: [{ src: 'https://placehold.co/390x844.png?text=Undone', role: null }],
          },
        ],
      },
      {
        ...orphanPr,
        ci: 'red',
        status: {
          ...orphanPr.status,
          ownerItems: [{ text: 'Should a reminder repeat after a missed visit?', options: [], isMulti: false }],
        },
      },
    ],
    updatedAt: context.now - 4 * MINUTE_MS,
  });

  await batch.commit();

  const statuses = fixtures.map((fixture) => [
    `status/${fixture.uid}`,
    {
      state:
        fixture.uid === FIXTURE_USERS.partnerTwo.uid ? 'offline' : 'online',
      currentLocation:
        fixture.uid === FIXTURE_USERS.partnerOne.uid ? 'worth-the-wait' : null,
      lastChanges: context.now,
    },
  ]);
  const statusData = Object.fromEntries(statuses);
  await context.database.ref().update(statusData);

  const result: SeedResult = {
    ...EMPTY_SEED_RESULT,
    authUsers: fixtures.length,
    firestoreDocuments:
      fixtures.length + APP_REGISTRY.length + usageEntries.length + visitedFixtures.length + pipelineSessions.length + 1,
    realtimePaths: fixtures.length,
  };

  return result;
}