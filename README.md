# MoonDreams Beta Apps

A collection of beta apps built to fit whatever felt useful, fun, or simply interesting during a particular moment in life. Each app is built to feel focused, personal, and easy to explore together as part of one growing beta app library.

<img width="1728" height="960" alt="image" src="https://github.com/user-attachments/assets/aedaa6f6-8a96-4c3f-aefc-1a7187965bc4" />


## Current apps

- 💌 **Worth the Wait** — a private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives.
- 🐱 **Nine Lives** — a private home base for cat owners to keep track of health records, visits, vaccinations, symptoms, and the everyday care that keeps a household organized.
- 🧭 **Waypoint** — a collaborative trip planner for shared itineraries, live travel coordination, and the details that keep a journey running smoothly.
- 🎟️ **A-List Tracker** — a personal companion for AMC Stubs A-List members that turns a calendar of movie nights into ticket savings, premium-format savings, and a clear answer on whether the membership is paying for itself.
- 🧂 **Pinch** — Bring in recipes from a chat, a photo or a link, plan your week and get a shopping list, with what it costs.
- 🛫 **Runway** — An income-first budget planner for money that does not arrive or leave on a tidy schedule: draft where each income day should go, look ahead to see how far the plan holds, and change it when life changes.

On a phone, Home shows your apps like a home screen; press and hold one to read about it or star it, and starred apps come first on Home and in the menu. Apps you don't have yet but can ask for are listed under "Ask for access". Your avatar opens an account card, like Google's: switch to another account you've used on this device in one tap (no Google sign-in unless you signed out of it), add one or sign out (switching and signing out both take you back to Home, in every open tab); "Manage your account" opens your account page (name, photo, the accounts on this device, and resetting this device's saved data). The header's menu (the hamburger, top left) slides in every app you can open, and apps that keep their place in the URL (A-List's tabs, Waypoint's trips) reopen where you last left them. Swipe right on the header to open it and left to close.

## Quick start

```bash
npm install
npm run dev
```

Then open the local Vite app in your browser to explore the collection.

`npm run dev` only listens on your machine. To try the app (and the emulators) from a phone on your home Wi-Fi, run `npm run lan:trust -- Home` once (`lan:list` and `lan:untrust` manage the list), then `npm run dev:lan` and `npm run emulators:lan`; they refuse to start on a network you haven't trusted. See [SEEDING.md](SEEDING.md#phone-testing). To let a friend try the app on their phone from anywhere, run `npm run share` (it starts everything and copies a private Tailscale link); setup and troubleshooting are in [SEEDING.md](SEEDING.md#sharing-with-a-friend).

For how an app leaves this site and becomes its own, see [GRADUATING.md](GRADUATING.md). For local Firebase emulator fixtures, see [SEEDING.md](SEEDING.md). For every Cloud Function (what it does, its secrets, and local testing), see [functions/README.md](functions/README.md).

For a production build:

```bash
npm run build
```

### Environment variables

Create a `.env.local` at the repo root (gitignored) with:

```bash
# Firebase web config — Firebase Console > Project Settings > General > Your apps. Public by design.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN_CUSTOM=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Web Push key — Firebase Console > Project Settings > Cloud Messaging. Only for testing push locally.
VITE_FIREBASE_VAPID_KEY=

# Places API (New) key for place search; search is hidden when unset. See "Google API keys" below.
VITE_GOOGLE_PLACES_API_KEY=

# Pinch store logos: a publishable Logo.dev token (pk_…), sent only with a store's web domain. Logos fall back to a letter tile when unset.
VITE_STORE_LOGO_TOKEN=

# App Check (required by every Firebase AI Logic call: Pinch's recipe reading, Nine Lives' ingestion). Prod: the site key of a score-based (no challenge) reCAPTCHA Enterprise Website key that App Check is registered with. Also a GitHub Actions secret of the same name, which both hosting workflows pass to the build.
VITE_FIREBASE_APPCHECK_SITE_KEY=
# Local: the team's shared debug-token UUID (registered under App Check > Manage debug tokens) — ask a teammate.
VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=

# Optional Gemini model override for Nine Lives ingestion (default gemini-2.5-flash-lite).
VITE_FIREBASE_AI_MODEL=

# true to use the local Firebase Emulator Suite (see SEEDING.md).
VITE_USE_FIREBASE_EMULATORS=

# Dev only: true to always show a sample reminder toast on load (stays until dismissed) for tweaking its design.
VITE_FORCE_REMINDER_TOAST=
```

