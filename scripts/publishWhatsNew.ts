import { execFileSync } from 'node:child_process';

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

import {
  WHATS_NEW_FEED_PATH,
  WHATS_NEW_RETENTION_DAYS,
  type WhatsNewFeed,
  type WhatsNewNote,
} from '../src/lib/whatsNew/whatsNewTypes.ts';
import { readFileRelease, readWhatsNewFiles } from './lib/whatsNewFiles.ts';

const PROJECT_ID = 'moondreams-dev-apps';
const isDryRun = process.argv.includes('--dry-run');

const fail = (message: string): never => {
  console.error(`::error::${message}`);
  process.exit(1);
};
const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

if (git('rev-parse', '--is-shallow-repository') === 'true') {
  fail(
    "The checkout is shallow, so release tags can't be read; the feed was left as it is (fetch-depth: 0).",
  );
}
if (git('tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*') === '') {
  fail('No release tag exists, so the feed was left as it is.');
}

const { files, errors } = readWhatsNewFiles();
errors.forEach((error) => console.log(`::warning::${error}`));

const now = Date.now();
const oldest = now - WHATS_NEW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const released = files.flatMap((file) => {
  const release = readFileRelease(file.slug);
  if (!release)
    console.log(`Skipped ${file.slug}: no release contains it yet.`);
  return release ? [{ ...file, release }] : [];
});
if (files.length > 0 && released.length === 0) {
  fail(
    'Files exist in whats-new/ but none has a release, so the feed was left as it is.',
  );
}
const notes = released
  .flatMap(({ slug, notes: drafts, release }) =>
    release.publishedAt >= oldest
      ? drafts.map((draft, index): WhatsNewNote => ({
          ...draft,
          id: `${slug}-${index}`,
          ...release,
        }))
      : [],
  )
  .reduce<WhatsNewFeed['notes']>(
    (byId, note) => ({ ...byId, [note.id]: note }),
    {},
  );
const feed: WhatsNewFeed = { notes, updatedAt: now };

if (isDryRun) {
  console.log(JSON.stringify(feed, null, 2));
  console.log(
    `Dry run: ${Object.keys(notes).length} note(s) from ${files.length} file(s) would be published.`,
  );
  process.exit(0);
}

initializeApp({
  credential: applicationDefault(),
  databaseURL:
    process.env.FIREBASE_DATABASE_URL ??
    `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});

await getDatabase().ref(WHATS_NEW_FEED_PATH).set(feed);
console.log(
  `Published ${Object.keys(notes).length} What's new note(s) from ${files.length} file(s).`,
);
process.exit(0);
