# A-List Tracker — Issue Roadmap

Tiers mirror the README's Core MVP / Next Steps / Stretch Goals. Within a tier, issues are ordered by prerequisite, and each issue adds only the fields, types and rules clauses it uses. On GitHub, Issue N is #(187 + N): the MVP is #188–#204, Next Steps #205–#208 and Beyond #209–#213, all labeled `A-List (App)` plus their tier.

## MVP

### Issue 1: Register A-List Tracker, make it reachable, and refresh the root README's app list

**Prerequisites:** The approved A-List `README.md`, `UX.md` and `TECHNICAL.md` are committed under `src/apps/a-list/` (`TECHNICAL.md` is the TDD) in an initial docs PR. That PR is not one of these issues.
**Target PR Size:** ~250 lines (mostly the manifest, registry entries and docs)
**Files:**

- `public/banners/by-app/banner-a-list.png` (new)
- `public/logos/by-app/logo-a-list.svg` (new)
- `public/manifest-a-list.json` (new)
- `src/routes/AppRoutes.tsx` (a lazy `/a-list` route)
- `src/apps/a-list/AList.tsx` (new; a placeholder screen)
- `src/lib/app/app.registry.ts` (one entry)
- `src/lib/types/appCatalog.ts` (one catalog entry)
- `cloudflare-worker.js` (exactly one new entry in its app registry)
- `README.md` (root: the "Current apps" list)
- `CLAUDE.md` and `.github/copilot-instructions.md` (one rule each)

**Context:** Read the registry comment at the top of `src/lib/app/app.registry.ts` (it lists what must stay in sync), `src/apps/a-list/README.md` (name, tagline, the 🎟️ identity) and the root `README.md`'s "Current apps" and PWA sections. A-List Tracker is a draft app, like Nine Lives and Waypoint.

### Description

Make A-List Tracker a real, installable mini-app that opens to a placeholder screen, so every later issue can be opened and checked in the running app. In the same PR, fix the root README's app list, which names only Worth the Wait, so it lists every app (Worth the Wait, Nine Lives, Waypoint, A-List Tracker), each with an emoji, and add the rule that keeps it current to `CLAUDE.md` and `copilot-instructions.md`.

### Possible Approach

