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

With no network, or with no `firebase login`, firebase-tools can't read the project's Admin SDK
config and the Functions emulator's default Storage bucket becomes `moondreams-dev-apps.appspot.com`,
while the app and the seeds use `moondreams-dev-apps.firebasestorage.app` (in production the default
bucket is the app's, as Waypoint's `deleteTrip` also relies on). Pinch's share functions copy covers
through the default bucket, so in that case start the suite with
`STORAGE_BUCKET_URL=moondreams-dev-apps.firebasestorage.app npm run emulators`; without it a cover
uploaded in the app is "not found" by the functions and the seeded share's cover can't be copied.

In a sandbox that sets `HTTPS_PROXY`, start the suite with the proxy variables unset
(`env -u HTTPS_PROXY -u https_proxy npm run emulators`): firebase-tools sends its own localhost
calls through the proxy and ignores `NO_PROXY`, so the suite stops at startup with `Error adding
firestore function … request blocked`.

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
  missing too: ids and Worth the Wait's encryption fall back to JavaScript automatically, but the copy buttons don't
  copy on the link.
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
| `npm run seed:core`                              | Upsert Auth users, profiles, app registry records, usage records, site visits, and presence.     |
| `npm run seed:nine-lives`                        | Upsert core data and Nine Lives household/cat fixtures.                                          |
| `npm run seed:worth-the-wait`                    | Upsert core data and Worth the Wait fixtures.                                                    |
| `npm run seed:waypoint`                          | Upsert core data and Waypoint trip fixtures.                                                     |
| `npm run seed:a-list`                            | Upsert core data and A-List Tracker fixtures.                                                    |
| `npm run seed:pinch`                             | Upsert core data and Pinch kitchen fixtures.                                                     |
| `npm run seed:runway`                            | Upsert core data and Alex's Runway plan, income and wrapped key.                                 |
| `npm run seed:pinch-scale`                       | Upsert core data and Taylor's oversized "Big Kitchen (scale test)" for Pinch performance checks.   |
| `npm run seed:reset`                             | Clear emulator Auth, Firestore, and RTDB, then seed all fixtures.                                |
| `npm run emulators:seed`                         | Start emulators, seed all fixtures, and exit.                                                    |
| `npm run emulators:seed:reset`                   | Start emulators, clear all fixtures, reseed, and exit.                                           |

Use `npm run seed -- --scope core`, `nine-lives`, `worth-the-wait`, `waypoint`, `a-list`, `pinch`, `pinch-scale`, `runway`, or `all` to select a scope (`pinch-scale` is opt-in; `all` and `seed:reset` leave it out).
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
catalog entries, each fixture's usage records (`apps/{appId}/usage/{uid}`, one lapsed member so the admin
sees both active and quiet) and `siteVisits/{uid}`, and `status/{uid}` RTDB presence. App-specific seeders build on core.

`worth-the-wait` writes a locked two-member space at
`apps/worth-the-wait/spaces/seed-shared-space`, the production default boxes, custom
Faker-backed box content, revealed and unrevealed items, reveal history, a pending
request, and a completed action. Faker is seeded with a fixed value, so the scenario
is repeatable.

`nine-lives` writes a shared household at
`apps/nine-lives/households/seed-nine-lives-household` plus two representative cat
profiles with insurance, origin, and key-date data for local CRUD and detail testing.

