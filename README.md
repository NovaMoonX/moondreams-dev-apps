# MoonDreams Mini Apps

A collection of mini-apps built to fit whatever felt useful, fun, or simply interesting during a particular moment in life. Each app is built to feel focused, personal, and easy to explore together as part of one growing mini-app library.

<img width="1728" height="960" alt="image" src="https://github.com/user-attachments/assets/aedaa6f6-8a96-4c3f-aefc-1a7187965bc4" />


## Current apps

- 💌 **Worth the Wait** — a private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives.
- 🐱 **Nine Lives** — a private home base for cat owners to keep track of health records, visits, vaccinations, symptoms, and the everyday care that keeps a household organized.
- 🧭 **Waypoint** — a collaborative trip planner for shared itineraries, live travel coordination, and the details that keep a journey running smoothly.
- 🎟️ **A-List Tracker** — a personal companion for AMC Stubs A-List members that turns a calendar of movie nights into ticket savings, premium-format savings, and a clear answer on whether the membership is paying for itself.

## Quick start

```bash
npm install
npm run dev
```

Then open the local Vite app in your browser to explore the collection.

`npm run dev` only listens on your machine. To try the app (and the emulators) from a phone on your home Wi-Fi, run `npm run lan:trust -- Home` once (`lan:list` and `lan:untrust` manage the list), then `npm run dev:lan` and `npm run emulators:lan`; they refuse to start on a network you haven't trusted. See [SEEDING.md](SEEDING.md#phone-testing). To let a friend try the app on their phone from anywhere, run `npm run share` (it starts everything and copies a private Tailscale link); setup and troubleshooting are in [SEEDING.md](SEEDING.md#sharing-with-a-friend).

For local Firebase emulator fixtures, see [SEEDING.md](SEEDING.md). For every Cloud Function (what it does, its secrets, and local testing), see [functions/README.md](functions/README.md).

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

# App Check (required by Nine Lives' AI ingestion). Prod: reCAPTCHA v3 site key (Firebase Console > App Check).
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

The worker rewrites link-preview tags per mini-app from `APP_REGISTRY`. An app's `params` list gives query-param-specific copy (e.g. Waypoint's `inviteCode`, then `trip`); the first valid param in list order wins, and the app's default title/description is the fallback.

### Cloudflare Worker secret setup

The worker deploy step needs a `CLOUDFLARE_API_TOKEN` repo secret:

1. Cloudflare dashboard → profile icon → **My Profile → API Tokens → Create Token**.
2. Use the **"Edit Cloudflare Workers"** template, or a custom token with **Account → Workers Scripts → Edit** (add more permissions if `wrangler.toml` grows to touch routes/KV/etc.).
3. Scope **Account Resources** to the account this worker deploys to, then create and copy the token.
4. Add it to the repo: **Settings → Secrets and variables → Actions → New repository secret**, name `CLOUDFLARE_API_TOKEN` — or `gh secret set CLOUDFLARE_API_TOKEN`.

`wrangler.toml` has no `account_id` set, which is fine if the token/account is unambiguous. If a deploy ever fails with a "multiple accounts found" error, add a `CLOUDFLARE_ACCOUNT_ID` secret (from the Workers & Pages overview page in the dashboard) and reference it in the workflow's `env:` block next to `CLOUDFLARE_API_TOKEN`.

The worker deploy step runs with `continue-on-error: true`, so if it fails, the Action shows a yellow warning on that step instead of failing the whole run — Firebase hosting/resources will have already deployed successfully by that point regardless.

### New Cloud Functions & Cloud Run invoker access

Firebase's 2nd-gen `onCall` functions get their public "allow unauthenticated invocations" IAM grant applied automatically only on a function's *first* deploy — later redeploys don't touch existing IAM policy. A function can land on a first deploy where that automatic grant silently fails (observed once, cause not fully confirmed — possibly a project/org policy blocking new `allUsers` bindings without revoking already-granted ones), leaving the function otherwise working but unreachable from the browser.

**Symptom:** a browser console CORS error on the callable (e.g. "No 'Access-Control-Allow-Origin' header is present"), even though its `cors`/`region` config looks correct and matches a working function. Checking GCP Cloud Run request logs for that service shows the real cause: a `403` on the `OPTIONS` preflight with `"The request was not authenticated. Either allow unauthenticated invocations or set the proper Authorization header."`

**Fix:** run this against the affected function's Cloud Run service (service name = the function name, lowercased — Cloud Run rejects mixed-case names):

