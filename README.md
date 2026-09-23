# MoonDreams Mini Apps

A collection of mini-apps built to fit whatever felt useful, fun, or simply interesting during a particular moment in life. Each app is built to feel focused, personal, and easy to explore together as part of one growing mini-app library.

<img width="1728" height="960" alt="image" src="https://github.com/user-attachments/assets/aedaa6f6-8a96-4c3f-aefc-1a7187965bc4" />


## Current apps

- Worth the Wait — a private space for companions to place thoughts, feelings, hopes, and desires until the right moment to share them arrives.

## Quick start

```bash
npm install
npm run dev
```

Then open the local Vite app in your browser to explore the collection.

For local Firebase emulator fixtures, see [SEEDING.md](SEEDING.md). For the callable Cloud Functions used by Worth the Wait, see [functions/README.md](functions/README.md).

For a production build:

```bash
npm run build
```

### Environment variables

Create a `.env.local` at the repo root (gitignored) with:

```bash
# Firebase project config — Firebase Console > Project Settings > General > Your apps.
# Safe to commit-adjacent-share: this is the public web config, not a secret.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Cloud Messaging Web Push certificate key — Firebase Console > Project Settings >
# Cloud Messaging > Web configuration. Only needed to test push notifications locally.
VITE_FIREBASE_VAPID_KEY=

# Google Maps Platform > Keys & Credential > API Keys. Powers place search (Places API (New),
# called from the browser — see src/lib/places/placesApi.ts); search is hidden when unset.
# Restrict it: HTTP referrers (apps.moondreams.dev, *.web.app, localhost), API = Places API
# (New) only, plus a daily quota cap on Autocomplete + Place Details and a billing alert.
VITE_GOOGLE_PLACES_API_KEY=

# App Check, required for Nine Lives' AI document ingestion (Firebase AI Logic enforces it).
# Production: a reCAPTCHA v3 site key — Firebase Console > App Check > Apps > reCAPTCHA v3.
VITE_FIREBASE_APPCHECK_SITE_KEY=
# Local/emulator dev: any fixed UUID, shared by the whole team and registered once in
# Firebase Console > App Check > Apps > Manage debug tokens. Ask a teammate for the current
# value rather than generating your own — a second registered token works too, but then
# everyone's re-registering their own separately for no benefit.
VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=

# Optional: overrides the Gemini model Nine Lives' document ingestion calls. Defaults to
# gemini-2.5-flash-lite when unset.
VITE_FIREBASE_AI_MODEL=

# true to point the app at the local Firebase Emulator Suite (see SEEDING.md) instead of
# the live project. Leave unset/false to hit real Firebase.
VITE_USE_FIREBASE_EMULATORS=
```

> [!IMPORTANT]
> This list must stay in sync with what the code actually reads. Whenever you add, rename, or
> remove a `VITE_*`/`import.meta.env` variable, update this section in the same change.

## Deployment

Merges to `main` trigger [`.github/workflows/firebase-hosting-merge.yml`](.github/workflows/firebase-hosting-merge.yml), which:

1. Builds the app and deploys Firebase resources (hosting, rules, indexes, functions) via `npm run fb:deploy:smart`, using the `FIREBASE_SERVICE_ACCOUNT_MOONDREAMS_DEV_APPS` and `VITE_FIREBASE_*` repo secrets.
2. Deploys the Cloudflare Worker (`cloudflare-worker.js`, the PWA OG-tag injector) via `npm run cf:worker` (`wrangler deploy`) — but **only if that push changed `cloudflare-worker.js` or `wrangler.toml`**, checked with a `git diff` against the previous commit SHA.

### Cloudflare Worker secret setup

The worker deploy step needs a `CLOUDFLARE_API_TOKEN` repo secret:

1. Cloudflare dashboard → profile icon → **My Profile → API Tokens → Create Token**.
2. Use the **"Edit Cloudflare Workers"** template, or a custom token with **Account → Workers Scripts → Edit** (add more permissions if `wrangler.toml` grows to touch routes/KV/etc.).
3. Scope **Account Resources** to the account this worker deploys to, then create and copy the token.
4. Add it to the repo: **Settings → Secrets and variables → Actions → New repository secret**, name `CLOUDFLARE_API_TOKEN` — or `gh secret set CLOUDFLARE_API_TOKEN`.

`wrangler.toml` has no `account_id` set, which is fine if the token/account is unambiguous. If a deploy ever fails with a "multiple accounts found" error, add a `CLOUDFLARE_ACCOUNT_ID` secret (from the Workers & Pages overview page in the dashboard) and reference it in the workflow's `env:` block next to `CLOUDFLARE_API_TOKEN`.

The worker deploy step runs with `continue-on-error: true`, so if it fails, the Action shows a yellow warning on that step instead of failing the whole run — Firebase hosting/resources will have already deployed successfully by that point regardless.

## PWAs & push notifications

Every mini-app is installable as its own Progressive Web App — the browser tab's `<link rel="manifest">` is swapped at runtime (see `src/ui/Layout.tsx`) based on the current route, pointing at that app's own `public/manifest-<app-id>.json` (name, icons, `start_url`, theme colors). This is why there's a `manifest-nine-lives.json`, `manifest-waypoint.json`, etc. instead of one shared manifest — each one gives its app a distinct "Add to Home Screen" identity.

Despite that, there is only **one Workbox service worker** for the whole origin (registered once in `src/main.tsx`, `scope: "/"`), shared by every app's manifest — every manifest's `scope` is `"/"` too. This matters for anything that touches the service worker:

- **Don't register a second service worker.** Two workers both trying to control `scope: "/"` fight for control of the origin; the browser only lets one worker actually control a given scope at a time. Firebase Cloud Messaging's push notifications (see [Nine Lives' `src/lib/notifications`](src/apps/nine-lives)) merge their background-message handler into the existing worker instead, via `workbox.importScripts` in `vite.config.ts` — `public/firebase-messaging-sw-additions.js` gets `importScript`'d into the Workbox-generated `sw.js` at build time, alongside a `firebase-messaging-sw-config.js` that same build step generates from the `VITE_FIREBASE_*` secrets already used by the client bundle (those values aren't secret — Firebase's web config is safe to ship publicly).
- **PWA/service-worker behavior is production-only by default.** `vite-plugin-pwa` doesn't register a worker in `npm run dev` unless `devOptions.enabled` is turned on, so push notifications can't be exercised locally without a production-style build (`npm run build && npm run preview`, or a deploy preview).
- **Push notifications need one more secret Firestore doesn't require:** `VITE_FIREBASE_VAPID_KEY` (see [Environment variables](#environment-variables)) isn't part of the standard `firebaseConfig` object, so it also has to be added to the `VITE_FIREBASE_*` repo secrets used by the deploy workflows before `requestPushPermission()` can mint a real device token.

## Tech Stack

- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Dreamer UI](https://www.npmjs.com/package/@moondreamsdev/dreamer-ui)
