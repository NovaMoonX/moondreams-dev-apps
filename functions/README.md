# Cloud Functions for MoonDreams Apps

Server-side code for the mini-apps. Every function:

- is exported from `functions/src/index.ts`;
- runs in `us-central1`;
- is deployed by CI on every merge to `main` (see the root README's [Deployment](../README.md#deployment)).

## Functions

| Function | Trigger | App | What it does |
| --- | --- | --- | --- |
| `searchMovies` | callable | A-List Tracker | `{ query }` → `{ results }` (up to 20, newest first) from TMDB, or OMDb when no TMDB key is set |
| `getMovie` | callable | A-List Tracker | `{ movieKey }` → a movie snapshot (release date, runtime, rating, poster) from the provider that issued the key (`tmdb-…` or `imdb-…`) |
| `getCalendarShare` | callable, **no sign-in** | A-List Tracker | `{ shareId, pin? }` → `{ status: 'ok', calendar }`, or `pin_required`, `wrong_pin`, `not_found`. Serves a calendar share to anyone with its link |
| `findTheatres` | callable | A-List Tracker | `{ query }` (a 5-digit zip code, a city or state, or part of a theater's name), `{ state }` or `{ latitude, longitude }` → `{ theatres, places, area }`: the closest AMC theaters (up to 10 nearest first, 25 for a state, each with its time zone), or for a typed city or state the places to confirm plus theaters matching the name, from the AMC Theatres API |
| `findShowtimes` | callable | A-List Tracker | `{ theatreId, date, title }` → `{ showtimes }`: a movie's showings at an AMC theater that day, with format, list price, a Standard price to compare and a purchase link |
| `triggerBoxAction` | callable | Worth the Wait | Runs the locked reveal/raffle workflow ([details](src/apps/worth-the-wait/README.md)) |
| `deleteTrip` | callable | Waypoint | Deletes a trip and everything a client `deleteDoc` can't reach (subcollections, requests, email invitations, members' personal expenses, reminders, cover) |
| `shiftTripDates` | callable | Waypoint | Moves a trip's dates while keeping every event, stay, rental and expense on its calendar day ("keep original dates"); checklist due days stay relative to the trip's start and are left alone |
| `rescheduleTripReminders` | Firestore update on `apps/waypoint/trips/{tripId}` | Waypoint | Re-times event reminders when a relative trip's dates or time zone change |
| `fetchLinkMetadata` | callable | shared | Reads a link's Open Graph preview (title, description, image, site name) |
| `sendScheduledReminders` | schedule, every 5 minutes | shared | Sends due push reminders from `reminders` through FCM |

Every callable requires a signed-in caller, except `getCalendarShare`, which exists to serve people who have no account.

## Secrets and config

| Name | Kind | Used by | Set it with |
| --- | --- | --- | --- |
| `TMDB_API_KEY` | Functions secret, **required to deploy** | `searchMovies`, `getMovie` | `firebase functions:secrets:set TMDB_API_KEY --project moondreams-dev-apps` (paste the TMDB "API Read Access Token" or the v3 API key) |
| `OMDB_API_KEY` | Functions secret, **required to deploy** | `searchMovies`, `getMovie` | `firebase functions:secrets:set OMDB_API_KEY --project moondreams-dev-apps` |
| `AMC_API_KEY` | Functions secret, **required to deploy** | `findTheatres`, `findShowtimes` | `firebase functions:secrets:set AMC_API_KEY --project moondreams-dev-apps` (the vendor key from [developers.amctheatres.com](https://developers.amctheatres.com), sent as `X-AMC-Vendor-Key`) |
| `MOVIE_PROVIDER` | env, optional (`tmdb` or `omdb`) | `searchMovies` | `functions/.env.local` locally. Forces a provider; unset, TMDB is used whenever its key is set. |
| `TMDB_API_BASE` | env, optional | TMDB calls | `functions/.env.local`. Points TMDB calls at another server; a test aid, never set in production. |
| `AMC_API_BASE` | env, optional | AMC calls | `functions/.env.local`. Points AMC calls at another server; a test aid, never set in production. |
| `A_LIST_THEATRE_APP_DAILY_LOOKUP_CAP` / `A_LIST_THEATRE_MEMBER_DAILY_LOOKUP_CAP` | env, optional (defaults 500 and 40) | `findTheatres`, `findShowtimes` (one shared budget) | `functions/.env.local` locally |
| `A_LIST_APP_DAILY_LOOKUP_CAP` | env, optional (default 900) | A-List lookups | `functions/.env.local` locally |
| `A_LIST_MEMBER_DAILY_LOOKUP_CAP` | env, optional (default 100) | A-List lookups | `functions/.env.local` locally |

- A secret never reaches the browser, a response, or a log.
- `functions/.env.local` and `functions/.secret.local` are git-ignored (`*.local`).
- Locally, the emulator reads a secret from `functions/.secret.local` when it has a value, and otherwise fetches it from production Secret Manager with your Google credentials, so once a secret exists in production the emulator uses it with no local step. To use a different key locally, put it in `functions/.secret.local` (`TMDB_API_KEY=…`). The built-in sample movies are used only when no key can be read at all.
- **Restart the emulators after editing either file.** They read `.env.local` and `.secret.local` only at startup.

## Service accounts

Three accounts show up under IAM & Admin → Service Accounts. Only the first two matter to us.

| Account | Role in this repo | When it needs a grant |
| --- | --- | --- |
| `github-action-…@moondreams-dev-apps.iam.gserviceaccount.com` ("GitHub Actions") | **Deployer.** Its key is the GitHub secret `FIREBASE_SERVICE_ACCOUNT_MOONDREAMS_DEV_APPS`, used by `firebase-hosting-merge.yml`. | A deploy fails with `secretmanager.secrets.getIamPolicy` / `setIamPolicy`. It must be able to set a secret's IAM policy. |
| `<project-number>-compute@developer.gserviceaccount.com` ("Default compute service account") | **Runtime.** Our 2nd-gen functions set no `serviceAccount`, so every function runs as this account and reads secrets as it. | A function logs permission denied reading a secret. The deploy normally grants this itself. |
| `firebase-adminsdk-…@moondreams-dev-apps.iam.gserviceaccount.com` | Firebase's downloadable Admin SDK identity. Nothing here uses it. | Never. |

Grant access to one secret only, never project-wide:

```bash
# deployer: needs to set the secret's IAM policy
gcloud secrets add-iam-policy-binding <SECRET_NAME> --project=moondreams-dev-apps \
  --member="serviceAccount:<github-action-account-email>" --role="roles/secretmanager.admin"

# runtime: needs to read the secret
gcloud secrets add-iam-policy-binding <SECRET_NAME> --project=moondreams-dev-apps \
  --member="serviceAccount:<project-number>-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

## Per-function notes

### A-List Tracker: `getCalendarShare`

- **Public by design, so it is strict about what it returns.** It reads `apps/a-list/calendarShares/{shareId}` with the admin SDK (clients can't read that collection unless they own the document), and copies only allowlisted fields into the response (`calendarShareView.ts`). The owner's uid, the PIN and any extra field on the document never leave it.
- **PIN:** an open share (`pin: null`) is returned as is. A locked one answers `pin_required` until a PIN arrives, then `wrong_pin` or the calendar. The PIN is trimmed, uppercased and compared in constant time. There is **no attempt limit**.
- **Ids:** anything that isn't 26 characters of the share alphabet, any unknown id and a deleted share all return `not_found`, so a caller can't tell which ids exist.
- **No secrets, no cache, no logging of ids or PINs.** Deploying a new callable may need the one-time invoker fix in the root README's [New Cloud Functions & Cloud Run invoker access](../README.md#new-cloud-functions--cloud-run-invoker-access).

### A-List Tracker: `searchMovies` and `getMovie`

- **Full flow:** the end-to-end outline (search, caching, provider choice, budget, details, refresh) is in `src/apps/a-list/TECHNICAL.md` under "Movie Data Service" → "How a lookup works, end to end".
- **Providers:** [TMDB](https://www.themoviedb.org/) is used whenever `TMDB_API_KEY` is set, otherwise [OMDb](https://www.omdbapi.com/) (free tier, about 1,000 lookups a day for the whole app). `MOVIE_PROVIDER` forces one. TMDB lists unreleased films; OMDb mostly does not.
  - **Keys:** new movies are saved as `tmdb-<id>`; older ones stay `imdb-tt…` and keep refreshing through OMDb, so keep `OMDB_API_KEY` set. `getMovie` asks the provider that issued the key.
  - **TMDB credential:** either the v4 "API Read Access Token" (sent as a Bearer header) or the v3 API key (sent as `api_key`); it is detected from the value.
  - **Search:** up to 20 results, newest release first (a second page is fetched when there is one). **Details:** US theatrical date, US rating, runtime, poster.
  - **Terms:** TMDB is free for non-commercial use only and requires its credit line and logo (shown in Membership settings); cached data must be under 6 months old (ours is 7 days or less).
- **Server cache:**
  - `apps/a-list/searchCache`: 7 days.
  - `apps/a-list/movieCache`: 30 days once a movie is released, 1 day before that (unreleased dates move).
- **Budget:** for OMDb only, `lookupBudget.ts` counts every upstream call in `apps/a-list/lookupUsage`. It refuses with `resource-exhausted` at 900 a day app-wide or 100 per member. TMDB has no practical daily limit, so it is not budgeted (the cache still applies).
- **Access:** clients can't read or write `searchCache`, `movieCache` or `lookupUsage`.
- **Offline fixtures:**
  - In the emulator with no key readable at all, both callables answer from a built-in OMDb-shaped catalog (try "galaxy", "matrix" or "starlight").
  - Unknown ids return `not-found`.

### A-List Tracker: `findTheatres`

- **Flow:** the full outline is in `src/apps/a-list/TECHNICAL.md` under "Theater Data Service". A zip code goes to AMC's `/v2/location-suggestions` for coordinates, then `/v2/locations` for the nearest theaters; other text returns the suggested places (city, state) for the member to confirm, plus name matches from `/v2/theatres`; a confirmed state goes to `/v2/locations/states/{state}`.
- **Server cache:** `apps/a-list/theatreCache`: suggested places for 30 days; a neighborhood's, a state's and the full theater list for 7 days (neighborhoods keyed on coordinates rounded to two decimals).
- **Budget:** `lookupBudget.ts` counts every upstream call in `apps/a-list/lookupUsage` (own `theatres_` counters) and refuses with `resource-exhausted` at 500 a day app-wide or 40 per member.
- **Access:** clients can't read or write `theatreCache`.
- **Offline fixtures:** in the emulator with no key readable, it answers from three built-in theaters.
- **Verified live (2026-10-09):** the suggestion, locations, state and theater-list shapes, that `/v2/theatres?page-size=1000` returns all 521 theaters in one page, and that AMC answers a no-match *suggestions* search with HTTP 400 (only that call treats a 4xx as an empty result). Its `timezone` is a name like "CENTRAL TIME", mapped to an IANA zone here.

### A-List Tracker: `findShowtimes`

- **Secrets:** the same `AMC_API_KEY` and budget as `findTheatres`; nothing new to set up.
- **Flow:** reads `/v2/theatres/{id}/showtimes/{M-D-YYYY}` (`page-size` 200, up to 3 pages), keeps the movie's showings by title, and reads each one's format from its attributes (IMAX, Dolby, PRIME, RealD 3D, Laser, otherwise Standard), its adult `ticketPrices` entry and its https `purchaseUrl`.
- **Server cache:** the whole day at a theater, 15 minutes, in `apps/a-list/theatreCache`; every movie asked about that day shares it.
- **Offline fixtures:** in the emulator with no key readable, every title gets five showings (Standard, IMAX, Standard, Dolby, a sold-out Standard).
- **Check after the key is set:** the response parsing was written from AMC's public docs and a third-party reference of live responses, and has not been run against the live API. Still unconfirmed: that `movieName` and `purchaseUrl` are present on every showtime, the Dolby and PRIME attribute codes, and the `/v2/locations` and `/v2/location-suggestions` shapes.

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
- **New secret:** create it in production *before* the PR merges, or the CI functions deploy fails and nothing ships. If the first deploy then fails on a Secret Manager permission, see [Service accounts](#service-accounts).
- **New callable:** if the browser reports a CORS error after its first deploy, run the invoker fix in the root README's [New Cloud Functions & Cloud Run invoker access](../README.md#new-cloud-functions--cloud-run-invoker-access).
- **Server-only collection:** give it a deny-all block in `firestore.rules`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Emulator says a function isn't found, or `lib/index.js` doesn't exist | `functions/lib/` wasn't built. Start through `npm run emulators` (it builds first), or run `npm --prefix functions run build`. |
| Browser CORS error on a callable in production | Missing public-invoker grant. See the root README's invoker section. |
| CI deploy fails on functions with a secret error | The secret doesn't exist in production yet. Set it with `firebase functions:secrets:set`. |
| CI deploy fails with `secretmanager.secrets.getIamPolicy` or `setIamPolicy` | The deployer account can't manage that secret. Grant it per [Service accounts](#service-accounts). |
| A function returns an error reading its secret at runtime | The runtime (default compute) account can't read that secret. Grant it per [Service accounts](#service-accounts). |
| A-List search shows sample movies locally | The emulator couldn't read any movie key: `.secret.local` has no value and Secret Manager access failed (not signed in to Google, or no access to the secret). Add a key to `functions/.secret.local` and restart the emulators. |
| A changed `.env.local` cap or `.secret.local` key has no effect | The emulators read these files only at startup. Restart them. |