```bash
gcloud run services update <lowercase-function-name> \
  --no-invoker-iam-check \
  --region="us-central1" \
  --project="moondreams-dev-apps"
```

This is a one-time, per-function operational step — run it after first deploying a new callable function if you hit this symptom, not as part of every deploy. It's not part of the automated deploy workflow.

## PWAs & push notifications

Every mini-app is installable as its own Progressive Web App — the browser tab's `<link rel="manifest">` is added at runtime (see `src/ui/Layout.tsx`) for the app that owns the route's first path segment (`/waypoint`, `/waypoint/`, `/a-list/shared/…`), pointing at that app's own `public/manifest-<app-id>.json` (name, icons, `id`/`start_url`/`scope`, theme colors). The hub (`/`) and other site pages carry no manifest on purpose: a root app with scope `/` would cover every mini-app URL and make browsers report them as already installed. Keep each manifest's `scope` inside its own `/<app>/` and never add `scope_extensions`. Inside an installed app (`IS_INSTALLED_APP` in `src/utils/pwaUtils.ts`: `display-mode` standalone, minimal-ui or window-controls-overlay, or iOS `navigator.standalone`) the in-app ways back to the hub (header icon, avatar menu "Home", entry and error screens) are hidden, since the hub is outside the app's scope; the sign-in redirect, `/unauthorized` and the admin dashboard still lead there. An installed app also shows no scrollbar anywhere, at any width (`data-installed-app` on `<html>`, set in `main.tsx`, hides them with `!important` in `src/index.css`); scrolling itself is unchanged. The same effect swaps the tab icon to the app's `public/logos/by-app/logo-<app-id>.svg` (the hub keeps its light/dark logos from `index.html`).

Despite that, there is only **one Workbox service worker** for the whole origin (registered once in `src/main.tsx`, `scope: "/"`), shared by every app's manifest (the worker's scope is `/`; each manifest's is its own app path). This matters for anything that touches the service worker:

- **Don't register a second service worker.** Two workers both trying to control `scope: "/"` fight for control of the origin; the browser only lets one worker actually control a given scope at a time. Firebase Cloud Messaging's push notifications (see [Nine Lives' `src/lib/notifications`](src/apps/nine-lives)) merge their background-message handler into the existing worker instead, via `workbox.importScripts` in `vite.config.ts` — `public/firebase-messaging-sw-additions.js` gets `importScript`'d into the Workbox-generated `sw.js` at build time, alongside a `firebase-messaging-sw-config.js` that same build step generates from the `VITE_FIREBASE_*` secrets already used by the client bundle (those values aren't secret — Firebase's web config is safe to ship publicly).
- **A new version reaches an installed app in two steps, and the second is the person's.** The new worker takes over at once (`skipWaiting` + `clientsClaim`), but the open page keeps running the old code, and a reload is served by the old worker while the next one downloads. So installed apps (`IS_INSTALLED_APP`) check for a new worker when they come back to the foreground or reconnect, and every 15 minutes (`src/lib/app/appUpdate.ts`), and once one takes over the top strip (`OfflineBanner`) offers **New version ready · Restart**, which reloads. Browser tabs don't get it. `firebase-messaging-sw-additions.js` must never throw while loading: it runs before `skipWaiting`, so a throw (an unreachable `gstatic.com`) leaves every update stuck waiting.
- **PWA/service-worker behavior is production-only by default.** `vite-plugin-pwa` doesn't register a worker in `npm run dev` unless `devOptions.enabled` is turned on, so push notifications can't be exercised locally without a production-style build (`npm run build && npm run preview`, or a deploy preview).
- **Push notifications need one more secret Firestore doesn't require:** `VITE_FIREBASE_VAPID_KEY` (see [Environment variables](#environment-variables)) isn't part of the standard `firebaseConfig` object, so it also has to be added to the `VITE_FIREBASE_*` repo secrets used by the deploy workflows before `requestPushPermission()` can mint a real device token.

## Troubleshooting

Problems we've hit before, so we don't hit them again.

### Google sign-in fails in a browser that has visited the site before

- **Symptom:** the sign-in popup opens as a page showing the app's "Page not found" (the URL is `apps.moondreams.dev/__/auth/handler?...`), then the console logs `auth/cancelled-popup-request`. Works in a fresh Incognito window or a profile that never loaded the site. Visiting `/__/auth/handler` directly in Incognito shows "missing initial state", which is normal.
- **Cause:** `authDomain` is `apps.moondreams.dev`, the same origin as the service worker. Workbox's default navigation fallback answered the popup's `/__/auth/handler` request with `index.html`, so Firebase's handler never ran. It never showed up before the custom auth domain because the handler lived on `firebaseapp.com`, an origin the worker didn't control.
- **Fix:** `navigateFallbackDenylist: [/^\/__\//]` in `vite.config.ts`. Keep every `/__/*` path (Firebase Hosting's reserved auth and init routes) out of the worker's fallback. The worker sets `skipWaiting` + `clientsClaim` so a fix like this reaches open tabs on their next load instead of waiting for every window to close, without reloading the page under someone who is typing. An already-open tab that then hits a missing lazy chunk reloads itself once (`vite:preloadError` in `src/main.tsx`); if a browser is still stuck, unregister the worker in DevTools → Application → Service Workers.
- **Cloudflare can serve a stale worker.** `apps.moondreams.dev` is proxied, and Cloudflare cached `sw.js` for hours (`cf-cache-status: HIT`, `max-age=14400`), so browsers kept the old worker after the fix deployed. `firebase.json` now sends `Cache-Control: no-cache` for `sw.js` and the `firebase-messaging-sw-*.js` helpers. If a worker change doesn't reach browsers, check `curl -sI https://apps.moondreams.dev/sw.js` and purge that URL in Cloudflare (Caching → Configuration → Custom Purge).
- **Check after any change to the worker or `authDomain`:** open `/__/auth/handler` in a profile that has loaded the site before; it should be blank, not the app.

### An app shows empty or first-run screens for an existing account on one device

- **Symptom:** one phone (Chrome, Android) showed A-List's setup modal for an account whose membership doc exists, with the same account fine on desktop and fine in Waypoint and Nine Lives on that phone. Reloading, signing out and in, and clearing Chrome's site data did not help. No error, no denied read.
- **Cause (not fully established):** the Firestore SDK on that device answered "document missing" from its own state while the backend had the doc. A raw REST read of the same path with the same ID token returned 200, and so did every other device; the SDK's listener and `getDocFromServer` both said `exists=false`, `fromCache=false`. Before it started the owner had uninstalled three mini-app PWAs, cleared Chrome's cache and site data, and reinstalled one app. All mini-apps share one origin, so they share one Firestore IndexedDB, and `persistentMultipleTabManager` (`src/lib/firebase/config.ts`) lets one tab or window lead and others follow. Our best guess is a stale leader or leftover persisted state from that uninstall and clear sequence; this is a hypothesis, not a proven cause.
- **Reproduces on demand:** on that phone, Chrome → Settings → Site settings → `apps.moondreams.dev` → Clear data brings it back every time, so clearing site data while the app's storage is in use is the trigger. Nothing in our code was reproduced against a real persistent cache; the emulators use a memory cache, so they never show it.
- **Fix on the device:** terminate the Firestore instance, call `clearIndexedDbPersistence(db)` and reload (`resetFirestoreLocalData` in `src/lib/firebase/localData.ts`). That immediately returned the right answer, even though Chrome had already cleared the site's data. Server data is untouched; only the local cache and any writes still queued offline are dropped.
- **Built-in recovery:** the avatar menu has **Reset saved data** (confirm, then the reset above, bounded to a few seconds if another tab holds the database open) in every app. Clearing the saved data stops Firestore in every other tab or PWA window of the origin, so the reset also broadcasts a reload to them (`reloadOnFirestoreReset` in `src/main.tsx`). It is deliberately manual: we don't know why the SDK gets into this state, so nothing resets itself behind someone's back, and any app's screens (a first-run gate, an empty list) can be affected, not just one.
- **How to tell it apart from a data or rules problem:** a rules denial shows an error screen, not an empty one. Compare the SDK against a plain `fetch` to `https://firestore.googleapis.com/v1/projects/<project>/databases/(default)/documents/<path>` with `Authorization: Bearer <ID token>`: if REST finds the doc and the SDK does not, the problem is the device's SDK state, not the account or rules. Check the same account on another device first.
- **Don't re-run setup to "fix" it.** Setup writes the membership again; the update rule should reject it for an existing doc, but a missing-looking doc invites a second membership.

## Tech Stack

- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Dreamer UI](https://www.npmjs.com/package/@moondreamsdev/dreamer-ui)