1. Add the app's registry entry (`id: 'a-list'`, `name: 'A-List Tracker'`, `path: '/a-list'`, `status: 'draft'`, a `createdAt` of today, and a one-sentence description in the same voice as the others) and widen `AppId` in `appCatalog.ts`.
2. Create `src/apps/a-list/AList.tsx` as a placeholder (a `SectionHeader`-style title and one muted line), exported as the default, and add the lazy route in `AppRoutes.tsx` following the Waypoint entry exactly (including `ProtectedRoute` if Waypoint uses it).
3. Add `manifest-a-list.json` by copying `manifest-waypoint.json` and changing the name, short name, icons and `start_url`. Add the logo SVG (a ticket mark) and the banner PNG (the same dimensions as the other banners).
4. Add exactly one entry to `cloudflare-worker.js`'s app registry, copying Waypoint's shape without its `params`. Change nothing else in the file.
5. Root `README.md`: replace the single-line "Current apps" list with one line per app, in registry order: 💌 Worth the Wait, 🐱 Nine Lives, 🧭 Waypoint, 🎟️ A-List Tracker, each followed by its registry description (A-List's from step 1). Keep the section's existing tone.
6. `CLAUDE.md` ("Release hygiene") and `copilot-instructions.md` ("Documentation quality" and the "Critical reminders" list): add the rule — **the root `README.md` "Current apps" list mirrors `APP_REGISTRY`: every app has one line (an emoji, its name, its registry description), added in the same PR that registers the app and updated whenever an app is renamed or its description changes.** Also add "root `README.md` apps list" to the list of things the registry comment says must stay in sync, if it isn't named there.
7. Do not touch `src/lib/app/app.constants.ts` for registration. `SITE_VERSION` is bumped separately, per the release-hygiene rule.

### CRUD & Entry-Point Requirements

- [ ] No entity in this issue.
- [ ] **Entry point:** `/a-list` opens the placeholder from the running app, and the app appears with its logo on the home screen's app list (whatever status filtering applies to a draft app, matching how Nine Lives and Waypoint appear).

### Success Criteria

- [ ] The four net-new files exist and the route resolves in the running app.
- [ ] Registry and catalog entries are added; the home screen and the app's own manifest (check the "Add to Home Screen" identity in the browser) show A-List Tracker.
- [ ] `cloudflare-worker.js` gained exactly one entry and nothing else changed.
- [ ] The root README lists all four apps in registry order, each with an emoji and the registry's description.
- [ ] `CLAUDE.md` and `copilot-instructions.md` each state the rule that keeps the README's app list in sync with the registry (Keep `.github/copilot-instructions.md` current).
- [ ] No Firestore field, rule or seed is introduced (so none is required); no unused type or helper was added.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the route was opened in a real browser.

### Issue 2: Membership setup and the app shell

**Prerequisites:** Issue 1
**Target PR Size:** ~450 lines (the largest MVP issue: the first data, the shell and the first form together; split the read-only settings modal off if it runs over)
**Files:**

- `src/apps/a-list/AList.tsx`, `types.ts`, `constants.ts`
- `src/apps/a-list/components/shell/BottomNav.tsx`, `LoadingSkeleton.tsx`
- `src/apps/a-list/components/setup/SetupModal.tsx`, `SetupStepper.tsx`, `CostStep.tsx`
- `src/apps/a-list/components/dashboard/DashboardScreen.tsx`, `MembershipSettingsModal.tsx` (read-only for now)
- `src/apps/a-list/store/index.ts`, `selectors.ts`, `slices/membershipSlice.ts`, `actions/membershipActions.ts`, `listeners/membershipListeners.ts`
- `src/apps/a-list/hooks/useAListSync.ts`
- `src/apps/a-list/utils/money.ts`, `utils/tax.ts`
- `src/store/index.ts` (mount `aList`)
- `src/components/SectionHeader.tsx`, `src/components/ModalFooterActions.tsx` (moved from Waypoint; Waypoint's imports updated)
- `firestore.rules` (the `apps/a-list` block and `memberships/{uid}`)
- `scripts/seeds/aList.ts`, `scripts/seeds/types.ts`, `scripts/seed.ts`, `package.json` (`seed:a-list`), `SEEDING.md`
- `CLAUDE.md`, `.github/copilot-instructions.md`, `src/apps/a-list/README.md` (check off the Build Plan line)

**Context:** Read `src/apps/a-list/TECHNICAL.md`'s "1. Membership Profile", Logic §4 (billing) and §6 (Setup branching), "Security Rules Design Criteria" and "Client State Management"; `UX.md`'s "Setup — Cost & start date", the shell diagram and its Setup table. Waypoint's `store/index.ts`, `hooks/useWaypointSync.ts` and `components/StepThroughModal.tsx` are the shape references.

### Description

On first launch, a member lands on a three-step Setup modal: confirm the perks, enter the monthly cost before tax, the total on their bill (optional) and the start date (required), then optional weekly and monthly goals. The app gauges the tax rate from the two money amounts, writes the membership once, and shows the three-tab shell with Calendar in the middle. The Dashboard's gear opens a read-only Membership settings modal.

### Possible Approach

1. Types: `MembershipProfile` exactly as in TECHNICAL.md (all keys required, `T | null`). Money helpers in `utils/money.ts` (`parseMoneyToCents`, `formatCents`) and `utils/tax.ts` (`getTaxRateFromBill(costCents, totalCents)` rounding to four decimals). Check `src/utils` first: nothing money-shaped exists, and these are domain-light enough to stay app-scoped.
2. Store: `membershipSlice` (`{ membership, isLoaded }`, resets on `resetAllState`), `startMembershipListener(uid, onChange)`, `useAListSync(uid)` called once from `AList.tsx`, mounted into `RootState` as `aList`. One listener tier only.
3. Move `SectionHeader` and `ModalFooterActions` from Waypoint to `src/components/` and update Waypoint's imports in this PR; A-List never imports from `@apps/waypoint`.
4. `AList.tsx` is the only orchestrator: auth/loading gate, skeleton until the membership snapshot arrives, an undismissable `SetupModal` when `membership === null`, then `BottomNav` (Dashboard · Calendar centred and raised · Watchlist) over three placeholder tabs, Calendar default (`?tab=`).
5. `SetupModal` holds a local step index and three `Form`s (Dreamer UI `Form` + `FormFactories`). Perks copy is a read-only list; use AMC's own wording from their A-List page and cite the source in the PR. Step 2 validates per Logic §6 (bill total at least the cost, rate at most 0.25, start date today or earlier). Submit calls `completeSetup`, one `setDoc`, every key written, `taxRate: null` when no bill total was given.
6. The "Add movies you've already seen?" offer is deferred to Issue 12; after Setup, land on the empty Calendar placeholder.
7. `MembershipSettingsModal` (opened from the Dashboard gear) shows the saved values read-only, including the rate as "about 7.5%".
8. Rules: add the `apps/a-list` catalog block (four read predicates, admin writes, placed above `nine-lives`) and `memberships/{uid}` with the shape checks and immutables from TECHNICAL.md's criteria. Verify on the emulator (owner allowed; a second user and a signed-out request denied; a bad shape denied).
9. Seed: `seedAList` creates a membership for the dev fixture users, registers `'a-list'` in `SeedScope`, adds `npm run seed:a-list`, and updates SEEDING.md and the document counts.
10. `copilot-instructions.md`: add (a) **per-member private data nests under `apps/{appId}/<root>/{uid}/…` with one-line `request.auth.uid == uid` rules, no `ownerUid` body checks and no composite indexes**; (b) **sums of money are stored as integer minor units (`priceCents`) and formatted at the edge**; (c) **when a second mini-app needs a component or hook, move it to central `src/components`, `src/ui` or `src/hooks` in that same PR; never import across `src/apps/*`**.

### CRUD & Entry-Point Requirements

- [ ] **Create:** the Setup modal writes the member's one `MembershipProfile` on first launch.
- [ ] **Read:** the saved membership is visible in the Dashboard tab's Membership settings modal, opened from the gear in the `DashboardScreen` header (reachable from the bottom bar).
- [ ] **Update:** deferred to Issue 3.
- [ ] **Delete:** not applicable; a membership isn't deletable in the MVP (the rules deny it).

### Success Criteria

- [ ] A fresh account sees Setup; after finishing it lands on the shell with Calendar centred; a reload skips Setup.
- [ ] Bill total blank, valid and too-low cases each behave as the UX table says; a future start date is rejected.
- [ ] `firestore.rules` covers the catalog document and `memberships/{uid}`; allowed and denied writes were verified on the emulator, and `firestore.indexes.json` was confirmed unchanged.
- [ ] Seed data updated (`seed:a-list` works, document counts correct).
- [ ] Every field added is used here (`taxRate` is shown in settings; goals and start date too) and nothing from a later issue (tickets, viewings) was pre-added.
- [ ] The three `copilot-instructions.md` rules above are added (Keep `.github/copilot-instructions.md` current), and the README's Build Plan line is checked off.
- [ ] The Setup modal and the Dashboard tab are both reachable in the running app; Waypoint still builds and its moved components render.
- [ ] Verified in a timezone behind UTC (the start date displays the day that was picked); `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass.

### Issue 3: Edit membership settings

**Prerequisites:** Issue 2
**Target PR Size:** ~300 lines
**Files:**

- `src/apps/a-list/components/dashboard/MembershipSettingsModal.tsx` (now editable)
- `src/apps/a-list/store/actions/membershipActions.ts` (`updateMembership`)
- `src/ui/FormSection.tsx` (reuse if it exists; otherwise create it here, centrally)
- `src/apps/a-list/UX.md` (only if the form differs from the diagram)

**Context:** Read `UX.md`'s "Form Field Organization" (Membership row: later edits through the Dashboard gear, `Disclosure` groups) and `TECHNICAL.md`'s "1. Membership Profile" bullets on editing and on the monthly cost applying to the whole history.

### Description

The Dashboard gear opens the same fields as Setup, grouped into `Disclosure` sections (Cost & tax, Start date, Goals), editable. Saving updates only what changed. A short note beside the cost explains that a changed cost applies to every month for now.

### Possible Approach

1. Check `src/ui` for `FormSection`; reuse it. If it's missing, build it centrally exactly as the Disclosure shell in the conventions describes.
2. Reuse Setup's validation and `getTaxRateFromBill`; extract nothing new unless two call sites genuinely share it (keep a copy per use otherwise).
3. `updateMembership(fields)`: a field-scoped `updateDoc` of only the fields the form owns plus `lastEditedAt`; never write the cached document back.
4. Per the form conventions, `placeholder` shows each field's saved value; the submit disables until valid.

### CRUD & Entry-Point Requirements

- [ ] **Create / Read:** already covered by Issue 2.
- [ ] **Update:** every Setup field is editable from the Membership settings modal, opened from the Dashboard gear.
- [ ] **Delete:** not applicable (not deletable in the MVP).

### Success Criteria

- [ ] Editing the cost, bill total, start date and goals each persists and re-renders in the modal.
- [ ] A second device's edit to a different field isn't overwritten (field-scoped write verified by editing one field with a stale form open).
- [ ] No rules change was needed (state this in the PR; the existing rule already accepts these updates) and the emulator was used to confirm an edit is allowed and an invalid shape denied.
- [ ] No seed change needed (stated); no new field added.
- [ ] The modal is reachable from the Dashboard gear; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 4: Find a movie — lookup service and the picker

**Prerequisites:** Issue 2
**Target PR Size:** ~400 lines
**Files:**

- `functions/src/apps/a-list/searchMovies.ts`, `getMovie.ts`, `lookupBudget.ts`, `movieCache.ts`
- `functions/src/index.ts`, `functions/README.md`
- `firestore.rules` (server-only deny blocks for the three cache/usage collections)
- `src/apps/a-list/queries/movieQueries.ts`
- `src/apps/a-list/types.ts` (`MovieSnapshot`, `MovieSearchResult`), `constants.ts` (movie constants)
- `src/apps/a-list/hooks/useAListOverlay.tsx`
- `src/apps/a-list/components/add/AddDrawer.tsx`, `MoviePicker.tsx`
- `src/apps/a-list/components/shared/PosterCover.tsx`
- `src/apps/a-list/components/watchlist/WatchlistScreen.tsx` (a header with a "+ Add" stand-in)
- `src/apps/a-list/components/dashboard/MembershipSettingsModal.tsx` (credits row)
- `CLAUDE.md`, `.github/copilot-instructions.md`

**Context:** Read `TECHNICAL.md`'s "Movie Data Service" end to end (the budget layers, the unverified facts, why a proxy) and "Overlay coordination"; `UX.md`'s "Add to calendar — pick" and its caption. Read `functions/src/linkMetadata/fetchLinkMetadata.ts` for the callable conventions and `src/lib/places/placesQueries.ts` for the query-factory shape.

### Description

The member can open an Add drawer from the Watchlist, search OMDb by title, and pick a result to see its release date, runtime and rating. Search is debounced and cached in the browser and, on the server, behind a shared cache and a daily lookup budget, because the free tier's roughly 1,000 lookups a day are shared by everyone. Saving what was picked arrives in Issue 5; here the details view ends in a disabled "Add".

### Possible Approach

1. **Verify first, in the PR description:** make one real search and one by-id call for a released movie and one upcoming one, and record the actual response fields, the format of release date, runtime and rating, whether the poster URL loads in a browser, and whether OMDb's pages state a caching or attribution rule. Correct `TECHNICAL.md`'s "unverified" notes to match what was found.
2. Functions: `searchMovies({ query })` and `getMovie({ movieKey })` per the TDD, with the secret `OMDB_API_KEY`, auth required, input caps, a timeout, low `maxInstances`, `N/A` mapped to `null`, and a key-free log policy (the upstream URL carries the key, so never log it).
3. `movieCache.ts` and `lookupBudget.ts`: Firestore reads/writes through the admin SDK only; TTLs as in the TDD (search 7 days; details 30 days when released, 1 day when null or future); the budget guard increments the app-wide and per-member daily counters in a transaction before an upstream call and refuses with `resource-exhausted` at 900 app-wide or 100 per member. Cache hits aren't counted.
4. Rules: deny-all blocks for `searchCache`, `movieCache` and `lookupUsage`, with an emulator check that a signed-in client can't read or write them.
5. Client: `movieQueries.ts` factories with the keys and persistence from the TDD; `MoviePicker` uses `useDebouncedValue(…, DEBOUNCE_MS.autocomplete)`, a minimum length, and shows the "search is resting for today" line on `resource-exhausted`. Search results never trigger per-result details calls.
6. `useAListOverlay` (the one-value overlay state) and `AddDrawer` (a Drawer; pick, then details); `PosterCover` with the title-tile fallback. The Watchlist tab shows a header with a "+ Add" that opens the drawer.
7. Credits: a line in the Membership settings modal crediting OMDb as its license requires.
8. `copilot-instructions.md` / `CLAUDE.md`: add (a) **a third-party credential that can't be domain-restricted lives in a Functions secret behind an `onCall`; the browser never holds it, and a free-tier API shared across users gets a server-side cache and a daily budget guard**; (b) the Design & UX line: **never stack an overlay on an overlay: whatever continues inside an open drawer swaps its content in place with a "‹ Back" link; a destructive confirm is the only thing allowed on top**.

### CRUD & Entry-Point Requirements

- [ ] **Create:** not in this issue; saving a watchlist item is Issue 5 (this issue's details view ends in a disabled "Add" as the stand-in).
- [ ] **Read:** search results and a picked movie's details are visible in the Add drawer, opened from the Watchlist tab's "+ Add".
- [ ] **Update / Delete:** not applicable (no entity is saved here).

### Success Criteria

- [ ] Typing pauses before a search fires; an identical repeat search makes no upstream call (confirm via the usage counter and the function logs); picking a movie costs one details call.
- [ ] A cache hit is served without incrementing the counters; hitting the cap returns `resource-exhausted` and the picker shows the friendly line.
- [ ] No key appears in the browser bundle, a response or a log.
- [ ] `firestore.rules` updated with the three deny blocks and verified on the emulator; `firestore.indexes.json` confirmed unchanged; no seed change needed (stated).
- [ ] `functions/README.md` documents the two functions and the secret; the invoker-access step in the root README was followed after deploy if CORS failed.
- [ ] The two `copilot-instructions.md`/`CLAUDE.md` rules above are added; the "unverified" notes in `TECHNICAL.md` were corrected from real calls.
- [ ] Every type and constant added is used here; the Add drawer is reachable from the Watchlist tab; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 5: Add a movie to the watchlist

**Prerequisites:** Issue 4
**Target PR Size:** ~350 lines
**Files:**

- `src/apps/a-list/types.ts` (`WatchlistItem`, `AmcFormat`, `WatchPriority`), `constants.ts` (format and priority option lists)
- `src/apps/a-list/store/slices/watchlistSlice.ts`, `actions/watchlistActions.ts`, `listeners/watchlistListeners.ts`, `selectors.ts`, `index.ts`
- `src/apps/a-list/hooks/useAListSync.ts`
- `src/apps/a-list/components/add/AddDrawer.tsx` (the details step)
- `src/apps/a-list/components/watchlist/WatchlistScreen.tsx`, `WatchlistRow.tsx`
- `src/apps/a-list/components/shared/FormatBadge.tsx`, `PriorityBadge.tsx`
- `firestore.rules` (the `watchlist/{movieKey}` block), `scripts/seeds/aList.ts`
- `src/apps/a-list/README.md`

**Context:** Read `TECHNICAL.md`'s "2. Watchlist Item" and the "Add or `addWatchlistItem`" row in the actions table; `UX.md`'s "Add to watchlist — details" and its caption (the closed format list, "no preference").

### Description

After picking a movie, the member chooses a priority (Must See, Want to See, If I Have Time; default Want to See) and optionally a preferred format, and adds it. The watchlist lists everything saved, with release date, preferred format and a priority badge. Tabs, Opening and the seen-state come later.

### Possible Approach

1. Types and `constants.ts`: add `AmcFormat` and `WatchPriority` to `types.ts` and, in the same PR, their option arrays and label maps to `constants.ts`. The preferred-format select offers the six formats plus "No preference" (`null`); the app never tries to find out which formats a movie plays in.
2. `addWatchlistItem`: a `runTransaction` that creates the document at `watchlist/{movieKey}` only if absent (never overwrites an existing priority), all keys written with explicit `null`s.
3. `watchlistSlice` + listener, started from `useAListSync` (the same single tier). A selector returns the items ordered by priority and then release date (nulls last); it must be a `createSelector`.
4. The details step shows the picked movie's release date (date-only: `formatDateUTC`, never `formatDate`), runtime and rating, the priority control and the format select, in a Dreamer UI `Form`; the Add button is the previously disabled one.
5. Rules: the watchlist block (exact keys, `movieKey` equals the document id and matches the key pattern, enum checks, `movie` snapshot shape) and verify on the emulator, including a second user denied. Seed a handful of items across all three priorities, one releasing within a week.

### CRUD & Entry-Point Requirements

- [ ] **Create:** a picked movie is added to the watchlist with a priority and an optional preferred format, from the Watchlist tab's "+ Add".
- [ ] **Read:** every saved item appears as a row (poster, title, release date, format, priority) on the Watchlist tab.
- [ ] **Update:** deferred to Issue 16.
- [ ] **Delete:** deferred to Issue 16.

### Success Criteria

- [ ] Adding the same movie twice doesn't create a second item or reset its priority.
- [ ] Release dates display as the same calendar day in a timezone behind UTC.
- [ ] `firestore.rules` has the watchlist block, verified (allowed owner write, denied other user, denied bad enum); indexes unchanged; seed updated.
- [ ] Every field is used by this issue's list or form; the Add flow and the list are both reachable from the Watchlist tab.
- [ ] README Build Plan progress noted; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 6: Add a movie by title

**Prerequisites:** Issue 5
**Target PR Size:** ~200 lines
**Files:**

- `src/apps/a-list/components/add/ManualMovieForm.tsx`, `MoviePicker.tsx`, `AddDrawer.tsx`
- `src/apps/a-list/components/shared/PosterCover.tsx`
- `src/apps/a-list/UX.md` (confirm it matches)

**Context:** Read `TECHNICAL.md`'s "Movie Data Service" (the manual path, layer 4) and the `manual-` movie key notes in "2. Watchlist Item"; `UX.md`'s picker caption.

### Description

When search is unavailable (the daily lookup budget is spent) or a movie isn't in the database, "Can't find it? Add it by title" asks for a title and an optional release date and carries on into the same details step. These movies have no poster, so their cover is a title tile.

### Possible Approach

1. `ManualMovieForm` (a `Form`): title (required), release date (optional, date-only via the existing date input helper), building a `MovieSnapshot` with `movieKey: 'manual-<uuid>'`, `posterUrl: null`, `runtimeMinutes: null`, `contentRating: null`.
2. The picker shows the link below results and, on `resource-exhausted`, as the primary route; selecting it swaps the drawer content in place (no new overlay) with "‹ Back".
3. Reuse Issue 5's add flow unchanged; the watchlist rule already allows the `manual-` key pattern, so confirm that on the emulator rather than changing it.

### CRUD & Entry-Point Requirements

- [ ] **Create:** a manual movie can be added to the watchlist from the Add drawer's "Add it by title".
- [ ] **Read:** it appears in the watchlist as a row with a title tile and its release date.
- [ ] **Update / Delete:** deferred to Issue 16.

### Success Criteria

- [ ] With the lookup guard forced to refuse (set the cap to zero locally), a movie can still be added end to end.
- [ ] Rules were checked rather than changed (a `manual-` key accepted, a malformed key denied); seed gains one manual item.
- [ ] No new field or type was added beyond what this issue uses; the form is reachable from the Add drawer; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 7: Poster calendar and add a movie to a day

**Prerequisites:** Issue 5
**Target PR Size:** ~450 lines (the calendar read model and the add flow ship together; peel the rewatch note off if it runs over)
**Files:**

- `src/apps/a-list/types.ts` (`Viewing`, `ViewingStatus`), `constants.ts` (runtime fallback, previews buffer, week start)
- `src/apps/a-list/utils/dayKeys.ts`, `viewingState.ts`
- `src/apps/a-list/store/slices/viewingsSlice.ts`, `actions/viewingActions.ts` (`addViewing`), `listeners/viewingListeners.ts`, `selectors.ts`, `index.ts`
- `src/apps/a-list/hooks/useAListSync.ts`
- `src/apps/a-list/components/calendar/CalendarScreen.tsx`, `PosterCell.tsx`, `DayPanel.tsx`, `ViewingRow.tsx`
- `src/apps/a-list/components/add/AddDrawer.tsx`, `MoviePicker.tsx`
- `firestore.rules` (the `viewings/{viewingId}` block), `scripts/seeds/aList.ts`
- `src/apps/a-list/UX.md` (the cell-sizing finding), `.github/copilot-instructions.md`

**Context:** Read `TECHNICAL.md`'s "3. Viewing", Logic §1 (lifecycle) and §2 (local-day keys), "Client State Management"; `UX.md`'s Calendar, "Add to calendar — pick/details" and the viewing-state table, plus its "Honest caveats" about cell sizing.

### Description

The Calendar tab shows a month grid where each day holding a movie is filled by its poster, and tapping a day lists its movies in a panel under the grid. "+ Add" opens the Add drawer (pick a movie from the watchlist or a search, then date and showtime) and saves a viewing: a past date saves as Seen, a future one as Planned, and a new movie joins the watchlist automatically. Seeing a movie twice is just two viewings, with a rewatch note in the picker.

### Possible Approach

1. **Prove cell sizing first** (the first commit): with Dreamer UI `Calendar`'s `customStyles` and `renderCell`, clear cell padding and border and make cells about 3:4. If the component can't, record the workaround (an absolutely positioned fill inside `renderCell`, for example) and update `UX.md`'s caveat honestly.
2. `getDayKey(timestamp)` = `toLocalDateInputValue(timestamp)`; `selectViewingsByDay` (a `createSelector`) builds the day map sorted by `showtimeAt`; `PosterCell` keys its date by `getDayKey(date.getTime())` and verifies the cell `Date` is local midnight (if it isn't, key it from the date the component means with the matching getters, e.g. `toDateInputValue` for UTC midnight; never round-trip through `fromDateInputValue` and a local read). Until Issue 8 a day with several movies shows its first cover.
3. `viewingState.ts`: `computeEndsAt(showtimeAt, runtimeMinutes)` (showtime + previews buffer + runtime, falling back to the default), and the creation rule (`SEEN` when `endsAt <= now`, else `PLANNED`).
4. `addViewing`: one `runTransaction` that reads the watchlist item, creates it if absent (default priority, no preferred format) and creates the viewing, with `movie` copied from the picked snapshot. `ticket` and `rating` don't exist yet.
5. The details step: date (defaults to the selected day) and showtime (`fromLocalDateAndTimeInputValues`), in a `Form`; the picker is watchlist-first and shows "↺ Seen once before — this will be a rewatch" using a selector over `SEEN` viewings of the same `movieKey`.
6. The day panel lists the selected day's movies (poster thumb, title, time, a Seen or Planned state) and a "+ Add" that pre-fills the date. A tapped row opens its drawer in Issue 10; until then it's not interactive.
7. Rules: the viewings block with the integrity checks from the criteria (`endsAt > showtimeAt`; `SEEN` implies `showtimeAt <= request.time`; arriving at `SEEN` needs `endsAt <= request.time`; a stored `SEEN` stays `SEEN`; `movieKey`, `movie`, `createdAt` immutable). Seed viewings on past and future days. Verify allowed and denied writes on the emulator.
8. `copilot-instructions.md`: add **a Calendar `renderCell` reads a prebuilt day-keyed map (built once in a `createSelector`); the key is the viewer's local day via `toLocalDateInputValue`, and a date-only (UTC-midnight) value is keyed with `toDateInputValue`, never read in local time**.

### CRUD & Entry-Point Requirements

- [ ] **Create:** a viewing is added from the Calendar's "+ Add" (and from the day panel's "+ Add", pre-filled), from the watchlist or a search; a new movie joins the watchlist.
- [ ] **Read:** the day's movies appear in the day panel under the Calendar grid, and their posters fill the day's cell; both on the Calendar tab, the app's home.
- [ ] **Update:** deferred to Issue 10.
- [ ] **Delete:** deferred to Issue 10.

### Success Criteria

- [ ] The cell-sizing result is documented; the grid renders posters edge to edge or the documented fallback.
- [ ] A late-evening showtime lands on the right day in a timezone behind UTC (America/Los_Angeles) and a date-only release date still shows the correct day.
- [ ] A past showing saves as Seen, one still running as Planned, a future one as Planned; a second viewing of the same movie works and the rewatch note appears.
- [ ] `firestore.rules` updated for viewings and verified; indexes unchanged; seed updated.
- [ ] Only `Viewing` fields used here exist (no `ticket`, no `rating`); the Calendar and its Add drawer are reachable from the bottom bar.
- [ ] The `renderCell` rule is added to `copilot-instructions.md`; README Build Plan progress noted; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 8: Poster splits for days with several movies

**Prerequisites:** Issue 7
**Target PR Size:** ~250 lines
**Files:**

- `src/apps/a-list/components/calendar/PosterSplit.tsx`, `PosterCell.tsx`
- `src/apps/a-list/components/shared/PosterCover.tsx`
- `src/apps/a-list/UX.md` (only if the real result differs)

**Context:** Read `UX.md`'s "Poster splits" diagrams and caption (corner-to-corner for two, pizza-style thirds, quadrants, "+N" past four, showtime order) and the cell-sizing finding from Issue 7.

### Description

A day with two movies splits corner to corner, three are cut like a pizza in thirds, four make quadrants, and five or more show the first four with a "+N" badge. Each poster fills the whole cell, clipped to its piece.

### Possible Approach

1. Draw each split with CSS `clip-path` over full-cell `PosterCover`s (polygons for the diagonal and the three wedges meeting at the centre with one edge straight up, rectangles for quadrants), covers in showtime order.
2. The date number sits in a corner over a soft shade; selected is a ring, today an accent on the number.
3. Check legibility on a phone-width grid, and that a title-tile fallback cover still clips correctly.

### CRUD & Entry-Point Requirements

- [ ] **Create:** no new entity; days with two to five or more viewings are created with Issue 7's "+ Add".
- [ ] **Read:** each split is visible on the Calendar tab's grid for the seeded multi-movie days (seed one day each with 2, 3, 4 and 5 movies).
- [ ] **Update / Delete:** not applicable.

### Success Criteria

- [ ] 1, 2, 3, 4 and 5+ movies each render as specified, including the "+N" badge; verified by eye on a phone-width viewport.
- [ ] Seed data gained the multi-movie days.
- [ ] No rules or schema change (stated); nothing unused added; reachable on the Calendar tab; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 9: Top-of-calendar counters and goals

**Prerequisites:** Issue 7
**Target PR Size:** ~250 lines
**Files:**

- `src/apps/a-list/components/calendar/CounterRow.tsx`, `CalendarScreen.tsx`
- `src/apps/a-list/components/shared/StatTile.tsx`, `GoalChip.tsx`
- `src/apps/a-list/utils/dayKeys.ts` (week bounds)
- `src/apps/a-list/store/selectors.ts` (`selectCounters`)

**Context:** Read Logic §3 (counters and goals) and §2; `UX.md`'s Calendar screen (the 14-column counter row) and its caption (counters count Seen movies only).

### Description

Above the month grid: total movies watched, movies this week as "watched / goal", and a goal chip each for the week and the month, "met" or "not yet". Counts are Seen viewings only, bucketed by the viewer's local day, and a rewatch counts again.

### Possible Approach

1. `selectCounters(state, now)` over `SEEN` viewings by day key: total, this week (local week from `WEEK_STARTS_ON`, compared as day-key strings), this month (the `YYYY-MM` prefix).
2. `StatTile` is the only card allowed inside a screen; `GoalChip` hides when a goal is null; the tile shows plain "n" with no goal.
3. `now` comes from `useNow()` at the screen; the selector is a `createSelector` keyed on viewings and `now`.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no entity; counters update live as viewings are added (and, from Issue 10, edited or removed).
- [ ] **Read:** the counters and goal chips are on the Calendar tab, above the grid.

### Success Criteria

- [ ] Seeded data produces the expected counts, including a week that spans a month boundary and a movie at 11 pm local time in America/Los_Angeles.
- [ ] A planned or ended-but-unconfirmed viewing isn't counted; a rewatch is.
- [ ] No rules, schema or seed change beyond seeding a Seen/Planned mix (state which); reachable on the Calendar tab; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 10: Open a viewing, edit it and remove it

**Prerequisites:** Issue 7
**Target PR Size:** ~350 lines
**Files:**

- `src/apps/a-list/components/viewing/ViewingDrawer.tsx`, `EditViewingForm.tsx`
- `src/apps/a-list/components/calendar/ViewingRow.tsx`, `DayPanel.tsx`
- `src/apps/a-list/hooks/useAListOverlay.tsx`
- `src/apps/a-list/store/actions/viewingActions.ts` (`updateViewing`, `removeViewing`)
- `src/apps/a-list/UX.md`

**Context:** Read `UX.md`'s Viewing drawer, its state table, the "Edit or remove a viewing" journey, and the "never overlay on overlay" principle; `TECHNICAL.md`'s Logic §1 (editing a showtime recomputes `endsAt`, a `SEEN` viewing never reverts) and the `viewingActions` rows.

### Description

Tapping a movie in the day panel opens its drawer: poster, title, date and time, and a grouped list of actions with Remove last, in red. Edit swaps the drawer's content in place to the same form as adding, prefilled (date and showtime; the movie is fixed). Remove asks for a destructive confirm, and the calendar, counters and watchlist recompute.

### Possible Approach

1. `ViewingDrawer` is a Drawer driven by the overlay state; its internal view (`details | edit`) is local state with a "‹ Back to movie" link, so nothing opens on top of it except the delete confirm.
2. `EditViewingForm` reuses the add form's date and showtime fields. `updateViewing` is a field-scoped `updateDoc` that rewrites `showtimeAt` and `endsAt` together. A `SEEN` viewing can only be moved to a time that has already started (form validation; the rule already enforces it).
3. `removeViewing` goes through `useActionModal().confirm({ destructive: true })`. Removing a movie's only viewing leaves it on the watchlist as unseen (nothing is touched on the watchlist).
4. Action list per the state table; Mark paid and Mark seen arrive in Issues 11 and 14, so they simply aren't offered yet.

### CRUD & Entry-Point Requirements

- [ ] **Create / Read:** covered by Issue 7.
- [ ] **Update:** a viewing's date and showtime can be edited from its drawer, reached by tapping a day and then the movie in the Calendar tab's day panel.
- [ ] **Delete:** a viewing can be removed from the same drawer, with a destructive confirm; verified not to remove the watchlist item.

### Success Criteria

- [ ] Edit, then Back, then Remove all work inside one drawer with no second overlay (except the confirm).
- [ ] Moving a viewing recomputes `endsAt`; the poster moves to the new day's cell; counters recompute.
- [ ] No rules change was needed (state it) and the emulator confirmed an edit allowed and an invalid `endsAt` denied; no seed change needed (stated).
- [ ] The drawer is reachable by tapping a day, then a movie; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 11: Mark paid — record what a ticket would have cost

**Prerequisites:** Issue 10
**Target PR Size:** ~450 lines (the Ticket form is large; peel the all-in mode off to a follow-up if needed)
**Files:**

- `src/apps/a-list/types.ts` (`Ticket`, `TicketEntryMode`), `constants.ts` (`MAX_FEE_CHIPS`, `MAX_TAX_CHIPS`)
- `src/apps/a-list/utils/chips.ts`, `tax.ts`, `money.ts`
- `src/apps/a-list/store/actions/viewingActions.ts` (`recordTicket`), `selectors.ts` (`selectFeeChips`, `selectTaxRateChips`)
- `src/apps/a-list/components/viewing/TicketForm.tsx`, `FeeChips.tsx`, `TaxChips.tsx`, `ViewingDrawer.tsx`
- `src/apps/a-list/components/add/AddDrawer.tsx` (the "+ Add ticket details" reveal)
- `src/apps/a-list/components/shared/FormatBadge.tsx`
- `src/components/DeleteIconButton.tsx` (moved from Waypoint; imports updated)
- `firestore.rules` (the ticket shape), `scripts/seeds/aList.ts`
- `src/apps/a-list/README.md`

**Context:** Read `TECHNICAL.md`'s "3. Viewing" (Ticket, and why `totalCents` is stored), Logic §5 (savings and the itemized and all-in math, with its worked example) and §9 (chips and the default rate); `UX.md`'s two Ticket diagrams and captions, the Mark paid journey and the Ticket form-table row.

### Description

"Mark paid" on a viewing swaps its drawer to the Ticket form: itemized (format, price before tax, standard price when the format isn't Standard) or all-in total; the convenience fee you skipped as chips (the fees entered before, plus $0, plus Other); and a tax rate as chips (the rates used on past tickets and the one gauged from your membership bill, the most-used preselected, plus Other). The same fields can be revealed when adding a viewing. The ticket shows on the row and in the drawer.

### Possible Approach

1. Add the `ticket` key to `Viewing`. Existing documents lack it: readers use `viewing.ticket ?? null`; every viewing edit action (`recordTicket`, `updateViewing`) writes `ticket` in its field-scoped `updateDoc`, so a legacy document gains the key on its first edit; and the rules validate the incoming value with `request.resource.data.get('ticket', null)` (never the stored `resource.data`). Prove it against a viewing document written without the key.
2. `utils/tax.ts`: itemized tax (`Math.round(price × rate)`) and the all-in split (`price = round((total − fee) / (1 + rate))`, `tax = total − fee − price`; with no rate, tax is 0). Check `src/utils` first; keep these app-scoped.
3. `utils/chips.ts`: `selectFeeChips` and `selectTaxRateChips` as in Logic §9, as pure functions behind `createSelector`s.
4. `TicketForm` (a `Form`): the mode toggle is local state that picks which amount field renders; the standard price field appears only for a premium format; validation per Logic §5; the footer follows the form conventions (Cancel, Save), with a trash icon bottom-left when editing (clearing a ticket sets it back to `null`, behind a destructive confirm). Promote `DeleteIconButton` to central here, as this is its second consumer.
5. Rules: extend the viewing block with `isTicketValid` including `totalCents == priceCents + feeAvoidedCents + taxCents`, the STANDARD-implies-no-standard-price check and rate bounds, and verify allowed and denied writes on the emulator (a sum mismatch denied).
6. Seed tickets: a Standard ticket, a premium ticket with a standard price, and an all-in ticket.

### CRUD & Entry-Point Requirements

- [ ] **Create:** a ticket is recorded from "Mark paid" in the viewing drawer, and from "+ Add ticket details" in the Add drawer.
- [ ] **Read:** a viewing's ticket (format badge, total) shows on its day-panel row and in the viewing drawer.
- [ ] **Update:** "Edit ticket" in the drawer reopens the form in the mode it was entered in.
- [ ] **Delete:** the footer trash icon clears a ticket after a destructive confirm.

### Success Criteria

- [ ] Itemized and all-in entries each save with `total = price + fee + tax` and reopen in the right mode; the worked examples in Logic §5 reproduce exactly.
- [ ] The tax default follows ticket history: after tickets use a different rate more than the membership's, that rate is preselected.
- [ ] A viewing written before this issue (no `ticket` key) loads, edits and gets its ticket without error.
- [ ] `firestore.rules` updated and verified (allowed, denied, legacy-shaped document); indexes unchanged; seed updated.
- [ ] Every field is used here (`taxRate` feeds the chips); the form is reachable from the drawer and the Add drawer; `DeleteIconButton` is central and Waypoint still builds.
- [ ] README Build Plan progress noted; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 12: Add past movies, and the first-run offer

**Prerequisites:** Issue 7, Issue 2
**Target PR Size:** ~250 lines
**Files:**

- `src/apps/a-list/components/add/AddDrawer.tsx`, `PastMoviesStrip.tsx`
- `src/apps/a-list/components/setup/SetupModal.tsx`, `src/apps/a-list/AList.tsx`
- `src/apps/a-list/components/calendar/CalendarScreen.tsx` (the empty-state nudge)
- `src/apps/a-list/UX.md`

**Context:** Read `UX.md`'s Sitemap caption, "Add past movies — details" and its caption ("Add + another" primary, "Add & finish"), the first-launch journey, and `TECHNICAL.md`'s Logic §6 (the offer is ephemeral UI state; dates can't precede the start date).

### Description

After Setup, the app asks "Add movies you've already seen?". Yes opens the Add drawer in past-movies mode: "Add + another" (the primary button) saves, shows "✓ added · N so far", and returns to search with the form cleared; "Add & finish" saves and closes. Skipping lands on an empty Calendar whose nudge offers "Add your first movie" and "Add past movies".

### Possible Approach

1. A past-movies mode flag on `AddDrawer`: the date picker's minimum is the membership start date; the dates it saves are in the past and so save as Seen with no prompt (Issue 7's rule).
2. `PastMoviesStrip` counts saves within one drawer session (local state); closing the drawer ends the loop and loses nothing, since each movie saves immediately.
3. The offer is local state in `AList.tsx` set when Setup completes; a reload lands on the empty Calendar with the nudge.
4. No new collection or field: it creates ordinary Seen viewings.

### CRUD & Entry-Point Requirements

- [ ] **Create:** past viewings are created through the loop, from the first-run offer and from the empty Calendar's "Add past movies".
- [ ] **Read:** they appear on the Calendar grid and in the day panel (Issue 7) and count in the counters (Issue 9).
- [ ] **Update / Delete:** covered by Issue 10.

### Success Criteria

- [ ] Adding three movies with "Add + another" saves each, shows "N so far", and finishing with "Add & finish" opens the filled Calendar; skipping shows the empty-state nudge.
- [ ] A date before the start date can't be chosen.
- [ ] No rules, schema or seed change (stated); the offer and the nudge are reachable on first launch and on the empty Calendar; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 13: Savings summary on the Dashboard

**Prerequisites:** Issue 11, Issue 2
**Target PR Size:** ~350 lines
**Files:**

- `src/apps/a-list/utils/billing.ts`, `savings.ts`
- `src/apps/a-list/store/selectors.ts` (`selectSavingsSummary`)
- `src/apps/a-list/components/dashboard/DashboardScreen.tsx`
- `src/apps/a-list/components/shared/StatTile.tsx`
- `src/apps/a-list/README.md`

**Context:** Read Logic §4 (billing cycles, the anchor and month-end clamping, and "Planned later") and §5 (the totals and the worked example); `UX.md`'s Dashboard diagram and caption.

### Description

The Dashboard shows monthly cost with tax (and how many months have been billed since the start date), total ticket savings, net savings, break-even ("Not yet" or "Broken even"), premium format savings, and convenience fees avoided. A line notes how many movies don't have prices yet.

### Possible Approach

1. `billing.ts`: `getCyclesElapsed(startDate, now)` per the clamping rule, and `getMembershipCost` as a sum over cycle dates of `getMonthlyTotalAt(cycleDate)`, which for now returns the stored total.
2. `savings.ts`: the totals from Logic §5 over `SEEN` viewings with tickets, plus `unpricedCount` and `premiumUnpricedCount`.
3. Tiles use `StatTile`; negative net savings reads plainly and kindly; the money formatting reuses Issue 2's helpers.
4. Check the arithmetic with a throwaway `tsx` script (delete it after): the spec example (`2794` cost, one `1682` ticket, net `−1112`), a start date on the 31st across February, and the all-in example.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no entity; the tiles recompute as viewings and tickets change.
- [ ] **Read:** the summary is the Dashboard tab's content, reached from the bottom bar.

### Success Criteria

- [ ] The spec's numbers reproduce exactly ($27.94, $16.82, −$11.12, Not yet, $0.00).
- [ ] A membership that started on the 31st bills Feb 28/29, Mar 31 and so on, with no drift.
- [ ] Planned and ended-unconfirmed viewings contribute nothing.
- [ ] No rules or schema change (stated); seed shows a mix of ticketed and unticketed viewings; reachable from the bottom bar; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 14: Mark a movie seen

**Prerequisites:** Issue 10
**Target PR Size:** ~350 lines
**Files:**

- `src/apps/a-list/types.ts` (`rating` on `Viewing`)
- `src/apps/a-list/store/actions/viewingActions.ts` (`markViewingSeen`), `selectors.ts` (`selectPendingSeenPrompts`)
- `src/apps/a-list/components/viewing/SeenPromptHost.tsx`, `SeenPrompt.tsx`, `ViewingDrawer.tsx`, `EditViewingForm.tsx`
- `src/apps/a-list/components/calendar/ViewingRow.tsx`
- `src/apps/a-list/components/shared/StarRating.tsx`
- `firestore.rules`, `scripts/seeds/aList.ts`

**Context:** Read Logic §1 (lifecycle, "Didn't go", `markViewingSeen`) and §10 (the prompt queue); `UX.md`'s Seen prompt diagram and caption, the viewing-state table and the "Mark seen" journey.

### Description

The next time the app is open after a planned showing ends, a drawer asks "Did you catch it?" with optional stars and Seen it / Didn't go / Later. Several prompts queue one at a time and wait for any open drawer to close. A "Did you catch it?" chip marks such rows, "Mark seen" appears in the drawer, and stars can be edited later.

### Possible Approach

1. Add `rating` (null or 1–5) to `Viewing`; existing documents lack it, so readers default `viewing.rating ?? null`, every viewing edit action (`updateViewing`, `recordTicket`, `markViewingSeen`) writes `rating` (backfilling `null` when absent), and the rules validate the incoming value with `request.resource.data.get('rating', null)`.
2. `selectPendingSeenPrompts(state, now)`: `PLANNED` viewings with `endsAt <= now`, oldest first. `SeenPromptHost` (mounted once in the orchestrator) shows the first only when no overlay is open and keeps a session-local set for "Later".
3. `markViewingSeen` is a field-scoped `updateDoc({ status: 'SEEN', rating, lastEditedAt })`. "Didn't go" reuses `removeViewing` with its destructive confirm.
4. `StarRating` is custom (Dreamer UI has none), built on Dreamer UI `Button`s; read-only on rows, editable in the prompt and the edit form.
5. Rules: `status`/`rating` integrity (`PLANNED` implies no rating; rating in range) verified on the emulator. Seed an ended-awaiting-answer viewing.

### CRUD & Entry-Point Requirements

- [ ] **Create:** no new entity; a rating is created by answering the prompt.
- [ ] **Read:** stars show on rows and in the drawer; Seen viewings count in the counters (Issue 9).
- [ ] **Update:** the rating can be changed from the viewing's Edit; "Mark seen" is available in the drawer for an ended planned viewing.
- [ ] **Delete:** "Didn't go" removes the viewing after a destructive confirm.

### Success Criteria

- [ ] With two ended planned viewings, prompts appear one at a time, don't appear while a drawer is open, and "Later" brings it back on the next open.
- [ ] Marking seen updates the watchlist's seen state (derived), the counters and the calendar; "Didn't go" leaves the movie on the watchlist as unseen.
- [ ] A viewing written before this issue (no `rating` key) loads, edits and can be marked seen.
- [ ] `firestore.rules` updated and verified (including a denied rating of 6); seed updated.
- [ ] The prompt and the drawer action are reachable; README Build Plan progress noted; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 15: Watchlist tabs, seen state and the Opening tab

**Prerequisites:** Issue 14, Issue 5
**Target PR Size:** ~400 lines
**Files:**

- `src/apps/a-list/utils/watchlistRows.ts`, `opening.ts`
- `src/apps/a-list/store/selectors.ts` (`selectWatchlistRows`, `selectOpeningRows`)
- `src/apps/a-list/components/watchlist/WatchlistScreen.tsx`, `WatchlistTabs.tsx`, `WatchlistRow.tsx`
- `src/apps/a-list/components/shared/PriorityBadge.tsx`
- `src/apps/a-list/UX.md`

**Context:** Read Logic §7 (the Opening window) and §8 (rows and tab filters); `UX.md`'s two Watchlist diagrams and captions, and its flag that the six tabs must scroll on a phone.

### Description

The Watchlist gets six tabs under its header: Opening (the default), All, Must See, Want to See, If I Have Time, Seen. Rows join each item with its viewings: a Seen check once watched, the next planned date or the latest watched date with "×2" for rewatches. Opening lists unseen movies releasing from today through seven days out, soonest first, with "in N days", and carries a count and accent.

### Possible Approach

1. `selectWatchlistRows` derives `isSeen`, `seenCount`, `nextPlannedAt` and `lastWatchedAt` from viewings by `movieKey` (a `createSelector`).
2. `selectOpeningRows(state, now)`: `todayDay` is the viewer's local day as UTC midnight (`fromDateInputValue(toLocalDateInputValue(now))`); both sides are date-only, so a plain comparison with `OPENING_WINDOW_DAYS`. Display dates with `formatDateUTC`.
3. Confirm Dreamer UI `Tabs` scrolls horizontally with full names at phone width; if not, record the workaround.
4. Empty Opening shows one muted line with a link to All.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no new entity; rows recompute as viewings change (Update/Delete of items is Issue 16).
- [ ] **Read:** the six tabs and their rows are on the Watchlist tab (the Opening tab opens first), reached from the bottom bar.

### Success Criteria

- [ ] A movie releasing in six days appears in Opening, All and its priority tab; one released yesterday doesn't appear in Opening; a seen movie appears only in All and Seen.
- [ ] The Opening window gives the right answer in America/Los_Angeles near a day boundary.
- [ ] Rewatches show "×2"; the tab strip scrolls on a phone-width viewport.
- [ ] No rules or schema change (stated); seed has items in every tab (opening soon, released, seen, rewatched); `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 16: Open a watchlist item — add to calendar, edit and remove

**Prerequisites:** Issue 15, Issue 10
**Target PR Size:** ~350 lines
**Files:**

- `src/apps/a-list/components/watchlist/WatchlistItemDrawer.tsx`, `WatchlistRow.tsx`
- `src/apps/a-list/components/add/AddDrawer.tsx`
- `src/apps/a-list/store/actions/watchlistActions.ts` (`updateWatchlistItem`, `removeWatchlistItem`)
- `src/apps/a-list/hooks/useAListOverlay.tsx`

**Context:** Read `UX.md`'s Watchlist caption (tapping a row opens a drawer: Add to calendar swaps in place, Edit swaps in place, Remove) and the "Add to calendar — details" caption (from the watchlist the pick step is skipped); `TECHNICAL.md`'s watchlist actions (remove leaves viewings alone).

### Description

Tapping a watchlist row opens a drawer. Add to calendar swaps its content to the date and showtime step with the movie already chosen; Edit swaps to priority and preferred format; Remove asks for a destructive confirm and takes the movie off the list without touching its viewings.

### Possible Approach

1. `WatchlistItemDrawer` has an internal view (`details | addToCalendar | edit`) with "‹ Back"; Add to calendar reuses `AddDrawer`'s details step as content, not as another overlay.
2. `updateWatchlistItem` is a field-scoped `updateDoc` (priority, preferred format). `removeWatchlistItem` is a `deleteDoc` behind `useActionModal().confirm({ destructive: true })`.
3. Edit placeholders show the saved values; submit disables until valid.

### CRUD & Entry-Point Requirements

- [ ] **Create / Read:** covered by Issue 5 and Issue 15.
- [ ] **Update:** priority and preferred format can be changed from a watchlist row's drawer on the Watchlist tab.
- [ ] **Delete:** an item can be removed from the same drawer after a destructive confirm; verified to leave its viewings and the calendar intact.

### Success Criteria

- [ ] Add to calendar from a watchlist item skips the pick step and saves a viewing; Edit persists; Remove leaves viewings in place.
- [ ] No second overlay opens inside the drawer except the delete confirm.
- [ ] No rules change was needed (stated; an owner edit allowed and a changed `movieKey` denied were confirmed on the emulator); no seed change needed (stated).
- [ ] The drawer is reachable from every watchlist tab; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 17: Keep release dates fresh

**Prerequisites:** Issue 15
**Target PR Size:** ~200 lines
**Files:**

- `src/apps/a-list/hooks/useRefreshUnreleasedMovies.ts`
- `src/apps/a-list/AList.tsx`
- `src/apps/a-list/store/actions/watchlistActions.ts` (`refreshWatchlistMovie`)

**Context:** Read `TECHNICAL.md`'s "Keeping release dates honest" (under "Movie Data Service") and the budget layers: the hook must stay inside the shared lookup budget.

### Description

Studios move release dates, and the Opening tab is only as right as the stored one. Once per session, unseen, non-manual watchlist items that haven't released yet are re-checked, and a changed snapshot is written back.

### Possible Approach

1. Take unseen, non-manual items whose `releaseDate` is null or not yet past, capped at 10 and picked by a daily rotation (sorted by `movieKey`, starting at `(days since epoch × 10) mod count`, wrapping) so no eligible movie is starved; fetch each through `queryClient.fetchQuery(movieDetailsQueryOptions(key))` (24-hour `staleTime`; the server's 1-day cache for unreleased movies bounds the whole app to one lookup per movie per day).
2. When the fresh snapshot differs, write `{ movie, lastEditedAt }` with a field-scoped `updateDoc`. Never touch a viewing's snapshot.
3. Mount the hook once in the orchestrator; it renders nothing.

### CRUD & Entry-Point Requirements

- [ ] **Create / Delete:** no entity.
- [ ] **Read:** a corrected release date is visible on the Watchlist tab (and moves the movie in or out of Opening).
- [ ] **Update:** the watchlist item's snapshot is refreshed in place.

### Success Criteria

- [ ] Changing a stored release date in the emulator and reloading corrects it; reloading again within a day makes no upstream call (check the usage counter).
- [ ] Manual and seen items are skipped; at most 10 are checked per session.
- [ ] No rules or schema change (stated); no seed change needed (stated); `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

## Next Steps

### Issue 18: Dashboard — movies by format

**Prerequisites:** Issue 13, Issue 11
**Target PR Size:** ~300 lines
**Files:**

- `src/apps/a-list/components/dashboard/FormatSplit.tsx`, `DashboardScreen.tsx`
- `src/apps/a-list/store/selectors.ts` (`selectDashboardBreakdowns`: formats)
- `src/apps/a-list/README.md`

**Context:** Read `UX.md`'s Dashboard ("By format · count and %" under Next Steps) and `TECHNICAL.md`'s derived-values table; read the `dataviz` skill's guidance before choosing marks and colors; `recharts` is already installed and Nine Lives' `TrendLineChart` is the existing chart reference.

### Description

A "By format" section on the Dashboard shows movies watched per format as a count and a percentage. Seen viewings without a ticket are counted in a labelled "No ticket details" group instead of being dropped.

### Possible Approach

1. A selector grouping `SEEN` viewings by `ticket.format`, with the no-ticket group and percentages summing to 100.
2. A bar (or share) chart built on `recharts`, with accessible colors for light and dark, plus the numbers as text.
3. Empty state: one muted line.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no entity.
- [ ] **Read:** the chart is under the Dashboard's "Next Steps" content, reached from the bottom bar.

### Success Criteria

- [ ] Counts and percentages match the seeded data; the no-ticket group is shown, not hidden.
- [ ] Legible in light and dark at phone width.
- [ ] No rules, schema or seed change beyond what the seed already contains (stated); README Build Plan line checked off; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 19: Dashboard — movies watched over time

**Prerequisites:** Issue 18
**Target PR Size:** ~250 lines
**Files:**

- `src/apps/a-list/components/dashboard/ActivityChart.tsx`, `DashboardScreen.tsx`
- `src/apps/a-list/store/selectors.ts`

**Context:** Read `UX.md`'s "Watched over time"; the `dataviz` skill; Logic §2 (day keys: bucket by the viewer's local day or month, never UTC).

### Description

A chart of movies watched per month (with a toggle for per week), bucketed by local day keys, starting from the membership start date.

### Possible Approach

1. Bucket `SEEN` viewings by `YYYY-MM` (or week start key) over the span from the start date to today, including empty buckets.
2. A `recharts` bar or line chart; the period toggle is a Dreamer UI control with immediate effect (use `AppToggle` if a toggle is chosen).

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no entity.
- [ ] **Read:** the chart is on the Dashboard tab.

### Success Criteria

- [ ] A movie at 11 pm local on a month's last day lands in that month in America/Los_Angeles; empty months show as zero.
- [ ] No rules, schema or seed change (stated); README line checked off; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 20: Dashboard — ratings and spend

**Prerequisites:** Issue 19, Issue 14
**Target PR Size:** ~250 lines
**Files:**

- `src/apps/a-list/components/dashboard/RatingsSpend.tsx`, `DashboardScreen.tsx`
- `src/apps/a-list/store/selectors.ts`

**Context:** Read `UX.md`'s "Ratings and spend" and `TECHNICAL.md`'s open question on what spend means (it sums what the tickets would have cost, their totals).

### Description

Movies grouped by star rating (one to five, plus unrated), with the combined ticket value for each group.

### Possible Approach

1. Group `SEEN` viewings by `rating ?? 'Unrated'`, with count and the sum of `totalCents`; label the amount as what those tickets would have cost, since members pay no fee.
2. A `recharts` bar chart with the numbers as text.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no entity.
- [ ] **Read:** the section is on the Dashboard tab.

### Success Criteria

- [ ] Group counts and sums match the seed; unrated and unticketed viewings are handled and labelled.
- [ ] No rules, schema or seed change (stated); README line checked off; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 21: Dashboard — premium insights

**Prerequisites:** Issue 18, Issue 11
**Target PR Size:** ~250 lines
**Files:**

- `src/apps/a-list/components/dashboard/PremiumInsights.tsx`, `DashboardScreen.tsx`
- `src/apps/a-list/store/selectors.ts`

**Context:** Read Logic §5 (premium savings need `standardPriceCents`; all-in tickets' price is an estimate) and `UX.md`'s "Premium insights".

### Description

For each premium format, the average premium difference (price minus standard price) and the total saved. Tickets without a standard price are counted in a note instead of skewing the average, and all-in tickets are marked as estimates.

### Possible Approach

1. Per premium format: count, average and sum of `priceCents − standardPriceCents` over `SEEN` tickets that have a standard price; the excluded count from `premiumUnpricedCount`.
2. A compact table (tabular data stays a table) with a one-line note about estimates.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no entity.
- [ ] **Read:** the section is on the Dashboard tab.

### Success Criteria

- [ ] Averages ignore tickets with no standard price and say how many were left out.
- [ ] No rules, schema or seed change (stated); README line checked off; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

## Beyond

### Issue 22: Convenience fee estimates

**Prerequisites:** Issue 11
**Target PR Size:** ~250 lines
**Files:**

- `src/apps/a-list/utils/chips.ts`, `components/viewing/FeeChips.tsx`
- `src/apps/a-list/store/selectors.ts`

**Context:** Read `UX.md`'s Ticket caption (a fee estimate "would sit beside the chips") and `TECHNICAL.md`'s Logic §9.

### Description

Suggest a likely fee for a new ticket beside the fee chips, based on the fees entered before for the same format.

### Possible Approach

1. Estimate as the most common past fee for the selected format, falling back to the most common overall; shown as one extra chip labelled "Likely".
2. Never preselect it; the member still taps.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no entity; the suggestion appears in the Ticket form.
- [ ] **Read:** the "Likely" chip is visible in the Ticket form after a few tickets exist.

### Success Criteria

- [ ] The estimate changes with the chosen format and disappears when there's no history.
- [ ] No rules, schema or seed change (stated); README line checked off; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 23: Showtime reminders

**Prerequisites:** Issue 14
**Target PR Size:** ~400 lines
**Files:**

- `src/apps/a-list/store/actions/viewingActions.ts`, `components/viewing/ViewingDrawer.tsx`, `components/setup/` or settings for the opt-in
- `functions/src/notifications/` (reuse), `src/lib/notifications/` (reuse)
- `firestore.rules`, `scripts/seeds/aList.ts`

**Context:** Read the repo's central reminders pipeline first (`src/lib/notifications/`, `functions/src/notifications/sendScheduledReminders.ts`, `src/hooks/useReminderSync.ts`) and how Waypoint's `rescheduleTripReminders` uses it; read `UX.md`'s Seen prompt caption and the README's "Showtime Reminders".

### Description

An optional nudge before a planned showing (time to head out) and after it ends (mark it seen, log what you saw), delivered through the existing reminders system.

### Possible Approach

1. An opt-in in Membership settings; scheduling on `addViewing`/`updateViewing` and cancelling on `removeViewing`, using the stored `showtimeAt` and `endsAt` instants.
2. Network side effects stay outside any transaction, with cleanup if the write fails; reminders carry no movie details beyond the title.
3. Reuse the central collection and function; add nothing app-specific to them except the message copy.

### CRUD & Entry-Point Requirements

- [ ] **Create:** reminders are created when a planned viewing is added with the opt-in on.
- [ ] **Read:** the member can see that a reminder is set on the viewing drawer.
- [ ] **Update:** moving a showtime reschedules; **Delete:** removing a viewing cancels them.

### Success Criteria

- [ ] Reminders fire before and after a seeded showing in the emulator; moving or removing it changes them.
- [ ] Rules and seed updated and verified (or stated as unchanged if the central ones suffice).
- [ ] The opt-in is reachable from Membership settings; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 24: Monthly recap card

**Prerequisites:** Issue 13, Issue 18
**Target PR Size:** ~300 lines
**Files:**

- `src/apps/a-list/components/dashboard/MonthlyRecap.tsx`, `store/selectors.ts`

**Context:** Read the README's "Monthly Recap" and the `dataviz` and `frontend-design` skills.

### Description

A shareable summary card of a month in movies: posters, movies watched, savings, top format. Shared as an image.

### Possible Approach

1. A recap selector for a chosen month (local day keys); a card component built on posters and `StatTile`s.
2. Export the card to an image and use the platform share sheet where available, with a download fallback.
3. Posters from another host may block image export (cross-origin); if so, fall back to title tiles and say so in the PR.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no stored entity.
- [ ] **Read:** the recap opens from the Dashboard tab.

### Success Criteria

- [ ] The recap matches the month's data and exports an image on a phone.
- [ ] No rules, schema or seed change (stated); `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 25: Membership price history

**Prerequisites:** Issue 13, Issue 3
**Target PR Size:** ~400 lines
**Files:**

- `src/apps/a-list/types.ts` (`priceHistory`), `utils/billing.ts` (`getMonthlyTotalAt`)
- `src/apps/a-list/components/dashboard/MembershipSettingsModal.tsx`, `components/setup/`
- `src/apps/a-list/store/actions/membershipActions.ts`
- `firestore.rules`, `scripts/seeds/aList.ts`, `src/apps/a-list/TECHNICAL.md`, `UX.md`, `README.md`

**Context:** Read Logic §4's "Planned later" and the open question on cost changes; the Membership row of `UX.md`'s Form Field Organization.

### Description

A member's monthly cost can change (a price rise). They record when it changed and what it became, and cost incurred and break-even are computed month by month at the price in force, instead of applying today's price to every month.

### Possible Approach

1. Add `priceHistory` (a list of `{ effectiveFrom (date-only), monthlyCostCents, monthlyTotalCents, taxRate }`) to the membership. Existing documents lack it: readers treat a missing _or empty_ list as a single entry built from the current cost and the start date; rules validate the incoming value with `request.resource.data.get('priceHistory', [])`; `updateMembership` backfills a missing list with that synthesized current-price entry, so billing never sees an empty history.
2. Replace only `getMonthlyTotalAt(cycleDate)` in `billing.ts` to look up the entry in force; everything that sums cost stays as written.
3. Membership settings gains a "Price changes" group: add a change (effective date, new cost and bill total), edit one, remove one with a destructive confirm. Update `UX.md` and `TECHNICAL.md` (their "single monthly cost" statements) in this PR.
4. Revisit how the tax-rate seed for ticket chips treats the latest entry.

### CRUD & Entry-Point Requirements

- [ ] **Create:** a price change is added in Membership settings (Dashboard gear).
- [ ] **Read:** the history is listed in the same place and reflected in the Dashboard's cost and break-even.
- [ ] **Update:** an entry's date and amounts are editable.
- [ ] **Delete:** an entry can be removed after a destructive confirm.

### Success Criteria

- [ ] A cost rise on a chosen date changes cost incurred only from that date forward; the spec example still reproduces with no history.
- [ ] A membership document without `priceHistory` loads, edits and works (proved against a legacy-shaped document on the emulator).
- [ ] `firestore.rules` updated and verified; seed updated; `UX.md` and `TECHNICAL.md` corrected (Docs Stay Current); the field is used here.
- [ ] Reachable from the Dashboard gear; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.

### Issue 26: Offline support

**Prerequisites:** Issue 15
**Target PR Size:** ~300 lines
**Files:**

- `src/lib/firebase/` (persistent cache, only if not already on), `vite.config.ts` (runtime caching for poster images)
- `src/apps/a-list/components/shared/PosterCover.tsx`

**Context:** Read the root README's PWA section (one service worker; don't register another) and how the query cache is persisted (`meta: { persist: true }`).

### Description

At the theater with poor signal, the Calendar and Watchlist still open and show posters, and edits made offline sync when signal returns.

### Possible Approach

1. Check whether Firestore's own persistent cache is already enabled; enable it if not, without touching other apps' behaviour.
2. Add a runtime cache rule for poster images to the existing Workbox config; no second service worker.
3. Test in a throttled/offline browser: open, browse, add a viewing, reconnect.

### CRUD & Entry-Point Requirements

- [ ] **Create / Update / Delete:** no new entity; existing writes must queue and sync.
- [ ] **Read:** the Calendar and Watchlist render from cache offline.

### Success Criteria

- [ ] Offline, the app opens, shows seeded data and posters seen before; an offline add syncs after reconnecting.
- [ ] No rules or schema change (stated); other apps unaffected; `SITE_VERSION` bumped; `npx tsc -b --force` and `npx eslint .` pass.