#### Google API keys

- **Firebase web key / App Check:** no key restrictions needed — access is enforced by Security Rules and App Check.
- **Places (`VITE_GOOGLE_PLACES_API_KEY`):** called straight from the browser, so the key is public; lock it down in Google Cloud Console > APIs & Services > Credentials. Use two keys:
  - **Production** (GitHub secret `VITE_GOOGLE_PLACES_API_KEY`): API restriction = Places API (New) only; website restrictions:
    ```text
    https://apps.moondreams.dev/*
    https://moondreams-dev-apps.web.app/*
    https://moondreams-dev-apps.firebaseapp.com/*
    ```
  - **Local** (`.env.local`): Places API (New) only; website restriction `http://localhost:5173/*` (add `http://127.0.0.1:5173/*` if you open the app that way).
  - Set a daily quota on Places API (New) and a billing budget alert.
- Referrer patterns are literal prefixes: they need the trailing `/*` and don't accept regex, port wildcards (`:*`), or partial-label wildcards (`moondreams-dev-apps*.web.app`). The only way to cover PR preview channels (`moondreams-dev-apps--pr…web.app`) is `https://*.web.app/*`, which admits every Firebase site, so previews are left without place search. (The regex `cors` list in `functions/` is a different mechanism and is fine as-is.)

> [!IMPORTANT]
> This list must stay in sync with what the code actually reads. Whenever you add, rename, or
> remove a `VITE_*`/`import.meta.env` variable, update this section in the same change.

## Deployment

Merges to `main` trigger [`.github/workflows/firebase-hosting-merge.yml`](.github/workflows/firebase-hosting-merge.yml), which:

1. Builds the app and deploys Firebase resources (hosting, rules, indexes, functions) via `npm run fb:deploy:smart`, using the `FIREBASE_SERVICE_ACCOUNT_MOONDREAMS_DEV_APPS` and `VITE_FIREBASE_*` repo secrets.
2. Deploys the Cloudflare Worker (`cloudflare-worker.js`, the PWA OG-tag injector) via `npm run cf:worker` (`wrangler deploy`) — but **only if that push changed `cloudflare-worker.js` or `wrangler.toml`**, checked with a `git diff` against the previous commit SHA.

The worker rewrites link-preview tags per app from `APP_REGISTRY`. An app's `params` list gives query-param-specific copy (e.g. Waypoint's `inviteCode`, then `trip`); the first valid param in list order wins, and the app's default title/description is the fallback.

### Cloudflare Worker secret setup

The worker deploy step needs a `CLOUDFLARE_API_TOKEN` repo secret:

1. Cloudflare dashboard → profile icon → **My Profile → API Tokens → Create Token**.
2. Use the **"Edit Cloudflare Workers"** template, or a custom token with **Account → Workers Scripts → Edit** (add more permissions if `wrangler.toml` grows to touch routes/KV/etc.).
3. Scope **Account Resources** to the account this worker deploys to, then create and copy the token.
4. Add it to the repo: **Settings → Secrets and variables → Actions → New repository secret**, name `CLOUDFLARE_API_TOKEN` — or `gh secret set CLOUDFLARE_API_TOKEN`.

`wrangler.toml` has no `account_id` set, which is fine if the token/account is unambiguous. If a deploy ever fails with a "multiple accounts found" error, add a `CLOUDFLARE_ACCOUNT_ID` secret (from the Workers & Pages overview page in the dashboard) and reference it in the workflow's `env:` block next to `CLOUDFLARE_API_TOKEN`.

The worker deploy step runs with `continue-on-error: true`, so if it fails, the Action shows a yellow warning on that step instead of failing the whole run — Firebase hosting/resources will have already deployed successfully by that point regardless.

