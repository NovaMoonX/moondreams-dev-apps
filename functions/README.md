# Cloud Functions for MoonDreams Apps

Server-side code for the apps. Every function:

- is exported from `functions/src/index.ts`;
- runs in `us-central1`;
- is deployed by CI on every merge to `main` (see the root README's [Deployment](../README.md#deployment)).

## Functions

| Function | Trigger | App | What it does |
| --- | --- | --- | --- |
| `getPopularMovies` | callable | A-List Tracker | `{}` → `{ results }` (up to 30, most popular first, each with `opensOn` for a film not yet open, a YouTube `trailerUrl`, a trimmed `overview` and up to three `genres`): what is in US theaters now plus what opens soon, from TMDB; empty on OMDb |
| `searchMovies` | callable | A-List Tracker | `{ query }` → `{ results }` (up to 20, newest first) from TMDB, or OMDb when no TMDB key is set |
| `getMovie` | callable | A-List Tracker | `{ movieKey }` → a movie snapshot (release date, runtime, rating, poster) from the provider that issued the key (`tmdb-…` or `imdb-…`) |
| `getCalendarShare` | callable, **no sign-in** | A-List Tracker | `{ shareId, pin? }` → `{ status: 'ok', calendar }`, or `pin_required`, `wrong_pin`, `not_found`. Serves a calendar share to anyone with its link |
| `findTheatres` | callable | A-List Tracker | `{ query }` (a 5-digit zip code, a city or state, or part of a theater's name), `{ state }` or `{ latitude, longitude }` → `{ theatres, places, area }`: the closest AMC theaters (up to 10 nearest first, 25 for a state, each with its time zone), or for a typed city or state the places to confirm plus theaters matching the name, from the AMC Theatres API |
| `findShowtimes` | callable | A-List Tracker | `{ theatreId, date, title }` → `{ showtimes }`: a movie's showings at an AMC theater that day, with format, list price, a Standard price to compare and a purchase link |
| `triggerBoxAction` | callable | Worth the Wait | Runs the locked reveal/raffle workflow ([details](../src/apps/worth-the-wait/PRODUCT.md)) |
| `deleteTrip` | callable | Waypoint | Deletes a trip and everything a client `deleteDoc` can't reach (subcollections, requests, email invitations, members' personal expenses, reminders, cover) |
| `shiftTripDates` | callable | Waypoint | Moves a trip's dates while keeping every event, stay, rental and expense on its calendar day ("keep original dates"); checklist due days stay relative to the trip's start and are left alone |
| `rescheduleTripReminders` | Firestore update on `apps/waypoint/trips/{tripId}` | Waypoint | Re-times event reminders when a relative trip's dates or time zone change |
| `notifyTripAnnouncement` | Firestore create on `apps/waypoint/trips/{tripId}/announcements/{id}` | Waypoint | Pushes a new announcement to everyone on the trip except its author |
| `notifyTripIdea` | Firestore create on `apps/waypoint/trips/{tripId}/ideas/{id}` | Waypoint | Pushes a new idea to everyone on the trip except whoever added it |
| `sendExpenseWrapUp` | scheduled, every 30 minutes | Waypoint | At 9 PM trip time, asks the trip's Admins to mark that day's still-expected expenses as paid |
| `recordPipelineEvent` | callable | shared | `{ key, kind: 'session', sessionId, state, url, branch, raisedHands }`, `{ key, kind: 'cost', sessionId, url, branch, app, contextTokens, calls, rows }` or `{ key, kind: 'inbox', prs, merged }` (`merged`: the PRs merged in the last 14 days, `{ number, sessionUrl, mergedAt, title, statusAt, decisions, followUps }`, up to 50; the lists are the calls made for the owner and the possible follow-ups from the PR's last status comment, kept for the newest PRs while they fit the document) → `{ ok }`. Called by curl from Claude Code hooks and by the owner-inbox workflow, not signed in: the shared `PIPELINE_KEY` is the only check. Writes `pipelineSessions/{sessionId}` (and prunes sessions untouched for 14 days), `pipelineCost/{sessionId}` (a session's whole token use by day, model and phase, rewritten in full each turn; up to 600 rows, bad rows dropped; prunes docs untouched for 180 days) or `pipeline/inbox`, which only the admin reads |
| `answerPipelineQuestions` | callable | shared | Admin only. `{ answers: [{ prNumber, items: [{ question, choices, other, note }] }] }` (`choices` the options picked, `other` what was typed under Other, `note` a free-text answer or the "Anything else?" box; a page still sending one `choice` is read as `choices: [choice]`) (up to 20 pull requests, each with its questions and the Anything else box, 21 items at most) → `{ isSample, results: [{ prNumber, ok, url, postedAt, error }] }`. Each pull request also carries `marks`, the asks it answers (`"<pr>:<index>"` for a question, `"<pr>:reply"` for 🚩 lines, `"<pr>:d:<hash>"` and `"<pr>:f:<hash>"` for each decision and follow-up line, the hash being 8 hex digits of the line's words; the old whole-list `"<pr>:decisions"` and `"<pr>:followups"` are still accepted); once posted they are stamped in `pipeline/answered` (`marks: { [mark]: postedAt }`), and the dashboard stops counting an ask whose stamp is newer than the status that raised it, so an answered card leaves Waiting before the session wakes and a skipped question stays; a decision or follow-up line is hidden by its own stamp whatever status lists it. A status comment rewritten for any reason brings its unanswered-looking questions back, since a stamp counts only against the status that raised the ask; marks are not pruned (a few bytes each, far below a document's limits). Posts each open pull request's answers as one comment from the owner's own GitHub token (`PIPELINE_GITHUB_TOKEN`), so the session watching it wakes; a merged pull request takes the comment too, and its `issues` (each a changed call or a picked follow-up, with a title and the owner's words) then open one GitHub issue each, reported back as `issues` and never failing the send (each issue carries the label `from-pipeline` and a `pipeline-issue:<mark>` marker; the open ones from the last 14 days are listed once first, so a retry, including one that finds the comment already posted, opens only what is missing; they are opened one at a time, a busy reply stops the rest, and a line whose issue could not be opened gets no stamp so it stays to be sent again; the emulator opens none and reports what it would have for the PRs its seeded inbox lists as merged); a failure on one PR never hides the others |
| `settlePipelineAsk` | callable | shared | Admin only. `{ prNumber, sessionId, text, outcome: 'done' \| 'skipped' \| 'open' }`, exactly one of `prNumber` or `sessionId`. With a PR it ticks (or unticks) the owner's line matching `text` in the PR's latest trusted `<!-- pr-status -->` comment, adding `(owner: done)` or `(owner: not doing it)`, with `PIPELINE_GITHUB_TOKEN`; then it records the ask in `pipeline/settled` (a 🚩 line from a session is only recorded). Returns `{ ok, error, at }`; GitHub refusals come back as `error` sentences. In the emulator it records and posts nothing. |
| `mergePipelinePr` | callable | shared | Admin only. `{ prNumber }` → `{ ok, outcome: 'asked' \| 'merged' \| null, url, error, isSample }`. It checks the gates again on GitHub before writing anything: the pull request is open, its latest trusted `<!-- pr-status -->` comment exists, isn't `in progress`, has a "Must do before merge" heading with no open box under it, has no open owner question in the inbox's stored list (the one the dashboard numbers its `pipeline/answered` marks by) that no dashboard answer has come in for since that status, and the inbox has read the newest status (refused with a try-again otherwise) and names the current head's sha in its heading; it has no `merge-conflict` label, isn't behind its base (the `behind-base` label or the compare API), and GitHub has finished checking it for conflicts; and every check run on its head passed (each check's latest run, as the inbox reads them; more than 100 runs is refused). A session that reported in the last 3 days (`pipelineSessions` with the status's session link, or the body's) drives it: it posts `Merge it (from the admin dashboard)` unless that comment is already there since the status last changed, and the session merges it through the merge line (`outcome: 'asked'` means asked, not merged). Otherwise, for a PR into `main`, it refuses while `firebase-hosting-merge.yml` has a run queued or in progress (checked before and again after taking the lock, since the deploy group keeps only one run waiting), takes the `merge-lock` branch the way `scripts/mergeLock.sh` does (a non-forced commit; refused while held for another PR, reused only when an earlier dashboard click left it held for this one; a failed release re-reads the lock before saying it is still held), marks a draft ready for review (GraphQL `markPullRequestReadyForReview`), squashes it with the PR's title and number, pinned to the head it checked, and frees the lock; a lock it couldn't free comes back as `error` beside `ok: true`, with the release command. Taking the lock is its first write, so a token without Contents write is refused before a draft is touched. A timeout or lost reply after the merge request says it may have merged. Uses `PIPELINE_GITHUB_TOKEN`; refusals come back as `error` sentences. In the emulator it checks the seeded `pipeline/inbox` and posts nothing (`isSample`). |
| `getFirebaseUsage` | callable | shared | Admin only. Returns this month's Firestore, Realtime Database, Cloud Storage and Functions usage against the free amounts, an estimated Blaze cost, and stored data per app |
| `registerAppUsage` | callable | shared | `{ appId }` → the caller's `apps/{appId}/usage/{uid}` record (`startedAt`, `lastActiveAt`). Creates it the first time a member opens an app, dating `startedAt` at the oldest data that app already holds for them |
| `fetchLinkMetadata` | callable | shared | Reads a link's Open Graph preview (title, description, image, site name) |
| `fetchPageContent` | callable | shared | `{ url, include?, schemaTypes?, maxTextChars? }` → `{ url, title, …only the kinds asked for }`: reads one web page and returns its `text` (capped, 30k by default, `maxTextChars` clamped to 1k–60k), `structuredData` (its schema.org nodes, optionally only the given `schemaTypes`, whole nodes up to 30k characters, with every key's leading `@` written as `_`: `@type` is `_type`, because a callable's client refuses any response that holds an `@type` key; an oversized node keeps its smaller fields, each field measured once, so a node with thousands of fields is cheap), `meta` (description, image address, site name, author), `headings` (h1–h3 text, up to 40) or `images` (absolute web addresses, up to 20). Defaults to `text` and `meta`. The text skips `nav`, `footer`, `form` and scripts. App-neutral: each app turns the content into its own thing. Fetches through the same private-network guard as `fetchLinkMetadata`, stores nothing |
| `searchRecipeImages` | callable | Pinch | `{ query }` (a recipe's title and the word "recipe", at most 80 characters) → `{ results }`: up to 6 pictures, each `{ thumbUrl, imageUrl, title, host }` with both addresses https, from DuckDuckGo images first and Google Programmable Search as the fallback, in the order `IMAGE_SEARCH_PROVIDERS` names them. Cached, budgeted and rate-limited per person; stores no one's query beyond the shared answer |
| `getPinchShare` | callable, **no sign-in needed** (a signed-in caller only learns whether the share is theirs) | Pinch | `{ shareId }` → `{ status: 'ok', kind, sharedAt, isOwner, ownerSourceId, recipe, meal }`, or `{ status: 'not_found' }` for a malformed, unknown or deleted id alike. Serves a shared recipe or saved meal to anyone with its link; never returns the owner's uid |
| `changePinchShare` | callable | Pinch | `{ action, … }` with `action` one of `create`, `update`, `renew`, `delete` → `{ shareId }` (null once deleted). Makes a share (the server mints the id), takes its copy again, gives it a new address, or ends it; up to 30 shares per person |
| `copyPinchShareCover` | callable | Pinch | `{ shareId, index, recipeId }` → `{ coverPath }`: copies a shared recipe's cover onto the signed-in visitor's own new recipe, or `{ coverPath: null }` when there is nothing to copy |
| `getRunwayKey` | callable | Runway | `{}` → `{ appId: 'runway', keyId, keyVersion, key }`: the caller's plan data key (64 hex characters), over TLS. Creates the key and stores it wrapped under the current master key only when the plan has none; never when unwrapping fails (it answers `failed-precondition` and logs `runway.keys.unwrapFailed` with the master key id). Re-wraps a key stored under an older master key id |
| `verifyRunwayKeys` | scheduled (daily, 06:17 UTC) | Runway | Reads `RUNWAY_MASTER_KEYS` and, for every id, opens that id's canary at `apps/runway/keyChecks/{masterKeyId}`. Writes one log entry per run: `runway.keys.ok` (INFO) or `runway.keys.failed` (ERROR, with the ids and reasons). Logs ids and reasons only, never a key, a wrapped key or a canary |
| `deleteRunwayPlan` | callable | Runway | `{ phrase }` → `{ deleted, receipts }`: removes the caller's plan (every document below `apps/runway/plans/{uid}`, children first, the plan document last), the wrapped data key under `apps/runway/server/{uid}` and receipt objects under `apps/runway/receipts/{uid}/`. Needs the phrase `delete my plan` and a sign-in from the last five minutes; the uid is the caller's; a plan already gone answers `deleted: 0`. No new secret |
| `claimDeviceToken` | Firestore write, `users/{uid}` | shared | When an account registers a device's push token, takes that token off every other account, so after an account switch the device stops getting the previous account's pushes |
| `sendScheduledReminders` | schedule, every minute | shared | Sends due push reminders from `reminders` through FCM, and deletes finished ones after two weeks |
| `sendEatSoonDigest` | schedule, every 30 minutes | Pinch | Sends each person who turned it on one push a day, in their own hour, naming the dishes in their fridge and freezer and, if they also turned that on, the ingredients in their pantry that are past their date or due soon |

Every callable requires a signed-in caller, except `getCalendarShare` and `getPinchShare`, which exist to serve people who have no account.

## Secrets and config

| Name | Kind | Used by | Set it with |
| --- | --- | --- | --- |
| `TMDB_API_KEY` | Functions secret, **required to deploy** | `searchMovies`, `getPopularMovies`, `getMovie` | `firebase functions:secrets:set TMDB_API_KEY --project moondreams-dev-apps` (paste the TMDB "API Read Access Token" or the v3 API key) |
| `OMDB_API_KEY` | Functions secret, **required to deploy** | `searchMovies`, `getPopularMovies`, `getMovie` | `firebase functions:secrets:set OMDB_API_KEY --project moondreams-dev-apps` |
| `AMC_API_KEY` | Functions secret, **required to deploy** | `findTheatres`, `findShowtimes` | `firebase functions:secrets:set AMC_API_KEY --project moondreams-dev-apps` (the vendor key from [developers.amctheatres.com](https://developers.amctheatres.com), sent as `X-AMC-Vendor-Key`) |
| `RUNWAY_MASTER_KEYS` | Functions secret, **required to deploy**: a JSON keyring, `{ "current": "m1", "keys": { "m1": "<64 hex characters>" } }` | `getRunwayKey` | `firebase functions:secrets:set RUNWAY_MASTER_KEYS --project moondreams-dev-apps` (paste the keyring JSON; generate a key with `openssl rand -hex 32`). Ids are only ever added, never removed or reused. See "Runway: the master keyring" below. |
| `MOVIE_PROVIDER` | env, optional (`tmdb` or `omdb`) | `searchMovies` | `functions/.env.local` locally. Forces a provider; unset, TMDB is used whenever its key is set. |
| `TMDB_API_BASE` | env, optional | TMDB calls | `functions/.env.local`. Points TMDB calls at another server; a test aid, never set in production. |
| `AMC_API_BASE` | env, optional | AMC calls | `functions/.env.local`. Points AMC calls at another server; a test aid, never set in production. |
| `A_LIST_THEATRE_APP_DAILY_LOOKUP_CAP` / `A_LIST_THEATRE_MEMBER_DAILY_LOOKUP_CAP` | env, optional (defaults 500 and 40) | `findTheatres` | `functions/.env.local` locally |
| `A_LIST_SHOWTIME_APP_DAILY_LOOKUP_CAP` / `A_LIST_SHOWTIME_MEMBER_DAILY_LOOKUP_CAP` | env, optional (defaults 2000 and 200) | `findShowtimes` (its own budget, counted in `lookupUsage` under `showtimes_`) | `functions/.env.local` locally |
| `PIPELINE_KEY` | Functions secret, optional (reporting is off without it) | `recordPipelineEvent` | Read at run time, never bound, so a deploy never needs it. `firebase functions:secrets:set PIPELINE_KEY --project moondreams-dev-apps` (any long random string, e.g. `openssl rand -hex 32`), then give the runtime account `roles/secretmanager.secretAccessor` on it (the `gcloud secrets add-iam-policy-binding` line under "Secrets and config"; without it every call answers "Pipeline reporting is off"); the same value goes in the `PIPELINE_KEY` GitHub secret and the Claude Code environment. `functions/.env.local` locally | `npm run pipeline:secrets -- key` does every step from the owner's machine.
| `PIPELINE_GITHUB_TOKEN` | Functions secret, optional (answering from the dashboard is off without it) | `answerPipelineQuestions`, `settlePipelineAsk` (edits the status comment, which the token's Pull requests or Issues write already covers), `mergePipelinePr` (a direct merge also needs Contents: Read and write and Actions: Read-only) | Read at run time, never bound, so a deploy never needs it. Create a fine-grained personal access token at github.com/settings/personal-access-tokens for the owner's account, only this repository, with Pull requests: Read and write, Issues: Read and write, Contents: Read and write and Actions: Read-only (Contents and Actions only for merging a pull request no session drives; a comment on a pull request goes through the issues API, but GitHub may ask for the pull-request permission for it). A refused send names the permissions GitHub asked for (its `X-Accepted-GitHub-Permissions` header) and says to edit the existing token, which keeps its value, so nothing needs saving again; `npm run pipeline:secrets -- check` tests the saved token with an empty comment GitHub rejects as invalid (422) once the token may comment, so nothing is posted, and with a merge of an already-merged pull request, which GitHub answers with 200, 405, 409 or 422 once the token may merge and 403 when it may not, and lists the deploy workflow's runs. `firebase functions:secrets:set PIPELINE_GITHUB_TOKEN --project moondreams-dev-apps`, then the same `roles/secretmanager.secretAccessor` grant as `PIPELINE_KEY`. Comments appear as the token's owner. `functions/.env.local` locally | `npm run pipeline:secrets -- token` does every step from the owner's machine.
| `IMAGE_SEARCH_PROVIDERS` | env, optional (default `ddg,google`) | `searchRecipeImages` | `functions/.env.local` locally; in production a committed `functions/.env` line (`IMAGE_SEARCH_PROVIDERS=google`) and a deploy. Providers are tried in the order listed and the first with pictures wins; `google` alone makes Google the only one. Unknown names are ignored. |
| `GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX` | Secret Manager secrets, **optional, not bound to the function, so the deploy never needs them** | `searchRecipeImages` (the Google provider) | See "Pinch: `searchRecipeImages`" below. Absent, the Google provider is skipped. Locally, `functions/.env.local` (`GOOGLE_CSE_KEY=…`) is read first. |
| `IMAGE_SEARCH_GOOGLE_DAILY_CAP` / `IMAGE_SEARCH_DDG_DAILY_CAP` | env, optional (defaults 90 and 1500) | `searchRecipeImages` | `functions/.env.local` locally. Google's free tier is 100 a day, counted from midnight Pacific time. |
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
- **No secrets, no cache, no logging of ids or PINs.** A new callable is opened to the browser by the deploy itself (root README's [New Cloud Functions & Cloud Run invoker access](../README.md#new-cloud-functions--cloud-run-invoker-access)).

### A-List Tracker: `searchMovies`, `getPopularMovies` and `getMovie`

- **Full flow:** the end-to-end outline (search, caching, provider choice, budget, details, refresh) is in `src/apps/a-list/TECHNICAL.md` under "Movie Data Service" → "How a lookup works, end to end".
- **Providers:** [TMDB](https://www.themoviedb.org/) is used whenever `TMDB_API_KEY` is set, otherwise [OMDb](https://www.omdbapi.com/) (free tier, about 1,000 lookups a day for the whole app). `MOVIE_PROVIDER` forces one. TMDB lists unreleased films; OMDb mostly does not.
  - **Keys:** new movies are saved as `tmdb-<id>`; older ones stay `imdb-tt…` and keep refreshing through OMDb, so keep `OMDB_API_KEY` set. `getMovie` asks the provider that issued the key.
  - **TMDB credential:** either the v4 "API Read Access Token" (sent as a Bearer header) or the v3 API key (sent as `api_key`); it is detected from the value.
  - **Search:** up to 20 results, newest release first (a second page is fetched when there is one). **Details:** US theatrical date, US rating, runtime, poster.
  - **Terms:** TMDB is free for non-commercial use only and requires its credit line and logo (shown in Membership settings); cached data must be under 6 months old (ours is 7 days or less).
- **Popular in theaters:** `getPopularMovies` (signed-in callers only) merges TMDB's US now-playing and upcoming lists by popularity. OMDb has no such list, so it answers empty (only the emulator fixtures answer offline). Building the list makes one extra TMDB `/videos` call per film (a failed one just leaves that film without a trailer link). An empty answer is never cached.
- **Server cache:**
  - `apps/a-list/searchCache`: 7 days for searches, 1 day for the popular list.
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
- **Flow:** reads `/v2/theatres/{id}/showtimes/{M-D-YYYY}` (`page-size` 200, up to 3 pages), keeps the movie's showings by title, and reads each one's format from its attributes (IMAX, Dolby, PRIME, RealD 3D, Laser, otherwise Standard), its Adult, Senior and Child `ticketPrices` entries (per-showing `prices`, and each entry's optional `tax` as `taxes`; AMC doesn't always send it, so a missing one is null). AMC's `price` includes its `tax` (checked against amctheatres.com for Adult at Chattanooga 18: 14.19 with tax 1.20 is the site's 12.99; Senior and Child assumed alike), so `prices` is the difference; with no usable tax the price is kept as is. It also reads each showing's https `purchaseUrl`.
- **Server cache:** the whole day at a theater, 15 minutes, in `apps/a-list/theatreCache`; every movie asked about that day shares it.
- **Offline fixtures:** in the emulator with no key readable, every title gets five showings (Standard, IMAX, Standard, Dolby, a sold-out Standard).
- **Check after the key is set:** the response parsing was written from AMC's public docs and a third-party reference of live responses, and has not been run against the live API. Still unconfirmed: that `movieName` and `purchaseUrl` are present on every showtime, the Dolby and PRIME attribute codes, and the `/v2/locations` and `/v2/location-suggestions` shapes.

### Runway: `getRunwayKey` and the master keyring

- **What it guards:** each plan has one random 256-bit data key, stored only wrapped (AES-256-GCM, the uid as authenticated data) at `apps/runway/server/{uid}/keys/data`, which no client rule can read. Losing the keyring loses every plan.
- **Flow:** in one transaction it reads that document; absent, it creates a key and wraps it under the keyring's `current` id; present, it unwraps it with the id the document names and, when that is not `current`, re-wraps it under `current`. A failed unwrap answers `failed-precondition` and never writes: nothing replaces a stored key. The raw key goes only to its owner in the response and is never stored or logged.
- **Cold-start check:** the keyring is validated on an instance's first call (and again if the secret text changes). A malformed keyring, a `current` that is not in `keys` or any key that is not 32 bytes of hex fails every call and logs `runway.keys.keyringInvalid`.
- **Log events:** `runway.keys.unwrapFailed` (ERROR, with `masterKeyId`, no bytes), `runway.keys.keyringInvalid` (ERROR), and from the daily check `runway.keys.ok` (INFO, `checked`) and `runway.keys.failed` (ERROR, `failures: [{ masterKeyId, reason }]`).
- **Emulator:** reads `RUNWAY_MASTER_KEYS` from `functions/.secret.local`, one line in the form `RUNWAY_MASTER_KEYS='{"current":"m1","keys":{"m1":"<64 hex>"}}'`. With no value the built-in development keyring (`DEV_KEYRING` in `planKey.ts`) is used, and only when `FUNCTIONS_EMULATOR` is set; production never falls back. `npm run seed` reads the same file, so seeded plans open under whatever keyring the emulator runs with; change the file and run `npm run seed:reset` (and restart the emulators).
- **Runbook stub:**
  1. Create the secret before the PR that binds it merges, with a keyring of one key (the command above). The deploy fails without it.
  2. Save the keyring to storage outside Google Cloud (a password manager entry, plus a second secure account) as soon as it exists.
  3. Never run `firebase functions:secrets:destroy` or `secrets:prune` against it; a PR that removes the last function binding to it is rejected.
  4. **Set the destruction delay once:** `gcloud secrets update RUNWAY_MASTER_KEYS --version-destroy-ttl=90d --project moondreams-dev-apps`. A destroyed version is disabled at once and only gone after 90 days, so it can be re-enabled in between. It does not protect against deleting the whole secret, so the secret has no expiry or TTL either.
  5. **Add a key (rotation, or restoring one):** `npx tsx scripts/runway/publishKeyring.ts --project moondreams-dev-apps --new-id m2` (add `--dry-run` to see what would change, `--keep-current` to add the key without making it current; a restored key comes in `RUNWAY_NEW_KEY`, 64 hex, never as an argument). It needs `gcloud` signed in as a maintainer and Admin SDK credentials for the project. It reads the latest version, refuses a result that drops or changes an id, names a `current` that is not in `keys`, reuses an id or holds a key that is not 32 bytes, writes the new key's canary, then adds the secret version (and removes the canary again if adding fails). It prints the ids and which is current, never key bytes. Afterwards save the new keyring to escrow.
  6. **The daily check:** the scheduler runs `verifyRunwayKeys`; run it by hand from the Cloud Scheduler console ("Force run"), or locally against the emulators with `npm run check:runway-keys` (fake keyrings, every refusal and failure). Read it with the log filter `jsonPayload.event="runway.keys.ok"` or `"runway.keys.failed"`.
  7. **What each `reason` means:** `missing-canary` (an id in the keyring has no canary: a publish stopped half way, or the document was deleted; the key is untested until it is restored), `unwrap-failed` (the canary does not open under that id's key: the keyring holds a different key or the canary was altered; treat as a lost key), `missing-id` (a canary exists for an id the keyring no longer has: an id was dropped, restore it from escrow now), `keyring-invalid` (the latest version is malformed, its `current` is not in `keys` or a key is not 32 bytes), `secret-unreadable` (the version could not be read, for example it is disabled or destroyed: re-enable it within the delay), `check-error` (the canaries could not be read). If the function does not run at all, for example because the latest version is disabled so the instance cannot start, no entry is written; the missing-heartbeat alert in Issue 26 is what catches that.
  8. **Alerts, deny policy, escrow and the recovery drill** are in "Runway: master keyring protection runbook" below. Until the owner has run it and filled in its record table, the log events exist but nothing notifies anyone.

### Runway: master keyring protection runbook

Run by the owner, in this order, before any real person's plan exists. Nothing here has been run from the repo's sandbox: every box below stays empty until the owner ticks it and fills the record tables at the end. The commands are written from Google's documentation and the repo's own scripts; where a Google behaviour is not confirmed, the step says so and what to do either way.

**Who holds what (fill in).** One person holds everything until the Succession issue (Issue 75) ships: the Google Cloud project, the billing account, the break-glass account and both escrow copies. If that person is unavailable and billing lapses or the project is closed, the secret and every wrapped data key go with it, and there is no second person who can recover them. That is a deliberate limit of the MVP, not an oversight.

| Role | Held by | Where |
| --- | --- | --- |
| Escrow holder (both copies) | `<name>` | Password manager vault `<name>`; second cloud account `<provider and account>` (not the Firebase project's Google account) |
| Alert recipients | `<email>`, phone push through the Google Cloud mobile app `<yes/no>` | One email notification channel in the real project and one in the scratch project |
| Break-glass account (deny policy exception) | `<account>` | Credentials in the password manager vault only |

Set these once (replace the values; no command below embeds a secret):

```bash
export PROJECT=moondreams-dev-apps
export SCRATCH=<your scratch project id>   # a throwaway project with billing; never PROJECT
export OWNER_EMAIL=<alert email>
```

#### 1. Destruction delay, no expiry, least privilege (real project)

- [ ] Set the delay (applies to every enabled and disabled version already there):

  ```bash
  gcloud secrets update RUNWAY_MASTER_KEYS --version-destroy-ttl=90d --project=$PROJECT
  ```

- [ ] Confirm it, and confirm there is no expiry, TTL or rotation schedule. `versionDestroyTtl` must read `7776000s` and `expireTime`, `ttl` and `rotation` must be absent:

  ```bash
  gcloud secrets describe RUNWAY_MASTER_KEYS --project=$PROJECT \
    --format="yaml(name,versionDestroyTtl,expireTime,ttl,rotation)"
  ```

- [ ] Secret-level access. Only the runtime service account (`<project-number>-compute@developer.gserviceaccount.com`, see Service accounts) may hold `roles/secretmanager.secretAccessor`, and nobody holds `secretmanager.admin` or `secretmanager.secretVersionManager`:

  ```bash
  gcloud secrets get-iam-policy RUNWAY_MASTER_KEYS --project=$PROJECT
  ```

- [ ] Project-level access. Owner, Editor, Secret Manager Admin and Secret Version Manager at the project all include destroy, and they apply to this secret. List them and write down every member in the audit table:

  ```bash
  gcloud projects get-iam-policy $PROJECT --flatten="bindings[].members" \
    --format="table(bindings.role,bindings.members)" \
    --filter="bindings.role:(roles/owner OR roles/editor OR roles/secretmanager.admin OR roles/secretmanager.secretVersionManager)"
  ```

  Two members need a decision, not just a note. The default compute service account (the runtime) has historically been granted Editor on the project, and the code running as it could then destroy a version; remove Editor from it if it holds it (the function needs only `secretAccessor`, `datastore.user` and what its deploy grants; test a deploy afterwards). The GitHub Actions deployer is granted `secretmanager.admin` per secret (see Service accounts above) so it can set IAM policies; if it holds it on this secret, record that as a known exception (its key is a GitHub secret) or narrow it. Humans: keep the everyday account out of Owner if you can, and use a separate account for administration.

#### 2. Deny policy (scratch project first)

The design wants an IAM deny policy on `secretmanager.googleapis.com/secrets.delete` and `secretmanager.googleapis.com/versions.destroy` so that even a project Owner cannot destroy the secret except through a named break-glass account. Three things are unconfirmed; settle each in `$SCRATCH` and write the answer in the record table:

1. **Is Secret Manager supported by deny policies, and under which permission names?** Google keeps a list of deny-supported permissions; look up `secretmanager.googleapis.com/secrets.delete` and `secretmanager.googleapis.com/versions.destroy` in it (and decide whether `versions.disable` should be denied too; it is reversible and the audit alert covers it).
2. **Can a deny policy be created at the organization or project this account has?** The Deny Admin role (`roles/iam.denyAdmin`) is documented as grantable on an organization. Check whether the scratch project and the real project sit under one: `gcloud projects get-ancestors $PROJECT` lists an `organization` entry when they do. A project owned by a personal account has none.
3. **Does Owner bypass it, and what is the break-glass exception?**

Steps (needs `roles/iam.denyAdmin` for you on the attachment point):

```bash
cat > /tmp/runway-deny.json <<JSON
{
  "displayName": "Protect the Runway master keyring",
  "rules": [
    {
      "denyRule": {
        "deniedPrincipals": ["principalSet://goog/public:all"],
        "exceptionPrincipals": ["principal://goog/subject/<break-glass-email>"],
        "deniedPermissions": [
          "secretmanager.googleapis.com/secrets.delete",
          "secretmanager.googleapis.com/versions.destroy"
        ],
        "denialCondition": {
          "title": "Only the Runway master keyring",
          "expression": "resource.name.contains('/secrets/RUNWAY_MASTER_KEYS')"
        }
      }
    }
  ]
}
JSON
gcloud iam policies create runway-protect-keyring --kind=denypolicies \
  --attachment-point=cloudresourcemanager.googleapis.com/projects/$SCRATCH \
  --policy-file=/tmp/runway-deny.json
```

The JSON follows Google's deny-policy format from its documentation and has not been run here. If `resource.name` is refused as a condition, drop `denialCondition` in the scratch project to test the principle (the policy then covers every secret in that project), and record that the real policy cannot be scoped to one secret. A policy without the condition would also block destroying versions of, and deleting, every other secret in the real project for everyone except the break-glass account (for example the Firebase CLI's clean-up of old versions when another function secret is rotated), so decide that trade before applying it there. Allow several minutes for a new policy to take effect.

- [ ] In the scratch project, create `RUNWAY_MASTER_KEYS` (step 5 below) and a throwaway version. With the policy in place, as the Owner (not the break-glass account): `gcloud secrets versions destroy 1 --secret=RUNWAY_MASTER_KEYS --project=$SCRATCH` and `gcloud secrets delete RUNWAY_MASTER_KEYS --project=$SCRATCH` must both answer `PERMISSION_DENIED` mentioning the deny policy. That settles whether Owner bypasses it.
- [ ] As the Owner, try to remove the policy: `gcloud iam policies delete runway-protect-keyring --kind=denypolicies --attachment-point=cloudresourcemanager.googleapis.com/projects/$SCRATCH`. Record whether it works without the Deny Admin role. A policy an Owner can remove with no extra step is a speed bump, not a lock; say so in the record.
- [ ] As the break-glass account the same destroy must succeed. Note the exact steps and who may use them.

Record one outcome in the table (section 8) and, in the real project, apply it:

- **In place:** the policy exists in the real project (same `create` command with `--attachment-point=.../projects/$PROJECT`), the destroy test above was repeated against a throwaway secret named `RUNWAY_MASTER_KEYS_DENY_TEST` (the condition matches by name), and the break-glass account's use is written down.
- **Impossible, with compensating controls:** name which of the three answers failed. The compensating controls are the ones above that need no deny policy: the 90-day delay, no human with version-manager or admin, the audit alert, the failure and heartbeat alerts, escrow outside Google Cloud, and administering from a separate account kept out of everyday use. State that an Owner can still delete the whole secret immediately (the delay does not cover that) and that only the audit alert and escrow protect against it.
- **Deferred:** write the reason and the date to revisit. Do not mark it done.

#### 3. The three alerts (scratch project first, then the real one)

Create one email channel per project, then the three policies. Run the whole of section 3 for `$SCRATCH` (set `P=$SCRATCH`), test each alert, then repeat for `$PROJECT` (`P=$PROJECT`) and test again.

```bash
export P=$SCRATCH
gcloud beta monitoring channels create --project=$P \
  --display-name="Runway owner email" --type=email \
  --channel-labels=email_address=$OWNER_EMAIL
gcloud beta monitoring channels list --project=$P --format="table(displayName,name)"
export CHANNEL=<the name column: projects/.../notificationChannels/...>
```

A phone push is added in the console: Monitoring, Alerting, Edit notification channels, "Google Cloud Mobile App", after signing in to the Google Cloud app on the phone. An email channel may need verifying from the message Google sends; check it in the console before relying on it.

**Alert A: failure.** Fires on any `runway.keys.failed` entry from the daily check (also on the `gcloud logging write` test entry below).

```bash
cat > /tmp/runway-alert-failed.json <<JSON
{
  "displayName": "Runway: key check failed",
  "combiner": "OR",
  "conditions": [{
    "displayName": "runway.keys.failed logged",
    "conditionMatchedLog": { "filter": "jsonPayload.event=\"runway.keys.failed\"" }
  }],
  "alertStrategy": { "notificationRateLimit": { "period": "300s" }, "autoClose": "604800s" },
  "notificationChannels": ["$CHANNEL"]
}
JSON
gcloud alpha monitoring policies create --project=$P --policy-from-file=/tmp/runway-alert-failed.json
```

- [ ] Test: write a fake entry (it is not key material): `gcloud logging write runway-alert-test '{"event":"runway.keys.failed","checked":0,"failures":[],"drill":true}' --payload-type=json --severity=ERROR --project=$P`. The email must arrive within a few minutes. Also test the real thing once in the scratch project if you deploy `verifyRunwayKeys` there: write a canary document for an id the keyring does not hold (a document `apps/runway/keyChecks/zz-drill` with any field, through the console), force-run the job from Cloud Scheduler, expect a `runway.keys.failed` entry with `missing-id` and the email, then delete the document. Do not use a disabled latest version for this: the function binds the secret at instance start, so a disabled latest version can stop the instance starting and no entry is written at all (that case is what alert B catches).

**Alert B: missing heartbeat.** A log-based metric counts `runway.keys.ok`, and a policy fires when the metric is absent. The check runs at 06:17 UTC daily, so the design says 26 hours.

```bash
gcloud logging metrics create runway_keys_ok --project=$P \
  --description="Daily Runway key check passed" \
  --log-filter='jsonPayload.event="runway.keys.ok"'
```

The metric has no time series until a matching entry has been logged, and an absence condition only watches a series that existed. In the scratch project write one (`gcloud logging write runway-alert-test '{"event":"runway.keys.ok","checked":1}' --payload-type=json --project=$P`); in the real project force-run `verifyRunwayKeys` from Cloud Scheduler once. Then:

```bash
cat > /tmp/runway-alert-heartbeat.json <<JSON
{
  "displayName": "Runway: key check heartbeat missing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "No runway.keys.ok for 26 hours",
    "conditionAbsent": {
      "filter": "metric.type=\"logging.googleapis.com/user/runway_keys_ok\"",
      "duration": "93600s",
      "aggregations": [{ "alignmentPeriod": "3600s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }]
    }
  }],
  "notificationChannels": ["$CHANNEL"]
}
JSON
gcloud alpha monitoring policies create --project=$P --policy-from-file=/tmp/runway-alert-heartbeat.json
```

The `crossSeriesReducer` merges the metric's series into one. A log-based metric has one series per monitored resource, and a function's resource includes its revision, so without the reducer every redeploy of `verifyRunwayKeys` leaves the old revision's series absent and the alert fires for a check that is running fine. Whether the series are split that way in this project is unconfirmed; the reducer is harmless if they are not.

**Open point to settle while creating it.** Google's documentation of metric-absence conditions, as remembered when this was written and not confirmed, caps the absence duration at 23.5 hours, which is shorter than the 24-hour cadence and would fire every day. If the API refuses `93600s`, or accepts only a shorter duration, do not shorten it to 23.5 hours. Choose one and record which: (a) a threshold condition on the same metric that fires when the sum over a one-day alignment period is below 1 (`conditionThreshold`, `COMPARISON_LT`, `thresholdValue` 1, `duration` `3600s`, the same `aggregations` with a one-day `alignmentPeriod` if the API accepts it, and `evaluationMissingData` set to `EVALUATION_MISSING_DATA_ACTIVE`; without that, a threshold condition on a metric with no data points at all never fires, which is exactly the failure being watched for, and whether this field is accepted here is unconfirmed), accepting up to an hour of extra lag; (b) a PromQL condition with a 26-hour range; or (c) a code change that runs `verifyRunwayKeys` every six hours so that a 23-hour absence means four missed runs (a change to the function, to be made in its own PR). The option chosen is recorded in the table.

- [ ] Test in the scratch project: pause the job that runs the check (or, with the metric only, stop writing entries) and wait past the window; the email must arrive; resume and confirm the incident closes. In the real project: `gcloud scheduler jobs list --location=us-central1 --project=$PROJECT` shows the job (its name starts `firebase-schedule-verifyRunwayKeys`); `gcloud scheduler jobs pause <name> --location=us-central1 --project=$PROJECT`, wait past the window, check the email, then `gcloud scheduler jobs resume ...` and force-run it once. The pause lasts more than a day, so do it before the first real user.

**Alert C: Secret Manager audit.** Fires when a version of the secret is destroyed or disabled, or the secret is deleted (Admin Activity logs, always on). The filter matches any secret whose name begins `RUNWAY_MASTER_KEYS`, which is what lets the real project be tested without touching the real keyring.

```bash
cat > /tmp/runway-alert-audit.json <<JSON
{
  "displayName": "Runway: master keyring changed",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Destroy, disable or delete on RUNWAY_MASTER_KEYS",
    "conditionMatchedLog": {
      "filter": "protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.methodName=(\"google.cloud.secretmanager.v1.SecretManagerService.DestroySecretVersion\" OR \"google.cloud.secretmanager.v1.SecretManagerService.DisableSecretVersion\" OR \"google.cloud.secretmanager.v1.SecretManagerService.DeleteSecret\") AND protoPayload.resourceName:\"/secrets/RUNWAY_MASTER_KEYS\""
    }
  }],
  "alertStrategy": { "notificationRateLimit": { "period": "300s" }, "autoClose": "604800s" },
  "notificationChannels": ["$CHANNEL"]
}
JSON
gcloud alpha monitoring policies create --project=$P --policy-from-file=/tmp/runway-alert-audit.json
```

- [ ] Test in either project with a throwaway secret (the dummy value is the word `alert-test`, not a key). Each of the three steps must send its own email; wait for each:

  ```bash
  printf 'alert-test' | gcloud secrets create RUNWAY_MASTER_KEYS_ALERT_TEST --data-file=- --project=$P
  gcloud secrets versions disable 1 --secret=RUNWAY_MASTER_KEYS_ALERT_TEST --project=$P
  gcloud secrets versions destroy 1 --secret=RUNWAY_MASTER_KEYS_ALERT_TEST --project=$P
  gcloud secrets delete RUNWAY_MASTER_KEYS_ALERT_TEST --project=$P
  ```

  If a deny policy covers the throwaway secret by name, the destroy and delete are denied and no entry is written that way; test those two before applying the policy, or as the break-glass account.
- [ ] If the log shows the method names differently from the filter, open Logs Explorer, find the entry, copy its `protoPayload.methodName` and correct the filter here and in `TECHNICAL.md`.

Finish by deleting the temp files (`rm /tmp/runway-*.json`) and confirming each alert fired once per test in the record table.

#### 4. Escrow

The keyring is saved after it is first created and after every rotation (a key added). Two copies, one holder, none in this repository or in any CI secret. The keyring is the only thing that opens every plan; the ids in it are not secret, the key values are.

- [ ] Encrypt and save. Run it from a private temporary directory outside the repo (`cd "$(mktemp -d)"`), so the file cannot be committed by a stray `git add`. The passphrase is generated by the password manager and stored in its own entry, separate from the encrypted file:

  ```bash
  gcloud secrets versions access latest --secret=RUNWAY_MASTER_KEYS --project=$PROJECT \
    | gpg --symmetric --cipher-algo AES256 --armor -o runway-keyring-$(date +%F).asc
  gcloud secrets versions access latest --secret=RUNWAY_MASTER_KEYS --project=$PROJECT | sha256sum
  ```

  The second command prints a fingerprint of the keyring text; it is safe to write on the escrow entries because the keys inside are 256 random bits each. Label each entry with the date, the ids in the keyring (not the values) and that fingerprint.
- [ ] Copy 1: attach the `.asc` file to a password manager entry. Copy 2: upload the same file to the second secure cloud account, which is not the Firebase project's Google account and has its own two-step sign-in.
- [ ] Delete the local `.asc` (`shred -u` or the platform's equivalent) and clear the terminal's history of the passphrase if one was typed. Check `git status` in the repo shows nothing new.
- [ ] Prove each copy opens: fetch it, `gpg -d` it, pipe the output to `sha256sum` and compare with the fingerprint. Do this once now and again at each drill.
- [ ] Keep keyring files out of the repo: `*.asc` and keyring JSON are never committed. If one is, treat the keyring as leaked and follow "Retiring a master key" in `TECHNICAL.md`.

#### 5. Recovery drill (scratch project)

Done before the first real user and after each rotation. It proves that the escrow copy alone restores a plan key after the secret is gone. Time it from the moment the secret is deleted until the unwrap succeeds, and write down every point that was unclear.

`scripts/runway/drillKeyring.ts` seeds a test plan's wrapped key and later says only whether a keyring opens it; it refuses the real project and never prints key bytes. It needs Admin SDK credentials for the scratch project (`gcloud auth application-default login`) and a Firestore database there.

- [ ] Prepare the scratch project: enable Secret Manager and Firestore (`gcloud services enable secretmanager.googleapis.com firestore.googleapis.com --project=$SCRATCH`; `gcloud firestore databases create --location=nam5 --project=$SCRATCH`).
- [ ] Create a scratch keyring and secret, with the same delay as production:

  ```bash
  gcloud secrets create RUNWAY_MASTER_KEYS --replication-policy=automatic --version-destroy-ttl=90d --project=$SCRATCH
  printf '{"current":"d1","keys":{"d1":"%s"}}' "$(openssl rand -hex 32)" \
    | gcloud secrets versions add RUNWAY_MASTER_KEYS --data-file=- --project=$SCRATCH
  ```

- [ ] Seed the test plan: `npx tsx scripts/runway/drillKeyring.ts seed --project $SCRATCH --from-secret` prints `Seeded the test plan's wrapped key under d1.`
- [ ] Escrow the scratch keyring exactly as in section 4 (with `$SCRATCH` in place of `$PROJECT`, and file names that say drill).
- [ ] Lose it. Start the stopwatch. `gcloud secrets delete RUNWAY_MASTER_KEYS --project=$SCRATCH` (answer yes). If a deny policy covers the scratch project, do this as the break-glass account.
- [ ] Open from escrow alone, with nothing from Google Cloud but the database: decrypt and pass the keyring on a pipe, for example `npx tsx scripts/runway/drillKeyring.ts open --project $SCRATCH --keyring-file <(gpg -d runway-keyring-drill.asc)`. Expect `Opened: the test plan's key unwrapped under d1.` If the shell has no `<(...)`, decrypt to a file in a private temporary directory and delete it straight afterwards.
- [ ] Restore the secret from the escrow file, which holds the whole keyring with every id, so wrapped keys keep opening:

  ```bash
  gcloud secrets create RUNWAY_MASTER_KEYS --replication-policy=automatic --version-destroy-ttl=90d --project=$SCRATCH
  gpg -d runway-keyring-drill.asc | gcloud secrets versions add RUNWAY_MASTER_KEYS --data-file=- --project=$SCRATCH
  ```

- [ ] Publish on the restored secret: `npx tsx scripts/runway/publishKeyring.ts --project $SCRATCH --new-id d2`. It adds `d2` as current, keeps `d1`, writes `d2`'s canary and prints ids only.
- [ ] Unwrap again from the secret now in Google Cloud: `npx tsx scripts/runway/drillKeyring.ts open --project $SCRATCH --from-secret`. Expect `Opened ... under d1` (an old wrapped key opens after a rotation). Stop the stopwatch.
- [ ] Clean up: delete the scratch project (or its secret and the `server/drill-test-plan` document), the decrypted files and the temp files. Write the record.

What this does and does not prove. It proves that an escrow file restores the keyring, that the publish tool works on a restored secret and that the keyring opens a wrapped key made under it, with the same unwrap code `getRunwayKey` uses. It does not run the deployed `getRunwayKey` function. `publishKeyring.ts` refuses an id the keyring already holds and refuses to change the key behind an id, so `RUNWAY_NEW_KEY` (a supplied key) adds a key you hold under a new id; it cannot restore a key under its old id, because a wrapped key names the old id. Restoring is therefore always from the whole keyring file, as above. After restoring the secret in a new project, each id's canary (`apps/runway/keyChecks/{id}`) must exist or `verifyRunwayKeys` reports `missing-canary`; they come back with a restore of the database, and no tool recreates one for an id the keyring already holds.

#### 6. The incident order, when an alert arrives

1. **Master key failure (A):** read the `failures` in the entry. `secret-unreadable` with a disabled version: re-enable it (`gcloud secrets versions enable <n> --secret=RUNWAY_MASTER_KEYS --project=$PROJECT`) within the 90 days. Anything else: stop and do not rotate. Compare the fingerprint of the latest version (section 4) with the escrow entry's. If it differs or the secret is gone, restore from the escrow file as in section 5: add the file as a new version when the secret still exists (`gpg -d <file> | gcloud secrets versions add RUNWAY_MASTER_KEYS --data-file=- --project=$PROJECT`), or create the secret first when it is gone. The restored version holds the whole keyring, so it is self-sufficient; do not use `publishKeyring.ts` for this, it refuses a keyring it did not build on.
2. **Heartbeat (B):** check Cloud Scheduler for a paused job, then the function's last deploy; a disabled latest version can also keep the instance from starting.
3. **Audit (C):** if it was not you, treat the keyring as exposed: re-enable the version, check IAM, and follow "Retiring a master key" in `TECHNICAL.md`.

#### 7. Not proven by any of this

An Owner can delete the whole secret immediately unless a deny policy stops them; the delay applies to versions only. Anyone who holds the keyring and read access to the database can decrypt every plan. One person holding both escrow copies is a single point of failure until Issue 75. A phone push depends on the Google Cloud mobile app being installed and signed in.

#### 8. Operator record

Filled in by the owner. A row left blank means it has not been done. Never write a key, a wrapped key, a passphrase or escrow content here.

| Item | Date | Result | Who |
| --- | --- | --- | --- |
| `--version-destroy-ttl=90d` set; no expiry, TTL or rotation (section 1) | | | |
| Secret IAM: only runtime `secretAccessor` | | | |
| Project-level audit (Owner, Editor, Admin, Version Manager members; compute service account Editor removed? deployer exception?) | | | |
| Deny policy: service supported / permission names | | | |
| Deny policy: organization present | | | |
| Deny policy: Owner bypass / can remove it | | | |
| Deny policy outcome (in place / impossible with controls / deferred) | | | |
| Alert A tested in scratch, email arrived | | | |
| Alert A tested in real project, email arrived | | | |
| Alert B tested in scratch, email arrived; option chosen for the 26-hour window | | | |
| Alert B tested in real project, email arrived | | | |
| Alert C tested in scratch (disable, destroy, delete), emails arrived | | | |
| Alert C tested in real project, emails arrived | | | |
| Escrow copy 1 saved and opens (fingerprint matched) | | | |
| Escrow copy 2 saved and opens (fingerprint matched) | | | |
| Recovery drill: time from loss to unwrap | | | |
| Recovery drill: unclear points | | | |
| Re-drill after next rotation | | | |


### Runway: `deleteRunwayPlan`

- **Secrets:** none.
- **Flow:** checks the phrase and `auth_time`, lists and deletes each plan collection recursively in chunks, then the plan document, then the plan's collections once more (a document written after the first pass, such as a closing, cannot be written once the plan document is gone), the `server/{uid}` tree and the receipt prefix; logs `runway.plan.deleted` (documents, receipts) or `runway.plan.deleteFailed` (an error code, never a message, path or id).
- **Later issues extend it:** link revocation and any link or grant documents, and receipt documents, are added by the issues that create them. The `apps/runway/usage/{uid}` record is left alone.
- **Emulator check:** deleting the seeded Alex plan removed 160 documents and left nothing under either path.

### `getFirebaseUsage`

- **Secrets:** none. It reads Cloud Monitoring as the runtime account, so that account needs `roles/monitoring.viewer` once: `gcloud projects add-iam-policy-binding moondreams-dev-apps --member="serviceAccount:<project-number>-compute@developer.gserviceaccount.com" --role="roles/monitoring.viewer"`. Without it (a Monitoring `PERMISSION_DENIED`) the callable answers `failed-precondition` (`monitoring-role-missing`) and the dashboard says what to grant.
- **Who:** signed-in admin only (`nova@moondreams.dev` with a verified email, or the `admin` claim; the emulator also accepts `dev`, see below); anyone else gets `permission-denied`. Like every callable it is open to the network, so the check lives in the function.
- **Where the numbers come from:** Cloud Monitoring, the source of the Firebase console's usage tabs. Google reports reads, writes, downloads and calls for the whole project, so only stored data is split by app (`attribution.ts`).
- **Emulator:** with `FUNCTIONS_EMULATOR=true` there is no Cloud Monitoring, so the callable returns made-up totals (`isSample: true`, from `sampleUsage.ts` through the real pricing code) and the page says so; stored data per app is still counted from the emulator's data. The `dev` claim counts as the admin there only. Both emulator paths also require the Emulator Suite's hub (`FIREBASE_EMULATOR_HUB`, through `src/emulator.ts`), which a deployed function never has; `K_SERVICE` can't be the test, because the emulator sets it like Cloud Run does. No function config sets `FUNCTIONS_EMULATOR`. The response's `isSample` flag (type in `src/lib/admin/firebaseUsageQueries.ts`) tells the page to say so.
- **Prices and free amounts** are constants in `firebaseUsage/pricing.ts` with a last-checked date (2026-10-21, from firebase.google.com/pricing and the Firestore (`nam5`: $0.06 reads, $0.18 writes, $0.02 deletes per 100,000), Cloud Storage and Cloud Run pricing pages). Realtime Database downloads are counted per day (360 MB). Storage follows the bucket type: `.appspot.com` buckets get 1 GB a day free and $0.026/GB stored; others get 100 GB a month free (us-central1, us-west1 and us-east1 only) and are priced at $0.020 per GiB-month stored, which assumes a us-central1 bucket. Functions: 2M requests a month free then $0.40 per million. Not tracked: Functions compute time (request-based Cloud Run free tier: 180,000 vCPU-seconds and 360,000 GiB-seconds a month), Firestore network egress and stored size, Hosting.
- **Stored data by app:** a document count per app (collection counts, down to three levels, capped at 20 parents a collection and 1,500 units of work, one per count call, listed parent or subcollection lookup) and file bytes by Storage folder, cached in memory for an hour because listing and counting are billed. A hit cap sets `isPartial`.
- **Check after deploy:** the metric names and the daily bucket alignment were written from Google's docs and haven't been compared against the console yet. Compare each figure with the Firebase console usage tabs.

### `registerAppUsage`

- **Secrets:** none.
- **When it runs:** the client calls it only when `apps/{appId}/usage/{uid}` doesn't exist yet, so the scan runs once per member per app. After that the client refreshes `lastActiveAt` itself, at most daily.
- **Finding `startedAt`:** each app has a `findFirstActivityAt` under `functions/src/apps/<app>/` that returns the oldest timestamp the app holds for that member, or `null`. With `null` the member's start is now. Add a finder (and its entry in `registerAppUsage.ts`) for every new app.
  - A-List: membership, viewings and watchlist `createdAt`.
  - Nine Lives: `createdAt` of what the member wrote in their households (`createdBy`), plus a household they created. Joining leaves no timestamp.
  - Pinch: the oldest `createdAt` in their kitchen's collections (recipes, ingredients, meals, plans, shopping and the rest), plus the kitchen itself.
  - Runway: `createdAt` of their plan document (`apps/runway/plans/{uid}`).
  - Waypoint: their `joinedAt` on each trip, plus trips they created.
  - Worth the Wait: their space, boxes and items, plus when they first saw the welcome.
- **Lazy by design:** nothing runs for existing members until they next open an app, so counts start from when tracking began, and a member who only joined a Nine Lives household starts at their first visit after launch.
- **Access:** it refuses a caller who couldn't open the app (not public, or restricted and not on its list). Admins and emulator dev accounts always pass.
- **Rules:** clients can't create or delete a record, and may only move their own `lastActiveAt` forward (and not more than an hour past the server clock), so `startedAt` can't be forged. Only admins can list a collection. The site-wide last visit lives separately in `siteVisits/{uid}`, written by the member and readable only by them and the admin.

### Pinch: sharing a recipe or a saved meal (`getPinchShare`, `changePinchShare`, `copyPinchShareCover`)

- **Where it lives.** `apps/pinch/shares/{shareId}` is the owner's record (`id, ownerUid, kind, sourceId, title, sourceUpdatedAt, createdAt, updatedAt`): its owner can read it, no client can write it. `apps/pinch/shareSnapshots/{shareId}` is the shared copy: no client can read or write it. An uploaded cover is copied to `apps/pinch/shares/{shareId}/cover-{index}.webp` in Storage, which anyone can `get` by its path and nobody can list or write. Only these functions write any of it, with the admin SDK.
- **The id is the capability.** 26 characters of `[2-9a-hj-np-z]` (32 characters, 5 bits each, 130 bits) drawn with `crypto.randomInt` on the server; a client never picks one. A malformed, unknown or deleted id all answer `{ status: 'not_found' }`, from both documents read the same way, so a caller can't tell which ids exist.
- **One allowlist, run twice.** `pinchShareView.ts` rebuilds a recipe or meal field by field (`toSharedRecipe`, `toSharedMeal`): every string trimmed and capped, numbers finite and in range, units from the list, links https only with no sign-in in the address (a too-long link is dropped, never cut), catalog ids only in the `cat-` shape. A recipe's tips and its notes each go as `{ text, step }` only, in two lists (up to 30 each, each up to 2,000 characters: `MAX_SHARED_TIPS`, `MAX_SHARED_TIP_LENGTH`, `MAX_SHARED_NOTES`, `MAX_SHARED_NOTE_LENGTH`; `step` a whole number inside the recipe's steps or null for the whole recipe); a copy stored before tips or notes existed reads as having none. Anything else on the input (an owner's uid, prices, planned changes, reasons, nutrition, ids, dates, a cover address) is dropped because only named fields are copied. It runs when `changePinchShare` writes (so the stored copy is already clean) and again when `getPinchShare` serves. A recipe with no title, no servings or neither ingredients nor steps is refused; a meal is all or nothing (an item pointing at a missing recipe, or more than 300 ingredient lines in all, refuses it whole). The caps are repeated from the app's `constants.ts` (a function can't import `src`), and `scripts/checks/pinchShare.ts` fails when they drift.
- **`getPinchShare`.** `isOwner` is whether the caller's uid equals the share's `ownerUid`; `ownerSourceId` (the owner's own recipe or meal id) is sent to the owner alone. The owner's uid, any other document id and any key outside the result's shape never leave. `hasCover` is what the server recorded, never what a client claimed.
- **`changePinchShare`.** Signed in only. A create or update carries `includesTips` and `includesNotes`; only an explicit `true` counts (`toShareIncludes`), and the Function empties the tips and notes lists it was not told to include (`toIncludedCopy`) whatever the client sent, then records both flags on the owner's `shares` document (a renew keeps them; a link made before the choice has neither key and reads as false). A copy over `MAX_COPY_BYTES` (900,000 bytes of JSON, under Firestore's 1 MiB document limit; the worst case of 10 recipes × 30 tips and 30 notes × 2,000 characters would pass it) is refused with `invalid-argument` and a readable sentence, before anything is written. `create` makes the share, or, for a recipe or meal that already has one, retakes it and returns the same id (a double tap or a second device never makes a second link). `update` takes the copy again and keeps the address. `renew` gives the same copy and covers a new address and then ends the old one; the new link is written first, so there is no moment without a valid one, and if the old one can't be ended the new one is taken back. `delete` removes the covers first and then both documents, and answers `{ shareId: null }` for a missing share, a malformed id and someone else's alike. `update` and `renew` answer `not-found` for a missing share and someone else's alike. At most 30 shares per person, counted with `count()` (`resource-exhausted` past it); **two creates at the same moment can both pass the count, so one link past 30 is possible**. The timeout is 30 s (the others 15 s) because a renew copies up to ten covers.
- **Covers.** For each `{ index, recipeId }` the request names, the source file is built on the server from the caller's own uid (`apps/pinch/kitchens/{uid}/recipes/{recipeId}/cover.webp`); a client never names a path. Each copy gets its own download token, so the shared file never shares an address with the owner's private one. A web-search cover is never shared. A copy that fails is logged (a short code and the first 4 characters of the id, nothing else) and leaves that recipe without a cover; it never fails the share. The bucket is the project's default (`getStorage().bucket()`, as `deleteTrip` uses): in production that is the one the app uploads to, but an offline Emulator Suite falls back to `moondreams-dev-apps.appspot.com`, where the app's uploads are not found, so start it with `STORAGE_BUCKET_URL=moondreams-dev-apps.firebasestorage.app` (`SEEDING.md`).
- **`copyPinchShareCover`.** Signed in only. Copies a shared recipe's cover onto the caller's own recipe, and only when the share has a cover at that index and the caller's recipe exists with no cover of its own. It never writes the recipe: the client stores the returned `coverPath`. A share with no cover, an unknown share and a recipe that already has a picture all answer `{ coverPath: null }`.
- **No logging of ids, titles or copies.** No secrets, env vars or indexes: every query is equality-only (`ownerUid`, `sourceId`).
- **Deploying.** The deploy opens the new callables to the browser itself (root README's [New Cloud Functions & Cloud Run invoker access](../README.md#new-cloud-functions--cloud-run-invoker-access)), the signed-out `getPinchShare` included, so nothing is run by hand. Nothing has to exist in production before the merge.
- **Not verified live.** The Storage `copy` and `setMetadata` calls and the download token a copied cover gets were written from the Admin SDK's documentation and run only against the emulator (with the bucket above, every copy, token, renew and delete case passed); check a shared cover (open a link whose recipe has an uploaded cover) on the first deploy.

### Pinch: `searchRecipeImages`

- **What it is for.** A new recipe's Photo drawer asks it for pictures for `"<title> recipe"`. It sees only that text and the caller's sign-in (the uid is used for the rate limit and never sent on). The generic layer is `functions/src/imageSearch/` (nothing there says recipe); `functions/src/apps/pinch/searchRecipeImages.ts` is the thin wrapper with the Firestore cache and counters.
- **What it returns.** At most six `{ thumbUrl, imageUrl, title, host }`, copied from the provider's rows by name. A row whose thumbnail or picture is not https (or is over 2,000 characters, or carries a user name) is dropped, a thumbnail never falls back to the full picture, and a picture is listed once. Anything else a provider sends is discarded.
- **Providers and the one switch.** `ddg` (DuckDuckGo images: a request for its results page, a `vqd` token read from it, then the JSON its picture grid loads, safe search on; no key, no dependency; the pictures request is tried once more when it fails or is empty; after three failures in a row it steps aside for five minutes) and `google` (Custom Search JSON API, `searchType=image`, `num=6`, `safe=active`). `IMAGE_SEARCH_PROVIDERS` orders them (default `ddg,google`). The first provider with pictures wins; one that is skipped (not configured, paused, out of budget) costs nothing and one that fails falls through. Adding a provider (Serper, Unsplash) is one file with a factory like `createGoogleProvider` and one line in `providers.ts`; none is built.
- **Cache.** `apps/pinch/imageSearchCache`, one document per lower-cased query and provider list: a week for pictures, ten minutes for "nothing found", never a failure (so a gap in a provider never sticks, and changing `IMAGE_SEARCH_PROVIDERS` takes effect at once). A cache that can't be read or written never fails a search, but each failure is logged as `image search cache read failed` or `image search cache write failed` with the error's code (never the query), because a cache that quietly never hits spends Google's 90 a day on repeats.
- **Budget and limit.** `apps/pinch/imageSearchUsage` counts, in a transaction, each call that goes out: Google by Pacific day, stopped at 90 of its 100; DuckDuckGo by UTC day at 1,500; and each person's uncached searches (10 a minute, 100 a day). A cache hit counts for nothing. The whole search gives up after 10 s, each request after 4 s and 1 MB (the token page 600 KB), and no body is scanned with a pattern over the whole text.
- **Errors.** The caller gets one sentence ("We couldn’t look up photos just now." or "Photo search is resting for a moment. Try again soon."); the reason is logged as a short code (`http_403`, `token_missing`, `timeout`), never an address, a key or a response body.
- **Access.** Clients can't read or write `imageSearchCache` or `imageSearchUsage`.
- **Turning Google on** (no redeploy; the key is read at run time and remembered for ten minutes, "not there" for two): create both secrets and let the runtime account read them.

  ```bash
  printf '%s' '<API key>' | gcloud secrets create GOOGLE_CSE_KEY --project=moondreams-dev-apps --data-file=-
  printf '%s' '<search engine id>' | gcloud secrets create GOOGLE_CSE_CX --project=moondreams-dev-apps --data-file=-
  for name in GOOGLE_CSE_KEY GOOGLE_CSE_CX; do
    gcloud secrets add-iam-policy-binding $name --project=moondreams-dev-apps \
      --member="serviceAccount:<project-number>-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
  done
  ```

  The key comes from Google Cloud (restrict it to the Custom Search API) and the engine id from a Programmable Search Engine with "Image search" on and "Search the entire web" on. Binding them with `defineSecret` instead would make the deploy need them, so it isn't done.
- **Before merging.** Nothing has to exist in production: no secret is bound and the one env var has a default, so CI's deploy cannot fail on this function.
- **Not verified live.** The sandbox has no outside network. DuckDuckGo's token page and picture JSON, Google's response fields, its quota and reset time, and the metadata-server and Secret Manager calls were written from public documentation and memory and run only against fakes (`scripts/checks/imageSearch.ts`). DuckDuckGo has no public image API and its terms don't offer this use: it can change or block Google Cloud's addresses at any time, which is what the switch and the Google fallback are for. Check after the first deploy: a search for "lemon pasta recipe" from a new recipe, and the function's logs for `image search provider failed` lines and their reasons.

### `fetchLinkMetadata`

- **Secrets:** none.
- **Safety:** it fetches on the caller's behalf, so it:
  - resolves DNS first and rejects private, loopback and link-local addresses (SSRF guard);
  - caps redirects at 3;
  - times out at 6s;
  - reads at most 1MB.

### `sendScheduledReminders`

- **Schedule:** polls every minute (it was five; a cooking timer of a minute or more is then picked up before it ends and goes out on time).
- **Timing:** it looks ahead over the whole window and waits out each reminder's exact delay, so delivery is accurate to the second without a task queue. After the wait it reads the reminder again and drops one that was cancelled meanwhile, so pausing a timer stops its push even once the sender has claimed it.
- **Overdue reminders are dropped, not sent:** one more than 30 minutes past its time is marked `expired` (a yearly one just rolls to its next date), so an outage or a missing index never flushes its backlog to phones. A reminder up to 30 minutes late still sends.
- **`inAppToast`:** a reminder may carry `inAppToast: false` (Pinch's timer pushes do: the page that scheduled it rings for itself). The function ignores it and sends the push as usual; only the client's in-app toast skips such a reminder.
- **Where a tap goes:** each reminder carries a `link`, a path and query inside the app that the scheduling app sets (`/waypoint?trip=<id>`, `/nine-lives`, `/a-list?tab=watchlist`). The function turns it into an absolute `https://apps.moondreams.dev` URL and sends it as the push's link, so tapping opens the installed app there. A link that is missing (reminders saved before links existed), or that points anywhere but the app, falls back to the trip for a Waypoint reminder (read from `relatedEntityPath`) or else the app's own page, and never leaves the app's origin. `firestore.rules` also refuses a `link` that isn't a path inside the app. A new app that schedules reminders adds its page to `APP_PATHS` in `sendScheduledReminders.ts` (Pinch's timer pushes link to `/pinch`).
- **Sending:** the token lookup and `sendEachForMulticast` live in `notifications/sendPush.ts` (`sendPushToUsers`), which `sendEatSoonDigest` uses too: one FCM sender, not two. It also takes a token off `users/{uid}.fcmTokens` (an `arrayRemove`, per person) when FCM answers `messaging/registration-token-not-registered` or `messaging/invalid-registration-token` for it, so dead devices stop being tried and a browser that is no longer theirs stops receiving what names their dishes; any other failure leaves a token alone, and a failed clean-up is only logged. The client also removes its own token on sign-out.
- **One notification, not two:** the service worker doesn't show the notification itself. Firebase shows a push that carries a `notification` and opens its link on tap; showing it by hand as well made a second copy with no link.
- **Pruning:** reminders are written by people and the rules never let a client delete one, so each run also deletes finished ones (`sent`, `cancelled`, `expired`) that were due more than 14 days ago, at most 200 a run (`notifications/pruneReminders.ts`, through the Admin SDK), so a backlog is worked off over a few runs. A pending one is never touched, and neither is a yearly one rolled forward. It runs beside the sending and a failure is only logged. Fourteen days is long enough for every open page to have seen a reminder change; the client's listener still reads every reminder that is left. Its query (`status in [...]` and `scheduledFor <`) uses the same `reminders (status, scheduledFor)` index below.
- **Index:** the `status == pending` + `scheduledFor <=` query on `reminders` needs the composite index in `firestore.indexes.json`. Without it every run fails with `FAILED_PRECONDITION` and no reminder is sent.

### Waypoint: trip pushes

- **`notifyTripAnnouncement` and `notifyTripIdea`:** a Firestore create trigger reads the trip's `members` and sends one push through `sendPushToUsers` to every member but the author. An expired announcement sends nothing. The push names the announcement's title and a clipped body, or the idea's title and who suggested it (a profile name that is an email reads "Someone"); a tap opens the trip (`?trip=`, plus `&tab=ideas` for an idea). Triggers are delivered at least once, so a retried delivery can repeat a push; nothing is stored. People with no registered device get nothing, and there is no per-kind switch: both follow the browser's notification permission like every other push.
- **`sendExpenseWrapUp`:** every 30 minutes it reads trips whose `endDate` is within the last two days, and for each one that is not archived and whose local clock (its `timezone`, UTC when it has none) is in the 9 PM hour on a day inside its dates, reads that day's expenses (`status == 'EXPECTED'` and `dayIndex ==` today, at most 50) and pushes the trip's Admins one note naming up to two of them. A day with none sends nothing and writes nothing; the two runs in the hour mean one late run still leaves the other, and a run after the hour drops the note instead of sending it late. `apps/waypoint/pushState/{tripId}.lastWrapUpDay` is written in a transaction before the push, so overlapping runs send one and a failed send skips the day. Only this function reads or writes `pushState` (no rule matches it, so clients are denied), and `deleteTrip` removes it. Equality filters only, so no composite index; the trips read is a single range on `endDate`.
- **Not verified live:** the sandbox has no FCM or Eventarc. The day arithmetic and copy are checked by `npm run check:waypoint-pushes`; the triggers and the push itself run only after deploy.

### Pinch: `sendEatSoonDigest`

- **Schedule:** every 30 minutes. A person's note goes out on the first run that falls in the hour they chose (`reminders.hour` in their `reminders.timeZone`; UTC when none): two runs fall in it, so one failed or late invocation still leaves the other, and `lastDigestDay` makes it one note. Every time zone, quarter-hour offsets included, gets exactly one note a day, and a run that wakes after the hour drops the note instead of sending it late (never later than an hour, so it still never flushes a backlog).
- **Reads:** `apps/pinch/settings` where `reminders.eatSoon == true` or `reminders.expiring == true`; for a person whose run it is, each source whose switch is on: their `apps/pinch/kitchens/{uid}/containers` where `status == 'IN_STOCK'` and `eatBy` is between yesterday and `reminders.leadDays` ahead (at most 100, ordered by `eatBy`), and their `apps/pinch/kitchens/{uid}/packages` where `status == 'IN_STOCK'` and `expiresAt` is in the same window (at most 100, ordered by `expiresAt`; a package with no date is never read). It needs the composite indexes `containers (status, eatBy)` and `packages (status, expiresAt)` in `firestore.indexes.json`; a new index takes a few minutes to build after deploy, and until it reports READY the failing source logs an error per person and the note goes out with what the other sources found (`Promise.allSettled`; a person whose every source failed is counted as failed and gets nothing).
- **What it sends:** one push per person per day. With only dishes it is titled "Eat soon" or "Check your fridge and freezer" and names at most two dishes and then "and N more" ("Adobo chicken is due tomorrow", "Chicken stock is past its date, and 2 more are due soon"). Once an ingredient is among the things to act on it is titled "Check your kitchen" and reads "Chicken stock, Spinach and 2 more need a look": the same two names and a count, one item per dish or ingredient (three cartons of milk are "Whole milk" once, at the nearest date; a dish and an ingredient with the same name are one), nearest first. Nothing but names, from a box's stored title and a package's stored `ingredientName`; never an address, price, amount or note. Nothing due sends nothing and writes nothing. The link is `/pinch?tab=kitchen&open=fridge` while a dish is named and `/pinch?tab=kitchen&open=pantry` when only ingredients are.
- **Idempotent:** `lastDigestDay` (the person's local day) is written in a transaction before the push is sent, so overlapping runs send one and a failed send is a skipped day. Only this function writes that field (`firestore.rules` refuses a client change to it).
- **Sources:** `DIGEST_SOURCES` in `sendEatSoonDigest.ts` lists where things to act on come from, each with its own `reminders.<flag>` (`eatSoon` for boxes, `expiring` for packages); a new source is one more entry and the person still gets one push. Both share the person's hour, zone and lead days.
- **Secrets and config:** none. The Admin SDK reads Firestore and sends through FCM with the project's own credentials, so nothing needs creating in production before this deploys; the index file deploys with it (`npm run fb:deploy:smart` includes it).
- **Testing:** `scripts/checks/pinchDigest.ts` (run by `npm run check:pinch-math`) covers which run sends and what it says. `runEatSoonDigest(firestore, send, now)` takes the sender and the time, so a run can be rehearsed against the emulator without FCM.

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
- **New callable:** nothing to run. The deploy opens it to the browser and says so in its log (root README's [New Cloud Functions & Cloud Run invoker access](../README.md#new-cloud-functions--cloud-run-invoker-access)). It is then reachable by anyone with its address, so it checks `request.auth` itself unless it exists for signed-out visitors, and this README says which.
- **Query with an equality plus a range or `orderBy`:** add its composite index to `firestore.indexes.json` in the same PR and run `npm run check:indexes`. The emulator doesn't enforce indexes, so a missing one only fails in production.
- **Server-only collection:** give it a deny-all block in `firestore.rules`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Emulator says a function isn't found, or `lib/index.js` doesn't exist | `functions/lib/` wasn't built. Start through `npm run emulators` (it builds first), or run `npm --prefix functions run build`. |
| Browser CORS error on a callable in production | The callable is still private. `npm run fb:invoker -- <function>` (or `--all`); see the root README's invoker section. |
| CI deploy log says `Unable to set the invoker for the IAM policy`, then opens every callable and deploys again | Expected on a new callable: the organization policy refuses the CLI's public grant, so the deploy applies it another way. If the run still fails after that, the deploy account can't update Cloud Run services: grant it `roles/run.admin`. |
| CI deploy fails on functions with a secret error | The secret doesn't exist in production yet. Set it with `firebase functions:secrets:set`. |
| CI deploy fails with `secretmanager.secrets.getIamPolicy` or `setIamPolicy` | The deployer account can't manage that secret. Grant it per [Service accounts](#service-accounts). |
| A function returns an error reading its secret at runtime | The runtime (default compute) account can't read that secret. Grant it per [Service accounts](#service-accounts). |
| A-List search shows sample movies locally | The emulator couldn't read any movie key: `.secret.local` has no value and Secret Manager access failed (not signed in to Google, or no access to the secret). Add a key to `functions/.secret.local` and restart the emulators. |
| A scheduled or triggered function logs `FAILED_PRECONDITION: The query requires an index` | A query needs a composite index that isn't in `firestore.indexes.json`. Add it (the error's link shows the fields), run `npm run check:indexes`, and deploy with `npm run fb:indexes`. The index takes a few minutes to build; the function recovers on its own once it is READY. |
| Photo suggestions always say "We couldn’t look up photos just now" | Every provider failed or was skipped. Read the function's logs for `image search provider failed` (the reason is a short code: `token_missing` or `http_403` for DuckDuckGo changed or blocking, `not_configured` for Google without its secrets) and `image search provider used up its day`. Turn Google on (see the Pinch note above) or set `IMAGE_SEARCH_PROVIDERS=google`. |
| A changed `.env.local` cap or `.secret.local` key has no effect | The emulators read these files only at startup. Restart them. |
