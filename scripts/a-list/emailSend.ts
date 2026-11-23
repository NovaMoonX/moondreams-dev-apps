import { readFileSync } from 'node:fs';

// Posts one fixture (From:, Subject:, a blank line, the text) to the Functions emulator, as the email worker would.
// EMAIL_WEBHOOK_SECRET=local-secret npm run a-list:email-send -- amc-<token>@moondreamsmail.com <fixture>; emulators only.
const [address, fixture] = process.argv.slice(2);
const secret = process.env.EMAIL_WEBHOOK_SECRET;
if (!address || !fixture || !secret) {
  console.error(
    'Usage: EMAIL_WEBHOOK_SECRET=<secret> npm run a-list:email-send -- <address> <fixture.txt>',
  );
  process.exit(1);
}

const [head, ...rest] = readFileSync(fixture, 'utf8').split(/\n\n/);
const header = (key: string) =>
  new RegExp(`^${key}: (.*)$`, 'm').exec(head)?.[1] ?? '';
const project = process.env.GCLOUD_PROJECT ?? 'moondreams-dev-apps';
const host = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const response = await fetch(
  `http://${host}/${project}/us-central1/ingestAListEmail`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-app-email-secret': secret,
    },
    body: JSON.stringify({
      to: address,
      from: header('From'),
      subject: header('Subject'),
      text: rest.join('\n\n'),
      html: '',
      messageId: `<${Date.now()}@fixture>`,
      spf: 'pass',
      dkim: 'pass',
      receivedAt: Date.now(),
    }),
  },
);
console.log(response.status, await response.text());
