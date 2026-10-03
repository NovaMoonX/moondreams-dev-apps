# Cloud Functions for MoonDreams Apps

This repository includes the server-side execution path for Worth the Wait. The callable function lives at `functions/src/apps/worth-the-wait/triggerBoxAction.ts` and is exported from `functions/src/index.ts`.

The app-agnostic `fetchLinkMetadata` callable (`functions/src/linkMetadata/fetchLinkMetadata.ts`) reads any link's Open Graph metadata (title/description/image/site name) for any mini-app that wants a link preview. It needs no secrets (no API key), but does an outbound fetch on the caller's behalf, so it resolves the target's DNS first and rejects private/loopback/link-local addresses (an SSRF guard), caps redirects at 3, times out at 6s, and reads at most 1MB.

A-List Tracker's movie lookups go through two callables in `functions/src/apps/a-list/`: `searchMovies({ query })` → `{ results }` (up to 10) and `getMovie({ movieKey })` → a movie snapshot (release date, runtime, rating, poster). Both require a signed-in caller and call [OMDb](https://www.omdbapi.com/) with the **`OMDB_API_KEY`** Functions secret (`firebase functions:secrets:set OMDB_API_KEY`); the key never reaches the browser, a response, or a log. OMDb's free tier is about 1,000 lookups a day for the whole app, so results are cached server-side (`apps/a-list/searchCache` for 7 days, `apps/a-list/movieCache` for 30 days once released and 1 day otherwise), and `lookupBudget.ts` counts every upstream call in `apps/a-list/lookupUsage`, refusing with `resource-exhausted` at 900 a day app-wide or 100 per member (override locally with `A_LIST_APP_DAILY_LOOKUP_CAP` / `A_LIST_MEMBER_DAILY_LOOKUP_CAP` in `functions/.env.local`). Clients can't read or write any of those three collections. **In the emulator with no key set, both callables answer from a built-in OMDb-shaped fixture catalog** (try "galaxy", "matrix" or "starlight"), so A-List works offline; put a real key in `functions/.secret.local` (`OMDB_API_KEY=…`) to hit OMDb locally. After the first deploy, if the browser reports a CORS error, follow the invoker-access step in the root README's Deployment section.

## Local development

1. Install the Cloud Functions package's dependencies:

   ```bash
   npm --prefix functions install
   ```

2. Start the local Firebase emulators for Auth, Firestore, Realtime Database, and Cloud Functions. `npm run emulators` (and `emulators:seed`/`emulators:seed:reset`) first recompiles `functions/lib/`, which the emulator loads, so pulled function changes are always picked up:

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