### New Cloud Functions & Cloud Run invoker access

A 2nd-gen `onCall` function reaches the browser only if its Cloud Run service lets anyone invoke it. The Firebase CLI grants that (`allUsers` → `roles/run.invoker`) on a function's *first* deploy only, and this project's organization policy (domain-restricted sharing) refuses every `allUsers` grant. So the first deploy of a new callable prints `Unable to set the invoker for the IAM policy`, the function is created anyway, and the deploy step fails. A re-run then goes green with the function still private, because a callable's grant isn't tried again on an update, and the browser shows a CORS error.

**What the deploy does about it.** `npm run fb:deploy:smart` reads the CLI's output. When it holds that message it runs `npm run fb:invoker -- --all`, which sets `--no-invoker-iam-check` on every callable's Cloud Run service (a setting on the service, not an IAM binding, so the policy has nothing to refuse), and deploys once more: the function the first run created is now an update, and an update doesn't ask for the grant again. A new callable needs nothing by hand. A second failure, or any failure without that message, fails the step as before. If the organization ever allows `allUsers` for this project, the CLI's own grant works and that path never runs.

**One-time setup:** the deploy account (the service account in the `FIREBASE_SERVICE_ACCOUNT_MOONDREAMS_DEV_APPS` secret) must be able to update Cloud Run services. If it can't yet, `roles/run.admin` is the simple grant:

```bash
gcloud projects add-iam-policy-binding moondreams-dev-apps \
  --member="serviceAccount:<the deploy account's email>" --role="roles/run.admin"
```

Without it the step fails on a PERMISSION_DENIED from `gcloud` and names the function; the merge workflow signs `gcloud` in as that account first. A re-run of the workflow won't fix the function after that, because it now exists and the deploy skips it without a message, so once the role is granted run `npm run fb:invoker -- --all` yourself.

**What it means:** every callable is reachable by anyone who has its address, exactly as with an `allUsers` grant, so each one checks the caller itself (`request.auth`) except the readers that exist for signed-out visitors (see [functions/README.md](functions/README.md)). The setting doesn't appear in the project's IAM policy, so a scan for `allUsers` won't find it, and the organization constraint `constraints/run.requireInvokerIam`, if it is ever turned on, would block it. It is kept to `onCall` functions: a scheduled or trigger function keeps its IAM check, and the script refuses it (it also stops if it can't read `functions/src/index.ts`, rather than guess). Only `fb:deploy:smart`, which the merge workflow runs, does this: `npm run fb:functions` and `npm run fb:deploy` call the CLI directly, so follow them with `npm run fb:invoker -- --all`.

**By hand** (a function that skipped the above, or a browser CORS error whose Cloud Run request log shows a `403` on the `OPTIONS` preflight with "The request was not authenticated"). Names are any case; the script lowercases them for Cloud Run, which rejects mixed-case names:

```bash
npm run fb:invoker -- getCalendarShare findShowtimes
npm run fb:invoker -- --all
npm run fb:invoker -- findShowtimes --dry   # prints the gcloud command without running it
```

It runs `gcloud run services update <lowercase-name> --no-invoker-iam-check --region=us-central1 --project=<.firebaserc default>` for each function and carries on if one fails. It needs `gcloud` signed in with a role that can update Cloud Run services.

### Storage CORS for reading sealed files

Runway's receipt photos are sealed on the device, so the app reads their bytes (`getBytes`) instead of showing a picture URL, and a browser only allows that when the bucket's CORS lists the site. It is a one-off bucket setting, kept in `storage-cors.json` (GET only, the production origins); apply it once, and again whenever that file changes:

```bash
gcloud storage buckets update gs://moondreams-dev-apps.firebasestorage.app --cors-file=storage-cors.json
```

Symptom without it: a receipt uploads, but its thumbnail never opens and the console shows a CORS error on `firebasestorage.googleapis.com`. A PR preview channel (`moondreams-dev-apps--pr…web.app`) is not listed, so receipts don't open there.

## PWAs & push notifications

