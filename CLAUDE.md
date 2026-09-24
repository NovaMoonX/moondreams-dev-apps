# CLAUDE.md

Coding practices, styles, and norms for this repo. Every rule here applies to new code and to any PR you review or finish.

The shared rules (imports/aliases, Firestore data contracts, listeners, TanStack Query, invite/join pattern, React state, class names, Dreamer UI usage) live in `.github/copilot-instructions.md` and apply in full:

@.github/copilot-instructions.md

This file adds the norms specific to how Claude works in this repo, plus the review checklist that `.claude/skills/finish-feature-pr` runs. When a rule appears in both places, `copilot-instructions.md` is the source of truth and this file only points at it.

## Code style

- **Functions over loose variables.** No `let` assigned across `if`/`else` branches — wrap the branching in a small function with early returns and use its result. Build values with `.reduce`/`.map`/`.filter`/`Object.fromEntries` instead of `for` loops and manual `push`/insertion. Default to `const`. Keep code compact and colocated: a helper lives next to its single use, not in a new file.
- **Comments: default zero.** Only write one when the process doesn't make sense on its own — a hidden constraint, a workaround for a specific bug, a non-obvious invariant, or why the obvious approach isn't used. Never describe what code does, restate a name in prose, or reference a task/PR/caller. Max 3 lines, no app/file/function names. Re-audit every touched file before wrapping up.
- **No IIFEs.** Arrow callbacks passed to `.map()`, `onClick=`, `setState()` are fine.
- **Never `setState` synchronously in a `useEffect` body** (or during render to mirror props). Derive during render, or set state only inside async/subscription callbacks.
- **Firestore fields are `T | null`**, required keys, explicit `null` — never optional `?:` or `undefined`.
- **Date-only vs. instant.** A date picked with no time (`fromDateInputValue`) is UTC midnight: display it with `formatDateUTC`/`getDayLabel`, never `formatDate`/`formatDateTime`/local getters, and treat a date-only end date as covering its whole day (`endDate + 1 day`) when comparing an instant against it. An instant (`startAt`, `createdAt`) displays in local time. Full rule in `copilot-instructions.md` ("Know which of the two kinds of time value a field is").
- **Copy is product-forward**: warm, friendly user-facing text (subtext, empty states, descriptions), not spec-literal.
- **Dreamer UI first.** No raw `<button>`/`<input>`/`<select>`/`<textarea>`. Use `AppToggle` (`@/components/AppToggle`), never Dreamer UI's raw `Toggle`. Use a toggle for anything that takes effect immediately (live filter, "show archived"); use `Checkbox` only for form-staged values and to-do-style completion marks.

## Forms, modals, and CRUD conventions

- **Modal/section titles are plain nouns** ("Expense", "Visit", "New cat"), never CRUD verbs ("Add Expense", "Edit Visit"). The same title serves create and edit. The verb belongs on the primary action button and on a destructive confirm dialog's title.
- **Submit buttons disable until required fields are valid** (`onDataChange` + `isValid`); no required-field asterisks.
- **Optional secondary fields use a "+ Add X" reveal link**, not "(optional)" in the label.
- **An always-mounted modal (visibility via `isOpen`) needs `key={editingX?.id ?? 'new'}`** at its call site, or its internal state goes stale across edit targets. A modal that's conditionally rendered should be keyed on whatever identity it depends on.
- **Deletes go through `useActionModal().confirm(...)` with `destructive: true`** — never a bare `window.confirm` or no confirmation.
- **A form modal's delete is an icon-only trash button, bottom-left of the footer.** Use the shared `DeleteIconButton` as `leftActions` of `ModalFooterActions` (`rightActions` holds Cancel then the primary submit). Never a "Delete" text button in the Cancel/Save row. References: `ChecklistItemFormModal.tsx`, `ExpenseFormModal.tsx`.
- **Pending-request/invite features ship both sides together**: owner approve/decline *and* requester cancel/withdraw (delete their own doc, destructive confirm).
- **Static option lists** (dropdown options, role/status allowlists) are declared once in the mini-app's `constants.ts` (never `types.ts`, which is types only) and imported everywhere. Reference: `src/apps/waypoint/constants.ts`.

## State, data, and performance

