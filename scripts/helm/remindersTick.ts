// One habit-reminder planning pass and one sending pass against the emulators: `npm run helm:reminders-tick [-- --at <iso>]`. Emulators only.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'moondreams-dev-apps';
if (getApps().length === 0)
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const flag = process.argv.indexOf('--at');
const at = flag === -1 ? Date.now() : Date.parse(process.argv[flag + 1] ?? '');
if (Number.isNaN(at)) {
  console.error('--at needs an ISO instant, such as 2026-06-10T10:00:00Z.');
  process.exit(1);
}

const { runHelmReminderPlanning } =
  await import('../../functions/src/apps/helm/reminders/planHelmReminders.ts');
const { runScheduledReminders } =
  await import('../../functions/src/notifications/sendScheduledReminders.ts');

const firestore = getFirestore();
const sent: string[] = [];
const messaging = {
  sendEachForMulticast: async (message: {
    tokens: string[];
    notification: { title: string; body: string };
  }) => {
    sent.push(`${message.notification.title}: ${message.notification.body}`);
    return { responses: message.tokens.map(() => ({ success: true })) };
  },
} as unknown as Messaging;

const planning = await runHelmReminderPlanning(firestore, at);
await runScheduledReminders(firestore, messaging, at);
const pending = await firestore
  .collection('reminders')
  .where('appId', '==', 'helm')
  .where('status', '==', 'pending')
  .get();
console.log(`As of ${new Date(at).toISOString()}`);
console.log('planning', planning);
console.log(`pushes to fake devices: ${sent.length}`);
sent.forEach((line) => console.log(`  ${line}`));
console.log(`Helm reminders still pending: ${pending.size}`);
process.exit(0);
