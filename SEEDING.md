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
seed runner share one project identity. 2. Run `npm run emulators` in one terminal. 3. Run `npm run seed:reset` in another terminal to create the full fixture set. 4. Run `npm run dev` in a third terminal.

The Vite app connects to local services only when `VITE_USE_FIREBASE_EMULATORS=true`.
It disables the Firestore persistent cache in this mode so a reset cannot leave stale
browser data behind. The Emulator Suite UI is available at `http://127.0.0.1:4001`.

While the emulators are in use, a thin strip pins to the top of the page: green when they're
running and seeded, amber when they're running but empty (run `npm run seed:reset`), red when
they can't be reached. It re-checks every few seconds while the tab is visible, and the offline
banner slides over it when both apply.

## Phone testing

`npm run dev` and `npm run emulators` only listen on this machine. To use a phone on the
same Wi-Fi, run `npm run lan:trust -- Home` once on your home network (the name is optional
to pass; it asks otherwise), then
`npm run emulators:lan`, `npm run seed:reset` and `npm run dev:lan`, and scan the QR code.
The app reaches the emulators through whatever host the page was loaded from, so the fixture
account buttons work there too.

The `:lan` commands refuse to start on a network you haven't trusted: the emulators accept
`Bearer owner` and open signups, and the dev server's bundle carries the App Check debug
token. Trusted networks live in the gitignored `.lan-trusted.local`, one `name  mac` line each;
`npm run lan:list` shows them and `npm run lan:untrust -- Home` (or no name, for the current
network) removes one. Re-run `npm run seed:reset` after every emulator restart; they keep no data.

## Sharing with a friend

