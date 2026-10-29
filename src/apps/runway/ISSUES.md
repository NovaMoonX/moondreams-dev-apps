# Runway — Issue Roadmap

Tiers mirror the README's Core MVP / Next Steps / Beyond. Within a tier, issues are ordered by prerequisite, and each issue adds only the fields, types and rules clauses it uses. Issue numbers here are this roadmap's own until the issues are filed; then each is labeled with its tier and set to Runway on the board's Apps field. Each MVP issue is a vertical slice a person can use in the running app, with its Create and Read paired. Where a Next Steps or Beyond issue says "to be scoped", it is a placeholder for a decision, not a build ticket.

Every issue's Success Criteria end with the same two checks, written once here and listed in each issue so they can't be skipped: **(1)** the PR carries one `minor` (or `patch`) label, which replaces any manual version bump; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; and the feature was driven in a real browser at 390×844 in light and dark; **(2)** the README Build Plan lines it delivers are checked off and `UX.md`, `TECHNICAL.md` and the Runway rules files still match what shipped. Issues that are decisions, proofs or operational work (the spikes, "Prove the protections", "Succession") say so and omit them.

Conventions that apply to every issue:

- **A sealed payload gains a field in the issue that uses it.** Nothing is added early. Readers default a missing field, and `v` rises only for a breaking change.
- **Rules.** Any issue that adds or changes a field, permission, path or collection updates `firestore.rules` (and `storage.rules`) in the same PR, verified on the emulator as the owner and a second user, with a legacy-shaped document, and says whether `firestore.indexes.json` changed. Runway is a beta app, so the rules check access, not shape (TECHNICAL.md "Security Rules Design Criteria"): a new collection under the plan needs a rule change only when the app updates or deletes in it, or when it must stay read-only to the client. The MVP issues below were built with strict per-field rules; the beta tier keeps their access and leaves their shape clauses to the app.
- **Seeds and engine checks.** Each issue extends `scripts/seeds/runway.ts` with documents sealed the way the app seals them, and `npm run check:runway-engine` with the cases it adds.
- **Secrets before merge.** CI deploys every function on merge, so a secret an issue binds must exist in production before the PR merges. The Link issues therefore come after the provider spike, and each function the TDD lists is documented in `functions/README.md`, which mirrors `index.ts`, in the same PR.
- **One PWA.** Runway has no manifest of its own.
- **Shared primitives** with no app entities (`AmountField`, `BeforeAfterRow`) live in `src/components` from their first use.
- **Closings** are built last in the MVP and only if the scale seed shows they are needed.
- **Succession** is in Beyond and is due before anyone else's plan is held.


## MVP

### Issue 1: Register Runway, make it reachable, and count its usage

