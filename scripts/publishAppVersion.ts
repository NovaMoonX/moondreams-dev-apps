import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const PROJECT_ID = 'moondreams-dev-apps';
const version = process.env.SITE_VERSION;

if (!version || version === 'dev') {
  throw new Error('Set SITE_VERSION (the merge workflow works it out from the latest v* tag).');
}

initializeApp({
  credential: applicationDefault(),
  databaseURL:
    process.env.FIREBASE_DATABASE_URL ?? `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});

await getDatabase().ref('appVersion').set(version);
console.log(`Published appVersion ${version}`);
process.exit(0);