`pinch` writes Alex's private kitchen under `apps/pinch/kitchens/seed-worth-the-wait-one`: a custom family (Chips), a ready-to-eat food in it (Doritos nacho cheese), a variant joined to a catalog family (Chicken feet), an ingredient with nothing but a name (House spice blend), a catalog ingredient Alex adjusted (Chicken breast, leaner, 5 oz serving), five products (Chicken breast at Walmart, the default, and at Costco; Jasmine rice at Costco, a catalog ingredient whose record only points at its default product; Doritos and Chicken feet at Green Market), three recipes (Adobo chicken, with "Salt · to taste" as a line with no amount and its storage notes in full: 3 days in the fridge, 3 months in the freezer, a reheating line and a tip; Cilantro lime rice, which only says 3 days in the fridge; and Game night nachos, which uses the custom Doritos ingredient and keeps the older shape with no `care` key, as does the archived Retired chili), two recipe collections (High-protein on the adobo and the nachos, Weeknight on the adobo and the rice; the archived Retired chili has no `collectionIds` key, the shape from before collections), categories (Main dishes on the adobo, Snacks and Main dishes on the nachos, none on the rice, which has no `categories` key, the shape from before categories), different created and edited times on the rice, the nachos and Snack plate so each sort gives its own order, two saved meals (Adobo and rice, starred, in Main dishes, and Snack plate, with no `isFavorite` or `categories` key, the shape from before those) and twenty-three planned meals around today (one planned from Adobo and rice, then tweaked) (two three days back, the lunch of chicken feet already fixed before it had a price, in the shape snapshots had before `repricedAt` existed, so that day offers "Price this day with today's prices"; one two days back; today with three; tomorrow with two; a day with five and a day with ten, to show the "+N" and a long drawer; each across several meal types), six recipe ideas (two links with a site and no picture, one link whose picture address can't load offline so the fallback tile shows, two jotted ones, one with a long note, and one link already turned into the adobo recipe), a shopping list of six lines that remember what put them there (the chicken thigh, soy sauce and garlic are Adobo chicken at its own four servings, added from the recipe; the got cilantro and lime juice are today's and tomorrow's dinners; the chicken breast was typed on the list), five cooks (Adobo chicken three times over the past weeks at 2, 4 and 6 servings, Cilantro lime rice once, and the adobo dinner from three days back marked from the calendar, so it reads "Cooked ✓" there), eight recipe journal entries (Adobo chicken's journal: a plain note from two weeks back, a tweak eight days back with two changes and a reason, which makes the plain note read "Written before your … tweak", and a note after the calendar dinner that follows that cook, all three in the shape from before steps, with no `stepIndex`, `stepText` or `reason` key; and, with those keys, a tip on step 2, a tip for the whole recipe, a planned change on step 1 with its reason (tied to the calendar dinner's cook, like the note on step 3, so that cook's page lists both), and a note on step 3; Cilantro lime rice: one note after its cook, in the older shape), ten containers of prepared food (seven in stock and three finished: Adobo chicken in the fridge with a day left, in the freezer, and a thawed one that went in the freezer twice; Cilantro lime rice in the fridge; a container of the saved meal Adobo and rice; Grandma's lentil soup in the freezer; Chicken stock in the freezer three days past its date; one finished adobo that was eaten over a few meals, one finished rice that was thrown out and a turkey chili cleared out of the freezer, so Kitchen's Fridge & freezer shows every state and the Recipes and Saved meals lists show stock lines), a settings document where Alex has already closed the vinegar's price nudge, and three stores: Walmart and Costco from the well-known list and Green Market, one of Alex's own with a seeded image (uploaded to the Storage emulator; into the bucket named by `VITE_FIREBASE_STORAGE_BUCKET`, else `moondreams-dev-apps.firebasestorage.app`; set `STORAGE_BUCKET` to override). Every other fixture account starts with an empty kitchen, except after `seed:pinch-scale`, which fills Taylor's: 40 custom families, 300 custom ingredients, 12 catalog stores, 150 products (on every second ingredient, so half of them are unpriced), 200 recipes (half with storage notes, the rest in the older shape with no `care` key), in 12 collections (a fifth with no `collectionIds` key, one recipe in eight of them, the rest in none, one or two) and in the nine categories (every sixth with no `categories` key, every tenth an empty list, every fourth in two), with created and edited times spread over 41 hours, 60 saved meals (every ninth starred, every other even one explicitly not, the rest with no `isFavorite` key), an 80-line shopping list written without `sources` (the shape older lists have), 80 recipe ideas (two links in three, titles over 100 characters, a few long notes, every tenth already made into a recipe), about 330 cooks across the recipes (one recipe has twelve, to show "Show N more" in the history), about 310 recipe notes on 160 of them (a fifth are tweaks, some follow one of the recipe's cooks, and the recipe with twelve cooks also has twelve notes, one tweak with the eight-line maximum and one long text, to show "Show N more", "More" and the longest tweak), about 1,100 planned meals from 45 days back to 45 days ahead (12 a day, the past ones unfrozen so the first load exercises the freeze) and about 560 containers (about 300 in stock across the fridge and freezer, some past their date, one recipe holding a dozen and ten from saved meals, and about 260 finished, to exercise Fridge & freezer, the stock lines and the What you finished list's paging), and a settings document with a five-day fridge default and the morning note on (Alex has none, which is the default path).


`pinch` also gives Alex's adobo cooks ratings (4, 5, 4.5) and uploads two small photos for them to the Storage emulator (the first adobo cook and the rice cook keep the older shape with neither key); `seed:pinch-scale` rates Taylor's cooks and gives some of them step tips and notes.