The site installs as **one** Progressive Web App: `index.html` links `public/manifest-main.json` (`id`/`start_url`/`scope` `/`; its installed icon is `public/logos/logo-pwa.svg`, with PNG copies `pwa-icon-192.png`, `pwa-icon-512.png` and a padded `pwa-icon-maskable-512.png` for Android and `apple-touch-icon.png` for iOS, because phones don't take an SVG icon when installing; regenerate the PNGs from the SVG if it changes), and every route, apps included, uses it. Apps are not installable on their own: several PWAs on one origin with nested scopes aren't supported by Chrome on Android, and a root app's scope covers every app URL anyway, so people reach an app from the installed hub. Don't add per-app manifests or `scope_extensions`. Because the hub is installed, its ways home (the menu's Home row, header icon, entry and error screens) stay visible everywhere. An installed window (`IS_INSTALLED_APP` in `src/utils/pwaUtils.ts`: `display-mode` standalone, minimal-ui or window-controls-overlay, or iOS `navigator.standalone`) shows no scrollbar anywhere, at any width (`data-installed-app` on `<html>`, set in `main.tsx`, hides them with `!important` in `src/index.css`); scrolling itself is unchanged. `src/ui/Layout.tsx` swaps only the tab icon and title to the current app's `public/logos/by-app/logo-<app-id>.svg` (the hub keeps its light/dark logos from `index.html`).

Despite that, there is only **one Workbox service worker** for the whole origin (registered once in `src/main.tsx`, `scope: "/"`), shared by the whole site, which is a single installed app. This matters for anything that touches the service worker:

- **Don't register a second service worker.** Two workers both trying to control `scope: "/"` fight for control of the origin; the browser only lets one worker actually control a given scope at a time. Firebase Cloud Messaging's push notifications (see [Nine Lives' `src/lib/notifications`](src/apps/nine-lives)) merge their background-message handler into the existing worker instead, via `workbox.importScripts` in `vite.config.ts` — `public/firebase-messaging-sw-additions.js` gets `importScript`'d into the Workbox-generated `sw.js` at build time, alongside a `firebase-messaging-sw-config.js` that same build step generates from the `VITE_FIREBASE_*` secrets already used by the client bundle (those values aren't secret — Firebase's web config is safe to ship publicly).
- **A new version reaches an installed app in two steps, and the second is the person's.** The new worker takes over at once (`skipWaiting` + `clientsClaim`), but the open page keeps running the old code, and a reload is served by the old worker while the next one downloads. So the installed app (`IS_INSTALLED_APP`) checks for a new worker when they come back to the foreground or reconnect, and every 15 minutes (`src/lib/app/appUpdate.ts`), and once one takes over the top strip (`OfflineBanner`) offers **New version ready · Restart**, which reloads. Nothing reloads the page on its own: `registerSW` gets `onNeedReload` (without it the register helper reloads the page itself the moment an update takes over), and a lazy chunk that the old page can no longer fetch (`vite:preloadError`) raises the same strip, in a browser tab too, and the person decides when to restart. Restart asks before throwing away typed work: a form whose `useDiscardGuard` is dirty, a form that reports its own dirtiness (`useUnsavedWork`: Pinch's recipe and cooking edits, Waypoint's receipt split and personal expenses, Pinch's notes, meal builder and put-away sheet, Runway's line-up, A-List's membership settings, the admin app drafts), or any text field typed into that is still on screen with text in it (`src/lib/app/unsavedWork.ts`). In a browser tab a takeover raises the same strip. A phone can still close the app in the background to free memory; a form holding unsaved work keeps a copy on the device while it is dirty (`useFormDraft` / `useKeepFormDraft`, `src/lib/app/formDrafts.ts`: under the account, a day at most, cleared when the form closes and on sign-out, never a picked photo or file), and the same form opened again starts from it with "We kept what you typed before the app closed · Start over" (`DraftRestoredNotice`, whose Start over asks first; Pinch's tabs also offer "Pick up your unsaved recipe?"). The strip's colors are the theme's `primary` pair, and its button is that pair swapped (not a `secondary` button, which Pinch's theme makes see-through), so `npm run check:apps` fails any theme whose primary text is under 4.5:1 in light or dark. `firebase-messaging-sw-additions.js` must never throw while loading: it runs before `skipWaiting`, so a throw (an unreachable `gstatic.com`) leaves every update stuck waiting.
- **PWA/service-worker behavior is production-only by default.** `vite-plugin-pwa` doesn't register a worker in `npm run dev` unless `devOptions.enabled` is turned on, so push notifications can't be exercised locally without a production-style build (`npm run build && npm run preview`, or a deploy preview).
- **Push notifications need one more secret Firestore doesn't require:** `VITE_FIREBASE_VAPID_KEY` (see [Environment variables](#environment-variables)) isn't part of the standard `firebaseConfig` object, so it also has to be added to the `VITE_FIREBASE_*` repo secrets used by the deploy workflows before `requestPushPermission()` can mint a real device token.

## Troubleshooting

Problems we've hit before, so we don't hit them again.

### The merge deploy fails with `Release … cloud.firestore already exists`

- **Symptom:** "Deploy to Firebase Hosting on merge" stops in "Deploy Firebase resources" with `Error: Request to https://firebaserules.googleapis.com/v1/projects/…/releases had HTTP Error: 409, Release projects/…/releases/cloud.firestore already exists.`, after the log has already shown the Database and Storage rules released. Re-running fails identically, so Hosting and Functions never deploy, and the app can call a Function or a rule that the merge expected. The Firestore indexes, uploaded earlier, did deploy.
- **Cause:** the 409 is a decoy. The Firebase CLI updates the `cloud.firestore` release first, hides any error from that, then tries to create it, and the create is what answers 409. The real answer is `400 INVALID_ARGUMENT: Total size of compiled executables must be smaller than 256000 bytes (actual: 258960 bytes)`. Neither the CLI's compile check nor the emulator applies that limit. The compiled size is the rules' own text: two real answers gave 1.73775 bytes per character of code (comments removed, whitespace collapsed), 149,020 characters to 258,960 bytes and 148,773 to 258,529. A function's body counts once however many rules call it, so merging the create and update rules of seven collections (#477, thought to save 24 KB) saved 431 bytes and the next deploy failed the same way. #395 grew the rules by 2,449 characters and crossed the limit.
- **Fix:** write less rules text. The repeated clauses (an unchanged `createdAt` or `createdBy`, `isTimestampNumber(request.resource.data.createdAt)`, the Waypoint trip `get(...)`) became ten helper functions at the top of the rules and two unused functions were deleted, which took the estimate from 258,530 to 242,656 bytes. Behaviour was checked by running every seeded document's writes (update unchanged and with each identity field changed, create a copy, an extra key, a read) as each of the four seeded users and signed out against the old and the new rules in the emulator and diffing the results.
- **Telling it apart:** `scripts/fbDeploySmart.ts` repeats the release update on this 409 and prints the Rules API's own answer under "Repeating its update to read the answer"; a 400 naming a size is this problem, anything else is a different one. `npm run check:rules-size` estimates the size on every PR that touches `firestore.rules` and fails at 250,000 bytes (warns from 240,000); it matched the real 258,529 for the old rules at 258,530.
- **Verified:** the estimate for the failing rules is 258,530 against the real 258,529. After the change it was 242,656, and the merge deploy of #480 is the real proof. The rules were later cut to the beta tier (about 54,000), which leaves most of the limit free; the strict version is in git history at `c784e89`.

### Every AI call fails with `401 Firebase App Check token is invalid`

- **Symptom:** on the deployed app, Pinch's recipe reading, Nine Lives' ingestion and any other Firebase AI Logic call fail with `[401 ] Firebase App Check token is invalid. (AI/fetch-error)` on `firebasevertexai.googleapis.com/.../generateContent`. The console also shows `@firebase/vertexai: Unable to obtain a valid App Check token: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error)`, and Realtime Database logs "Provided AppCheck credentials ... are invalid". There is no `firebaseappcheck.googleapis.com/...:exchangeRecaptchaEnterpriseToken` request. The failing call's `X-Firebase-AppCheck` header is `eyJlcnJvciI6IlVOS05PV05fRVJST1IifQ==`, which decodes to `{"error":"UNKNOWN_ERROR"}`: the SDK's placeholder, sent when no real token could be made.
- **Causes (three, in the order they showed up):**
  1. The hosting workflows never passed `VITE_FIREBASE_APPCHECK_SITE_KEY` to the build, so deployed builds skipped `initializeAppCheck` altogether.
  2. App Check was registered with reCAPTCHA Enterprise while `src/lib/firebase/config.ts` used `ReCaptchaV3Provider`, the classic flow.
  3. **The reCAPTCHA key was created with the checkbox challenge.** App Check needs a score-based key, and Google's Enterprise endpoint rejects a checkbox key for this use: the `.../recaptcha/enterprise/anchor?...&size=invisible` response is an error page (`recaptcha.anchor.ErrorMain.init(["ainput", ... "Invalid input" ...])` instead of `Main.init`), so no `reload` request follows and no token is ever made. It looks like a domain or key-type problem but isn't: the key and `apps.moondreams.dev` were both accepted, and opening the anchor URL by hand shows a blank page for both the good and the bad case.
- **Fix:** the hosting workflows pass the key from the `VITE_FIREBASE_APPCHECK_SITE_KEY` repository secret, `config.ts` uses `ReCaptchaEnterpriseProvider`, and the key is a new Enterprise key in Google Cloud Console > Security > reCAPTCHA: type **Website**, domain `apps.moondreams.dev`, **"Will you use challenges?" off** (score-based; challenge is a locked setting that cannot be changed after creation, so a wrong key means a new key). Put the **site** key (not the secret) in both the secret and Firebase Console > App Check > Apps > the web app > reCAPTCHA Enterprise, then re-run "Deploy to Firebase Hosting on merge", since the key is baked in at build time. Preview hosts (`*.web.app`) are separate domains and need adding to the key if AI should work in previews.
- **Telling it apart (record a HAR with the type filter on All and Disable cache on, since the reCAPTCHA requests are not fetch/XHR):**
  - No `enterprise.js` request: the key is missing from the build (secret empty or not set when the build ran).
  - `anchor` answers with `ErrorMain.init`, or there is no `reload` request: the key is the wrong kind (a checkbox or classic key) or not an Enterprise key; the anchor's own text, "Invalid domain for site key", is the domain case.
  - `reload` succeeds but `exchangeRecaptchaEnterpriseToken` returns 403: the Firebase API key's restrictions need **Firebase App Check API**, or the key registered in App Check differs from the one in the build.
  - `exchangeRecaptchaEnterpriseToken` returns 200 and `generateContent` still fails: a different problem (model name, quota); read the response body.
- **Locally** with emulators the debug token (`VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`) bypasses the provider, so none of this shows up there.
- **Verified:** after swapping to a score-based key and redeploying, recipe reading works in production.

### A recipe from a link always says "We couldn't read a recipe from that page"

- **Symptom:** Pinch's "From a link" fails every time with that sentence, although the network panel shows `fetchPageContent` answering 200. The console shows `Reading the recipe failed Error: Data cannot be decoded from JSON: [object Object]`, with no `AIError` and no call to the AI.
- **Cause:** the response holds the page's schema.org Recipe data, whose nodes have `"@type": "Recipe"`. The client of a Firebase callable reads an object with an `@type` key as its own type marker (`type.googleapis.com/...`) and throws on any other value, so the call fails after the server succeeded. A page with no Recipe data (and so no `@type`) read fine, which made it look like a bad page. The reader sorted every error it did not recognise as "unread".
- **Fix:** `functions/src/linkMetadata/wireNodes.ts` writes every key's leading `@` as `_` before the function returns (`@type` becomes `_type`); `scripts/checks/pageContentWire.ts` runs a response through the real callable client, once raw (refused) and once rewritten (read).
- **Telling it apart:** an `AIError` in the same console line, or no `fetchPageContent` request at all, is the reader or the connection, not this.
- **Not verified:** the live AI answer for a real page (the sandbox cannot fetch pages), only the decode and the flow up to the AI call.

### Google sign-in fails in a browser that has visited the site before

- **Symptom:** the sign-in popup opens as a page showing the app's "Page not found" (the URL is `apps.moondreams.dev/__/auth/handler?...`), then the console logs `auth/cancelled-popup-request`. Works in a fresh Incognito window or a profile that never loaded the site. Visiting `/__/auth/handler` directly in Incognito shows "missing initial state", which is normal.
- **Cause:** `authDomain` is `apps.moondreams.dev`, the same origin as the service worker. Workbox's default navigation fallback answered the popup's `/__/auth/handler` request with `index.html`, so Firebase's handler never ran. It never showed up before the custom auth domain because the handler lived on `firebaseapp.com`, an origin the worker didn't control.
- **Fix:** `navigateFallbackDenylist: [/^\/__\//]` in `vite.config.ts`. Keep every `/__/*` path (Firebase Hosting's reserved auth and init routes) out of the worker's fallback. The worker sets `skipWaiting` + `clientsClaim` so a fix like this reaches open tabs on their next load instead of waiting for every window to close, without reloading the page under someone who is typing. An already-open tab that then hits a missing lazy chunk gets the Restart strip, or, when the route itself fails to load, a Restart button on the error screen, and never reloads on its own (`vite:preloadError` in `src/main.tsx`); if a browser is still stuck, unregister the worker in DevTools → Application → Service Workers.
- **Cloudflare can serve a stale worker.** `apps.moondreams.dev` is proxied, and Cloudflare cached `sw.js` for hours (`cf-cache-status: HIT`, `max-age=14400`), so browsers kept the old worker after the fix deployed. `firebase.json` now sends `Cache-Control: no-cache` for `sw.js` and the `firebase-messaging-sw-*.js` helpers. If a worker change doesn't reach browsers, check `curl -sI https://apps.moondreams.dev/sw.js` and purge that URL in Cloudflare (Caching → Configuration → Custom Purge).
- **Check after any change to the worker or `authDomain`:** open `/__/auth/handler` in a profile that has loaded the site before; it should be blank, not the app.

### The app restarts by itself, and what someone was typing is gone

- **Symptom:** people come back to the app (often an installed one) after a minute away, and the page reloads under them, losing a half-filled form, though nobody tapped Restart.
- **Cause:** `vite-plugin-pwa`'s `registerSW` in prompt mode calls `window.location.reload()` itself when a newer worker takes over the page, unless it is given `onNeedReload`. Coming back to the app runs `registration.update()` (`src/lib/app/appUpdate.ts`); any update found more than 60 seconds after the page loaded counts as "external" to Workbox, and with `skipWaiting` + `clientsClaim` it takes over at once, so the helper reloaded. The earlier fix removed our own reloads but not this one.
- **Fix:** `registerSW({ immediate: true, onNeedReload: markUpdateReady })` in `src/main.tsx`, so a takeover raises the Restart strip instead. Checked with a production build: load the page, build again, wait past 60 seconds, call `update()`; before, the page's state was gone, after, it stayed.
- **Still open:** a phone that kills the app in the background to free memory reopens it fresh. Forms that keep a draft on the device bring their work back (see the update paragraph above); a picked photo or file and a form that keeps no draft are still lost; Runway's and Worth the Wait's forms keep theirs sealed with each app's own key.
- **Tell it apart:** a reload right after a deploy, on coming back, is this; a reload long after any deploy, after the phone has been busy with other apps, is the system discarding the page.

### Scheduled reminders never arrive and `sendScheduledReminders` logs a 500

- **Symptom:** Cloud Run logs for `sendscheduledreminders` show `9 FAILED_PRECONDITION: The query requires an index` every 5 minutes, and no push reminders are delivered.
- **Cause:** the function queries `reminders` for `status == 'pending'` and `scheduledFor <= now + 5 min`. Equality on one field plus a range on another needs a composite index, and `firestore.indexes.json` was empty. The emulator never enforces indexes, so nothing failed locally.
- **Fix:** the index is in `firestore.indexes.json` and deploys with `npm run fb:deploy:smart` on merge. It builds for a few minutes after deploy (Firebase console → Firestore → Indexes shows Building, then Enabled); the next 5-minute run after that succeeds. `npm run check:indexes` now fails any PR with a query that needs an index the file doesn't have.
- **Tell it apart:** an index error names `requires an index` with a console link; a missing-secret or permission error does not.

### Old reminders arrive all at once, and their in-app toasts come back after every reload

- **Symptom:** right after the missing-index fix, phones got push reminders for events from a week earlier, and in-app reminder toasts reappeared on every page reload even after being swiped away.
- **Cause:** two things. While the index was missing nothing was sent, so every reminder since stayed `pending` and the first working run sent them all. And the toast hook only skipped reminders that were already `sent` when it mounted, but the first Firestore snapshot arrives after mount, so every `sent` reminder looked newly sent on each reload. Swiping a toast away only removes it from the page; it never changes the reminder.
- **Fix:** `sendScheduledReminders` marks a reminder more than 30 minutes overdue `expired` instead of sending it (a yearly one rolls forward), and `useReminderToasts` only toasts a reminder it saw as not yet sent.
- **Tell it apart:** a late push for something old is the function; a toast that returns after reload is the hook. Neither touches a reminder that is still ahead.

### An app shows empty or first-run screens for an existing account on one device

- **Symptom:** one phone (Chrome, Android) showed A-List's setup modal for an account whose membership doc exists, with the same account fine on desktop and fine in Waypoint and Nine Lives on that phone. Reloading, signing out and in, and clearing Chrome's site data did not help. No error, no denied read.
- **Cause (not fully established):** the Firestore SDK on that device answered "document missing" from its own state while the backend had the doc. A raw REST read of the same path with the same ID token returned 200, and so did every other device; the SDK's listener and `getDocFromServer` both said `exists=false`, `fromCache=false`. Before it started the owner had uninstalled three app PWAs, cleared Chrome's cache and site data, and reinstalled one app. All apps share one origin, so they share one Firestore IndexedDB, and `persistentMultipleTabManager` (`src/lib/firebase/config.ts`) lets one tab or window lead and others follow. Our best guess is a stale leader or leftover persisted state from that uninstall and clear sequence; this is a hypothesis, not a proven cause.
- **Reproduces on demand:** on that phone, Chrome → Settings → Site settings → `apps.moondreams.dev` → Clear data brings it back every time, so clearing site data while the app's storage is in use is the trigger. Nothing in our code was reproduced against a real persistent cache; the emulators use a memory cache, so they never show it.
- **Fix on the device:** terminate the Firestore instance, call `clearIndexedDbPersistence(db)` and reload (`resetFirestoreLocalData` in `src/lib/firebase/localData.ts`). That immediately returned the right answer, even though Chrome had already cleared the site's data. Server data is untouched; only the local cache and any writes still queued offline are dropped.
- **Built-in recovery:** your account page (the avatar, then **Manage your account**) has **Reset saved data** (confirm, then the reset above, bounded to a few seconds if another tab holds the database open) in every app. Clearing the saved data stops Firestore in every other tab or PWA window of the origin, so the reset also broadcasts a reload to them (`reloadOnFirestoreReset` in `src/main.tsx`). It is deliberately manual: we don't know why the SDK gets into this state, so nothing resets itself behind someone's back, and any app's screens (a first-run gate, an empty list) can be affected, not just one.
- **How to tell it apart from a data or rules problem:** a rules denial shows an error screen, not an empty one. Compare the SDK against a plain `fetch` to `https://firestore.googleapis.com/v1/projects/<project>/databases/(default)/documents/<path>` with `Authorization: Bearer <ID token>`: if REST finds the doc and the SDK does not, the problem is the device's SDK state, not the account or rules. Check the same account on another device first.
- **Don't re-run setup to "fix" it.** Setup writes the membership again; the update rule should reject it for an existing doc, but a missing-looking doc invites a second membership.

## Tech Stack

- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Dreamer UI](https://www.npmjs.com/package/@moondreamsdev/dreamer-ui)
