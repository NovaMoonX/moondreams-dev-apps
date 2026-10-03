# Cloud Functions for MoonDreams Apps

Server-side code for the mini-apps. Every function:

- is exported from `functions/src/index.ts`;
- runs in `us-central1`;
- is deployed by CI on every merge to `main` (see the root README's [Deployment](../README.md#deployment)).

## Functions

| Function | Trigger | App | What it does |
| --- | --- | --- | --- |
| `searchMovies` | callable | A-List Tracker | `{ query }` → `{ results }` (up to 10) from OMDb |
| `getMovie` | callable | A-List Tracker | `{ movieKey }` → a movie snapshot (release date, runtime, rating, poster) |
| `triggerBoxAction` | callable | Worth the Wait | Runs the locked reveal/raffle workflow ([details](src/apps/worth-the-wait/README.md)) |
| `deleteTrip` | callable | Waypoint | Deletes a trip and everything a client `deleteDoc` can't reach (subcollections, requests, reminders, cover) |
| `shiftTripDates` | callable | Waypoint | Moves a trip's dates while keeping every item on its calendar day ("keep original dates") |
| `rescheduleTripReminders` | Firestore update on `apps/waypoint/trips/{tripId}` | Waypoint | Re-times event reminders when a relative trip's dates or time zone change |
| `fetchLinkMetadata` | callable | shared | Reads a link's Open Graph preview (title, description, image, site name) |
| `sendScheduledReminders` | schedule, every 5 minutes | shared | Sends due push reminders from `reminders` through FCM |

Every callable requires a signed-in caller.

## Secrets and config

| Name | Kind | Used by | Set it with |
| --- | --- | --- | --- |
| `OMDB_API_KEY` | Functions secret, **required to deploy** | `searchMovies`, `getMovie` | `firebase functions:secrets:set OMDB_API_KEY --project moondreams-dev-apps` |
| `A_LIST_APP_DAILY_LOOKUP_CAP` | env, optional (default 900) | A-List lookups | `functions/.env.local` locally |
| `A_LIST_MEMBER_DAILY_LOOKUP_CAP` | env, optional (default 100) | A-List lookups | `functions/.env.local` locally |

- A secret never reaches the browser, a response, or a log.
- `functions/.env.local` and `functions/.secret.local` are git-ignored (`*.local`).
- Locally, put a real key in `functions/.secret.local` (`OMDB_API_KEY=…`) to call OMDb from the emulator. Leave the value empty (`OMDB_API_KEY=`) to use the built-in sample movies instead.
- **Restart the emulators after editing either file.** They read `.env.local` and `.secret.local` only at startup.

## Per-function notes

### A-List Tracker: `searchMovies` and `getMovie`

- **Upstream:** [OMDb](https://www.omdbapi.com/). The free tier is about 1,000 lookups a day for the whole app.
- **Server cache:**
  - `apps/a-list/searchCache`: 7 days.
  - `apps/a-list/movieCache`: 30 days once a movie is released, 1 day before that (unreleased dates move).
- **Budget:** `lookupBudget.ts` counts every upstream call in `apps/a-list/lookupUsage`. It refuses with `resource-exhausted` at 900 a day app-wide or 100 per member.
- **Access:** clients can't read or write `searchCache`, `movieCache` or `lookupUsage`.
- **Offline fixtures:**
  - In the emulator with no key set, both callables answer from a built-in OMDb-shaped catalog (try "galaxy", "matrix" or "starlight").
  - Unknown ids return `not-found`.

### `fetchLinkMetadata`

- **Secrets:** none.
- **Safety:** it fetches on the caller's behalf, so it:
  - resolves DNS first and rejects private, loopback and link-local addresses (SSRF guard);
  - caps redirects at 3;
  - times out at 6s;
  - reads at most 1MB.

### `sendScheduledReminders`

- **Schedule:** polls every 5 minutes.
- **Timing:** it looks ahead over the whole window and waits out each reminder's exact delay, so delivery is accurate to the second without a task queue.

## Local development

1. Install the functions package's dependencies. The root `npm install` doesn't cover `functions/`:

   ```bash
   npm --prefix functions install
   ```

2. Start the emulators:

   ```bash
   npm run emulators
   ```

   This recompiles `functions/lib/` first, which is what the emulator loads. The `preemulators*` hooks in the root `package.json` do the same for `emulators:seed` and `emulators:seed:reset`, so pulled function changes are always picked up.

3. Seed the emulator data, in a second terminal:

   ```bash
   npm run seed:reset
   ```

4. Call a function from the signed-in app, or directly at:

   ```text
   http://127.0.0.1:5001/moondreams-dev-apps/us-central1/<functionName>
   ```

The emulator UI at `http://127.0.0.1:4001` shows Firestore and Realtime Database state while a function runs. The seed data has fixture users and records for every app (see [SEEDING.md](../SEEDING.md)).

## Adding or changing a function

- **Location:** export it from `functions/src/index.ts`, with app code under `functions/src/apps/<app>/`.
- **Update this README in the same PR:**
  - the table row;
  - a "Secrets and config" row for any new secret or env var;
  - a note if it caches, budgets, or fetches on a user's behalf.
- **New secret:** create it in production *before* the PR merges, or the CI functions deploy fails and nothing ships.
- **New callable:** if the browser reports a CORS error after its first deploy, run the invoker fix in the root README's [New Cloud Functions & Cloud Run invoker access](../README.md#new-cloud-functions--cloud-run-invoker-access).
- **Server-only collection:** give it a deny-all block in `firestore.rules`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Emulator says a function isn't found, or `lib/index.js` doesn't exist | `functions/lib/` wasn't built. Start through `npm run emulators` (it builds first), or run `npm --prefix functions run build`. |
| Browser CORS error on a callable in production | Missing public-invoker grant. See the root README's invoker section. |
| CI deploy fails on functions with a secret error | The secret doesn't exist in production yet. Set it with `firebase functions:secrets:set`. |
| A-List search shows sample movies locally | `OMDB_API_KEY` in `functions/.secret.local` is missing or empty, so the emulator uses its fixture catalog. If you just added the key, restart the emulators. |
| A changed `.env.local` cap or `.secret.local` key has no effect | The emulators read these files only at startup. Restart them. |
