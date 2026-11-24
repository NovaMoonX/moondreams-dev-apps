import { readFileSync } from 'node:fs';

/**
 * Posts one sample email to the local Functions emulator, as the email worker would.
 *   EMAIL_WEBHOOK_SECRET=local-secret npm run runway:email-send -- runway-<token>@moondreamsmail.com scripts/runway/emailFixtures/chase.json
 * Start the emulator with the same EMAIL_WEBHOOK_SECRET in its environment. Emulators only.
 */
const [address, fixture] = process.argv.slice(2);
const secret = process.env.EMAIL_WEBHOOK_SECRET;
if (!address || !fixture || !secret) {
  console.error(
    'Usage: EMAIL_WEBHOOK_SECRET=<secret> npm run runway:email-send -- <address> <fixture.json>',
  );
  process.exit(1);
}

const sample = JSON.parse(readFileSync(fixture, 'utf8')) as Record<
  string,
  unknown
>;
const project = process.env.GCLOUD_PROJECT ?? 'moondreams-dev-apps';
const host = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const response = await fetch(
  `http://${host}/${project}/us-central1/ingestRunwayEmail`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-email-secret': secret,
    },
    body: JSON.stringify({
      html: '',
      spf: 'pass',
      dkim: 'pass',
      receivedAt: Date.now(),
      ...sample,
      to: address,
    }),
  },
);
console.log(response.status, await response.text());