`pinch` also writes eight pantry packages for Alex under `apps/pinch/kitchens/seed-worth-the-wait-one/packages`, over five ingredients and counted in its `firestoreDocuments`: Chicken thigh (1.2 lb in the fridge, two days past its date, and 2 lb in the freezer), Cilantro (1 cup, use by tomorrow), Whole milk (two cartons, one due tomorrow and one in six days), Spinach (two bags, three and nine days out) and Jasmine rice (8 lb, no date), to show the past-its-date row, "Use by tomorrow", an ingredient with two packages and one with no date. `seed:pinch-scale` gives Taylor 120 packages over his first 60 ingredients (8 on one, two on most, one on a few, some past their date or due soon, a few mixing weights, volumes and counts) and turns his pantry reminder on. Neither seed runs by itself in these checks; a kitchen without packages (Jamie's, or Alex's before a reseed) shows no Pantry anywhere.

`pinch` also writes two shares for Alex under `apps/pinch/shares` and `apps/pinch/shareSnapshots` (written with the Admin SDK, since no client can), counted in its `firestoreDocuments` as four: Adobo chicken, taken from the recipe as it is now, with a cover uploaded to the Storage emulator at `apps/pinch/shares/<id>/cover-0.webp`; and the saved meal Adobo and rice, taken before its last edit, so the owner's list reads it as changed since. Their ids are fixed so a link can be opened by hand: `/pinch/shared/seedsharercp23456789abcdef` and `/pinch/shared/seedsharemeal23456789abcde`.

`a-list` writes Alex's private A-List membership at
`apps/a-list/memberships/seed-worth-the-wait-one` (a $25.99 plan billed at $27.94, started
60 days ago, with weekly and monthly goals). Every other fixture account has no
membership, so signing in as one opens A-List's Setup. Alex's watchlist holds seven
movies across all three priorities: five whose keys match the emulator's OMDb fixture
catalog (one opening in three days, one undated), one with a TMDB key (`tmdb-438631`,
already released), and one added by title (`manual-seed-0001-hometown`, no poster). Alex also has five viewings at 7 pm Los Angeles time: Dune
seen twice (a rewatch) and The Matrix seen in the past few weeks, and Starlight Harbor and
Galaxy Drift planned after they open. Four more past days hold two, three, four and five movies
(3, 9, 15 and 17 days ago), so every poster split and the "+N" badge show on the calendar. A sixth seen viewing, The Matrix at 11 pm LA time
two days ago, checks that late showings count on the viewer's own day. One more planned showing (Midnight Matinee) starts 5 minutes after the seed runs, so the "add from trailers" bubble shows above the Calendar icon; it leaves its window about 35 minutes after seeding (run `npm run seed:reset` again to see it). Three seen viewings carry tickets:
The Matrix (Standard, $15.56 + $1.26 tax), Dune (Dolby Cinema with its standard price),
and a Dune IMAX showing entered as an all-in $21.39 total. Two planned showings have already ended
without an answer (Midnight Matinee four days ago and Hometown Film Fest Shorts yesterday),
so the Seen prompt opens on load; The Matrix and both Dune viewings carry star ratings.

To add a main app or mini-app, create a module in `scripts/seeds/`, seed data under
its owned collection path, call the module from `scripts/seed.ts`, and document its
scope here. Keep fixed fixture UIDs in `scripts/seeds/types.ts` so global and
app-specific records always agree.

`runway` writes Alex's plan at `apps/runway/plans/seed-worth-the-wait-one` (a sealed currency payload), one income source with two pay lines (a paycheck every other week that ends after six, and a one-time bonus) as sealed items, versions and changes beneath it, and
its wrapped data key at `apps/runway/server/seed-worth-the-wait-one/keys/data`, so Alex's Runway opens at once, plus one canary per master key at `apps/runway/keyChecks/{masterKeyId}` so `verifyRunwayKeys` reports healthy.
Every other account has no plan: its first open calls `getRunwayKey` and creates one. The seed derives Alex's data
key from the emulator keyring and wraps it the way `getRunwayKey` does. That keyring is the `RUNWAY_MASTER_KEYS`
line in `functions/.secret.local` (git-ignored), for example
`RUNWAY_MASTER_KEYS='{"current":"m1","keys":{"m1":"<64 hex characters>"}}'`; with no file or line, both the seed
and the emulator use the built-in development keyring. Restart the emulators and run `npm run seed:reset` after
changing it, or Alex's plan will not open ("Your plan cannot be opened right now").

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
