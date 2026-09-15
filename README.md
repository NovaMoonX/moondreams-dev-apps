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

## Tech Stack

- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Dreamer UI](https://www.npmjs.com/package/@moondreamsdev/dreamer-ui)
