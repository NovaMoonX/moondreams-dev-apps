# Local Firebase Seeding

All fixture data is local to the Firebase Emulator Suite. The seed runner rejects
missing or non-local emulator hosts before it initializes the Admin SDK, so it
cannot write to a cloud Firebase project.

## Installed tooling

- `firebase-tools` runs the Auth, Firestore, and Realtime Database emulators.
- `firebase-admin` creates emulator Auth users and writes Firestore and RTDB data.
- `@faker-js/faker` provides reproducible representative content for larger UI scenarios.
- `tsx` runs the TypeScript seed scripts directly. It is the selected runner because it
  executes ESM TypeScript without a build step.
- `@types/node` types the script runtime.

`ts-node` is installed in the repository but is not used by this workflow.

## Start local development

The Firestore emulator requires Java 21 or newer. Confirm `java -version` reports
version 21+ before starting the Emulator Suite.

1. Keep the real Firebase client configuration in your local `.env` file and set:

  ```dotenv
  VITE_USE_FIREBASE_EMULATORS=true
  ```

  The Auth, Firestore, and Realtime Database SDKs connect to local emulators while
  retaining the project's real `VITE_FIREBASE_*` values. The project ID must remain
  `moondreams-dev-apps` so emulator Auth tokens, Firestore rules, RTDB data, and the
  seed runner share one project identity.
2. Run `npm run emulators` in one terminal.
3. Run `npm run seed:reset` in another terminal to create the full fixture set.
4. Run `npm run dev` in a third terminal.

The Vite app connects to local services only when `VITE_USE_FIREBASE_EMULATORS=true`.
It disables the Firestore persistent cache in this mode so a reset cannot leave stale
browser data behind. The Emulator Suite UI is available at `http://127.0.0.1:4001`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run emulators` | Start Auth, Firestore, and RTDB emulators with their UI. |
| `npm run seed` | Upsert all named fixtures into an already-running emulator. |
| `npm run seed:core` | Upsert Auth users, profiles, app registry records, and presence. |
| `npm run seed:worth-the-wait` | Upsert core data and Worth the Wait fixtures. |
| `npm run seed:reset` | Clear emulator Auth, Firestore, and RTDB, then seed all fixtures. |
| `npm run emulators:seed` | Start emulators, seed all fixtures, and exit. |
| `npm run emulators:seed:reset` | Start emulators, clear all fixtures, reseed, and exit. |

Use `npm run seed -- --scope core`, `worth-the-wait`, or `all` to select a scope.
Normal runs are idempotent upserts and retain records created manually during local
development. `--reset` is the explicit destructive local reset.

## Fixture accounts

All seeded accounts use password `local-fixture-password` and are only valid in the
Auth Emulator:

| Account | Email | UID | Role |
| --- | --- | --- | --- |
| Admin | `nova@moondreams.dev` | `seed-admin` | Admin app catalog access |
| Alex | `alex@example.test` | `seed-worth-the-wait-one` | Worth the Wait partner and space creator |
| Jamie | `jamie@example.test` | `seed-worth-the-wait-two` | Worth the Wait partner |

When Vite uses the emulator configuration, the header provides local account buttons
for these identities. This uses email/password so the selected account always owns the
fixed UID and related fixture data. The ordinary Google popup remains unchanged; the
Auth Emulator also supports its native local provider popup for manual testing.

## Fixture scope

`core` writes global data shared by every app: Auth accounts, `users/{uid}`, app
catalog entries, and `status/{uid}` RTDB presence. App-specific seeders build on core.

`worth-the-wait` writes a locked two-member space at
`apps/worth-the-wait/spaces/seed-shared-space`, the production default boxes, custom
Faker-backed box content, revealed and unrevealed items, reveal history, a pending
request, and a completed action. Faker is seeded with a fixed value, so the scenario
is repeatable.

To add a main app or mini-app, create a module in `scripts/seeds/`, seed data under
its owned collection path, call the module from `scripts/seed.ts`, and document its
scope here. Keep fixed fixture UIDs in `scripts/seeds/types.ts` so global and
app-specific records always agree.

## Emulator snapshots

After preparing a useful state, capture it with:

```bash
firebase emulators:export ./firebase-data
```

Load it in later sessions with:

```bash
firebase emulators:start --only auth,firestore,database --import=./firebase-data --export-on-exit
```

Snapshots are optional. The scripts remain the source of truth for a clean,
shareable baseline.