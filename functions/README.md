# Cloud Functions for MoonDreams Apps

This repository includes the server-side execution path for Worth the Wait. The callable function lives at `functions/src/apps/worth-the-wait/triggerBoxAction.ts` and is exported from `functions/src/index.ts`.

The app-agnostic `fetchLinkMetadata` callable (`functions/src/linkMetadata/fetchLinkMetadata.ts`) reads any link's Open Graph metadata (title/description/image/site name) for any mini-app that wants a link preview. It needs no secrets (no API key), but does an outbound fetch on the caller's behalf, so it resolves the target's DNS first and rejects private/loopback/link-local addresses (an SSRF guard), caps redirects at 3, times out at 6s, and reads at most 1MB.

## Local development

1. Build the Cloud Functions package first so the emulator loads the compiled `functions/lib/index.js`:

   ```bash
   cd functions && npm install && npm run build
   ```

2. Start the local Firebase emulators for Auth, Firestore, Realtime Database, and Cloud Functions:

   ```bash
   npm run emulators
   ```

3. Seed the local emulator data for the app:

   ```bash
   npm run seed:reset
   ```

4. Invoke the callable function from a signed-in client or a custom-token helper. The emulator exposes it at:

   ```text
   http://127.0.0.1:5001/moondreams-dev-apps/us-central1/triggerBoxAction
   ```

## Emulator checks

Use the emulator UI at `http://127.0.0.1:4001` to inspect the Firestore and Realtime Database state while the function runs. The local seed data includes a shared Worth the Wait space and fixture user IDs so you can validate both trigger paths without touching production data.

## Troubleshooting

If you run into issues about the function not being found or `lib/index.js` not existing, it means you've forgotten to run `npm run build`.
