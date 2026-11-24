import type { WhatsNewNote } from '../../src/lib/whatsNew/whatsNewTypes.ts';
import { FIXTURE_USERS, type SeedContext, type SeedResult } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

type SeedNote = Omit<WhatsNewNote, 'id' | 'publishedAt'> & { daysAgo: number };

const note = (
  app: WhatsNewNote['app'],
  kind: WhatsNewNote['kind'],
  version: string,
  daysAgo: number,
  text: string,
  path: string | null = null,
): SeedNote => ({
  app,
  kind,
  version,
  daysAgo,
  text,
  path,
  gate: null,
  audience: 'everyone',
});

const NOTES: SeedNote[] = [
  note(
    'site',
    'new',
    '1.171.0',
    3,
    'Star your favorite apps and they sit first on Home.',
    '/',
  ),
  note(
    'site',
    'improved',
    '1.168.0',
    12,
    'The account menu now opens faster on slow connections.',
  ),
  note(
    'site',
    'fixed',
    '1.166.0',
    20,
    'Switching accounts no longer flashes the sign-in screen.',
  ),
  note(
    'runway',
    'new',
    '1.170.0',
    2,
    'See what is left to spend after your bills on the Plan screen.',
    '/runway',
  ),
  note(
    'runway',
    'new',
    '1.169.0',
    5,
    'Move money between envelopes with one tap.',
    '/runway',
  ),
  note(
    'runway',
    'new',
    '1.167.0',
    9,
    'Pay a card bill from the card statement itself.',
  ),
  note(
    'runway',
    'improved',
    '1.165.0',
    14,
    'Envelope history now shows running totals.',
  ),
  note(
    'runway',
    'improved',
    '1.164.0',
    16,
    'Bank connections explain why a bank refused a request.',
  ),
  note(
    'runway',
    'improved',
    '1.162.0',
    21,
    'Goals show how far along they are at a glance.',
  ),
  note(
    'runway',
    'fixed',
    '1.168.0',
    11,
    'A started card payment also clears its move to do.',
  ),
  note(
    'runway',
    'fixed',
    '1.163.0',
    18,
    'Dates on paychecks no longer slip a day in some time zones.',
  ),
  note(
    'runway',
    'new',
    '1.140.0',
    60,
    'Runway can read a forwarded bill email.',
  ),
  note(
    'pinch',
    'new',
    '1.158.0',
    30,
    'Cook with your voice: say "next step" and Pinch reads it.',
    '/pinch',
  ),
  note(
    'pinch',
    'improved',
    '1.159.0',
    28,
    'Shopping lists group items by store aisle.',
  ),
  note(
    'pinch',
    'fixed',
    '1.169.0',
    4,
    'Servings stay put when you reopen a recipe.',
  ),
  note(
    'pinch',
    'fixed',
    '1.167.0',
    8,
    'Pasted recipe links with a trailing space now work.',
  ),
];

const SEEN: Record<string, string> = { runway: '1.150.0', pinch: '1.160.0' };

/** A local feed of "What's new" notes, and seen marks that leave Runway with news and Pinch with only fixes. */
export async function seedWhatsNew(context: SeedContext): Promise<SeedResult> {
  const notes = Object.fromEntries(
    NOTES.map(({ daysAgo, ...rest }, index) => {
      const id = `seed-${index + 1}`;
      return [id, { ...rest, id, publishedAt: context.now - daysAgo * DAY_MS }];
    }),
  );
  await context.database.ref('whatsNew').set({ notes, updatedAt: context.now });

  const people = [FIXTURE_USERS.partnerOne, FIXTURE_USERS.admin];
  const batch = context.firestore.batch();
  people.forEach((person) => {
    batch.set(context.firestore.doc(`whatsNewSeen/${person.uid}`), {
      uid: person.uid,
      seen: SEEN,
      showFixOnly: null,
      updatedAt: context.now,
    });
  });
  await batch.commit();

  return { authUsers: 0, firestoreDocuments: people.length, realtimePaths: 1 };
}
