import { readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const PROJECT_ID = 'moondreams-dev-apps';
const constants = readFileSync('src/lib/app/app.constants.ts', 'utf8');
const version = constants.match(/SITE_VERSION = '([^']+)'/)?.[1];

if (!version) {
  throw new Error('SITE_VERSION not found in src/lib/app/app.constants.ts');
}

initializeApp({
  credential: applicationDefault(),
  databaseURL:
    process.env.FIREBASE_DATABASE_URL ?? `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});

await getDatabase().ref('appVersion').set(version);
console.log(`Published appVersion ${version}`);
process.exit(0);