- **Firestore `onSnapshot` lives in `store/listeners/`** as `startXListener(key, onChange)`, started once from a `useXSync` hook at the mini-app's top-level page (reference: `useNineLivesSync.ts`, `useWaypointSync.ts`). Never inside a leaf/tab/panel component's `useEffect`. The exception is a genuinely modal-local, ephemeral subscription that no other component reads (e.g. a single invite-code lookup); keep it a small hook and mount it via a conditionally-rendered, keyed component so it subscribes once per key.
- **Request/response calls go through TanStack Query** (`queryOptions` factory in `src/lib/<feature>/<feature>Queries.ts` or `src/apps/<app>/queries/<resource>Queries.ts`). Key includes every param that changes the result and nothing that doesn't; `staleTime` fits how often the data changes. Writes and non-idempotent calls stay uncached.
- **`meta: { persist: true }` must earn its place.** Remove it from any query whose `queryFn` reads Firestore (Firestore's own cache already persists it) or returns secrets, tokens, or key material. Keep it on safe third-party/worker results so they work offline.
- **`useAppSelector` that builds a new array/object** (`.filter`, `.map`, spread, object literal, `[]` fallback) must pass `shallowEqual` from `react-redux` or use a `createSelector` selector. A selector that returns an existing slice or `.find(...) ?? null` is fine.
- **Read-modify-write of a shared field** (a `members` map, a counter) happens inside one `runTransaction`, reading via `transaction.get()` — never a Redux-cached read followed by a separate write. Thunks that only assign caller-supplied values to disjoint scalar fields don't need one. Reference: Waypoint `membershipActions.ts`.

## Firestore and Storage rules

- The rule's identity check matches the collection's real path. Shape validation covers every field on the type using the `T | null` convention. Immutable-field checks cover only truly immutable fields (id, owner/parent id, `createdBy`, `createdAt`, file metadata) — don't lock a field the UI edits.
- `storage.rules` paths mirror wherever the Firestore doc lives. `firestore.indexes.json` drops indexes for queries that no longer exist and adds any composite index a new query needs.
- Never add a global `match /{path=**}/X` rule for something scoped under an app path; prefer a body check (`resource.data.householdId == householdId`).
- Repeated assertions go in helper functions. Never put a self-referential `get()`/`exists()` in a collection's own `allow read`; use `resource.data`. Split OR-ed read predicates into separate `allow read` statements.
- Denials and atomicity are verified against the emulator (e.g. a raw REST or client-SDK write), not just by the absence of a UI button.

## Cloud Functions

- A newly-added `onCall` function can deploy without its public-invoker IAM grant (symptom: browser CORS error; GCP Cloud Run request logs show a 403 on the `OPTIONS` preflight). See README's [Deployment](README.md#new-cloud-functions--cloud-run-invoker-access) section for the `gcloud run services update --no-invoker-iam-check` fix.

## Nine Lives placement

Nine Lives features are one of two shapes — check which the request actually asks for:

- **Household-level sections** rendered directly in `NineLives.tsx`, each wrapped in `DetailsDisclosure` (see `ClinicsSection.tsx`, `ExpensesSection.tsx`), stored at `apps/nine-lives/households/{householdId}/{collection}/{id}`, synced via `useNineLivesSync.ts`.
- **Cat-scoped tabs** in `CatDetailsModal.tsx`, stored at `households/{householdId}/cats/{catId}/{collection}`, synced via `useCatDetailSync.ts`.

Migrating between them means moving the collection path and updating every action/listener/selector, the rule, the Storage path, and the tab/section wiring in `CatDetailsModal.tsx`/`NineLives.tsx` at the position the request specifies (Visits, Expenses, Vet Clinics are the anchors for "under"/"at the bottom"). An entity that attaches to several cats uses `catIds: string[]` (create dedupes with `Array.from(new Set(...))`, form uses a first-position `FormFactories.checkboxGroup`, list resolves cat names, rule checks `catIds is list && catIds.size() > 0`).

## Validation

- **Typecheck with `npx tsc -b --force` (or `npm run build`)** — `tsc --noEmit -p .` checks nothing in this solution-style repo. Also run `npx eslint .`.
- **Drive the change in a real browser** against the local Emulator Suite, signed in through the dev fixture switcher, with a throwaway Playwright script (delete it when done). A passing typecheck is not evidence a feature works. Also re-drive every pre-existing feature that touches a file you changed, and treat "the new feature works" and "nothing regressed" as separate checks.
- **Anything that shows or compares a date runs in a timezone behind UTC** — create the Playwright page with `timezoneId: 'America/Los_Angeles'`. Cloud sandboxes and CI run in UTC, where a date-only value formatted in local time looks correct; the off-by-one only appears west of UTC. Check that the displayed date matches the date picker's value.
- **Leave the dev server and emulators running** after browser validation; finish with `npm run seed:reset` so data is back to the seeded baseline.
- **Update the mini-app seed** (`scripts/seeds/<app>.ts`) when a feature adds an entity or state worth seeding, including its `firestoreDocuments` count.

## Release hygiene

- **Bump `SITE_VERSION`** in `src/lib/app/app.constants.ts` on every PR that changes app code or behavior: patch for a fix or small tweak, minor for a feature (finishing an in-progress feature PR is a minor bump). Bump once per PR, in its first code-changing commit, and re-check against `origin/main` first — main may already have taken the number.
- Keep the root `README.md` and the mini-app docs current, concise, and in their existing tone.
- Commits and PRs end with the attribution lines the session's system reminder specifies.
