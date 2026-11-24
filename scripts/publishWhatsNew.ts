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

const { files, errors } = readWhatsNewFiles();
if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  throw new Error("Fix the What's new files above (npm run check:whats-new).");
}

const now = Date.now();
const oldest = now - WHATS_NEW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const notes = files
  .flatMap(({ slug, notes: drafts }) => {
    const release = readFileRelease(slug);
    return release && release.publishedAt >= oldest
      ? drafts.map((draft, index): WhatsNewNote => ({
          ...draft,
          id: `${slug}-${index}`,
          ...release,
        }))
      : [];
  })
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