Let a friend try the app on their phone, with the seeded fixtures, without putting anything on the public internet.
It uses [Tailscale](https://tailscale.com/download): only people on your tailnet, or people you've shared your Mac with,
can reach the link.

### Every time: `npm run share`

1. Run `npm run share`. It starts everything and gives you a link, also copied to your clipboard.
2. Send your friend the link. They open it **with the Tailscale app on** and pick a fixture account (Alex has the
   A-List and Waypoint data) from the dev switcher at the top.
3. Press Ctrl+C when you're done. If the terminal is gone, run `npm run share:stop` instead.

`npm run share:check` is a dry run. Set `SHARE_HOST=<address>` to use a different host in the link.

### One-time setup

1. **You:** install Tailscale on your Mac and sign in. `tailscale ip -4` prints your address (the `100.x.y.z` in the link).
2. **You:** share your Mac with your friend. In the Tailscale admin console (https://login.tailscale.com/admin/machines)
   open your Mac's menu, choose Share, and send them the invite link. They only ever see that one machine.
3. **Your friend:** install Tailscale on their phone, sign in with their own (free) account, and accept the invite.
4. **You, at home, once per network:** `npm run lan:trust -- Home`.

When you're finished with a friend, remove the share in the same admin console page.

### Good to know

- **Two safeguards.** `share` refuses to start on a network you haven't trusted (see "Phone testing" above): the emulators
  bind to every interface, so the check protects the network you start on. Tailscale's sharing controls who on the
  friend's side can reach your Mac.
- **They get full access to the fake data.** Anyone who can open the link can reach every emulator, owner bypass
  included, and can see the dev App Check token in the page. That only touches seeded local data, so share with someone you trust.
- **Plain HTTP.** It runs in a normal browser tab and can't be installed as a PWA. Browser features that need HTTPS are
  missing too: ids fall back automatically, but Worth the Wait's encrypted entries can't be read or written on the link.
- **Keep your Mac awake** and the terminal open while they're using it.
- **Your edits reach them live.** App code hot-reloads on their screen, data is shared, and `firestore.rules` changes
  apply straight away. Not automatic: Functions code (rebuild with `npm --prefix functions run build`) and Vite config
  or `.env` changes (they refresh the page). `seed:reset` wipes the data for both of you, and a half-finished edit can
  break their screen, so tell them before a messy change.
- **No exit node.** Don't route your traffic through a Tailscale exit node while sharing; it can confuse the network check.

### If something's off

| Symptom                                  | Fix                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| "Couldn't find a Tailscale address"      | Open the Tailscale app and sign in; `tailscale ip -4` should print an address.                                       |
| "This network isn't trusted"             | At home, run `npm run lan:trust -- Home`.                                                                            |
| "Left alone … it isn't ours"             | Another program is on a port `share` needs (8080 is a common one). Quit it and run `npm run share` again.            |
| The link doesn't load for your friend    | They need the Tailscale app on and signed in, with your invite accepted. Check you can open the link yourself first. |
| The page loads but sign-in or data fails | The emulators aren't running or seeded. Look for errors in the `npm run share` terminal.                             |
| Seeding fails                            | `share` stops instead of serving an empty app. Fix the error shown, then run it again.                               |

## Commands

| Command                                          | Purpose                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `npm run emulators`                              | Start Auth, Firestore, and RTDB emulators with their UI.                                         |
| `npm run emulators:lan` / `dev:lan`              | The same, reachable from a phone on a trusted network.                                           |
| `npm run share`                                  | Start the LAN emulators, seed, start the dev server, and copy a Tailscale link to send a friend. |
| `npm run lan:trust` / `lan:untrust` / `lan:list` | Name and trust the current network for the `:lan` commands, remove one, or list them.            |
| `npm run seed`                                   | Upsert all named fixtures into an already-running emulator.                                      |
| `npm run seed:core`                              | Upsert Auth users, profiles, app registry records, and presence.                                 |
| `npm run seed:nine-lives`                        | Upsert core data and Nine Lives household/cat fixtures.                                          |
| `npm run seed:worth-the-wait`                    | Upsert core data and Worth the Wait fixtures.                                                    |
| `npm run seed:waypoint`                          | Upsert core data and Waypoint trip fixtures.                                                     |
| `npm run seed:a-list`                            | Upsert core data and A-List Tracker fixtures.                                                    |
| `npm run seed:reset`                             | Clear emulator Auth, Firestore, and RTDB, then seed all fixtures.                                |
| `npm run emulators:seed`                         | Start emulators, seed all fixtures, and exit.                                                    |
| `npm run emulators:seed:reset`                   | Start emulators, clear all fixtures, reseed, and exit.                                           |

Use `npm run seed -- --scope core`, `nine-lives`, `worth-the-wait`, `waypoint`, `a-list`, or `all` to select a scope.
Normal runs are idempotent upserts and retain records created manually during local
development. `--reset` is the explicit destructive local reset.

## Fixture accounts

All seeded accounts use password `local-fixture-password` and are only valid in the
Auth Emulator:

| Account | Email                 | UID                         | Role                                     |
| ------- | --------------------- | --------------------------- | ---------------------------------------- |
| Admin   | `nova@moondreams.dev` | `seed-admin`                | Admin app catalog access                 |
| Alex    | `alex@example.test`   | `seed-worth-the-wait-one`   | Worth the Wait partner and space creator |
| Jamie   | `jamie@example.test`  | `seed-worth-the-wait-two`   | Worth the Wait partner                   |
| Taylor  | `taylor@example.test` | `seed-nine-lives-caretaker` | Nine Lives household creator             |

When Vite uses the emulator configuration, the header provides local account buttons
for these identities. This uses email/password so the selected account always owns the
fixed UID and related fixture data. The ordinary Google popup remains unchanged; the
Auth Emulator also supports its native local provider popup for manual testing.
Anyone who signs in through that popup, new fake account or existing, gets the fixtures' see-every-app access
automatically, but only against the emulators.

## Fixture scope

`core` writes global data shared by every app: Auth accounts, `users/{uid}`, app
catalog entries, and `status/{uid}` RTDB presence. App-specific seeders build on core.

`worth-the-wait` writes a locked two-member space at
`apps/worth-the-wait/spaces/seed-shared-space`, the production default boxes, custom
Faker-backed box content, revealed and unrevealed items, reveal history, a pending
request, and a completed action. Faker is seeded with a fixed value, so the scenario
is repeatable.

`nine-lives` writes a shared household at
`apps/nine-lives/households/seed-nine-lives-household` plus two representative cat
profiles with insurance, origin, and key-date data for local CRUD and detail testing.

`a-list` writes Alex's private A-List membership at
`apps/a-list/memberships/seed-worth-the-wait-one` (a $25.99 plan billed at $27.94, started
60 days ago, with weekly and monthly goals). Every other fixture account has no
membership, so signing in as one opens A-List's Setup. Alex's watchlist holds six
movies across all three priorities: five whose keys match the emulator's OMDb fixture
catalog (one opening in three days, one undated), and one added by title
(`manual-seed-0001-hometown`, no poster). Alex also has five viewings at 7 pm Los Angeles time: Dune
seen twice (a rewatch) and The Matrix seen in the past few weeks, and Starlight Harbor and
Galaxy Drift planned after they open. Four more past days hold two, three, four and five movies
(3, 9, 15 and 17 days ago), so every poster split and the "+N" badge show on the calendar. A sixth seen viewing, The Matrix at 11 pm LA time
two days ago, checks that late showings count on the viewer's own day. Three seen viewings carry tickets:
The Matrix (Standard, $15.56 + $1.26 tax), Dune (Dolby Cinema with its standard price),
and a Dune IMAX showing entered as an all-in $21.39 total. Two planned showings have already ended
without an answer (Midnight Matinee four days ago and Hometown Film Fest Shorts yesterday),
so the Seen prompt opens on load; The Matrix and both Dune viewings carry star ratings.

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