**Prerequisites:** The approved Runway `README.md`, `UX.md` and `TECHNICAL.md` are committed under `src/apps/runway/` in an initial docs PR. That PR is not one of these issues.
**Target PR Size:** ~250 lines
**Files:**
- `public/banners/by-app/banner-runway.png` (new)
- `public/logos/by-app/logo-runway.svg` (new)
- `src/apps/runway/RunwayPage.tsx` (new; a placeholder screen)
- `src/routes/AppRoutes.tsx` (a lazy `/runway` route as a `ProtectedRoute appId='runway'`)
- `src/lib/app/app.registry.ts` (one entry, with `resumeParams` left empty until tabs exist)
- `src/lib/types/appCatalog.ts` (the `AppId` union and one catalog entry)
- `cloudflare-worker.js` (exactly one new entry in its app registry)
- `README.md` (root: the "Current apps" list)
- `functions/src/apps/runway/findFirstActivityAt.ts` (new), `functions/src/appUsage/registerAppUsage.ts` (one `FIRST_ACTIVITY_FINDERS` entry), `functions/README.md` (the `registerAppUsage` note)
- `.github/copilot-instructions.md` (the New-app checklist's Release line, if the owner approves the proposed change)

**Context:** Read the registry comment at the top of `src/lib/app/app.registry.ts`, the New-app checklist in `.github/copilot-instructions.md`, `scripts/checkAppWiring.ts`, and the TDD's Decisions 16 and 18 and its "Wiring checklist".

### Description
Make Runway a real, access-gated mini-app that opens to a placeholder, counts a member's first visit, and appears in the root README's app list, so every later issue can be opened and checked in the running app. Runway has no manifest of its own: the site is one PWA.

### Possible Approach
1. Add the registry entry (`id: 'runway'`, `name: 'Runway'`, `path: '/runway'`, `status: 'draft'`, today's `createdAt`, a one-sentence description in the voice of the others) and widen `AppId`. Route it as a `ProtectedRoute appId='runway'` (Decision 16, beta access), following A-List's entry exactly.
2. Create `RunwayPage.tsx` as a placeholder (a title and one muted line) and call `useTrackAppUsage('runway', user?.uid ?? null)` in it, so the first visit is recorded.
3. Add `findFirstActivityAt.ts` returning the plan document's `createdAt` or `null` (the path is `apps/runway/plans/{uid}`; nothing writes it yet, so it returns `null` for now), register it in `FIRST_ACTIVITY_FINDERS`, and add its line to the `registerAppUsage` note in `functions/README.md`.
4. Add the logo (a simple runway mark in the app's restrained palette) and a banner of the same dimensions as the others. Add exactly one entry to `cloudflare-worker.js`, copying a draft app's shape. Change nothing else in the file.
5. Root `README.md`: one line for Runway in registry order, with its emoji and registry description.
6. Propose (as its own block in the PR description, for the owner to approve) the New-app checklist change from the TDD's "Proposed changes to the repo's instructions" item 1: replace "bump `SITE_VERSION`" with the label rule the file already states elsewhere.

### CRUD & Entry-Point Requirements
- [ ] No entity in this issue.
- [ ] **Entry point:** `/runway` opens the placeholder for a signed-in member with access, shows Unauthorized for one without, and the app appears with its logo on the home screen's app list like the other draft apps.

### Success Criteria
- [ ] The two net-new assets exist and the route resolves in the running app for a member with access and is refused for one without.
- [ ] Registry and catalog entries are added; the home screen shows Runway; there is no `manifest-runway.json` and no per-app manifest anywhere (stated in the PR).
- [ ] `cloudflare-worker.js` gained exactly one entry and nothing else changed.
- [ ] `npm run check:apps` passes: the finder file, its map entry and the hook call all exist.
- [ ] The root README lists Runway with an emoji and the registry description, in registry order.
- [ ] No Firestore field, rule or seed is introduced (so none is required).
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 2: Runway's look, tabs and an empty first run

**Prerequisites:** Issue 1
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/RunwayPage.tsx` (the single orchestrator: theme, tabs, empty states)
- `src/apps/runway/types.ts`, `constants.ts`, `runway.css`, `useRunwayTheme.ts`
- `src/apps/runway/useRunwayUrlState.ts` (the tab in the URL with `nuqs`)
- `src/apps/runway/screens/home/HomeScreen.tsx`, `days/DaysScreen.tsx`, `plan/PlanScreen.tsx` (each an `EmptyCard`)
- `src/apps/runway/components/RunwayBottomNav.tsx`
- `src/store/index.ts` (mount `runway` with an empty reducer shell) and `src/apps/runway/store/runwaySlice.ts`
- `src/lib/app/app.registry.ts` (`resumeParams: ['tab']`)
- `.github/instructions/runway.instructions.md` and `.claude/rules/runway.md` (identical bodies)

**Context:** Read the TDD's "Theming", "UI Conventions Applied" and Decision 17, `UX.md` section 1 (what is specific to Runway) and the sitemap; Pinch's and A-List's `BottomNav`, theme stylesheet and `use<App>Theme`; CLAUDE.md's "Designing a mini-app's look" and "An app resumes where you left it".

### Description
Open Runway to three tabs, Home, Days and Plan, in a restrained, matter-of-fact theme with light and dark modes. Each tab shows one friendly empty state. The Spend tab does not exist yet.

### Possible Approach
1. `runway.css` overrides the semantic tokens on `html.runway-theme`, switched on by `useRunwayTheme()`. Set `--color-popover`, `--color-popover-foreground`, `--color-tooltip`, `--color-tooltip-foreground` and `--subview-backdrop` in both the light and dark blocks (`check:apps` enforces them). Quiet radii, no playful accents. Check a filled button, a selected pill, a badge, a highlighted card and a banner in light and dark.
2. `RunwayBottomNav` with Home, Days and Plan. The active tab lives in the URL as `?tab=` through a `useRunwayUrlState` hook (replace, not push), and `resumeParams` lists it so the app reopens where it was left.
3. `RunwayPage.tsx` is the only orchestrator: the sync hook arrives in Issue 3, so for now it renders the active screen. Each screen is an `EmptyCard` with one sentence and no control for data that does not exist.
4. Write both rules files with identical bodies: the restrained tone and why it departs from "Playful by default", the level wording rule (assigned at Plan, left at Track, safe to spend at Link), hidden-not-disabled gating, and the sealed-document rule (a readable field never holds a name, an amount, a merchant or a note).
5. Mount an empty `runway` reducer in `src/store/index.ts` that resets on `resetAllState`.

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Read:** all three tabs open from the bottom bar, survive a reload on the same tab, and reopen where they were left after visiting another app.

### Success Criteria
- [ ] Three tabs render; there is no Spend tab, no disabled control and no placeholder text for data that does not exist.
- [ ] The theme is correct in light and dark on a filled button, selected pill, badge and highlighted card, and nothing outside Runway is re-themed.
- [ ] Both rules files exist with identical bodies, and `check:apps` passes with the theme tokens.
- [ ] The store slice resets on `resetAllState` (switching accounts with the dev switcher shows no stale state).
- [ ] No Firestore field, rule or seed is introduced (so none is required).
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 3: A private plan with a key held by the server

**Prerequisites:** Issue 2. `RUNWAY_MASTER_KEYS` exists in the production Functions secrets, as a keyring with one key, before this PR merges.
**Target PR Size:** ~550 lines (split at the client: the functions and rules first, the sync hook and screens second, if it runs over)
**Files:**
- `functions/src/apps/runway/planKey.ts` (new: read and validate the keyring, wrap, unwrap, `sealForPlan`)
- `functions/src/apps/runway/getRunwayKey.ts` (new callable)
- `functions/src/index.ts`, `functions/README.md` (Functions table row, "Secrets and config" row for `RUNWAY_MASTER_KEYS`, a runbook stub)
- `src/apps/runway/security.ts` (`sealJson`, `openJson`, `normalizeRunwayEncryption`), `queries/runwayKeyQueries.ts`
- `src/apps/runway/types.ts`, `constants.ts` (`Sealed`, `SEALED_SCHEMA_VERSION`, `STANCES`, `PlanDoc`)
- `src/apps/runway/store/runwaySlice.ts`, `listeners/planListener.ts`, `actions/planActions.ts` (`ensurePlan`), `useRunwaySync.ts`
- `src/apps/runway/RunwayPage.tsx` (the sync hook, the loading, ready and failed states)
- `firestore.rules` (the plan document, owner only, with no match for `server/**` and `keyChecks/**`)
- `scripts/seeds/runway.ts`, `scripts/seeds/types.ts`, `scripts/seed.ts`, `package.json` (`seed:runway`), `SEEDING.md`, `src/lib/dev/fixtureAccounts.ts`

**Context:** Read the TDD's Decisions 1 to 3, 12, 20, Invariants 1 and 12, "The key", "Master secret management" (shape and fails-closed items), "Encryption in the app", "Key" under Client State Management and Security Rules Design Criteria 1, 2, 4, 5 and 12; Worth the Wait's `security.ts` and `queries/spaceEncryptionQueries.ts`; `src/lib/security/encryption.ts`.

### Description
A person who opens Runway for the first time gets a private plan and a data key that only the server can create. The key is held in memory on their device and never stored. Until it arrives the screen says it is getting ready; if it cannot be opened, the screen says the plan cannot be opened right now and never offers to start over.

### Possible Approach
1. Functions: `planKey.ts` reads `RUNWAY_MASTER_KEYS`, rejects a malformed keyring, a `current` that is not in `keys` or any key that is not 32 bytes (a cold-start check), and wraps or unwraps a 256-bit data key under a named master key id. `getRunwayKey` requires `request.auth`, creates the wrapped key document only when it does not exist, never when unwrapping fails (it reports an error and logs `runway.keys.unwrapFailed` with the id and no bytes), and re-wraps lazily when the stored `masterKeyId` is not current.
2. App: `security.ts` wraps `@lib/security` so nothing else calls `encryptValue` or `decryptValue`. `runwayKeyQueries.ts` is `staleTime: Infinity` with no `persist` meta. The key lives in the query cache and in `security.ts` only, never in Redux.
3. `ensurePlan(uid)` creates `apps/runway/plans/{uid}` in a transaction when absent, with the fields this issue uses (`uid`, `createdAt`, `updatedAt`, `stance: 'conservative'`, `keyId`). `useRunwaySync(uid)` starts the plan listener once `keyStatus` is `ready`, and `RunwayPage` renders loading, ready and failed states.
4. Rules: `isUser(uid)` is the single predicate, and `apps/runway/server/**` and `apps/runway/keyChecks/**` have no match, so a client can't reach them. The beta tier leaves the plan document's shape to the app.
5. Seed: the seed derives the plan key the way the functions do, from the emulator keyring in `functions/.secret.local`, and writes a wrapped key document plus a sealed plan, so a seeded account opens like a real one. Document the keyring file in `SEEDING.md`. Add `'runway'` to a fixture's `apps` list.
6. Propose to the owner, as a block in the PR, the TDD's "Proposed changes to the repo's instructions" item 2: a document may carry one `sealed` payload beside readable fields, with the key held by a callable and never persisted.

### CRUD & Entry-Point Requirements
- [ ] **Create:** the plan document and the wrapped key are created on first open, once, even if two tabs open together.
- [ ] **Read:** a returning member sees the same plan open with no extra step; a failed key shows the failed state.
- [ ] **Update / Delete:** deferred (the stance is changed in Issue 12; deleting the plan is Issue 23).

### Success Criteria
- [ ] A second device and a second tab get the same key; an unwrap failure never creates or overwrites a wrapped key (tested with a deliberately wrong keyring on the emulator).
- [ ] The raw key does not appear in Redux, local or session storage, IndexedDB, a log line or a network response other than `getRunwayKey`'s own.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `getRunwayKey`, `RUNWAY_MASTER_KEYS` and the runbook stub are in `functions/README.md`, and the secret exists in production with a keyring of one key before merge.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 4: Guard the master key: publish, verify and log

**Prerequisites:** Issue 3
**Target PR Size:** ~400 lines
**Files:**
- `functions/src/apps/runway/verifyRunwayKeys.ts` (new, scheduled daily)
- `functions/src/apps/runway/planKey.ts` (a `readKeyring()` the verifier shares)
- `scripts/runway/publishKeyring.ts` (new, maintainer-only, Admin SDK)
- `functions/src/index.ts`, `functions/README.md` (Functions row, the two log events, the publish procedure)

**Context:** Read the TDD's "Master secret management" items 1 to 6 and Invariant 13, and "Retiring a master key" only for what it assumes already exists.

### Description
A keyring can only grow, and a broken one is found within a day. The publish tool refuses any keyring that is missing an id the previous version had, writes each new key's canary, and the daily check proves every key in the keyring still opens its canary and says so in a structured log line.

### Possible Approach
1. `publishKeyring.ts`: reads the latest version of the secret, takes a new key (generated, or supplied for a restore), refuses a result that drops any id, sets `current`, writes `apps/runway/keyChecks/{masterKeyId}` (a fixed value sealed under that key plus its digest) and adds the new secret version. It prints what changed and never prints key bytes.
2. `verifyRunwayKeys` reads the keyring and, for every id, unwraps that id's canary and compares its digest. One log entry per run: `event: 'runway.keys.ok'` at INFO, or `event: 'runway.keys.failed'` at ERROR naming the id and the reason (disabled version, missing id, unwrap failure).
3. Add the commands to the runbook in `functions/README.md`: how to publish, how to read the log events, and what each failure reason means. The alert policies and the destruction delay are set up in Issue 26, which proves them.
4. Add `--version-destroy-ttl=90d` and the Firebase CLI hazards (`secrets:destroy` and `secrets:prune` are never run against this secret) to the runbook as the rules for whoever holds the project.

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Entry point:** the tool is run from a terminal; the check is invoked by the scheduler and by hand through the emulator or the console.

### Success Criteria
- [ ] `publishKeyring` refuses a keyring that drops an id, a `current` not in `keys`, and a key that is not 32 bytes; each refusal is exercised.
- [ ] `verifyRunwayKeys` logs `ok` for a healthy keyring and `failed` with the id and reason for a missing id and for an id whose canary no longer opens (exercised with fake keyrings).
- [ ] Neither the tool nor the function prints or logs a key, a wrapped key or a canary value.
- [ ] `functions/README.md` lists the function and both log events; no new secret is needed.
- [ ] `firestore.rules` is unchanged because `keyChecks/**` is already deny-all (stated in the PR).
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 5: Income: sources, pay lines and the days they produce

**Prerequisites:** Issue 3
**Target PR Size:** ~550 lines (split at the form: the engine and Days list first, the Plan form second, if it runs over)
**Files:**
- `src/apps/runway/engine/money.ts` (`allocate`, `percentOf`), `dates.ts` (day keys, UTC math, `todayAsUtcDate`), `schedule.ts` (occurrences), `resolve.ts` (the plan on a date from versions)
- `src/apps/runway/types.ts`, `constants.ts` (`PlanItemDoc`, `PlanVersionDoc`, `ChangeDoc`, `SourceSealed`, `PayLineSealed`, `Schedule`, `Ending`, `ITEM_KINDS`, `SCHEDULE_KINDS`, `CHANGE_KINDS`)
- `src/apps/runway/store/listeners/itemListeners.ts`, `actions/itemActions.ts` (`createIncome`), `selectors/` (`selectResolvedPlan`, `selectComingDays`)
- `src/apps/runway/screens/plan/IncomeScreen.tsx`, `forms/IncomeForm.tsx`, `screens/days/DaysScreen.tsx`, `components/IncomeDayCard.tsx`
- `src/components/AmountField.tsx` (new, shared; exact mode only for now)
- `firestore.rules` (`items`, `versions`, `changes`)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts` (new) and `package.json` (`check:runway-engine`)

**Context:** Read the TDD's Decisions 4, 5, 9, 10, Invariants 2 to 5, 7 and 8, "Money", "Dates and schedules", "Plan versions", `PlanItemDoc`, `PlanVersionDoc`, the source and pay line payloads and the lifecycle row for a plan item; `UX.md`'s Expected and Expected income rows; `src/utils/` date helpers (`fromDateInputValue`, `toDateInputValue`, `formatDateUTC`).

### Description
A person adds an income source and a pay line (take-home, an exact amount, weekly, every other week, twice a month, monthly or once, ending never, on a date or after N times) and sees its coming income days on Days. One-time income is a pay line that happens once.

### Possible Approach
1. Engine first, with its check: `allocate` by largest remainder with ties by id; day keys `${payLineId}_${yyyymmdd}`; schedules generated with `getUTC*` math (monthly day 31 clamps to the month's last day); endings; `resolve(items, versions, on)` taking the greatest `createdAt` among covering versions. Run it in the check script with shuffled inputs and with `TZ=America/Los_Angeles`.
2. `createIncome` is one `writeBatch` of the item header, its first version (`effectiveFrom` = the start date, `changeId`) and a `ChangeDoc` whose sealed summary says what was added. Items and versions are created and never updated; changes are append-only.
3. Sealed payloads carry only the fields this issue reads. A field a later issue needs (`pairings`, `steps`, `stanceOverride`, `hourly`) is added by that issue; readers default a missing one.
4. `AmountField` is built in `src/components` with an exact mode and a prop for the money label; later issues add the other modes.
5. Plan > Income lists sources with their pay lines and "Add income"; the form asks for the name, the amount, how often and when it ends as visible pill questions, with the first date. Days lists the coming income days, three first and the rest behind "Show N more", each as an `IncomeDayCard` with no chevron yet.
6. Rules for `items`, `versions` and `changes`: required keys with explicit nulls, immutable `kind`, `itemId`, `effectiveFrom` and `changeId`, `endedAt` writable once, and `update`/`delete` denied on `versions` and `changes`. Seed a source with two pay lines, one ending after a count and one once.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Add income" on Plan > Income and "Add expected money" on Days with Income chosen.
- [ ] **Read:** the Income list, and the coming days on Days.
- [ ] **Update / Delete:** deferred to Issues 18 and 19 (changing, ending and archiving apply to every kind of item, so they are built once).

### Success Criteria
- [ ] Both a source and a pay line save; a pay line ending after 3 times produces exactly 3 coming days; a monthly line on the 31st lands on each month's last day.
- [ ] Dates are correct west of UTC: the check script and a browser session in `America/Los_Angeles` show the same day keys.
- [ ] Coming days do not exist as documents (Decision 5): nothing is written to `days` by this issue.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 6: Envelopes: priority and how they are funded

**Prerequisites:** Issue 5
**Target PR Size:** ~500 lines
**Files:**
- `src/apps/runway/types.ts`, `constants.ts` (`EnvelopeSealed`, `FundingRule`, `PRIORITIES`)
- `src/apps/runway/store/actions/itemActions.ts` (`createEnvelope`), `selectors/`
- `src/apps/runway/screens/plan/EnvelopesScreen.tsx`, `forms/EnvelopeForm.tsx`, `components/PriorityBadge.tsx`, `components/ItemBadge.tsx` (emoji or first letter)
- `src/apps/runway/engine/schedule.ts` (cadence selection: every income day, every Nth, chosen)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `EnvelopeSealed` and `FundingRule`, the cadence rules under "Draft algorithm > Demand rules", and Decision 4; `UX.md`'s Plan tab and Form field organization; Nine Lives or Pinch forms for `PickOrCreate` and `FormSheet`.

### Description
A person adds an envelope with a name, an optional emoji, a priority (Must, Should or Want) and an exact amount, funded every income day, every other income day or every third, or on chosen days. Envelopes list under Plan > Envelopes.

### Possible Approach
1. `createEnvelope` follows `createIncome`: header, first version and change in one batch. `orderIndex` is a fractional rank inside the priority tier, so reordering later writes one version.
2. `EnvelopeForm` is a `FormSheet`: name, priority pills (a detail the path depends on, so visible), the amount (`AmountField` exact) and "funded" pills (every income day, every other, every third, chosen days). Emoji is a chip under "Add X".
3. The cadence selector in `schedule.ts` answers, for an envelope and an income-day list, which days it funds: `everyNth` counts from `anchorDayKey` in the plan-wide chronological income-day list; `chosen` is a list of day keys picked from the coming days.
4. List at 5 and 50: a `SearchInput` from 8 rows, rows with the badge, name, priority and funding line ("$50 every income day").
5. Seed five envelopes covering all three cadences and priorities.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "New" in the Envelopes pill of Plan.
- [ ] **Read:** the Envelopes pill; the funding line on each row.
- [ ] **Update / Delete:** deferred to Issues 18 and 19.

### Success Criteria
- [ ] An envelope funded every other income day selects exactly the alternate days of the coming-day list (check script, with two pay lines interleaved).
- [ ] The list is checked at 5 and at 50 envelopes at 320px; a long name wraps and never moves the priority badge.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 7: The draft for an income day

**Prerequisites:** Issue 6
**Target PR Size:** ~550 lines (split off the screen if it runs over)
**Files:**
- `src/apps/runway/engine/demands.ts`, `draft.ts`
- `src/apps/runway/store/selectors/` (`selectDraft(dayKey)`, plan fingerprint)
- `src/apps/runway/screens/days/IncomeDayScreen.tsx` (a `Subview`), `components/DraftLine.tsx`, `components/CoverageHeadline.tsx` (Free to spend line only for now)
- `src/apps/runway/screens/days/DaysScreen.tsx` (rows open the day)
- `scripts/checks/runwayEngine.ts`
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's Decision 6, Invariants 6 and 7, "Draft algorithm" (steps 0, 1, 3 to 7 and the property list; pairings and holds arrive in Issue 11), "Derived values" and the Income day row in `UX.md`'s Payday group.

### Description
Open a coming income day and see exactly what its money does: every envelope funded in priority order, each line saying why, what is left as Free to spend, and "Not funded" with the reason when money runs short. Nothing is stored; the draft is a pure function.

### Possible Approach
1. `buildDraft({ days, plan, stance, state, overrides })` with the ordered steps from the TDD: day money (exact amounts only, so the stance is not yet read), demands for envelopes whose cadence selects the day, sort by tier, `dueBeforeNext`, `orderIndex`, `createdAt`, `itemId`, walk the pool first-in-first-out, record `shortBy`, a reason code and `tieBrokenBy`, and Free to spend.
2. Lines have stable ids `${dayKey}:${itemId}` and a structured `reason` the screen words ("Dining: Should, paid from Main job"). Wording lives in `constants.ts`.
3. `selectDraft` is a memoized `createSelector` keyed on the plan fingerprint (a hash of the resolved versions). Keep the draft free of `Date.now()`; the clock is passed in.
4. The Income day screen shows the headline, the lines in sort order with `PriorityBadge`, "Not funded" lines with their reasons, and Free to spend. Rows on Days open it.
5. Add the properties to the check: shuffling inputs changes nothing; line cents plus Free to spend equal the day's money; no line is negative; dropping a lower-priority demand never reduces a higher one; the same inputs give identical JSON.

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Read:** Days row opens the Income day screen for any coming day.

### Success Criteria
- [ ] Money that cannot cover everything funds Must before Should before Want and names what it left out.
- [ ] Two demands tied on every key place the same one first on every run and the draft says so.
- [ ] Opening a draft writes nothing (verified by watching the emulator).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] A draft recompute for a plan with 50 envelopes takes under 30 ms in the dev build.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 8: Bills: one time, repeating, and funded across income days

**Prerequisites:** Issue 7
**Target PR Size:** ~550 lines (split the form from the demand rules if it runs over)
**Files:**
- `src/apps/runway/types.ts`, `constants.ts` (`BillSealed`, `Ending`)
- `src/apps/runway/store/actions/itemActions.ts` (`createBill`)
- `src/apps/runway/engine/demands.ts` (bill demands: chosen days and suggested), `draft.ts`
- `src/apps/runway/screens/plan/BillsScreen.tsx`, `forms/BillForm.tsx`, `components/BillRow.tsx`
- `src/apps/runway/screens/days/ExpectedScreen.tsx` (Expense choice, reached from "Add expected money")
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `BillSealed`, the bill demand rules under "Draft algorithm", Invariant 2, and `UX.md`'s Expected row; the README's "Bills, in detail" if present.

### Description
A person adds a bill (exact amount) due once or repeating, ending never, on a date or after N times, and chooses how it is funded: suggested (spread over the income days before it is due) or on income days they pick. The draft funds it and shows how much of the bill each day sets aside.

### Possible Approach
1. `BillForm` / `ExpectedScreen`: name, amount, "Starts" (any future date; nothing changes before the first income day that has to fund it), "Repeats" (Once, Weekly, Monthly, More), "Ends" (only when it repeats), priority, and "Funded from" pills (suggested, or choose days). Group and emoji are chips; groups arrive in Issue 39, so no group field yet.
2. Demand rules: suggested is `ceil(remaining / n)` with `n` the income days from this one through the last on or before the due date, and the last such day demands what remains; a bill due before the next income day demands all of it; chosen days split the amount with `allocate`.
3. `BillRow` shows the name, amount, next due date and a funding line ("$62.50 from each of the next 4 income days"). The Bills pill groups nothing yet.
4. Seed a monthly bill, a one-time bill, a bill chosen across 3 days and a bill ending after 6 payments.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Add a bill" on Plan > Bills and "Add expected money" on Days with Expense chosen.
- [ ] **Read:** the Bills pill, and the bill's funding lines on each draft.
- [ ] **Update / Delete:** deferred to Issues 18 and 19. **Paid and progress:** Issue 15.

### Success Criteria
- [ ] Rent due the 1st with income on the 24th, 31st and 7th funds across the first two and shows the third as not needed before the due date (check case).
- [ ] A bill due before the next income day demands its full remaining amount on the one day before it.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 9: Savings goals with a pace line

**Prerequisites:** Issue 7
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/types.ts`, `constants.ts` (`GoalSealed`)
- `src/apps/runway/store/actions/itemActions.ts` (`createGoal`)
- `src/apps/runway/engine/demands.ts` (goal demands), `pace.ts`
- `src/apps/runway/screens/plan/GoalsScreen.tsx`, `forms/GoalForm.tsx`, `components/GoalRow.tsx`
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `GoalSealed`, the goal rule under "Demand rules" and the Goal lifecycle row; the README's goals and pace line description.

### Description
A person adds a savings goal with a target, an optional date and a priority, funded like an envelope. Each goal shows a pace line: what it takes per income day to reach the target by the date, and where it stands against that.

### Possible Approach
1. `createGoal` follows the other creators. The goal funds by the same cadence rules as an envelope; a goal at its target demands nothing ("completed" is derived, never stored).
2. `pace.ts` is pure: given the target, the date, the contributions so far and the coming income days, it returns the needed amount per income day and "ahead", "on pace" or "behind". Before any day is confirmed, contributions are zero and the line reads from the plan alone.
3. `GoalRow` shows the badge, name, target, progress and the pace line. Goals sit under the Goals pill of Plan.
4. Seed an active goal with a date, one without, and one at its target.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "New" on the Goals pill.
- [ ] **Read:** the Goals pill and the draft lines.
- [ ] **Update / Delete:** pause, complete and archive in Issue 19; editing in Issue 18.

### Success Criteria
- [ ] A goal at its target stops drawing money from the draft on the next income day.
- [ ] The pace line matches a hand calculation for three seeded goals.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 10: Amounts as a percentage of the day's money, or the rest

**Prerequisites:** Issue 9
**Target PR Size:** ~350 lines
**Files:**
- `src/components/AmountField.tsx` (percent and rest modes, with caller-supplied "of" labels)
- `src/apps/runway/engine/money.ts` (`percentOf`), `demands.ts`, `draft.ts`
- `src/apps/runway/forms/EnvelopeForm.tsx`, `forms/GoalForm.tsx`
- `src/apps/runway/types.ts` (`FundingAmount`)
- `src/apps/runway/TECHNICAL.md` (Demand rules; record the `rest` semantics in this PR)
- `scripts/checks/runwayEngine.ts`
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's `FundingAmount`, `percentOf` under "Money", the pairing amount table in "Draft algorithm" step 2 and the Demand rules; `UX.md`'s Form field organization.

### Description
An envelope or goal can ask for a percentage of the income day's money, or for whatever is left. A 10% savings line and an "everything else goes to Everyday" line become possible.

### Possible Approach
1. `AmountField` gains a percent mode (basis points internally, whole and half percents in the field) and a rest mode. The "of" label is a prop: the component names no money concept.
2. `percentOf(cents, bps)` rounds once, down, and a set of percentage lines on one day is shared out with `allocate` so lines never add to more than the day's money.
3. The TDD defines `rest` for pairings only. Record in the TDD's Demand rules, in this PR, how an envelope or goal `rest` behaves (it sorts last inside its tier and takes what the pool then holds), then implement exactly that. A tier with two `rest` demands follows the normal order.
4. Forms: the amount pills gain "% of the day's money" and "The rest" for envelopes and goals. Bills stay exact or a range (Issue 12). Seed one of each.

### CRUD & Entry-Point Requirements
- [ ] No new entity.
- [ ] **Create / Update:** the amount mode on the envelope and goal forms (editing arrives in Issue 18).
- [ ] **Read:** funding lines on rows and draft lines read "10% of Main job" and "the rest".

### Success Criteria
- [ ] A 100% line plus any other line on a day never funds more than the day's money; rounding differences go to the first line by id (check case).
- [ ] `rest` on a day with nothing left shows $0 funded and says why.
- [ ] The TDD paragraph for `rest` is written and matches the code.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 11: Point money at what it funds: pairings, short ones held

**Prerequisites:** Issue 10, Issue 8
**Target PR Size:** ~550 lines (split the engine from the editor if it runs over)
**Files:**
- `src/apps/runway/engine/draft.ts` (step 2: pairings, top-up demands, holds, `holdResolutions`)
- `src/apps/runway/types.ts`, `constants.ts` (`Pairing`, `IncomeDayDoc`)
- `src/apps/runway/store/actions/dayActions.ts` (`saveDayOverride`), `listeners/dayListeners.ts` (days of the coming window)
- `src/apps/runway/forms/PairingsEditor.tsx` (on a source, a pay line and a day)
- `src/apps/runway/screens/days/IncomeDayScreen.tsx` (held lines, "Top up" and "Leave it short")
- `firestore.rules` (`days`: create while draft, update while draft, deterministic id)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's Decisions 5 and 19, Invariants 10, "Draft algorithm" step 2 and its table and pseudo-code, the `IncomeDayDoc` section and lifecycle row, and Security Rules Design Criteria 9 and 11.

### Description
A person can say that one source, pay line or single income day funds named bills, envelopes or goals (a fixed amount, a percentage, or the rest). A pairing that its own paycheck cannot cover is never covered silently: it is topped up from the pool at its own priority, or held until the person chooses.

### Possible Approach
1. Engine: implement step 2 exactly as written: narrowest pairing set, ordered by the step 4 key, funded only from that day's own money, `shortBy` resolved by the branch (top-up demand, hold for a Must or Should, plain short line for a Want). A hold reserves pool money where a funded line would and cannot be used by lower lines.
2. A day document is created the first time the person overrides a day (deterministic id `${payLineId}_${yyyymmdd}`); `holdResolutions` live in its sealed override so the draft stays deterministic. Rules: create only when the id matches the fields; update only while `status == 'draft'`.
3. UI: a pairings editor reused on a source, a pay line and a day; the Income day screen shows a held line as "Rent is $100 short from Main job. $100 is held until you choose" with two actions. The day screen gains a clear note that it cannot be confirmed until holds are resolved (the confirm action itself is Issue 13).
4. Add the TDD's hold properties to the check: no lower tier is funded from money a hold has reserved, and a Must demand is never starved by a hold on a Should.

### CRUD & Entry-Point Requirements
- [ ] **Create:** pairings on a source, pay line or day; a day override document.
- [ ] **Read:** the pairing lines in drafts and on the editors.
- [ ] **Update / Delete:** removing a pairing and editing one arrive with Issue 18 for sources and pay lines; a day's override can be cleared here ("Use the plan again").

### Success Criteria
- [ ] A pairing that is short by $100 behaves the three ways the TDD specifies (top-up set; Must or Should held; Want short), each with a check case and a seeded example.
- [ ] Choosing "Leave it short" releases the money to the lines below and stays chosen after a reload.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 12: Ranges and the planning stance

**Prerequisites:** Issue 8, Issue 10
**Target PR Size:** ~450 lines
**Files:**
- `src/components/AmountField.tsx` (range mode)
- `src/apps/runway/engine/draft.ts` (`pick(stance, range)`), `demands.ts`
- `src/apps/runway/types.ts`, `constants.ts` (`MoneyRange`, `STANCES`, `stanceOverride`)
- `src/apps/runway/store/actions/planActions.ts` (`setStance`)
- `src/apps/runway/screens/plan/MoreScreen.tsx` (new list), `screens/plan/SettingsScreen.tsx` (planning stance row)
- `src/apps/runway/forms/IncomeForm.tsx`, `BillForm.tsx`, `components/RangeNote.tsx`
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's "Draft algorithm" step 0, `MoneyRange`, Decision 6, and `UX.md` rule 4 (a range is always labelled).

### Description
Income and bills can be a range. A conservative stance (the default) plans income at its low end and bills at their high end; middle uses midpoints; optimistic is the reverse. The stance is set for the plan in Settings, and any one source, pay line or bill can override it. Every figure built on a range says so.

### Possible Approach
1. `pick(stance, range)`: low for income under conservative, high under optimistic, the midpoint rounded down under middle; expenses use the opposite ends. A per-item `stanceOverride` replaces the plan's stance for that item.
2. `AmountField` gains range mode (low and high, equal when exact). Income and bill forms offer "exact" or "a range" as pills; the form says which end the plan will use.
3. `RangeNote` is the one component that words "planned at the low end, $140"; draft lines and rows use it wherever a range drives a figure.
4. Create the More list (Change log, Settings and later entries appear as their issues land; hidden, not disabled) and Settings with the planning stance row. `setStance` is a field-scoped `updateDoc` of `stance` and `updatedAt`.
5. Seed a range income, a range bill and one item with an override.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** a range on income and bills; the plan stance; an item's override.
- [ ] **Read:** labelled ranges on rows and drafts.
- [ ] **Delete:** none (a range is edited back to exact).

### Success Criteria
- [ ] Switching the stance changes every draft that uses a range and no draft that does not (check case).
- [ ] No range-driven figure is unlabelled on any screen (grep the draft, rows and Home for the `RangeNote`).
- [ ] Unknown or missing `stance` on a legacy plan reads as conservative.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 13: Confirm that the money arrived

**Prerequisites:** Issue 7, Issue 11
**Target PR Size:** ~550 lines (split the record view from the transaction if it runs over)
**Files:**
- `src/apps/runway/store/actions/dayActions.ts` (`confirmDay`, `markNotArrived`, `undoNotArrived`)
- `src/apps/runway/types.ts`, `constants.ts` (`DayRecordDoc`, `DAY_STATUSES`, `DAY_RECORD_KINDS`)
- `src/apps/runway/store/listeners/dayListeners.ts` (records of the recent window)
- `src/apps/runway/screens/days/ConfirmSheet.tsx`, `RecordScreen.tsx` ("Planned and confirmed")
- `src/apps/runway/engine/draft.ts`, `selectors/` (a confirmed day's split)
- `firestore.rules` (`days` transitions, `records` create-only)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's Decision 5, Invariants 3, 5 and 10, the `IncomeDayDoc` records and lifecycle row, the "Actions" table row for confirming a day, Security Rules Design Criteria 7 to 9 and 11; `UX.md`'s Confirm and Planned and confirmed rows.

### Description
When the money lands, a person confirms the day with the amount that arrived and the date it arrived. The draft as proposed is kept beside the confirmed split. A day can be marked not arrived, and that can be undone.

### Possible Approach
1. `confirmDay` is a `runTransaction`: read the day, abort with a readable message when it is not `draft`, when a hold in its draft is unresolved, or when another device already confirmed; then update the day (`status`, `arrivedOn`, `confirmedAt`) and create the `proposed` and `confirmed` records with the plan fingerprint and stance used. In this issue the confirmed lines are the proposed lines.
2. `ConfirmSheet` asks the amount that arrived (starting at the expected figure) and the date. When the amount differs, the difference goes to Free to spend by default; choosing where it goes is Issue 14.
3. `markNotArrived` removes the draft from lookahead and creates no records; undo sets `draft` again. Both are transactions on the day document.
4. After confirmation the only writable field on the day is `doneLineIds` (rules, and an emulator denial for anything else). `RecordScreen` reads the records.
5. The Days list marks confirmed and not-arrived days and folds the older ones.

### CRUD & Entry-Point Requirements
- [ ] **Create:** confirm a day (its day document and two records).
- [ ] **Read:** the Income day screen for a confirmed day, and Planned and confirmed.
- [ ] **Update:** mark not arrived and undo; correcting a confirmed day is Issue 16.
- [ ] **Delete:** none (history is append-only).

### Success Criteria
- [ ] Two devices confirming the same day: the second sees a readable message and nothing is duplicated (emulator, concurrent transactions).
- [ ] A confirmed day's amount and lines never change except through Issue 16's corrections; an update of anything but `doneLineIds` is denied.
- [ ] A day with an unresolved hold cannot be confirmed and says why.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 14: Adjust the split and record each difference

**Prerequisites:** Issue 13
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/screens/days/ConfirmSheet.tsx` (adjust lines, send the difference)
- `src/apps/runway/engine/` (`differences.ts`)
- `src/apps/runway/components/BeforeAfterRow.tsx` (move to `src/components/BeforeAfterRow.tsx`)
- `src/apps/runway/screens/days/RecordScreen.tsx` (differences, notes, fold unchanged lines)
- `scripts/checks/runwayEngine.ts`
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's `confirmed` record contents, `UX.md`'s Confirm and Planned and confirmed rows, and CLAUDE.md's "A reason is asked at the moment of the change, in the flow, and never blocks it".

### Description
When the money or the plan differs from the draft, the person adjusts any line's amount, adds a short note to a difference, and chooses where extra money goes or where a shortfall comes from. The confirmed split and the original proposal both stay.

### Possible Approach
1. Every line in `ConfirmSheet` is adjustable. `differences.ts` compares confirmed to proposed line by line and returns only the differing lines, each with an optional note.
2. "Choose where the $100 goes" swaps the sheet's content in place (a `BackLink`, no second overlay) to the draft lines of this day; the default stays Free to spend. A shortfall asks which lines give.
3. The `confirmed` record stores the lines, the differences with notes, and where the extra went or the shortfall came from. `RecordScreen` marks only differing lines and folds unchanged ones behind one row.
4. `BeforeAfterRow` is built in `src/components` (its props name no money concept).

### CRUD & Entry-Point Requirements
- [ ] **Create:** differences and notes inside the confirmed record.
- [ ] **Read:** Planned and confirmed.
- [ ] **Update / Delete:** a mistaken confirmation is corrected in Issue 16.

### Success Criteria
- [ ] Adjusting two lines and sending $100 extra to a goal records exactly those differences and the goal's balance rises by $100 once.
- [ ] A note is optional and never blocks Confirm.
- [ ] Money allocated across lines still adds to the arrived amount to the cent (check case, including a shortfall).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 15: After confirming: bills to pay, paid ahead, and progress

**Prerequisites:** Issue 13, Issue 8
**Target PR Size:** ~500 lines
**Files:**
- `src/apps/runway/store/actions/moveActions.ts` (`markBillPaid`, `undoBillPaid`), `listeners/moveListeners.ts`
- `src/apps/runway/types.ts`, `constants.ts` (`MoveDoc`, `MOVE_KINDS`)
- `src/apps/runway/engine/demands.ts` (paid-ahead rule), `progress.ts`
- `src/apps/runway/screens/days/ChecklistScreen.tsx`, `components/ChecklistGroup.tsx`
- `src/apps/runway/screens/plan/BillScreen.tsx` (progress)
- `firestore.rules` (`moves` create-only, deterministic ids; `doneLineIds` bounds)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's Invariants 3 and 5, the bill occurrence lifecycle row, `MoveDoc`, the "Bill, paid ahead" demand rule, the Actions table rows for ticks, and `UX.md`'s Checklist row.

### Description
Confirming a day opens a checklist of the bills to pay with that money. A bill can be marked paid, including before it is due. A bill funded across several days shows progress. Rent that is only half funded waits and says so.

### Possible Approach
1. `markBillPaid` creates a `billPaid` move with the deterministic id `paid_${billId}_${yyyymmdd}` (a second tap fails harmlessly); undo creates a move with `reversesMoveId`. Moves are create-only.
2. `progress.ts` derives each bill's funded-so-far from confirmed lines and its paid state from moves. A bill paid ahead has no demand on later days; the part not yet set aside came out of Free to spend, and the money the bill would have asked for stays in the pool.
3. `ChecklistScreen`: groups ("Bills to pay"), a checkbox per row and one for each group and for the whole list with a partial state and an "N of M" count. Ticks are `arrayUnion`/`arrayRemove` on `doneLineIds` (at most 200).
4. The Bill screen shows funded, paid and the next due date. "Mark everything done" ticks lines; it does not mark bills paid unless the row says so.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a paid mark (move) and ticks.
- [ ] **Read:** the checklist after confirming, and bill progress on the bill and its row.
- [ ] **Update:** undo a paid mark. **Delete:** none (reversal moves).

### Success Criteria
- [ ] Marking a bill paid twice makes one move; undoing and marking again makes a reversal and a new move.
- [ ] A 3-day bill shows 1 of 3 funded after the first confirmed day, and a half-funded bill is listed as waiting.
- [ ] The checklist behaves at 5 and at 40 lines at 320px.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 16: Correct a confirmed day, with the original kept

**Prerequisites:** Issue 14
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/runway/store/actions/dayActions.ts` (`correctDay`)
- `src/apps/runway/screens/days/CorrectSheet.tsx`
- `src/apps/runway/screens/days/RecordScreen.tsx` (original and corrections)
- `src/apps/runway/selectors/` (effective split)
- `firestore.rules` (`records`: `correction` with `supersedesId`)
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's "The day's effective split" paragraph under `IncomeDayDoc`, Invariant 5 and the Actions table; `UX.md`'s Correct a confirmed day.

### Description
A person who confirmed a day wrongly corrects it. The correction is a new record; the original confirmation stays viewable, and every balance reads from the latest correction.

### Possible Approach
1. `correctDay` is a `runTransaction` creating a `correction` record that names the record it replaces (`supersedesId`), with the replacement lines, the before and after effect and a note.
2. `CorrectSheet` is titled "Correct this day" (not "Amend"), shows the effect before saving with `BeforeAfterRow`, and swaps content in place for a second step. Recent corrections remain correctable.
3. `selectEffectiveSplit` returns the latest correction no later correction supersedes, else the confirmed record. Draft, balances and Home read only that.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a correction record.
- [ ] **Read:** Planned and confirmed shows original, each correction and the current split.
- [ ] **Update / Delete:** none (corrections supersede).

### Success Criteria
- [ ] A day corrected twice shows the original, both corrections and the second as current; a stale device that tries to supersede an already-superseded record is refused (emulator).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 17: Starting out, and Home

**Prerequisites:** Issue 16, Issue 9
**Target PR Size:** ~550 lines (split Starting Out from Home if it runs over)
**Files:**
- `src/apps/runway/screens/start/StartingOutScreen.tsx` (a `Subview`), `forms/StartingAmountsSheet.tsx`
- `src/apps/runway/store/actions/moveActions.ts` (`recordStart`), `planActions.ts` (`setStartDate`)
- `src/apps/runway/engine/balances.ts` (assigned, Free to spend), `selectors/` (`selectBalances`, `selectEnvelopeFigure`, `selectFreeToSpend`)
- `src/apps/runway/screens/home/HomeScreen.tsx`, `FreeToSpendScreen.tsx`, `components/EnvelopeTile.tsx`, `CoverageHeadline.tsx`
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's Decision 7 (the ledger, not the closings, for now), "Balances and closings", `MoveDoc` kinds `start`, "Derived values" and Level gating; `UX.md`'s sitemap (Starting Out) and the Home rows; the README's guided setup.

### Description
A person with no income source is walked through setup: income, what they pay, envelopes and goals, then where they stand today (money on hand, what each goal holds, what is already set aside for each bill). Home then shows Free to spend, the next income day and the most-used envelopes, reading *assigned* at this level.

### Possible Approach
1. Starting Out is a sequence of the existing forms plus one new step: the start date and starting amounts. `recordStart` writes `start` moves (one per holding) and `startDate`, in one batch.
2. `balances.ts` derives each figure by summing the ledger since the starting point: start moves, confirmed lines from the effective splits, and later purchases. No stored running balance. The figure's word comes from `selectLevel`: *assigned* at Plan.
3. Home: Free to spend (headline, tap for "in detail"), the next income day card, and envelope tiles capped for 50 envelopes with a link to the full list. First run shows Starting Out's door as the one `EmptyCard` action.
4. A figure shown on Home and in its detail is formatted by one function. Over-assigned money is shown, never blocked.

### CRUD & Entry-Point Requirements
- [ ] **Create:** the start moves and start date.
- [ ] **Read:** Home and Free to spend in detail.
- [ ] **Update / Delete:** starting amounts are corrected with a `balanceCorrection` move when Track arrives (Issue 22); until then they are edited by rerunning the setup step.

### Success Criteria
- [ ] A person can complete setup from nothing on a phone without leaving the guided path, and Home shows figures that equal the sum of the ledger (check case).
- [ ] No stored balance exists anywhere; clearing the cache and reloading gives the same figures.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 18: Change an item from a date, and see the effect first

**Prerequisites:** Issue 17
**Target PR Size:** ~550 lines (split the preview from the forms if it runs over)
**Files:**
- `src/apps/runway/store/actions/itemActions.ts` (`changeItem`: a new whole-payload version, a change entry, one `writeBatch`)
- `src/apps/runway/forms/` (every item form opens for edit: income, bill, envelope, goal)
- `src/apps/runway/components/FromWhenPicker.tsx`, `EffectPreview.tsx`
- `src/components/BeforeAfterRow.tsx`
- `src/apps/runway/engine/whatIf.ts` (layer one virtual version over the real ones)
- `firestore.rules` (versions with `effectiveFrom`, future dates allowed)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's Decision 4, Invariant 4, "Plan versions", "What if" (the layering function), the Actions table row for a plan change, `UX.md`'s Change row, and CLAUDE.md's "A reason is asked at the moment of the change".

### Description
A person can edit any bill, envelope, goal or income: from now on, or from a date ahead. Before saving, the screen shows the effect on each upcoming income day. Every change can carry an optional note.

### Possible Approach
1. `changeItem` writes the item's whole new payload as a version with `effectiveFrom` and a `ChangeDoc` with the summary, before and after, affected days and the optional note. Versions and changes are create-only.
2. `EffectPreview` calls the engine twice, with and without a layered virtual version (`createdAt = Infinity` so it wins), and lists the first affected days with "Show all". It appears in the form's footer area and updates as the form changes.
3. `FromWhenPicker`: "From now on" and "From a date" (a date picker, any future date). Both are visible pills, not a hidden option.
4. Editing is routed through the same forms with `placeholder` set to the original value; a note chip asks "Why?" in place of the form (a few starter chips and one box) and "Save without a reason" always works.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a version and a change entry per edit.
- [ ] **Read:** the edited values on rows; the preview before saving.
- [ ] **Update:** every kind of item (this is the update path for Issues 5 to 9).
- [ ] **Delete:** end, pause and archive are Issue 19.

### Success Criteria
- [ ] A change from a date ahead leaves every earlier draft unchanged and moves every later one (check case with `TZ=America/Los_Angeles`).
- [ ] The previewed effect equals the saved result for the same inputs.
- [ ] Two devices editing the same item: both versions are kept and the later `createdAt` wins (emulator).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 19: Change for a stretch, for one income day, or end it

**Prerequisites:** Issue 18
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/store/actions/itemActions.ts` (`changeItem` with `effectiveUntil`, `endItem`, `archiveItem`, `setGoalState`)
- `src/apps/runway/store/actions/dayActions.ts` (`saveDayOverride` for lines and amount)
- `src/apps/runway/components/FromWhenPicker.tsx` ("For a stretch", "Just this income day")
- `src/apps/runway/components/ItemActionsRow.tsx` (End, Archive, Pause)
- `firestore.rules` (`endedAt` write-once, `archivedAt`, `effectiveUntil`)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's lifecycle rows for a plan item and a goal, Security Rules Design Criteria 8, Invariant 3 (`ended_${itemId}`), `PlanVersionDoc` (`effectiveUntil`) and `UX.md`'s Change row.

### Description
A change can last for a stretch of time, apply to one income day only, or end the item. Goals can be paused and resumed; any item can be archived and its history stays.

### Possible Approach
1. "For a stretch" writes a version with `effectiveUntil`; "Just this income day" writes the day's override (a draft day document) and no version.
2. `endItem` ends an item on a date. When an ending is reached, `endedAt` is written once by the device in a transaction using the deterministic change id `ended_${itemId}`, so a second device cannot write it twice. Record in the TDD, in this PR, when that write runs (the first load after the ending date, and when the last occurrence is confirmed).
3. Pause and resume are versions of a goal; archive is `archivedAt` on the header. Archived items disappear from lists and pickers and still resolve for old days and records.
4. `ItemActionsRow` names outcomes ("End after the July payment", "Pause saving") and each opens the same effect preview.

### CRUD & Entry-Point Requirements
- [ ] **Create:** stretch versions and day overrides.
- [ ] **Read:** the item states on rows (paused, ended, archived) and the preview.
- [ ] **Update / Delete:** this issue completes Update and Delete for plan items: end, pause, archive.

### Success Criteria
- [ ] A stretch change ends on its date without any further write (the later version is simply absent from resolution).
- [ ] An item archived in the middle of a funded bill leaves the bill's confirmed history intact.
- [ ] `endedAt` cannot be written twice or changed (emulator denial).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 20: The change log

**Prerequisites:** Issue 19
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/runway/store/listeners/changeListeners.ts` (the history window: first use of the second listener tier)
- `src/apps/runway/screens/plan/ChangeLogScreen.tsx` (a `Subview`), `components/ChangeRow.tsx`
- `src/apps/runway/screens/plan/MoreScreen.tsx` (the Change log row)
- `src/apps/runway/store/useRunwaySync.ts` (tier 2 window)
- `firestore.indexes.json` (`changes`: `itemIds` ARRAY_CONTAINS, `createdAt` DESC)
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's "Listeners" (tier 2), "Indexes" and the Where-this-screen-set-stops note in `UX.md`; Waypoint or Pinch's history screens for window listeners.

### Description
Every plan change, with its note, is listed newest first, one date window at a time, and can be filtered to one item. A change that affected a confirmed day links to Planned and confirmed.

### Possible Approach
1. A window listener keyed on `(from, to)` that restarts only when the window changes; entries are decrypted with a sequence guard.
2. `ChangeLogScreen`: pills for the window, an item filter (`array-contains` on `itemIds`, which is the one composite index), search over the decrypted window only, with a line saying search covers the window in view.
3. Each row reads "Main job: raised from $2,000 to $2,100 from Nov 1" and the optional note; a row opens the affected item or the record.

### CRUD & Entry-Point Requirements
- [ ] No new entity.
- [ ] **Read:** Plan > More > Change log.

### Success Criteria
- [ ] The filtered query uses the composite index and is deployed with the PR (`npm run check:indexes` passes).
- [ ] The log is checked at 5 and at 500 entries (seeded): one window renders, paging windows restarts only the window listener.
- [ ] A decrypt failure shows an unreadable entry, never an empty log.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 21: Look ahead: how far the plan holds

**Prerequisites:** Issue 18, Issue 17
**Target PR Size:** ~500 lines
**Files:**
- `src/apps/runway/engine/lookahead.ts`
- `src/apps/runway/store/selectors/` (`selectLookahead`)
- `src/apps/runway/components/CoverageHeadline.tsx` (the headline), `LookaheadWarnings.tsx`
- `src/apps/runway/screens/days/DaysScreen.tsx` (upcoming days beyond the next three, warnings), `IncomeDayScreen.tsx`
- `src/apps/runway/constants.ts` (`LOOKAHEAD_MONTHS`)
- `scripts/checks/runwayEngine.ts`
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's "Lookahead", Invariant 6 and the `LOOKAHEAD_MONTHS` note; `UX.md`'s Home and Days rows.

### Description
Runway chains the drafts for the coming income days, assuming each is confirmed as proposed and nothing is spent. Home says how far the plan holds. Any bill with no income before it is due gets a warning. Upcoming days beyond the next few can be opened and planned, including changes that start in the future.

### Possible Approach
1. `lookahead(plan, startState, horizon)` builds each coming day's draft, carries bill progress, loan balances (none yet) and Free to spend into the next, and stops at `LOOKAHEAD_MONTHS` or the last income day. It reads the plan on each day's date, so changes that start in the future apply from their date.
2. The headline reads in plain words ("Your plan holds through Dec 14"). The first day that goes short is named with the item that runs out.
3. A bill whose due date falls before any income day that could fund it gets a warning naming the bill and the date, shown on Days and on the bill.
4. Memoize on the plan fingerprint; the lookahead for a plan with 60 bills and 25 envelopes recomputes only when the plan changes.

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Read:** the headline on Home, upcoming days and warnings on Days, and each future day through its screen.

### Success Criteria
- [ ] A bill due the 5th with income on the 1st and 8th warns for the 5th only when the 1st cannot fund it (check case).
- [ ] A change starting in two months does not affect any draft before that date and does from it (check case).
- [ ] A year of lookahead for the seeded plan computes under 100 ms in the dev build.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 22: Choose Plan or Track, and move either way

**Prerequisites:** Issue 17, Issue 12
**Target PR Size:** ~550 lines (split the move-down flow if it runs over)
**Files:**
- `src/apps/runway/store/actions/planActions.ts` (`moveToTrack`, `moveToPlan`: `runTransaction`, a new tracking period, a `trackingChange` move, a `levelMove` change)
- `src/apps/runway/types.ts`, `constants.ts` (`trackingPeriods`, `MOVE_KINDS`)
- `src/apps/runway/screens/plan/SettingsScreen.tsx` (a "Tracking" row), `TrackingScreen.tsx` (a `Subview`), `forms/StartingAmountsSheet.tsx` (reused)
- `src/apps/runway/components/LevelGate.tsx`, `selectors/level.ts` (`selectLevel`)
- `src/apps/runway/components/RunwayBottomNav.tsx` (the Spend tab appears with Track)
- `src/apps/runway/engine/balances.ts` (level wording)
- `firestore.rules` (`trackingPeriods` shape, `moves` kinds)
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's "Level gating", the Tracking lifecycle row ("Moving to Track requires a start date and starting amounts"), Decisions 9 and 10 and Invariant 8; `UX.md` rule 1 and rule 3, and the Tracking and linking and Where is your money now rows.

### Description
A person chooses Plan or Track and can move either way. Moving up asks for a start date and what each envelope, bill and goal holds now, so the numbers begin true. Moving down keeps the history. The level changes the wording (assigned at Plan, left at Track) and shows the Spend tab only at Track.

### Possible Approach
1. `moveToTrack` is one transaction: it appends `{ from: startDate, to: null }` to `trackingPeriods`, writes `trackingChange` moves for the starting amounts and a `levelMove` change. `moveToPlan` sets the open period's `to`. Both read the plan document fresh.
2. `LevelGate` renders nothing for a feature above the current level, so nothing greyed out reaches the screen. Data for a hidden level is still listened to.
3. Starting amounts reuse `StartingAmountsSheet` from Issue 17 with one total for money on hand. Named accounts arrive in Issue 52; until then the single total stands for the whole of it, and the TDD's `Where is your money now?` screen shows one row.
4. The Spend tab appears, with its empty state, while Track is on. Level words come from `selectLevel` everywhere through one function.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a tracking period and its moves.
- [ ] **Read:** Settings > Tracking shows the periods and the current level.
- [ ] **Update:** move up and down. **Delete:** none (periods and moves are history).

### Success Criteria
- [ ] Moving up and down repeatedly leaves one period per stretch of tracking and never overlaps (emulator and check case).
- [ ] No control at Plan is disabled for want of Track; each one is absent (grep the screens).
- [ ] A device that is behind (plan still shows the old level) refuses a stale `moveToTrack` with a readable message.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 23: Delete your plan and everything in it

**Prerequisites:** Issue 22
**Target PR Size:** ~350 lines
**Files:**
- `functions/src/apps/runway/deleteRunwayPlan.ts` (new callable)
- `functions/src/index.ts`, `functions/README.md` (Functions row)
- `src/apps/runway/screens/plan/DeletePlanScreen.tsx`, `SettingsScreen.tsx` (a "Delete plan" row)
- `src/apps/runway/queries/` (or an action) for the call
- `scripts/seeds/runway.ts` (a seed that can be deleted and re-seeded)

**Context:** Read the TDD's "Deleting a plan" and Security Rules Design Criteria 16; CLAUDE.md's rules on destructive confirms and on Functions secrets.

### Description
A person can permanently delete their plan. It asks for a recent sign-in and a typed confirmation, then removes the plan, its server data and any stored files.

### Possible Approach
1. `deleteRunwayPlan` requires `request.auth`, a sign-in newer than a few minutes, and a client-supplied confirmation phrase. It removes `apps/runway/plans/{uid}` with the Admin SDK's recursive delete, the `server/{uid}` tree and the Storage prefix `apps/runway/receipts/{uid}/`. Link revocation is added by the Link issue that creates links.
2. `DeletePlanScreen` names exactly what goes ("Your plan, every change, every day and every purchase. This can't be undone."), asks for the phrase and shows the call's failure in the screen. It uses the destructive confirm pattern.
3. After success the app resets state (`resetAllState`) and returns to the empty first run; the shared usage records are left alone.

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Delete:** Settings > Delete plan.

### Success Criteria
- [ ] A deleted plan leaves no document under `apps/runway/plans/{uid}` or `apps/runway/server/{uid}` (emulator listing); the account can start over.
- [ ] A request without a recent sign-in or with a wrong phrase is refused with a readable message.
- [ ] The Functions row is in `functions/README.md`; no new secret.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 24: Add a purchase by hand

**Prerequisites:** Issue 22, Issue 17
**Target PR Size:** ~550 lines (split the Spend tab from the split editor if it runs over)
**Files:**
- `src/apps/runway/types.ts`, `constants.ts` (`PurchaseDoc`, `PURCHASE_SOURCES`)
- `src/apps/runway/store/actions/purchaseActions.ts` (`addPurchase`: `runTransaction`), `listeners/purchaseListeners.ts` (recent window)
- `src/apps/runway/screens/spend/SpendScreen.tsx`, `forms/PurchaseForm.tsx`, `components/SplitEditor.tsx`, `PurchaseRow.tsx`
- `src/apps/runway/engine/balances.ts` (purchases reduce envelopes), `selectors/`
- `src/apps/runway/screens/home/HomeScreen.tsx` (Left figures)
- `firestore.rules` (`purchases`)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `PurchaseDoc`, Invariants 7, 8 and 11, "Balances and closings" (the ledger sum), `UX.md`'s Purchase row and rule 6 (over is shown, never blocked), and Security Rules Design Criteria 14.

### Description
At Track, a person adds a purchase by hand: an amount, a date, a merchant and the envelope it comes from, or split across several, or a refund. The envelope's *left* figure goes down, Free to spend goes down by the same, and going over is shown, never blocked.

### Possible Approach
1. `addPurchase` is a transaction that reads fresh state, refuses a date outside every tracking period with a readable message, stores the lines as chosen (`via: 'chosen'`) and writes the `PurchaseDoc` (`source: 'manual'`, `needsHome: false`).
2. `SplitEditor` splits an amount across envelopes with `allocate`; the total always equals the amount to the cent. A refund is a negative amount that raises the envelope and Free to spend.
3. `SpendScreen`: this month's purchases newest first from the recent window, a header action "New purchase", `SearchInput` from 8 rows. Home envelope tiles read *left* and show how far over when negative, with Free to spend dropping by the same amount.
4. Spill-over, notes, links, receipts and merchant rules are later issues; the purchase document carries only the fields this issue reads.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "New purchase" in the Spend tab.
- [ ] **Read:** the Spend tab and the envelope's Purchases list.
- [ ] **Update / Delete:** Issue 25.

### Success Criteria
- [ ] A purchase of $120 against an envelope with $100 left reads "$20 over" and Free to spend falls by $20 (check case).
- [ ] A split of $100 three ways stores 3334, 3333, 3333 cents by id order and sums to 10000.
- [ ] The Spend tab is checked at 5 and at 500 seeded purchases; only the recent window is loaded.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 25: Edit and delete a purchase, and check an amount

**Prerequisites:** Issue 24
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/runway/store/actions/purchaseActions.ts` (`editPurchase`, `deletePurchase`: transactions)
- `src/apps/runway/forms/PurchaseForm.tsx` (edit mode)
- `src/apps/runway/screens/spend/PurchaseScreen.tsx` (a `Subview`)
- `src/apps/runway/screens/home/CheckAmountScreen.tsx`
- `src/apps/runway/engine/checkAmount.ts`
- `firestore.rules` (`purchases` delete allowed for the owner)
- `scripts/seeds/runway.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's "Spill-over and check an amount" (the part that does not need spill-over), Security Rules Design Criteria 14, and `UX.md`'s Check an amount and Purchase rows.

### Description
A purchase can be edited and removed (its lines go with it). Before spending, a person can check an amount against an envelope and see whether it fits and what is left.

### Possible Approach
1. `editPurchase` and `deletePurchase` are transactions that re-read the purchase and recompute its lines from fresh balances. Removal uses a destructive confirm that names the merchant and amount.
2. `checkAmount(envelope, cents)` returns "fits, $12 left" or "over by $18", using the same balances as Home. With no spill-over configured it says only that; spill-over arrives in Issue 43.
3. `CheckAmountScreen` is reached from Home. An amount field and an envelope picker (`PickOrCreate` without a New option) show the answer immediately.

### CRUD & Entry-Point Requirements
- [ ] **Update:** edit a purchase from its screen.
- [ ] **Delete:** the screen's trash icon with a destructive confirm.
- [ ] **Read:** the Check an amount answer.

### Success Criteria
- [ ] Editing an amount changes the envelope's left figure by the difference exactly once, even if two devices edit (emulator).
- [ ] Deleting a purchase restores the envelope and Free to spend.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 26: Prove the protections before any real data

**Prerequisites:** Issue 3, Issue 4. All other Core MVP functions deployed.
**Target PR Size:** ~250 lines of documentation and scripts; most of the work is in Google Cloud and the password manager
**Files:**
- `functions/README.md` (the runbook: keys, alerts, escrow, recovery, drill record)
- `src/apps/runway/TECHNICAL.md` (Open question 1 closed with the outcomes)
- `scripts/runway/` (only if a helper is needed for the drill)

**Context:** Read the TDD's "Master secret management" items 1 to 9, Open question 1, "Succession" for what is deliberately not here, and Google's Secret Manager, IAM deny and audit-log documentation as it stands when this is done.

### Description
Before anyone's real plan exists, every claim in the key-protection design is tested rather than assumed: the destruction delay, the deny policy, the audit alert, the three alerts, the escrow and the recovery drill. What cannot be proven is written down as a limit.

### Possible Approach
1. In the real project, set `--version-destroy-ttl=90d` on `RUNWAY_MASTER_KEYS`, confirm the secret has no expiry or TTL, and confirm the runtime service account has only `secretAccessor` on it and no human holds `secretmanager.admin`, editor or version-manager on it.
2. In a scratch project, settle the three deny-policy questions: Is Secret Manager supported by IAM deny policies, and with which permission names (`secretmanager.googleapis.com/secrets.delete`, `…/versions.destroy`)? Can a deny policy be created at the organization or project the account has? Does Owner bypass it, and what is the break-glass exception? Record the answers; if no deny policy is possible, record the compensating controls.
3. Create the three alerts by hand: the failure log alert on `jsonPayload.event="runway.keys.failed"`, the missing-heartbeat alert (a log-based metric on `runway.keys.ok`, absent 26 hours) and the Secret Manager audit alert on `DestroySecretVersion`, `DisableSecretVersion` and `DeleteSecret`. Test each once in the scratch project (destroy a test version; pause the scheduler) and then in the real one.
4. Store the escrow keyring in the password manager vault and in the separate secure cloud account, one holder. Run the recovery drill in the scratch project: restore from escrow, publish, unwrap a test plan's wrapped key. Record the date, the time it took and what was unclear.
5. Close Open question 1 in the TDD with the outcomes, and list in the runbook who holds escrow, the alert recipients and the exact recovery steps.

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Entry point:** the runbook in `functions/README.md`.

### Success Criteria
- [ ] Each of the three alerts fired at least once in a test and its notification arrived on the owner's email (and phone if configured).
- [ ] The recovery drill restored a test plan from escrow alone, and the time and steps are recorded.
- [ ] The deny policy outcome is recorded as one of: in place, impossible with the compensating control stated, or deferred with the reason.
- [ ] No key, wrapped key or escrow content appears in the repo, the PR or the runbook.
- [ ] The runbook states plainly that one person holds everything until the Succession issue ships.

### Issue 27: A scale plan and a performance pass

**Prerequisites:** Issues 1 to 25
**Target PR Size:** ~350 lines (seed and measurements; fixes as needed)
**Files:**
- `scripts/seeds/runwayScale.ts`, `scripts/seeds/types.ts`, `scripts/seed.ts`, `package.json` (`seed:runway-scale`), `SEEDING.md`
- Whatever selectors, lists or components the measurements flag

**Context:** Read the TDD's "Performance" (targets and the version-volume note), CLAUDE.md's "Performance is a design check", and Waypoint's `waypointScale.ts`.

### Description
"Five-year plan (scale test)" holds the volume a long-time user could reach, and every main screen is checked on it at phone width with the dev build throttled 4x. The measurements decide whether closings and a plan snapshot are built.

### Possible Approach
1. Seed three sources, 60 bills, 25 envelopes, 12 goals, a few hundred versions and about 25,000 purchases over five years, sealed the way the app seals them, and extend the document count.
2. Measure cold start to first useful screen, a draft recompute, the lookahead, the history window change, Spend tab and search, with and without the monthly closings idea. Profile before changing anything.
3. Write the numbers into the PR: first useful screen within 1.5 s, a draft recompute under 30 ms, a history window change under 300 ms. Record which of Open questions 2, 5 and 6 (closings, an engine worker, a plan snapshot) the numbers settle, and update the TDD.
4. Fix what is slow in this PR (memoizing selectors, mounting lists lazily, capping pickers).

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Read:** the existing screens on the scale plan.

### Success Criteria
- [ ] No tab switch takes over a second at 4x; no "Maximum update depth" or render storm in the console.
- [ ] The PR lists the fixture, the throttle, before and after numbers, and a clear decision on whether Issue 28 (closings) is built.
- [ ] `npm run seed:reset` restores the baseline.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The TDD's Open questions 2, 5 and 6 are updated with the measured answers.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 28: Monthly closings, only if the numbers need them

**Prerequisites:** Issue 27 shows closings are needed. If they do not, this issue is not built and the TDD is changed to remove closings and `dirtyFrom`.
**Target PR Size:** ~500 lines
**Files:**
- `src/apps/runway/engine/closings.ts`
- `src/apps/runway/hooks/useClosings.ts`
- `src/apps/runway/types.ts`, `constants.ts` (`ClosingDoc`; `PlanDoc.dirtyFrom`)
- `src/apps/runway/store/listeners/` (closings; the recent window starts after the latest valid closing)
- `src/apps/runway/store/actions/` (every action that writes into a closed month sets `dirtyFrom` in the same transaction: purchases, days, corrections, moves)
- `firestore.rules` (`closings`, `dirtyFrom` shape)
- `scripts/seeds/runway.ts`, `runwayScale.ts`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's Decision 7, Invariant 9, "Balances and closings", the Closing lifecycle row and Security Rules Design Criteria 13; the measurements from Issue 27.

### Description
Cold start reads a month of entries, no matter how old the plan is. A closing stores every balance at a month's end; anything written into a closed month marks later closings stale, and the next load rebuilds them.

### Possible Approach
1. `closing(month, previousClosing, entries)` is pure and deterministic: balances, Free to spend by source, bill progress and loan balances at month end. The balances engine reads the latest valid closing plus the ledger since.
2. A rebuild is a transaction that re-reads the plan document so two devices cannot both rebuild different things. A closing is a rebuildable cache: it can be overwritten or deleted by the owner.
3. Wire `dirtyFrom` into every action that writes a dated entry; a write dated in a closed month sets `dirtyFrom = min(dirtyFrom, month)` in the same transaction.
4. Check: with and without closings the balances are identical for the scale plan, and the cold start drops under the target.

### CRUD & Entry-Point Requirements
- [ ] No entity of its own.
- [ ] **Read:** balances read from closings; there is no screen except an "Updating your history" state shown while a rebuild runs.

### Success Criteria
- [ ] Balances equal the no-closing result for every month of the scale plan (check case).
- [ ] Editing a purchase from three months ago marks the later closings stale and the next load rebuilds them correctly (emulator).
- [ ] Cold start on the scale plan, on the dev build with the CPU throttled 4x, is within 3.5 s (Issue 27 measured 3 s with the items and a month loaded; the 1.5 s first written needs a production build).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.


## Next Steps

### Issue 29: Start from gross pay, with each deduction

**Prerequisites:** Issue 18
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/types.ts`, `constants.ts` (`PayLineSealed.deductions`, `grossEntered`)
- `src/apps/runway/engine/draft.ts` (step 0: deductions in listed order)
- `src/apps/runway/forms/IncomeForm.tsx` ("Start from gross" pills, a deductions list)
- `scripts/checks/runwayEngine.ts`, `scripts/seeds/runway.ts`

**Context:** Read the TDD's `PayLineSealed`, Draft algorithm step 0, Decision 9 and `UX.md`'s Expected income row.

### Description
A pay line can be entered as gross, with each tax and deduction as a percentage or an exact amount, listed in order. The take-home that results is what the draft plans; a deduction that builds an asset (a retirement contribution) can be marked.

### Possible Approach
1. The deduction list is a column of one-line summaries that open one at a time. Each is an `AmountField` in exact or percent-of-gross mode.
2. Step 0 subtracts deductions in their listed order, each exact or a percent of gross, with `allocate` where percentages share a base, and records the result on the line's reason.
3. Switching an existing pay line to gross is a normal change with its effect preview; the take-home before and after is shown.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** deductions on a pay line (editing through Issue 18's flow).
- [ ] **Read:** the take-home and the deduction lines on the draft's first line.
- [ ] **Delete:** removing a deduction is a change like any other.

### Success Criteria
- [ ] Gross $3,000 with 22% tax and $200 retirement gives the take-home stated by a hand calculation, to the cent (check case).
- [ ] A pay line entered as take-home still works exactly as before.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 30: Amounts as a percentage of what is left

**Prerequisites:** Issue 10
**Target PR Size:** ~300 lines
**Files:**
- `src/components/AmountField.tsx` ("% of what's left" mode)
- `src/apps/runway/engine/draft.ts` (resolved at its turn from the pool then left, and in pairings at their turn)
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's pairing amount table and Draft algorithm step 4.

### Description
An envelope, goal or pairing can take a percentage of whatever is left when its turn comes in priority order.

### Possible Approach
1. Add the mode to `AmountField` (the "of" label is a prop). In step 4 a `percent of remaining` amount is resolved from the pool at that point; in pairings from `available` at its turn.
2. Show the resolved figure on the line ("20% of what was left, $64").

### CRUD & Entry-Point Requirements
- [ ] No new entity.
- [ ] **Create / Read:** the mode on the forms and the resolved line.

### Success Criteria
- [ ] Reordering two lines changes their resolved amounts as the order of operations says (check case).
- [ ] A percent-of-remaining line with an empty pool shows $0 and why.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 31: Plan consecutive income days together

**Prerequisites:** Issue 13
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/engine/draft.ts` (`days` is one to many; `paidBy` per line)
- `src/apps/runway/store/actions/planActions.ts` (`setPlanTogetherDays`)
- `src/apps/runway/screens/days/IncomeDayScreen.tsx` (a group of days in one sitting), `SettingsScreen.tsx`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `buildDraft` input description, the pool/FIFO steps and the `paidBy` note, and `PlanDoc.planTogetherDays`.

### Description
Income days within a chosen number of days of each other are planned in one sitting: one draft over the combined money, with each line saying which day's money pays for it, confirmed day by day.

### Possible Approach
1. Group coming days where the gap is at most `planTogetherDays`; the draft treats them as one pool of chunks in day order.
2. The screen lists the group, shows `paidBy` per line and confirms each day on its own (the existing confirm per day, with its own lines).

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Update:** `planTogetherDays` in Settings. **Read:** the combined draft.

### Success Criteria
- [ ] A bill due before the second paycheck is paid from the first day's money and says so (check case).
- [ ] Confirming the first day leaves the second a draft with the rest of the lines.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 32: The Priorities view

**Prerequisites:** Issue 18
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/screens/plan/PrioritiesScreen.tsx` (a `Subview`)
- `src/apps/runway/store/actions/itemActions.ts` (`reorderItems`: one version per moved item)
- `src/apps/runway/engine/draft.ts` (cutoff line)
- `src/apps/runway/screens/plan/MoreScreen.tsx` (a row)

**Context:** Read the TDD's `orderIndex` notes and Draft algorithm step 4, and `UX.md`'s Priorities (later) entry.

### Description
One list of every bill, envelope and goal grouped by Must, Should and Want, in funding order, with a line drawn where the next income day's money runs out. Items can be moved inside a tier or to another tier.

### Possible Approach
1. Fractional `orderIndex` so a move writes one version; the screen shows the effect through `EffectPreview` before saving.
2. The cutoff line comes from the next draft's `shortBy` boundary.
3. Moves are drag handles on a phone with an alternative "Move up / Move down" control.

### CRUD & Entry-Point Requirements
- [ ] **Update:** order and tier. **Read:** the list and the line.

### Success Criteria
- [ ] A move writes exactly one version and one change entry.
- [ ] The line moves correctly as amounts change (check case).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 33: Loans with a fixed rate

**Prerequisites:** Issue 18, Issue 15
**Target PR Size:** ~550 lines
**Files:**
- `src/apps/runway/types.ts` (`LoanTerms`)
- `src/apps/runway/engine/loans.ts` (monthly estimated interest, extra payments, payoff)
- `src/apps/runway/forms/BillForm.tsx` ("This is a loan" pill question)
- `src/apps/runway/screens/plan/BillScreen.tsx` (balance, payoff date)
- `scripts/checks/runwayEngine.ts`, `scripts/seeds/runway.ts`

**Context:** Read the TDD's `LoanTerms`, the Loan payment demand rule and the loan rows of "Derived values".

### Description
A bill can be a loan: balance, rate, payment and schedule. Interest is estimated monthly, extra payments reduce it, and payoff is the ending. The draft caps the payment at the balance plus estimated interest.

### Possible Approach
1. Loan balance derives from the terms, the payments marked paid, estimated interest and any `balanceCorrection` move; nothing is stored.
2. Extra payment is a paid mark with a larger amount; payoff date is shown on the bill.
3. Label estimates as estimates everywhere (`RangeNote`-style).

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update:** a loan through the bill forms.
- [ ] **Delete:** payoff ends the bill (Issue 19's ending).

### Success Criteria
- [ ] A $10,000 loan at 6% paid $300 a month reaches the stated payoff month in the check case.
- [ ] The last payment is capped at balance plus interest and ends the loan.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 34: Endings by a total amount, and yearly limits

**Prerequisites:** Issue 19
**Target PR Size:** ~300 lines
**Files:**
- `src/apps/runway/types.ts` (`Ending.totalCents`, `resetsEachYear`)
- `src/apps/runway/engine/schedule.ts`
- `src/apps/runway/forms/` (the "Ends" pills gain "after a total")
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `Ending` and `UX.md`'s Expected "Ends" row.

### Description
A bill, expense or income can end after a total amount, or stop at a yearly limit that resets each year.

### Possible Approach
1. Evaluate the running total from confirmed history and the drafts ahead; the last occurrence is shortened to hit the total.
2. A yearly limit resets on January 1 in the date-only calendar (UTC).

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** the ending choice on forms.

### Success Criteria
- [ ] A $1,200 total with $300 payments ends after 4 payments and a $250 final one for $1,250 is shortened to $200 (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 35: Amounts that step up on a schedule

**Prerequisites:** Issue 18
**Target PR Size:** ~300 lines
**Files:**
- `src/apps/runway/types.ts` (`Step`)
- `src/apps/runway/engine/resolve.ts`, `draft.ts`
- `src/apps/runway/forms/` (a "Steps up" chip)
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `Step` and Plan versions.

### Description
A bill or pay line can step up on set dates, by a percentage or an exact amount (a lease, a raise).

### Possible Approach
1. Steps are part of the version payload; the amount on a date is the base plus the steps on or before it.
2. The effect preview lists the first affected days.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** steps via the chip.

### Success Criteria
- [ ] A 3% step on Jan 1 changes every draft from that date and none before (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 36: Hourly income

**Prerequisites:** Issue 12
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/runway/types.ts` (`Hourly`)
- `src/apps/runway/engine/draft.ts` (step 0: `pick` over minutes, then gross)
- `src/apps/runway/forms/IncomeForm.tsx` ("Paid by the hour" pills)
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `Hourly`, Draft algorithm step 0 and Decision 9 (minutes).

### Description
A pay line can be a rate and the hours expected, as a range. The stance picks low or high hours; the result flows through deductions to take-home.

### Possible Approach
1. Hours are stored as minutes; `pick` runs over `minutesLow..minutesHigh` and then multiplies by the rate in integer arithmetic.
2. The line says its basis ("planned at 32 hours").

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** an hourly pay line.

### Success Criteria
- [ ] 32 hours at $22.50 equals $720.00 exactly with no float drift (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 37: Bills that land within a window

**Prerequisites:** Issue 12
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/runway/types.ts` (`BillSealed.timing: window`)
- `src/apps/runway/engine/demands.ts` (window demands)
- `src/apps/runway/forms/BillForm.tsx` ("Due sometime between")
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's "Bill, window" demand rule.

### Description
A bill that arrives sometime in a window (a utility bill) is funded across the income days before the window closes, then marked paid when it lands.

### Possible Approach
1. Same arithmetic as suggested funding counting income days before `closesOn`.
2. Show "expected between Nov 3 and Nov 12" on rows and warn only if no income falls before it closes.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** timing on the bill form.

### Success Criteria
- [ ] A window closing before the next income day demands the full amount on the day before it (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 38: Monthly envelope funding

**Prerequisites:** Issue 6
**Target PR Size:** ~300 lines
**Files:**
- `src/apps/runway/types.ts` (`FundingRule.cadence: monthly`)
- `src/apps/runway/engine/schedule.ts`, `demands.ts`
- `src/apps/runway/forms/EnvelopeForm.tsx`
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's `FundingRule` and the Envelope or goal demand rule for `monthly`.

### Description
An envelope or goal can be funded monthly, from the first income day of the month, the last, or split across all of them.

### Possible Approach
1. `take: 'first' | 'last' | 'split'` selects days from the plan-wide chronological list; split uses `allocate`.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** the funding cadence.

### Success Criteria
- [ ] With three paychecks in a month, "split" sums to the monthly amount exactly (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 39: Group bills and expected expenses

**Prerequisites:** Issue 8
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/types.ts` (`GroupSealed`, `BillSealed.groupId`)
- `src/apps/runway/screens/plan/BillsScreen.tsx` (groups with monthly totals), `forms/GroupSheet.tsx`
- `src/apps/runway/screens/days/ExpectedScreen.tsx` (an optional "Group")
- `src/apps/runway/engine/` (`monthlyTotal`)

**Context:** Read the TDD's `GroupSealed`, `UX.md`'s Plan > Bills and Expected rows.

### Description
Bills and expected expenses can be grouped (Subscriptions, Housing, Car). A group shows its monthly total and gives its members a starting priority.

### Possible Approach
1. `PickOrCreate` for the group; a group's `startingPriority` fills the priority of a new member. `monthlyTotal` is derived, labelled when a range or estimate is involved.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update:** groups and membership.
- [ ] **Delete:** archive a group; members keep their history.

### Success Criteria
- [ ] A group with a range member shows its total as a range (check case).
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 40: Irregular income, with a rough monthly expectation

**Prerequisites:** Issue 21
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/runway/types.ts` (`Schedule.roughMonthly`)
- `src/apps/runway/engine/schedule.ts`, `lookahead.ts`
- `src/apps/runway/forms/IncomeForm.tsx` ("No set schedule")

**Context:** Read the TDD's `Schedule.roughMonthly` and Lookahead.

### Description
A pay line can have no schedule. Income days are created when money arrives; lookahead uses a rough monthly range so the headline stays honest.

### Possible Approach
1. An irregular pay line generates no occurrences; "Income arrived" creates a day on the date. Lookahead adds a labelled expectation per month, at the stance's end of the range.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read:** an irregular pay line and its arrivals.

### Success Criteria
- [ ] Lookahead labels the irregular contribution and never lets it fund a bill's earliest day (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 41: What if: a scratch copy of the plan

**Prerequisites:** Issue 18
**Target PR Size:** ~550 lines (split the saved list from the engine layer if it runs over)
**Files:**
- `src/apps/runway/engine/whatIf.ts` (layered virtual versions, `hours` in what-ifs)
- `src/apps/runway/types.ts` (`WhatIfDoc`), `store/listeners/`, `actions/whatIfActions.ts`
- `src/apps/runway/screens/plan/WhatIfScreen.tsx`, `components/WhatIfBanner.tsx`
- `firestore.rules` (`whatIfs`)

**Context:** Read the TDD's Decision 14, "What if", the What-if lifecycle row and `UX.md`'s What if row.

### Description
A person tries changes in a scratch copy, compares it with the real plan, saves it, applies it (as ordinary changes) or drops it. A banner stays on every screen while one is open.

### Possible Approach
1. An unsaved what-if exists only in memory; a saved one is a sealed `WhatIfDoc`. Applying writes ordinary versions and one `whatIfApplied` change in one batch.
2. Every selector that takes a plan takes the layered one the same way, so the comparison is two calls.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** a saved what-if (save, open, rename, drop); apply.

### Success Criteria
- [ ] Dropping an unsaved what-if writes nothing; applying one produces the same plan as making the changes by hand (check case).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 42: Open the plan as of a past date

**Prerequisites:** Issue 18
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/runway/screens/plan/PlanAsOfScreen.tsx`
- `src/apps/runway/engine/resolve.ts` ("known on date" cutoff)
- `src/apps/runway/screens/plan/MoreScreen.tsx`

**Context:** Read the TDD's "Plan versions" and Invariant 4.

### Description
A person picks a past date and sees the plan as it was then, and as it was known then, read-only.

### Possible Approach
1. "Known on a date" keeps only versions with `createdAt < date + 86_400_000`; "the plan on a date" ignores `createdAt`. The screen shows both and says which is which.

### CRUD & Entry-Point Requirements
- [ ] **Read:** the as-of view.

### Success Criteria
- [ ] A change made later but dated earlier appears in "the plan on" and not in "as known on" (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 43: Spill-over between envelopes

**Prerequisites:** Issue 25
**Target PR Size:** ~550 lines
**Files:**
- `src/apps/runway/types.ts` (`EnvelopeSealed.spillTo`; purchase `lines` with `via: 'spill'`)
- `src/apps/runway/engine/spill.ts`
- `src/apps/runway/screens/plan/OverflowScreen.tsx`
- `src/apps/runway/engine/checkAmount.ts`
- `src/apps/runway/screens/spend/PurchaseScreen.tsx`

**Context:** Read the TDD's Decision 8, Invariant 11, "Spill-over and check an amount" and `UX.md`'s Overflow row.

### Description
An envelope can name an ordered list of envelopes that pay when it goes over, any number of steps deep. The split a purchase resolved to is stored as a fact on the purchase. Check an amount now says where an overspend would come from.

### Possible Approach
1. `spill.ts` resolves a purchase against fresh balances in the same transaction as the write and stores the lines; later entries never recompute it.
2. Fallback balances are shown as separate lines and never added into the first envelope's figure.
3. Each money move appears in the change log of the purchase.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** the overflow list on an envelope.
- [ ] **Read:** the resolved lines on a purchase and in Check an amount.

### Success Criteria
- [ ] A $30 overspend with a two-step chain splits exactly as the chain says and the lines add to the purchase (check case).
- [ ] Editing a different purchase later does not change an earlier resolved split (emulator).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 44: Cover it: choose what gives

**Prerequisites:** Issue 18
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/engine/proposals.ts`
- `src/apps/runway/components/CoverIt.tsx` (swapped into the change sheet)
- `src/apps/runway/screens/home/EnvelopeScreen.tsx`

**Context:** Read the TDD's "Proposals" and `UX.md`'s Envelope-over and Change rows.

### Description
When a new bill, a change or an overspent envelope leaves a day short, Runway proposes what gives, lowest priority first, with the effect shown. "Cover it" appears only while an envelope is over and has no overflow set.

### Possible Approach
1. Proposals are pure functions returning an ordered list of changes; applying one is an ordinary change with its own note.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a covering change. **Read:** the proposals.

### Success Criteria
- [ ] Proposals never take from a Must before a Want is exhausted (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 45: Put it to work: where new income would go

**Prerequisites:** Issue 44
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/runway/engine/proposals.ts`
- `src/apps/runway/components/PutItToWork.tsx`

**Context:** Read the TDD's "Proposals".

### Description
When income rises or an extra pay line arrives, Runway proposes where the new money goes by priority, with effect shown first.

### Possible Approach
1. A proposal is the reverse of Cover it: fund the highest-priority unfunded demand first.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read:** proposals applied as ordinary changes.

### Success Criteria
- [ ] A raise funds the highest-priority short line first (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 46: Notes, links and expense groups on purchases

**Prerequisites:** Issue 24
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/runway/types.ts` (purchase `note`, `link`; `ExpenseDoc`)
- `src/apps/runway/screens/spend/PurchaseScreen.tsx`, `ExpenseScreen.tsx`
- `firestore.rules` (`expenses`)

**Context:** Read the TDD's `ExpenseDoc` and `UX.md`'s Purchase row (notes, links and receipts never change a balance).

### Description
A purchase can carry a note and a link, and belong to a named expense group ("Chicago trip") for a total across envelopes. None of it changes a balance.

### Possible Approach
1. Links are https only. An expense group's total is derived over its purchases.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** notes, links and expense groups.

### Success Criteria
- [ ] A purchase's amount and lines are unchanged by adding any of these (check case).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 47: Receipts: sealed photos kept until you remove them

**Prerequisites:** Issue 24
**Target PR Size:** ~550 lines (split the expiry function from the client if it runs over)
**Files:**
- `src/lib/security/encryption.ts` (`encryptBytes`, `decryptBytes`), `src/apps/runway/security.ts`
- `functions/src/apps/runway/expireReceiptImages.ts`, `functions/README.md`
- `storage.rules`, `firestore.rules`, `firestore.indexes.json` (collection-group exemption on `expiresAt`)
- `src/apps/runway/components/ReceiptPicker.tsx`, `PurchaseScreen.tsx`

**Context:** Read the TDD's Decision 13, "Receipts", Security Rules Design Criteria 15 and the Receipt image lifecycle row.

### Description
Receipt photos are sealed on the device and stored as opaque bytes. A photo expires after a year unless kept; in the last 30 days the purchase offers to keep or download it. A kept photo stays until the person removes it.

### Possible Approach
1. Add `encryptBytes`/`decryptBytes` to the shared security lib, exported from `@lib/security`, and note them in `.github/copilot-instructions.md` beside the sealed-payload rule in the same PR.
2. `expireRunwayReceipts` (daily) uses the collection-group query on `expiresAt`, deletes the object then the document, and never deletes `expiresAt == null`.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Delete:** attach, view, remove. **Update:** keep.

### Success Criteria
- [ ] A photo not opened with the plan key is unreadable bytes in Storage and in a dump.
- [ ] The scheduled function deletes an expired fixture and leaves a kept one (emulator).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `encryptBytes` and `decryptBytes` have a round-trip check.
- [ ] `.github/copilot-instructions.md` names `encryptBytes`/`decryptBytes` in `@lib/security` as the way to seal bytes (the owner's item 5, held until these exist).
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 48: Move leftover envelope money

**Prerequisites:** Issue 24
**Target PR Size:** ~300 lines
**Files:**
- `src/apps/runway/store/actions/moveActions.ts` (`transfer`)
- `src/apps/runway/screens/home/EnvelopeScreen.tsx`

**Context:** Read the TDD's `MoveDoc` and the Moves rules.

### Description
Money left in an envelope can be moved to another envelope or a goal; the ledger records the move.

### Possible Approach
1. A `transfer` move with source and target and a note; balances read it.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read:** a transfer. **Delete:** a reversing move.

### Success Criteria
- [ ] Total money is unchanged by any transfer (check case).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 49: Free to spend, by source

**Prerequisites:** Issue 24
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/runway/engine/balances.ts`
- `src/apps/runway/screens/home/FreeToSpendScreen.tsx`

**Context:** Read the TDD's pool chunks and Derived values.

### Description
Free to spend shows how much came from each source, and a purchase can be assigned to a chosen source's money.

### Possible Approach
1. Chunks carry `sourceId`; a purchase's `via: 'free'` line records which source it drew from.

### CRUD & Entry-Point Requirements
- [ ] **Read / Update:** the split and the assignment.

### Success Criteria
- [ ] The by-source split sums to Free to spend (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 50: Credit cards: a reserve per card, paid by card, and paying a card off

**Prerequisites:** Issue 24
**Target PR Size:** ~900 lines (widened by the owner for card-first budgeting)
**Files:**
- `src/apps/runway/types.ts` (`CardDoc`, `paidByCardId` on purchases and bills, `cardId` on `billPaid`, `cardPayment` moves)
- `src/apps/runway/engine/balances.ts`, `engine/closings.ts` (a reserve per card)
- `src/apps/runway/forms/CardForm.tsx`, `forms/PayCardSheet.tsx`, Plan > Cards
- `firestore.rules` (`cards`)

**Context:** `PRODUCT.md` "Who It Is Built For First" and "Credit Cards, In Detail"; the TDD's balances table.

### Description
A card is named by its issuer and an optional name ("Capital One Venture X"). A purchase or bill paid by a card fills that card's reserve while the cash stays put; "Pay off" lowers the cash and the reserve together, so Free to spend does not move.

### Possible Approach
1. Cards are their own collection; a card's reserve is its start (what it owed when added) plus its charges less its payments.
2. Matching card payments from imports (Issue 55) stays on hold with importing.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Archive:** cards on Plan > Cards.
- [ ] **Paid by** on the purchase and bill forms; **Pay off** on the card's sheet, with an Undo.

### Success Criteria
- [ ] Card purchases and card-paid bills never count twice in Free to spend, a payoff leaves it unchanged, an overpayment draws it by the extra, and a closing equals the replay (check cases).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `firestore.rules` gained only `cards` in the update list, verified with `check:runway-rules`.
- [ ] The PR carries one `minor` label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; driven at 390×844 in light and dark.
- [ ] `PRODUCT.md`, `UX.md` and `TECHNICAL.md` match what shipped.

### Issue 51: Import purchases from a CSV, with Needs a home and merchant rules

**Prerequisites:** Issue 24
**Target PR Size:** ~550 lines (split the matching pass from the import if it runs over)
**Files:**
- `src/apps/runway/engine/matching.ts` (steps 1, 2, 5, 6)
- `src/apps/runway/hooks/useReconcile.ts`
- `src/apps/runway/screens/spend/ImportScreen.tsx`, `NeedsHomeScreen.tsx`
- `src/apps/runway/types.ts` (`MerchantRuleDoc`, `importBatchId`, `dedupeKey`)
- `firestore.rules` (`rules`)

**Context:** Read the TDD's "Matching", Open question 4 (parser), `dedupeKey` and `UX.md`'s Needs a home row.

### Description
A bank CSV becomes purchases that wait in Needs a home. Merchant rules assign repeats; "varies" merchants always ask.

### Possible Approach
1. Pick the parser per Open question 4. The device dedupe key is an HMAC under the plan key.
2. The pass assigns by rule after the listeners settle; a rule is offered only after three identical assignments.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** imports, Needs a home, rules.

### Success Criteria
- [ ] Importing the same file twice makes no duplicates (emulator).
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 52: Accounts: where each pot is held, and check a balance

**Prerequisites:** Issue 22
**Target PR Size:** ~550 lines
**Files:**
- `src/apps/runway/types.ts` (`AccountDoc`)
- `src/apps/runway/screens/plan/AccountsScreen.tsx`, `forms/AccountSheet.tsx`, `WhereIsYourMoneyScreen.tsx`
- `src/apps/runway/screens/spend/CheckBalanceScreen.tsx`
- `firestore.rules` (`accounts`)

**Context:** Read the TDD's `AccountDoc`, `UX.md`'s Where is your money now row and Accounts (later) entry.

### Description
A person names their accounts, says where each goal and envelope is held, sees the line-up against each balance and can check a balance. Over-assigned money is shown.

### Possible Approach
1. Accounts are counted toward the total or left out (a brokerage), and `balanceCorrection` moves record a corrected balance.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** accounts (archive when used).

### Success Criteria
- [ ] Over-assigned reads "Over-assigned $X" and never blocks anything.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 53: After confirming: money to move between accounts

**Prerequisites:** Issue 15, Issue 52
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/runway/screens/days/ChecklistScreen.tsx` ("Move to accounts" group)
- `src/apps/runway/engine/` (`moves.ts`)

**Context:** Read `UX.md`'s Checklist row.

### Description
Once accounts are named, the checklist lists the moves between accounts a confirmed day needs, as ticks.

### Possible Approach
1. The group appears only once accounts exist; ticks use `doneLineIds`.

### CRUD & Entry-Point Requirements
- [ ] **Read / Update:** the group and its ticks.

### Success Criteria
- [ ] The group is absent without accounts (hidden, not disabled).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 54: Interest on savings goals, shared across goals in an account

**Prerequisites:** Issue 52
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/runway/engine/` (`interest.ts`)
- `src/apps/runway/forms/GoalForm.tsx`
- `src/apps/runway/screens/plan/AccountsScreen.tsx`

**Context:** Read the TDD's `GoalSealed.rateBps` and the goal pace note.

### Description
A goal can earn interest from the account holding it; the interest is shared across the goals in the account in proportion to their balances, and shown as an estimate.

### Possible Approach
1. Shares use `allocate`; the estimate is labelled everywhere it shows.

### CRUD & Entry-Point Requirements
- [ ] **Update / Read:** the rate and the estimate.

### Success Criteria
- [ ] Shares add to the account's interest to the cent (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 55: Match deposits to income days, and card payments to the reserve

**Prerequisites:** Issue 51, Issue 50, Issue 13
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/runway/engine/matching.ts` (steps 3 and 4)
- `src/apps/runway/hooks/useReconcile.ts`
- `src/apps/runway/screens/days/IncomeDayScreen.tsx` ("Deposit found", the difference line)
- `src/apps/runway/types.ts` (purchase `incomeDayId`, `assignedBy`)
- `scripts/checks/runwayEngine.ts`

**Context:** Read the TDD's "Matching (Track and Link)" steps 3 and 4, the properties paragraph, Decision 21 and `UX.md`'s Income day row.

### Description
A posted deposit that fits a coming income day is linked to it and the day is ready to confirm. A deposit that arrives after its day was confirmed links to that day and changes nothing else. A purchase that settles a card payment becomes a `cardPayment` move.

### Possible Approach
1. Implement the candidate, amount and choice rules exactly as written; ties and no candidates leave the deposit in Needs a home. Pending deposits are skipped.
2. On a draft day set `incomeDayId`; on a confirmed day set `incomeDayId` only and show the difference with the existing correction action.
3. `assignedBy` is `'auto'` for a pass and `'person'` for a choice made on Needs a home; the pass never touches an already assigned purchase.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read:** the link and the "Deposit found" line on the day.
- [ ] **Update / Delete:** unlinking a deposit from a day returns it to Needs a home.

### Success Criteria
- [ ] The five matching properties in the TDD are asserted in the check, including order independence.
- [ ] Matching the same imported file twice changes nothing (emulator).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 56: Spike: bank-data provider access, coverage and cost

**Prerequisites:** Core MVP complete
**Target PR Size:** Decision recorded in the TDD; no app code. A sandbox demo may be a script under `scripts/runway/`.
**Files:**
- `src/apps/runway/TECHNICAL.md` (Bank data, Open question 3, Functions and secrets)
- `src/apps/runway/README.md` (the sentence about bank sign-in)
- `scripts/runway/plaidSandbox.ts` (throwaway; not deployed)

**Context:** Read the TDD's "Bank data", Open question 3 and "Functions and secrets".

### Description
Settle, before any Link code is written, what Plaid access will be: production approval and lead time, price per linked account, coverage of the accounts in the UX (checking, savings, cash management such as Wealthfront, and whether the investments product covers retirement and brokerage), which banks use OAuth, and how the webhook is verified.

### Possible Approach
1. Apply for production access if it is not held yet and record the lead time.
2. Run a sandbox link, an account listing, a balance read, a cursor sync and a signed webhook against the throwaway script.
3. Write the findings into the TDD; correct the README so it says credentials go to the bank or to the provider's window and never to Runway.
4. Create `RUNWAY_PLAID_CLIENT_ID` and `RUNWAY_PLAID_SECRET` in production Functions secrets before the first Link PR merges (CI deploys every function).

### CRUD & Entry-Point Requirements
- [ ] No user-facing surface.

### Success Criteria
- [ ] The TDD's Open question 3 is answered, with the price per linked account and the access status.
- [ ] The README's bank sign-in wording matches the finding.
- [ ] Both secrets exist in production, and the first Link issue's prerequisites say so.
- [ ] If the answer is that Plaid cannot cover the UX, the PR says what changes in the README before any Link issue is filed.

### Issue 57: Choose Link and connect a bank

**Prerequisites:** Issue 56, Issue 52, Issue 22
**Target PR Size:** ~600 lines (split the functions from the screens if it runs over)
**Files:**
- `functions/src/apps/runway/link/provider.ts`, `providerPlaid.ts`, `normalize.ts`, `createLinkSession.ts`, `attachAccount.ts`
- `functions/README.md` (rows), `firestore.rules` (`links`, `accountBalances`: owner read, `write: if false`)
- `src/apps/runway/queries/linkQueries.ts`, `store/listeners/` (`links`), `screens/more/LinkScreen.tsx`
- `src/apps/runway/screens/plan/WhereIsYourMoneyScreen.tsx`
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's "Bank data", Security Rules Design Criteria 3, `LinkDoc`, `AccountBalanceDoc` and the Link-an-account journey in `UX.md`.

### Description
A person at the Track level can choose Link, read what it does, sign in at their bank through the provider's window, and attach each provider account to an account they already named. The provider's accounts and balances arrive, and the line-up is shown once.

### Possible Approach
1. `BankDataProvider` is the only place provider names appear. `createRunwayLinkSession` returns a link token; the public token is exchanged on the server, the access grant is sealed under `HKDF(current master key, 'runway-provider-grant')` with `masterKeyId` beside it, stored in `server/{uid}/grants/{linkId}` and never returned.
2. `attachRunwayAccount` binds a provider account to a named account and writes the `LinkDoc` and an `accountBalances` document, both sealed with the plan key.
3. A person who never links has no links, no grants and no bank data. The level choice is the same switch as Issue 22 gaining its third option.
4. Document the functions in `functions/README.md` in the same PR.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a link and the attachments. **Read:** the Link screen and the line-up.
- [ ] **Update / Delete:** unlinking is Issue 58.

### Success Criteria
- [ ] Both Plaid secrets exist in production before this PR merges.
- [ ] A second user cannot read or write the first user's links, balances or grants (emulator, owner and non-owner).
- [ ] Cancelling the provider window leaves nothing linked and says so.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 58: Unlink an account, and move down from Link

**Prerequisites:** Issue 57
**Target PR Size:** ~350 lines
**Files:**
- `functions/src/apps/runway/link/unlinkAccount.ts`, `functions/README.md`
- `src/apps/runway/screens/more/LinkScreen.tsx`, `SettingsScreen.tsx` (Tracking and linking)
- `src/apps/runway/store/actions/planActions.ts`

**Context:** Read the TDD's `unlinkRunwayAccount` bullet, "Level gating" and the Move-down-a-level journey in `UX.md`.

### Description
A person can unlink an account: new purchases stop and what already came in stays. Moving down a level hides what depends on the level and keeps all data; the change is recorded in the change log.

### Possible Approach
1. `unlinkRunwayAccount` revokes at the provider, deletes the grant, sets the link to `revoked` and keeps the imported purchases.
2. Figures change wording from "safe to spend" to "left" or "assigned" by level, as the gating table says; nothing greyed out.

### CRUD & Entry-Point Requirements
- [ ] **Update / Delete:** unlink; stop tracking.

### Success Criteria
- [ ] After unlinking, the grant document is gone and the link reads `revoked` (emulator).
- [ ] Moving down then up restores the same data.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 59: Bring in transactions: sync, webhook, normalize and dedupe

**Prerequisites:** Issue 57, Issue 51
**Target PR Size:** ~600 lines (split the webhook from the sync if it runs over)
**Files:**
- `functions/src/apps/runway/link/syncAccount.ts`, `webhook.ts`, `normalize.ts`, `functions/README.md`
- `src/apps/runway/screens/spend/NeedsHomeScreen.tsx`, `store/listeners/`
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's `syncRunwayAccount` bullet, `dedupeKey` and "Matching".

### Description
New bank transactions appear in Needs a home as pending or posted purchases, one document each, without duplicates, and a pending charge becomes the same document when it posts.

### Possible Approach
1. The webhook verifies the provider's signed header and queues a sync; a scheduled backstop `syncRunwayAccounts` catches a missed webhook.
2. `dedupeKey = HMAC(HKDF(plan data key, 'runway-dedupe'), linkId + providerTransactionId)`; purchases are sealed with the plan key and the function logs counts and ids only.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read:** synced purchases in Needs a home and the sync time on the link.

### Success Criteria
- [ ] Replaying the same webhook payload creates no second document, and a pending charge that posts keeps its id (emulator).
- [ ] A forged webhook is rejected (emulator).
- [ ] Logs hold no merchant or amount.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 60: Match what you entered by hand to what the bank shows

**Prerequisites:** Issue 59, Issue 24
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/runway/engine/matching.ts` (step 5)
- `src/apps/runway/screens/more/LinkScreen.tsx` (one-time offers)

**Context:** Read the TDD's "Matching" step 5 and the Link journey in `UX.md`.

### Description
When an account is linked, hand-entered purchases are offered as matches to the arriving real ones by amount and date within three days, and nothing is counted twice.

### Possible Approach
1. The manual purchase is offered as the match and the person confirms; the pair becomes one purchase.

### CRUD & Entry-Point Requirements
- [ ] **Update:** accept or decline the match.

### Success Criteria
- [ ] Equal candidates ask; none is silently merged (check case).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 61: Safe to spend, and Where your cash is

**Prerequisites:** Issue 59, Issue 52
**Target PR Size:** ~500 lines
**Files:**
- `src/apps/runway/engine/balances.ts` (`cashPosition`)
- `src/apps/runway/screens/home/WhereYourCashIsScreen.tsx`, `EnvelopeScreen.tsx`, `HomeScreen.tsx`
- `src/apps/runway/components/LevelGate.tsx`

**Context:** Read the README's Where your cash is paragraph, the TDD's "Derived values" and "Level gating".

### Description
At the Link level each envelope shows safe to spend from live balances, and Where your cash is lists the cash in chosen accounts, what is already committed, and what is free. Over-assigned money reads as a line and changes no envelope.

### Possible Approach
1. Committed is derived: bills funded and unpaid, goal money held in those accounts, the card reserve, pending charges.
2. Envelope figures stay their planned values when over-assigned.

### CRUD & Entry-Point Requirements
- [ ] **Read:** the breakdown and the per-envelope figure.

### Success Criteria
- [ ] The breakdown adds up to the account balances to the cent (check case).
- [ ] The rows are absent below Link (hidden, not disabled).
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 62: Goals held in linked accounts

**Prerequisites:** Issue 61, Issue 54
**Target PR Size:** ~300 lines
**Files:**
- `src/apps/runway/engine/balances.ts`
- `src/apps/runway/screens/plan/GoalScreen.tsx`

**Context:** Read the README's Goals, In Detail and the TDD's goal pace note.

### Description
A goal held in a linked account shows its planned balance and the account's actual, with the difference as a line.

### Possible Approach
1. Difference is derived; it never moves the goal's planned balance.

### CRUD & Entry-Point Requirements
- [ ] **Read:** the difference line.

### Success Criteria
- [ ] Planned and actual differ by the stated amount in the check case.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 63: Spike: one engine for the device and the server

**Prerequisites:** Core MVP complete
**Target PR Size:** Decision plus a golden-check run; the build change only if the chosen option needs one.
**Files:**
- `functions/` build config (`rootDir: src`)
- `src/apps/runway/engine/` (imports checked)
- `scripts/checks/runwayEngine.ts`
- `src/apps/runway/TECHNICAL.md` (Server-side Reconcile, Open question 7)

**Context:** Read the TDD's "Server-side Reconcile and Notifications" step 1.

### Description
Pick how matching, plan resolution, schedule generation and the `dirtyFrom` helper run in both the app and Functions with identical answers: a copy at build time with a parity check, a small shared package, or a Functions build that includes the engine folder.

### Possible Approach
1. Confirm the engine modules import nothing from React, the store or the browser.
2. Run the golden checks against both copies of each candidate and compare.
3. Record the choice, its build step and the parity check in the TDD.

### CRUD & Entry-Point Requirements
- [ ] No user-facing surface.

### Success Criteria
- [ ] The choice is recorded with the evidence of identical golden outputs.
- [ ] The CI path that builds Functions is shown to work with it.
- [ ] Open question 7 is closed.

### Issue 64: Reminders for income days and bills coming due

**Prerequisites:** Issue 63, Issue 21
**Target PR Size:** ~550 lines
**Files:**
- `functions/src/apps/runway/sendReminders.ts`, `notificationText.ts`, `functions/README.md`
- `scripts/checks/runwayNotifyText.ts`
- `src/apps/runway/screens/more/NotificationsScreen.tsx`
- `src/apps/runway/types.ts` (`PlanDoc.notify` keys `billDue`, `incomeToday`; sealed `notifyTimeZone`, `notifyHour`)
- `firestore.rules`, `scripts/seeds/runway.ts`

**Context:** Read the TDD's "Server-side Reconcile and Notifications" step 3, Invariant 14 and Decision 21.

### Description
A person can turn on a push the day before a bill is due and on an income day. The text is fixed, with no amounts or names, and each push is sent once.

### Possible Approach
1. `sendRunwayReminders` runs hourly, reads only plans with a switch on, and compares each plan's sealed `notifyTimeZone` and `notifyHour` (default 9:00 local) with its schedules.
2. Create-only `server/{uid}/notified/{kind}_{subjectId}` before sending; delivery through `sendPushToUsers` and `toAppUrl`; never the `reminders` collection.
3. The switches default off, Runway asks permission on a tap with the reason beside it, and the screen says iOS needs the site installed to the home screen.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update:** the two switches, the hour and the time zone.

### Success Criteria
- [ ] The same hourly run twice sends one push (emulator).
- [ ] `npm run check:runway-notify-text` fails if a template reads a sealed field.
- [ ] Invariant 14 holds: logs carry ids, kinds and counts only.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 65: Match new purchases and deposits on the server

**Prerequisites:** Issue 63, Issue 55, Issue 59
**Target PR Size:** ~600 lines
**Files:**
- `functions/src/apps/runway/reconcile.ts`, `syncAccount.ts` (marks the plan needing a pass), `functions/README.md`
- `src/apps/runway/engine/matching.ts` (shared as the spike decided)
- `scripts/seeds/runway.ts`

**Context:** Read the TDD's "Server-side Reconcile and Notifications" step 2 and "Matching".

### Description
After a sync, a short per-plan debounce runs the matching rules on the server on posted purchases only, so a purchase is already assigned when the app opens. The device pass stays as catch-up and for CSV imports.

### Possible Approach
1. `reconcileRunwayPurchases` is task-triggered; it loads only items, versions of kind `bill`, `payLine` and `source`, rules, the coming days window and the `needsHome` purchases.
2. One `runTransaction` per purchase that re-reads it; a pass touches only `needsHome` purchases, sets `assignedBy: 'auto'`, and a write into a closed month sets `dirtyFrom` in the same transaction.
3. If the pass cannot run (key trouble, timeout) purchases stay in Needs a home.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read:** assignments made by the server.

### Success Criteria
- [ ] A webhook payload becomes an assigned purchase; a purchase the person assigned is untouched; a pending purchase is skipped until it posts (emulator).
- [ ] The device and server give identical results on the golden fixtures.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] `npm run check:runway-engine` passes and gained the cases this issue adds to the engine.
- [ ] Every sealed field this issue adds is read by this issue's own screens; a field for a later tier is not added early.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 66: Notifications when money arrives or a bill is paid

**Prerequisites:** Issue 65, Issue 64
**Target PR Size:** ~350 lines
**Files:**
- `functions/src/apps/runway/reconcile.ts`, `notificationText.ts`
- `src/apps/runway/screens/more/NotificationsScreen.tsx`
- `src/apps/runway/types.ts` (`PlanDoc.notify` keys `moneyArrived`, `billPaid`)

**Context:** Read the TDD's notification kinds table and the once-only bullet.

### Description
Two more switches: a push that money arrived and is ready to confirm, and a push that a bill was paid. Each is sent right after the pass, once.

### Possible Approach
1. Send after the pass assigns, behind create-only `notified` documents; no push for a deposit that links to an already confirmed day.

### CRUD & Entry-Point Requirements
- [ ] **Update:** the two switches. **Read:** the push opens the day or the bill.

### Success Criteria
- [ ] The same payload twice sends one push; a pending purchase sends none (emulator).
- [ ] A deposit linking to a confirmed day sends none.
- [ ] Templates contain no value from the fixtures.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] `scripts/seeds/runway.ts` gained this issue's documents, sealed the way the app seals them, and the app's document count is updated.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.

### Issue 67: Retire a master key

**Prerequisites:** Issue 4
**Target PR Size:** ~400 lines
**Files:**
- `scripts/runway/retireMasterKey.ts`, `scripts/runway/publishKeyring.ts` (`--retire`)
- `firestore.indexes.json` (collection-group exemptions on `masterKeyId`)
- `functions/README.md` (runbook)

**Context:** Read the TDD's "Retiring a master key" and Invariant 13.

### Description
A maintainer can retire a master key id by re-wrapping every data key and grant under the current key, proving none remain, and only then publishing a keyring without it.

### Possible Approach
1. Run with Admin SDK credentials, never as a deployed function; idempotent and resumable; one transaction per document that re-reads it.
2. Exit non-zero unless both queries return nothing for the id, and only then let the publish tool's `--retire` flag past.

### CRUD & Entry-Point Requirements
- [ ] Maintainer tool only.

### Success Criteria
- [ ] A dry run on the emulator re-wraps a mixed fixture and exits zero only when none remain.
- [ ] Publishing without the id fails unless the retirement passed in the same run.
- [ ] The runbook gained the steps and the recovery drill is repeated afterwards.
- [ ] `firestore.rules` gained only the clauses this issue uses, verified on the emulator as the owner and as a second user with at least one allowed and one denied write per clause, plus a legacy-shaped document (newer keys removed); the PR says whether `firestore.indexes.json` changed.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.


### Issue 77: History window and a production cold-start check

**Prerequisites:** Issue 28
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/runway/store/listeners/` (the second listener tier, keyed on `(from, to)`)
- `src/apps/runway/hooks/useRunwaySync.ts`, `store/runwaySlice.ts`
- `src/apps/runway/screens/days/`, `screens/spend/SpendScreen.tsx`, `utils/spendPeriod.ts`
- `scripts/seeds/runwayScale.ts`

**Context:** Read the TDD's "Tier 2: the history window" and `TECHNICAL.md` "What reaches back, and what does not". Since Issue 28, Days and Spend list only what happened since the newest closing. Older purchases and income days count in every figure but can't be opened. Spend's period control (This month, Last month, Past 30 and 90 days) already loads a fixed period on demand, which is a small version of this window.

### Description
A person can open any older month in Days and Spend, find a purchase or an income day from it, and open, edit or correct it like a recent one. A plan's first screen stays fast on a production build.

### Possible Approach
1. Turn Spend's period read into the general window: a month picker back to the plan's start, read by `(from, to)` only while the view is open, one window at a time.
2. Give Days the same window, so an income day older than the newest closing opens its record and its Correct a day.
3. Search covers the window in view and says which window that is.
4. An edit inside a closed month marks its closing stale through `markLedgerWrite`, as every other write does.
5. Measure on `seed:runway-scale` (Morgan) with a production build (`npm run build` and `vite preview`) and with the dev build at 4× CPU.

### CRUD & Entry-Point Requirements
- [ ] **Read:** a month older than the newest closing opens in Days and in Spend.
- [ ] **Update:** an older purchase can be edited and an older income day corrected, and the closing is rebuilt.

### Success Criteria
- [ ] Cold start on the scale plan reaches the first useful screen within 1.5 s on a production build, and within 3.5 s on the dev build at 4× CPU (Issue 28 measured only the dev build).
- [ ] Changing the history window takes under 300 ms on the scale plan.
- [ ] Spend's "Earlier purchases are counted in your figures but not listed" note, the Days limit and the README's "Where it stands" line are removed or updated to match what shipped.
- [ ] `npm run check:runway-engine` passes; a rebuild after an old edit matches a full replay (equivalence case).
- [ ] The PR carries one `minor` label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark.
- [ ] `UX.md` and `TECHNICAL.md` match what shipped.


## Beyond

### Issue 68: Describe a coming expense or income in words

**Prerequisites:** Core MVP complete and the opt-in AI decision recorded in the TDD
**Target PR Size:** To be sized when scoped
**Files:**
- `src/apps/runway/` (Add flow), the AI service wrapper decided in the TDD's Optional AI section

**Context:** Read the TDD's "Optional AI".

### Description
A person can describe a coming expense or income in plain words and get proposed changes, through an AI service they opt into. Nothing is sent without the opt-in, and proposals are applied as ordinary changes.

### Possible Approach
1. Scope in the issue that picks it up: what text leaves the device, what stays sealed, and the opt-in copy.

### CRUD & Entry-Point Requirements
- [ ] To be scoped.

### Success Criteria
- [ ] Scoped before it is built; no plan content leaves the device without a recorded opt-in.

### Issue 69: Loans whose rate moves

**Prerequisites:** Issue 33
**Target PR Size:** To be sized when scoped
**Files:**
- `src/apps/runway/engine/loans.ts`

**Context:** Read the TDD's `LoanTerms`.

### Description
Loans whose rate moves on its own, or that have a promotional rate, with the estimate labelled until a statement balance corrects it.

### Possible Approach
1. Scope when picked up.

### CRUD & Entry-Point Requirements
- [ ] To be scoped.

### Success Criteria
- [ ] Scoped before it is built.

### Issue 70: Credit cards carried month to month

**Prerequisites:** Issue 50, Issue 33
**Target PR Size:** To be sized when scoped
**Files:**
- `src/apps/runway/engine/loans.ts`

**Context:** Read the README's Beyond list.

### Description
Cards carried month to month: rate, minimum payment and payoff.

### Possible Approach
1. Scope when picked up.

### CRUD & Entry-Point Requirements
- [ ] To be scoped.

### Success Criteria
- [ ] Scoped before it is built.

### Issue 71: More providers, for retirement and brokerage accounts

**Prerequisites:** Issue 56
**Target PR Size:** To be sized when scoped
**Files:**
- `functions/src/apps/runway/link/provider<Name>.ts`

**Context:** Read the TDD's "Bank data".

### Description
A second provider behind `BankDataProvider` if the spike shows the first does not cover retirement and brokerage accounts.

### Possible Approach
1. Scope when picked up.

### CRUD & Entry-Point Requirements
- [ ] To be scoped.

### Success Criteria
- [ ] Provider names stay inside `provider*.ts`.

### Issue 72: Itemized receipts and order pages

**Prerequisites:** Issue 47
**Target PR Size:** To be sized when scoped
**Files:**
- `src/apps/runway/components/ReceiptPicker.tsx`

**Context:** Read the TDD's "Receipts".

### Description
Read order numbers and itemized details from receipts and order pages to suggest an envelope for a mixed purchase.

### Possible Approach
1. Scope when picked up.

### CRUD & Entry-Point Requirements
- [ ] To be scoped.

### Success Criteria
- [ ] Scoped before it is built.

### Issue 73: View-only access to a plan

**Prerequisites:** Core MVP complete
**Target PR Size:** To be sized when scoped
**Files:**
- `firestore.rules`, `src/apps/runway/`

**Context:** Read the TDD's Decision on one owner per plan and Security Rules Design Criteria.

### Description
Someone else can see a plan read-only. This changes the key model (a plan key per reader), so it is scoped as a design first.

### Possible Approach
1. Write the key-sharing design in the TDD before any code.

### CRUD & Entry-Point Requirements
- [ ] To be scoped.

### Success Criteria
- [ ] The design is approved before an implementation issue is filed.

### Issue 74: Net worth, investments and long-range projections

**Prerequisites:** Core MVP complete
**Target PR Size:** Its own app
**Files:**
- a new app, planned with `plan-mdd-app`

**Context:** Read the README's Beyond list.

### Description
Net worth, investments and projections are large enough to be a separate app rather than part of Runway.

### Possible Approach
1. Plan it as its own app.

### CRUD & Entry-Point Requirements
- [ ] To be scoped.

### Success Criteria
- [ ] Planned separately; nothing is added to Runway for it in advance.

### Issue 75: Succession: a second Owner and a recoverable key

**Prerequisites:** Issue 4, Issue 67; due before anyone else's plan is held
**Target PR Size:** Operational plus runbook; little code
**Files:**
- `functions/README.md` (runbook)
- `src/apps/runway/TECHNICAL.md` (Succession)

**Context:** Read the TDD's "Succession (after the MVP)" and Open question 10.

### Description
A second trusted person is Owner on the Google Cloud project and billing account, has emergency access to escrow, and has done the recovery drill from a runbook written for someone who did not build this.

### Possible Approach
1. Name the second Owner and escrow holder (Open question 10).
2. Set the second Owner on the project and billing account; billing emails and budget alerts go to both.
3. Set the password manager's emergency access and a recovery contact on the second cloud account.
4. Write the runbook, then have the second person run the drill in the scratch project from it alone.
5. Decide whether to split the keyring with Shamir sharing; take it only if the first four steps are judged not enough.
6. Add "confirm the second holder can still reach the new entry" to Retiring a master key, step 7.

### CRUD & Entry-Point Requirements
- [ ] No user-facing surface.

### Success Criteria
- [ ] The second person unwraps a test plan's key from the runbook without help.
- [ ] Both people receive billing and budget alerts.
- [ ] The drill is repeated after each rotation and after either person changes.
- [ ] Moving to Cloud KMS is not part of this issue.

### Issue 76: Start from a budget you already have

**Tier:** Next Steps (added after the roadmap was numbered; the owner asked for it in round 13).
**Prerequisites:** Issue 17 (Starting out), and the round-13 Starting out changes (calendar cadence, goals with a current amount)
**Target PR Size:** ~550 lines (split the reader callable from the review step if it runs over)
**Files:**
- `functions/src/apps/runway/readRunwayBudget.ts`, `functions/src/index.ts`, `functions/README.md`
- `src/apps/runway/queries/budgetReadQueries.ts`
- `src/apps/runway/screens/start/` (a "Start from your budget" way in, and the review step)

**Context:** Read Pinch's reading flow (`CLAUDE.md` Product: "A document fills the form; it doesn't create records", "Every AI entry point says what happens") and the TDD's sealed-document rules.

### Description
Someone who already keeps a budget in a spreadsheet, a CSV, a notes file or a message can start from it: an AI reads the file or pasted text into proposed income, bills, envelopes and goals, and the person reviews each one in Starting out before anything is saved.

### Possible Approach
1. Starting out offers "Start from your budget" beside "Start fresh" as one `MethodPicker` (a file, or pasted text), saying before anything is sent that an AI reads it and that it isn't kept.
2. The callable returns a structured answer (every field required and nullable; amounts in cents; cadence as one of the calendar cadences or per pay) and never saves; the file is not stored.
3. The review step lists the proposals by kind with their amounts, each editable and removable, with what could not be read named; Save writes them through the same actions as Starting out, sealed.

### CRUD & Entry-Point Requirements
- [ ] **Create:** the proposals become real items only on Save. **Read / Update / Delete:** each proposal before saving.

### Success Criteria
- [ ] A CSV, a pasted list and a notes-style text each produce proposals a person can review; nothing is written before Save (emulator).
- [ ] A value the source doesn't give stays empty and is named, never invented.
- [ ] The callable checks `request.auth`, logs no content, and is in `functions/README.md`.
- [ ] The PR carries one `minor` (or `patch`) label; `npx tsc -b --force`, `npx eslint .` and `npm run check:apps` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan lines this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Runway rules files are updated if the app's design vocabulary changed.
