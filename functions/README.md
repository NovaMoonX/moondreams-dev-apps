# Cloud Functions for MoonDreams Apps

This repository includes the server-side execution path for Worth the Wait. The callable function lives at `functions/src/apps/worth-the-wait/triggerBoxAction.ts` and is exported from `functions/src/index.ts`.

## Local development

1. Start the local Firebase emulators for Auth, Firestore, Realtime Database, and Cloud Functions:

   ```bash
   npm run emulators
   ```

2. Seed the local emulator data for the app:

   ```bash
   npm run seed:reset
   ```

3. Build the Cloud Functions package:

   ```bash
   cd functions && npm install && npm run build
   ```

4. Invoke the callable function from a signed-in client or a custom-token helper. The emulator exposes it at:

   ```text
   http://127.0.0.1:5001/moondreams-dev-apps/us-central1/triggerBoxAction
   ```

## Emulator checks

Use the emulator UI at `http://127.0.0.1:4001` to inspect the Firestore and Realtime Database state while the function runs. The local seed data includes a shared Worth the Wait space and fixture user IDs so you can validate both trigger paths without touching production data.
