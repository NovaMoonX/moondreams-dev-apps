# GitHub AI Instructions for project

## Core project rules

### Quick reference
- Component syntax: `export function ComponentName` (or `function ComponentName` + `export default ComponentName`).
- **No IIFEs: never write an anonymous function that is immediately invoked in place (`(() => { ... })()`). Arrow functions passed as arguments to another call (`.map()`, `onClick={() => ...}`, etc.) are fine and idiomatic — the rule is about self-invoking anonymous functions, not callbacks.**
- **No loose `let` variables assigned across `if`/`else` branches, and no `for` loops that build up a result. Wrap the branching in a small function that returns the value (early returns), and build collections with `.reduce`/`.map`/`.filter`/`Object.fromEntries`. Keep related logic colocated and compact — see "Functions over loose variables" under Coding Styles.**
- **Class names: always use `join()` for conditionals; never use template literals in `className`.**
- Check the repo's shared components (`src/components`, `src/ui`) first, then Dreamer UI, before building custom UI.
- **Keep the look playful: rounded shapes, pills over radios/tab strips, meaningful emoji, warm copy. Mini-app-specific rules live in `.github/instructions/<app>.instructions.md` (mirrored in `.claude/rules/<app>.md`).**
- **Floating/hover UI uses Dreamer UI's `Popover`/`DropdownMenu`/`Drawer`, not a hand-rolled hover panel; labeled hairline dividers use `@/components/SectionDivider`; status badges are soft tints, not solid fills; nested pages use `@/components/Subview`. See CLAUDE.md Design & UX.**
- **A component whose props mention no app entity (a search field, divider, subview, money input) goes in `src/components` from its first use; only entity-aware pieces stay in the mini-app.**
- **Alignment: items in a column share one left edge; an emoji/icon line uses a fixed-width icon column (`w-5 shrink-0 text-center`); counts and dates are `whitespace-nowrap` badges, never a wrapping trailing `· ×3`; omit empty rows instead of placeholder text. Check new screens at narrow phone width.**
- **Pick a form's container by its content, phone first: a `Modal` only for a handful of simple inputs that fit a phone screen without scrolling in any state; a `Drawer` for forms with several sections and for a row's actions and read-only detail (`@/components/FormSheet` is a tall drawer on phones and a modal from `sm` up, footer pinned); a full-page `Subview` for search flows, sequences and page-sized tasks no drawer fits. Never a long form in one modal; measure on a phone. A drawer whose action opens an editor closes first. A mini-app's own look lives in its `<app>.css` tokens and `<app>.instructions.md`. See CLAUDE.md "Pick the container by the content", "Subviews" and "Designing a mini-app's look".**
- **Visual rules live in the narrowest place that covers everyone: behaviour every app needs goes once in `src/index.css`, an app's look (tokens, radii, quiet tappable text) in its `<app>.css`. Body and row text is the normal color; blue is for real links and filled buttons. See CLAUDE.md "Where a visual rule lives" and "Text color is part of the theme".**
- **Performance is judged at scale: build `Intl` formatters once, compute totals in one pass and memoize them, share one Firestore listener per key and batch snapshot bursts, cap long lists, and check new lists on the app's oversized seed fixture with the dev build throttled. See CLAUDE.md "Performance is a design check".**
- **Check colors where they land (filled button, selected pill with emoji, badge, highlighted card, banner, in light and dark), keep a rounded field's text inset from its curve, and keep one control's icon, label and border one color. See CLAUDE.md "Design & UX".**
- **A detail the user's path depends on is asked as a visible question with `Pill` answers ("Already booked?"), not tucked behind a "+ Add X" link or chip; those are for truly optional extras. See CLAUDE.md "A journey detail is asked, not tucked away".**
- **No "Back home" link inside a mini-app's page; Home is in the header (icon on sm+, avatar menu on phones). Only `AppEntryFallback` says "Back home", and nothing leads to the hub while `IS_INSTALLED_APP` (`@utils/pwaUtils`) is true.**
- **Never write raw `<button>`, `<input>`, `<select>`, or `<textarea>` elements — use Dreamer UI's `Button`, `Input`, `Select`, `Textarea` (or the `Form`/`FormFactories` system for anything with more than one field) instead.**
- **Never call `setState` synchronously inside a `useEffect` body or during render to mirror props/derive values — see "React and state patterns" below.**
- Always use the project import aliases instead of relative paths when available.
- Follow the existing folder organization and keep responsibilities separated by feature, UI, hooks, context, routes, lib, and utils.
- Use shared date/time formatting helpers from `src/utils/formatUtils.ts` for timestamp display instead of inline `Date` formatting.
- When showing a user or member avatar in the UI, prefer the shared `UserAvatar` component from `src/ui/UserAvatar.tsx` instead of raw `Avatar` components.
- **Bump `SITE_VERSION` in `src/lib/app/app.constants.ts` on every PR that changes app code or behavior** — patch (`1.0.x`) for fixes/small tweaks, minor (`1.x.0`) for new features. It's the single site-wide version, shown in the avatar menu and on the error page, and logged once on mount across every mini-app; it must never go stale.

### File structure and imports
- Follow the existing project structure and keep code organized by feature, UI, hooks, context, routes, lib, and utils.
- Use the established import aliases: `@/`, `@apps/`, `@components/`, `@contexts/`, `@hooks/`, `@lib/`, `@routes/`, `@screens/`, `@store/`, `@styles/`, `@ui/`, and `@utils/`.
- Always prefer the alias path over relative imports like `../` when the target is inside the app structure.
- Prefer clean, consistent imports over broad or redundant patterns.

```tsx
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useTheme } from '@moondreamsdev/dreamer-ui/hooks';

import { APP_TITLE } from '@lib/app';
import Layout from '@ui/Layout';
import { router } from '@routes/AppRoutes';
import MyComponent from '@components/MyComponent';
import { useCustomHook } from '@hooks/useCustomHook';
import { MyContext } from '@contexts/MyContext';
import { store } from '@store';
import { helper } from '@utils/helper';
```

### File structure
Follow the existing structure:
```text
src/
├── apps/       # Mini-apps
├── components/ # Reusable UI components
├── contexts/   # React context providers
│   └── AuthContext.tsx
├── hooks/      # Custom React hooks
├── lib/        # Utilities and constants
├── routes/     # Router configuration
│   └── AppRoutes.tsx
├── screens/    # Page/route components
├── store/      # State management
├── styles/     # Additional CSS styling files
├── ui/         # Layout and core UI components
│   ├── Home.tsx
│   └── Layout.tsx
├── utils/      # Utility functions
├── App.tsx     # Main app entry point w/ providers
└── main.tsx
```

### Data and app patterns
- Namespace app data per mini-app, such as `apps/worth-the-wait/...`, instead of mixing app-specific state into a generic shared path.
- Keep app-specific state isolated to that app's official collection path and keep other mini-app data separate.
- Shared user profiles belong in the global `users` collection and should be resolved by `uid` when display data or avatar metadata is needed.
- Treat time fields as real timestamps in milliseconds as numbers, not plain strings or JS date strings in app state.
- Use `Date.now()` for new timestamp values unless a real server-generated timestamp is required.
- Keep app-side type shapes and Firestore data contracts aligned so `createdAt`, `updatedAt`, and request timestamps use consistent millisecond-number semantics in the client.
- **Know which of the two kinds of time value a field is, and never mix their helpers.** Getting this wrong shows every viewer west of UTC the *previous* day — and it's invisible in UTC-based dev/CI environments.
  - **Date-only** — a calendar day picked with no time (a trip's `startDate`/`endDate`, a vaccination's `administeredAt`, an expense's `incurredAt`). Stored as **UTC midnight** of that day: write with `fromDateInputValue`, read into a picker with `toDateInputValue`, display with `formatDateUTC` (or `getDayLabel` for a trip's "Day N"). Never display one with `formatDate`, `formatDateTime`, a bare `toLocaleDateString()`, or local getters (`getDate()`/`getMonth()`/`getFullYear()`) — any local-timezone read of a UTC-midnight value lands on the day before for anyone behind UTC. A formatter that must read one passes `timeZone: 'UTC'` / uses the `getUTC*` getters.
  - **Instant** — a real moment in time (`createdAt`, an event's `startAt`, a stay's `checkInAt`, `Date.now()`). Write from a date + time picker with `fromLocalDateAndTimeInputValues`, read back with `toLocalDateInputValue`/`toLocalTimeInputValue`, display with `formatDate`/`formatDateTime`/`formatTime` (local time is correct here).
  - **Trip-relative** — a time that belongs to a day *of a trip* rather than to a calendar date (a Waypoint event's `dayIndex` + `startTime`, a stay's check-in day + time). Stored as a day offset from the trip's start plus a floating `"HH:mm"`; it displays identically to every viewer, and only turns into a real instant (reminders, "now" comparisons) through the item's zone (`event.timezone ?? trip.timezone`) via `zonedDateTimeToEpoch`. Never store it as a timestamp, so changing the trip's dates is a single trip-document write. See Waypoint's `utils/tripTime.ts`.
  - **A date-only end date is the *start* of its day.** When comparing an instant against it ("does this stay's checkout fall inside the trip?"), the exclusive upper bound is `endDate + 86_400_000`, not `endDate` — otherwise anything later that same day reads as out of range.
  - **Day math on date-only values** (`getDayIndex`, `getDayCount`, a `dayIndex` offset) stays in whole UTC days from the UTC-midnight anchor; don't route it through local `Date` getters.
- Do not add string-based or Firestore `Timestamp`-style values unless the feature truly requires them.
- Keep Firestore rules and app state lifecycle logic aligned when creating or updating lifecycle-related fields such as `createdBy`, `members`, `pendingRequests`, or invite codes.
- In Firestore rules, place repeated field assertions in helper functions instead of duplicating long inline checks inside `allow` expressions.
- **Every Firestore listener whose data is read anywhere other than the single component that owns it belongs in `store/listeners/` as a plain `startXListener(key, onChange)` function, started once from the mini-app's top-level orchestrator via a `useXSync` hook (Nine Lives' `useNineLivesSync.ts` is the reference implementation; Waypoint's `useWaypointSync.ts` follows the same shape) — never from inside a leaf/tab/panel component's own `useEffect`.** A leaf component (a tab, a panel inside a modal) mounts and unmounts far more often than the page around it — switching tabs, reopening the same trip/household — and an `onSnapshot` embedded there tears down and resubscribes on every one of those, instead of once per actual key change. The `useXSync` hook dispatches into a slice; the leaf component reads that slice with `useAppSelector` and has no listener of its own. Split listeners into tiers exactly like `useNineLivesSync.ts` does: one effect for data scoped to the signed-in user (not tied to any single open resource), a second for data scoped to whichever resource is currently open, keyed on that resource's id so it restarts only when the open resource actually changes.
- **A third-party credential that can't be domain-restricted lives in a Functions secret behind an `onCall`**; the browser never holds it, and neither a response nor a log carries it (nor the upstream URL that contains it). A free-tier API shared across all users gets a server-side cache and a daily budget guard (reference: A-List's `searchMovies`/`getMovie` with `movieCache.ts`/`lookupBudget.ts`).
- **A Calendar `renderCell` reads a prebuilt day-keyed map** (built once in a `createSelector`, e.g. A-List's `selectViewingsByDay`), never a per-cell filter or fetch. The key is the viewer's local day via `toLocalDateInputValue` (Dreamer UI's cells are local-midnight `Date`s); a date-only (UTC-midnight) value is keyed with `toDateInputValue`, never read in local time.
- **Never stack an overlay on an overlay:** whatever continues inside an open drawer swaps its content in place with a "‹ Back" link; a destructive confirm is the only thing allowed on top.
- **One-shot request/response calls go through TanStack Query, never a bare `fetch`/callable/`getDoc` inside a `useEffect` + `useState`.** This covers third-party APIs, Cloud Function callables, and single Firestore reads whose result is only ever read, not live. Live data stays on `onSnapshot` listeners in Redux (above). Each feature exports a key factory plus `xQueryOptions(...)` built with `queryOptions()` next to its client: shared ones in `src/lib/<feature>/<feature>Queries.ts` (e.g. `places/placesQueries.ts`), app-specific ones in `src/apps/<app>/queries/<resource>Queries.ts` (e.g. `waypoint/queries/tripTitleQueries.ts`) — never a bare `queries.ts`. Read in components with `useQuery`/`useQueries`. For imperative calls (on blur, on click, inside a callback) use `queryClient.fetchQuery(xQueryOptions(...))` from `useQueryClient()`, or the shared `queryClient` from `@lib/query/queryClient` outside React. The cache then dedupes and reuses repeat params. Set `staleTime` from how often the data really changes (`Infinity` for write-once data such as a space's encryption key), and leave anything that only groups or bills a request, such as a Places session token, out of the key. Writes and non-idempotent calls (Gemini extraction, `triggerBoxAction`, a transaction's own reads) are not cached. The cache is cleared on user switch in `AuthContext`. The query cache is persisted to IndexedDB for offline use, but only for queries that opt in with `meta: { persist: true }`. Add it only when the `queryFn` reaches something other than Firestore (a third-party API, the link-metadata worker) and the result holds nothing sensitive. Never add it to a Firestore-backed query, whose data Firestore's own cache already keeps on disk, or to anything carrying secrets, tokens or key material (e.g. a space's encryption key).
- **A static option list consumed by more than one file (UI dropdown options, a validation allowlist) is declared exactly once and imported everywhere it's needed — never redeclared per file.** Every mini-app keeps its runtime constant values (allowlists, label maps, magic numbers) in a sibling `constants.ts`, separate from `types.ts` — `types.ts` holds type/interface declarations only. `src/apps/waypoint/constants.ts` (`ASSIGNABLE_MEMBER_ROLES`, `MEMBER_ROLE_LABELS`) is the reference shape; derive UI `options` arrays from these constants at render time instead of hand-writing a parallel literal.
- **Firestore document field types are the exception to the "prefer optional `?:`" rule below: model every field on a Firestore-backed type as a required key typed `T | null` (no `?`), and always write an explicit `null` (never `undefined`, never an omitted key) when a value is absent.** `setDoc`/`updateDoc` reject fields explicitly set to `undefined`, and this repo's `firestore.rules` are written expecting the key to exist (e.g. `request.resource.data.phone == null || request.resource.data.phone is string`) — a missing key throws a rules-evaluation error, not a passing check. Do not reach for `ignoreUndefinedProperties` on the Firestore client as a workaround; fix the type and the value instead. `create*` action thunks that accept a `Partial<Entity>` from callers (so quick-create/partial UI flows can omit fields) must normalize every non-required field to `?? null` when assembling the final document before calling `setDoc`.
- **An action thunk that reads a document, derives a new value for a field that other actions can also mutate concurrently (a shared map like `members`, a counter, anything read-modify-written rather than replaced outright), and writes it back must do the read and the write inside one `runTransaction`, not a separate `getDoc`/Redux-cache read followed by a `setDoc`/`updateDoc`/`writeBatch`.** A plain read-then-write race-loses silently: two admins changing two different members' roles at nearly the same time can each read the same stale `members` map and the second write overwrites the first's change with no error. `runTransaction(db, async (transaction) => { const snapshot = await transaction.get(ref); ...; transaction.set/update(ref, ...); })` makes Firestore retry the transaction on a conflicting concurrent write instead. `src/apps/waypoint/store/actions/membershipActions.ts`'s `changeRole`/`removeMember`/`approveJoinRequest` are the reference shape — note they always read the document fresh via `transaction.get`, never from the Redux-cached copy, since the whole point is to not trust a read that isn't part of the same transaction. This does not apply to a thunk that only ever assigns literal caller-supplied values to disjoint scalar fields (e.g. `editTrip` writing `title`/`startDate`/`coverImageUrl`, `setTripArchived` writing `isArchived`) — those aren't derived from the prior value of a shared field, so there's nothing to lose to a race.
- **Atomic writes — choose the primitive by what can race.** Another member can change a document while the user has a modal open, so a write built from a cached copy loses their change silently. Use:
  - `arrayUnion`/`arrayRemove` to append to or remove from an array another user can also append to (`changeHistory`, `upvotedBy`). Never `[...cached, item]`.
  - `runTransaction` with `transaction.get` for a member writing their own key in a shared map (`seenBy`, `dismissedBy`, a paid-status map), for any value derived from the previous one, and for any change that must hold across documents (approving a suggestion: re-read the source event and the suggestion, abort with a readable message if either changed, then archive/create/delete together). Do network side effects (scheduling a reminder) outside the transaction and undo them if it fails; never inside, since it can retry.
  - `updateDoc` with only the fields the action owns for an edit-form save. Never `setDoc` the cached object back: it overwrites concurrent `seenBy`, votes, history, and archive state. Strip concurrently-written fields out of the payload.
  - `writeBatch` only for independent writes that need no reads.
  - A side effect keyed by a stored id (a scheduled push's `trailerReminderId`) is rescheduled only when the field it derives from changed in that edit (compare with the document the transaction read), cancelled only while still ahead, and never awaited after the write, so a slow or offline network can't hold the save UI.
  - A plain `updateDoc` of caller-supplied scalar values to disjoint fields needs none of these.
- **New work must be backwards compatible with data already stored.** Existing documents lack any field you add. Readers default it (`field ?? []`, `?.`), edit actions backfill missing keys with the field's empty value in the same write, and rules read it with `resource.data.get('field', default)` and permit the legacy shape. Do not mutate the listener's data to hide the gap if an action relies on seeing the key is missing. Test it by writing a legacy-shaped document (new keys removed) into the emulator and driving every read/edit path over it.
- **`firestore.rules` and `storage.rules` ship with the change, and are verified.** Any new/renamed field, changed permission, moved path, or new collection updates the rules (and indexes) in the same PR. Verify against the emulator, signed in per role through the auth emulator: at least one allowed and one denied write per role-sensitive rule touched, plus a legacy-shaped document. The UI hiding a button is not verification.

- **A date/time range input preserves its range.** Wherever a start and an end are entered together (trip dates, an event's or stay's start/end), moving the start moves an already-chosen end by the same amount; moving the end only changes the length. Reuse `DateRangeField` / `shiftDateRangeStart` (dates) and `shiftRangeEnd` (day + time).
- **Reserve superseded Firestore fields, don't delete them.** When a field is replaced, it stays in the type with a `/** @deprecated … */` note naming its replacement (existing documents still return it, and it records history); new writes set it to `null` and the rules keep accepting it.
- **Per-member private data nests under `apps/{appId}/<root>/{uid}/…`** (e.g. A-List's `apps/a-list/memberships/{uid}/viewings/{id}`) with a one-line `request.auth.uid == uid` rule: no `ownerUid` body check, no `where` query, no composite index.
- **Sums of money are stored as integer minor units** (`priceCents`, `monthlyTotalCents`) and formatted only at the edge (a `formatCents`-style helper); never store or add floating-point dollars.
- **When a second mini-app needs a component or hook, move it to central `src/components`, `src/ui` or `src/hooks` in that same PR** and update the first app's imports. Never import across `src/apps/*`.
- **Utilities: share what's general, keep what isn't.** A helper that could serve other mini-apps goes in `src/utils` (or `src/components`) with a general name and general parameters (no app entities in its signature). A helper that only makes sense for one mini-app lives in that app's `utils/`.

### Invite / join / pending-request pattern
Any mini-app feature where one user requests access to a resource owned/shared by others (joining a household, a space, a group, etc.) must use this exact shape. It is not a per-app judgment call — Nine Lives and Worth the Wait both use it, and it's the only supported pattern for new apps.

**Collection shape — flat, sibling to the owning resource, never nested and never a `collectionGroup`:**
```
apps/{appId}/pendingRequests/{docId}
```
- Doc ID is the requester's own `uid` when a user can only ever hold one open request app-wide (e.g. a two-person space with a hard member cap).
- Doc ID is `{uid}_{resourceId}` when a user can legitimately hold concurrent requests to different resources (e.g. household invites, where nothing stops requesting to join several households at once).
- Never nest it under the resource (`.../households/{id}/pendingRequests/{uid}`) and never rely on a `{path=**}` wildcard rule or `collectionGroup()` query to read across resources. Flat + sibling makes "my requests" (`where('uid','==',me)`) and "requests for my resource" (`where('resourceId','==',id)`) both plain `COLLECTION`-scope queries — no wildcard security rule, no manual `firestore.indexes.json` entry, and no risk of one app's pending-request documents leaking into another app's `collectionGroup` results.

**Firestore rule for the collection — one block, no wildcard:**
- `allow create`: requester's own uid only, validated against the identity fields (uid, resourceId, any invite code) via a small helper function; require the target resource to `exist()` and require the requester is not already a member/participant.
- `allow read`: `request.auth.uid == <uid derived from the doc, from path or split()>` (covers `get()` on a not-yet-existing doc *and* satisfies list-safety for the "my requests" query) `||` (`resource != null && resource.data.uid == request.auth.uid`) `||` (`resource != null && isMemberOf(resource.data.resourceId)`) for the "requests for my resource" query.
- `allow delete`: requester (cancel) or an existing member/participant (decline) — same uid/membership checks as read.
- `allow update`: `false`. A pending request is created, read, and deleted — never patched.

**Client hooks — always build the pair, not just one side. Both sides are mandatory, not "one now, cancel later if wanted":**
- Requester-facing: "pending requests you've sent," backed by a query filtered on `uid`, **with a Remove/cancel action that deletes their own doc** — ship this in the same PR as approve/decline, not as a follow-up. If the doc ID is just `{uid}`, this can be a single `getDoc`/`onSnapshot(doc)` instead of a query.
- Owner-facing: "requests for my resource," backed by a query filtered on the resource id, with Accept/Decline actions.
- Approval must be one atomic `writeBatch`: add the uid to the resource's members/participants array *and* delete the pending-request doc in the same commit. Never do these as two separate writes.
- If the owning resource document carries anything sensitive (an encryption key, private content), pending state must live only in `pendingRequests` — never add a `pendingMember`/`pendingUid` field to the resource document itself, since that resource's own read rule would then have to loosen to let a not-yet-approved requester read it.

**Presence/derived-member pitfalls (found and fixed in this exact pattern — do not reintroduce):**
- Never fall back to a pending requester's uid when computing "the active member/partner" for presence, avatars, or online-status UI. Keep "who is pending" and "who is an active member" as two separate values; only the active-member value may feed `usePresence`/`useUserInfo`.
- Any hook that fans out into one listener per element of an array (e.g. one listener per box id, per member id) must treat a zero-length array as "loading complete, zero results" — not silently leave `loading` stuck `true` forever, since a zero-length array creates zero listeners and `setLoading(false)` never fires.
- Any hook that computes its listener/query key from a caller-supplied array (`useUserInfo`, `usePresence`, etc.) must key its effect on the array's *content* (e.g. `ids.join(',')`), never the array's object identity — callers frequently pass a freshly `.map()`'d/`.filter()`'d array each render, and identity-keyed effects will tear down and resubscribe every listener on every unrelated re-render.

### React and state patterns
- Avoid calling `setState` synchronously inside effects or render just to mirror props or derive values from current data.
- Prefer deriving values directly during render, or move the update into an event handler or computed value.
- Keep effects focused on async subscriptions or fetching rather than mirroring prop-driven state.

```tsx
// ❌ Bad: setting state in render or effect to follow prop-driven data
if (!userUid) {
  setSpace(null);
  setPendingMember(null);
}

useEffect(() => {
  if (!pendingMember?.uid) {
    setPendingUser(null);
    return;
  }

  // ...load user data
}, [pendingMember?.uid]);

// ✅ Better: derive or guard in render; keep effects for async subscriptions only
const hasPendingUser = Boolean(pendingMember?.uid);

useEffect(() => {
  if (!hasPendingUser) {
    return;
  }

  // ...load user data
}, [hasPendingUser, pendingMember?.uid]);
```

### Definition of done for a GitHub issue
- **Every checklist section in the issue is mandatory, not just the first one you reach.** An issue with separate `Success Criteria`, `CRUD & Entry-Point Requirements`, and `Documentation` checklists is not done when the first list is checked off — all of them are the acceptance criteria. Re-read the full issue body immediately before opening the PR and confirm each checkbox, not just the ones near the top.
- **A component that exists in the codebase but is never rendered from a screen a user can actually reach does not satisfy a "Create/Read/Update/Delete" or "browse/view" requirement.** Building `FooSection.tsx` is not the same as wiring it into a tab, route, or modal. If the issue names a specific entry point (e.g. "a dedicated tab on the cat details view, following the same pattern as X"), grep the target file (e.g. `CatDetailsModal.tsx`) and confirm the new tab/route is actually there before considering the work complete.
- If an issue has a `CRUD & Entry-Point Requirements` section, treat it as equally binding as `Success Criteria` — it exists specifically because "the store/actions/types are built" and "a user can actually use the feature end-to-end" have been two different, both-required outcomes on past issues in this repo.

### Documentation quality
- Keep the root `README.md` and relevant mini-app docs current and minimal whenever code or behavior changes.
- Preserve the existing structure and tone of existing docs; do not rewrite them into a different format or voice.
- Update, remove, or compress stale content instead of adding long commentary.
- **`functions/README.md` mirrors `functions/src/index.ts`:** every exported function has a row in its Functions table (trigger, app, purpose), and every secret or env var a function reads has a "Secrets and config" row. Update both in the same PR that adds, renames, removes or reconfigures a function. A new secret must exist in production before the PR merges, because CI deploys every function on merge and a missing secret fails the deploy.
- **A setup step every developer must repeat is a script, not a README instruction.** Build it into `package.json` (a script or a `pre*` hook, like the `preemulators*` hooks that compile `functions/lib/` before the emulators load it), then document the command.
- **The root `README.md` "Current apps" list mirrors `APP_REGISTRY`:** every app has one line (an emoji, its name, its registry description), added in the same PR that registers the app and updated whenever an app is renamed or its description changes.

### Critical reminders
- **No IIFEs — never self-invoke an anonymous function (`(() => {...})()`). Arrow functions passed as arguments (`.map()`, `onClick={() => ...}`, `setState((current) => ...)`) are normal and fine. See "No IIFEs" under Coding Styles.**
- **No loose `let` reassigned across branches and no accumulator `for` loops — use a returning function (early returns) and `.reduce`/`.map`/`.filter`/`Object.fromEntries`. See "Functions over loose variables" under Coding Styles.**
- **Template literals with `${` in `className` are FORBIDDEN.**
- **Always import and use `join` from `@moondreamsdev/dreamer-ui/utils`.**
- **Before writing any conditional className, ask: “Am I using `join()`?”**
- **Always prefer configured project aliases over relative paths.**
- **Treat time fields as timestamps, not strings.**
- **Keep Firestore rules and app data lifecycle logic aligned.**
- **Concurrent-write safety: `arrayUnion` for shared arrays, `runTransaction` for derived/own-key/cross-document writes, field-scoped `updateDoc` for edits — never `setDoc` a cached document back. See "Atomic writes" under Data and app patterns.**
- **Backwards compatibility: every new field must work on documents that don't have it yet (reader defaults, action backfill, rules `.get(field, default)`), proven against a legacy-shaped document in the emulator.**
- **Rules updated and verified in the same PR: allowed + denied write per touched role-sensitive rule, run against the emulator.**
- **Firestore document fields: no optional `?:` — required `T | null` keys, and always write `null` (never `undefined`) for an absent value.**
- **Never nest a bordered/`bg-card` container inside another one — pick one layer for the card treatment.**
- **A "Custom"/"Other" follow-up input only renders once that option is selected, never unconditionally.**
- **Large forms: essentials visible, the details the user's path depends on asked as visible `Pill` questions, only truly optional extras in chips, an Accordion or a Disclosure, and a form that can scroll on a phone is a drawer (`FormSheet`), never a long modal.**
- **Use `formatDateTime` from `src/utils/formatUtils.ts` for shared timestamp display formatting.**
- **Date-only values (anything written with `fromDateInputValue`) are UTC midnight — display them with `formatDateUTC`/`getDayLabel`, never `formatDate`/`formatDateTime`/local getters, and bound an instant against a date-only end date with `endDate + 1 day`. Grep the diff for `formatDate(` and `toLocaleDateString(` on any such field.**
- **In Firestore rules, move repeated assertions into helper functions.**
- **Keep the root README and mini-app docs current, concise, and aligned with the existing format and tone.**
- **Registering, renaming, or re-describing an app updates the root README's "Current apps" list (emoji, name, registry description) in the same PR.**
- **Invite/join flows: always use the flat, sibling `apps/{appId}/pendingRequests` collection pattern — never nested, never a `collectionGroup`. Ship the requester's own Remove/cancel action in the same PR as approve/decline, not as a later follow-up.**
- **A pending (not-yet-approved) requester must never be treated as an active member for presence, avatars, or reads of a resource document that carries sensitive data.**
- **Any Firestore `onSnapshot` belongs in `store/listeners/`, started once from a `useXSync` hook at the mini-app's top-level orchestrator (see `useNineLivesSync.ts` / `useWaypointSync.ts`) — never embedded inside a tab/panel/leaf component's own effect.**
- **Debounce with `@/hooks/useDebounce` (`useDebouncedValue` / `useDebouncedCallback`) and its shared `DEBOUNCE_MS` presets — never a hand-rolled `setTimeout` debounce or a per-file delay constant.**
- **Request/response calls (APIs, callables, one-off Firestore reads) use TanStack Query via a `queryOptions` factory in `lib/<feature>/<feature>Queries.ts` or `apps/<app>/queries/<resource>Queries.ts` — no hand-rolled fetch-in-useEffect caching.** Opt a query into offline persistence with `meta: { persist: true }` only when it isn't Firestore-backed and holds nothing sensitive.
- **A static option list (UI dropdown options, a role/status allowlist) used by more than one file is declared once, next to the type it constrains, and imported everywhere — never redeclared per file.**
- **Array-driven hooks (`useUserInfo`, `usePresence`, or similar) must key their effect on the array's content, not its identity.**
- **No raw `<button>`/`<input>`/`<select>`/`<textarea>` in `.tsx` files — always the matching Dreamer UI component, or `Form`/`FormFactories` for multi-field UI. Grep the diff for these tags before finishing any PR.**
- **`setState` inside a `useEffect` body or during render, to mirror props or derive values, is a bug — not a style nit. Derive the value during render or move the update into an event handler.**
- **An issue's checklist sections are all mandatory — a `CRUD & Entry-Point Requirements` section is not optional supplementary work. Before opening the PR, re-read the whole issue and confirm the new feature is actually wired into a reachable screen, not just present in the codebase.**
- **Every PR bumps `SITE_VERSION` (`src/lib/app/app.constants.ts`) — this is a checklist item, not optional. Forgetting it is an incomplete PR.**

## Coding Styles

### Core principles
- Use `export function ComponentName` (or `function ComponentName` + `export default ComponentName`) syntax instead of `React.FC` or arrow-function components.
- Prefer `interface` for component props and object contracts; use `type` only when an interface would not work, such as unions or computed/non-object shapes.
- Always store computed or returned values in variables before returning them for easier debugging and traceability.
- Prefer TypeScript optional properties with `?:` when a value may simply be absent, instead of `null` or `undefined` in object types whenever that absence is the normal state.
- Use `null` only when a runtime value genuinely needs to represent a nullable state, not just an absent field.
- Keep code readable and consistent with the existing project structure and existing app patterns.

```ts
// ✅ Prefer interface for props and shape contracts
interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

// ✅ Use type only when an interface cannot express the shape
type Status = 'idle' | 'loading' | 'success';
```

### Functions over loose variables
- Don't declare a `let` and then assign it in each branch of an `if`/`else if`/`else` chain (or a `switch`) to feed a later `return`. Put the branching in a small function whose branches `return` the value directly (early returns), then call it once and destructure or use the result. This is what keeps a component's branches, their data, and their handlers colocated in one place instead of scattered across mutated variables.
- Prefer expressions over statements for building values: `.reduce` over a `for` loop that pushes into or mutates an accumulator, `.map`/`.filter`/`.flatMap` over `for` + `push`, `Object.fromEntries` / `new Map(...)` / `new Set(...)` over manual insertion loops.
- Default to `const`. A `let` is only acceptable when a value genuinely must be reassigned over time (a counter inside a closure, a retry loop's state) and no returning function or reduce expresses it more compactly.
- Prefer compact, colocated code: keep a helper next to the single place that uses it (inside the component or the same file) rather than a separate file or abstraction, and don't split a short piece of logic across several one-use variables.

```tsx
// ❌ Bad: loose lets assigned per branch
let title = "You've been invited";
let actions = [];
if (!invite.exists) {
  title = 'Invite not found';
  actions = [closeAction];
} else if (membership) {
  title = "You're already in";
  actions = [closeAction, viewAction];
}

// ✅ Better: a returning function with early returns
const getView = () => {
  if (!invite.exists) return { title: 'Invite not found', actions: [closeAction] };
  if (membership) return { title: "You're already in", actions: [closeAction, viewAction] };
  return { title: "You've been invited", actions: [cancelAction, joinAction] };
};
const { title, actions } = getView();

// ❌ Bad: for loop accumulating a map
const byId: Record<string, Trip> = {};
for (const trip of trips) {
  byId[trip.id] = trip;
}

// ✅ Better
const byId = trips.reduce<Record<string, Trip>>((acc, trip) => ({ ...acc, [trip.id]: trip }), {});
```

### No IIFEs (self-invoking anonymous functions)
- Never write an anonymous function that is immediately invoked in place — `(() => { ... })()` or `(function () { ... })()`. If a JSX branch needs a computed value (a derived string, a `.find()` result, etc.), compute it as a local `const` in the enclosing scope instead of wrapping it in a self-invoking closure.
- This is narrowly about self-invocation, not arrow functions in general. **Arrow functions passed as arguments to another call remain the normal, idiomatic style** — `.map((item) => ...)`, `.filter(...)`, `onClick={() => doThing()}`, `setState((current) => ...)` are all fine and expected. Do not hoist these into named functions; that's a needless departure from how the rest of the codebase (and React generally) is written.
- If the value a `.map()` callback needs requires more than one expression, give the arrow function a block body (`(item, index) => { const x = ...; return <Row />; }`) rather than reaching for an IIFE inside an implicit-return arrow.

```tsx
// ❌ Anonymous function immediately invoked in place
{isEditing ? (
  <Input />
) : (
  (() => {
    const summary = [item.name, item.breed].filter(Boolean).join(' · ');
    return <p>{summary}</p>;
  })()
)}

// ✅ Compute the value as a local const in the enclosing arrow's block body
{items.map((item, index) => {
  const summary = [item.name, item.breed].filter(Boolean).join(' · ');
  return (
    <div key={index}>
      {isEditing ? <Input /> : <p>{summary}</p>}
    </div>
  );
})}

// ✅ Arrow functions as callback arguments are fine, no change needed
<Button onClick={() => toggleSection(section)}>Toggle</Button>
{items.map((item) => <Row key={item.id} onDelete={() => removeItem(item.id)} />)}
setSelections((current) => ({ ...current, saveAsRecord: !current.saveAsRecord }));
```

### Return-value debugging
- This applies to callbacks, computed values, complex expressions, and hook return values.
- Keep early returns readable, but when a value is derived, assign it to a local variable before returning it.

```tsx
// ❌ Hard to debug - direct return
const answeredCount = useMemo(() => {
  if (!selectedApartment) return 0;
  return allQuestions.filter(
    (q) => getAnswer(q.id, selectedApartment) !== '',
  ).length;
}, [allQuestions, selectedApartment, getAnswer]);

// ✅ Easy to debug - store in variable first
const answeredCount = useMemo(() => {
  if (!selectedApartment) return 0;

  const result = allQuestions.filter(
    (q) => getAnswer(q.id, selectedApartment) !== '',
  ).length;

  return result;
}, [allQuestions, selectedApartment, getAnswer]);

// ✅ Also for hook return values
export function usePresence(userIds: string[] | null) {
  const presence = useMemo(() => {
    if (!userIds || userIds.length === 0) {
      return null;
    }

    const result = userIds.map((id) => ({ id }));
    return result;
  }, [userIds]);

  return presence;
}
```

### Optional properties and nullish handling
- Prefer `email?: string` over `email: string | undefined` when the field is optional by definition.
- Prefer `displayName?: string` over `displayName: string | null` when the absence is just an omitted value.
- Use explicit `null` only when the runtime semantics truly require it.
- **Exception: Firestore document types.** For any type that models a Firestore document (or a nested object stored inside one), do the opposite — no `?:` optional keys; every field is required and typed `T | null`, with `null` written explicitly whenever the value is absent. See "Data and app patterns" above for why.

```ts
// ❌ Avoid when the field is optional by definition
type User = {
  email: string | null;
  displayName: string | undefined;
};

// ✅ Prefer optional properties when absence is the natural state
type User = {
  email?: string;
  displayName?: string;
};
```

### Styling and class names
- Use TailwindCSS exclusively.
- **Always** use `join` from `@moondreamsdev/dreamer-ui/utils` for conditional class names.
- **Never** use template literals with `${` in `className`; always use `join()` instead.
- Reuse existing styles and colors from `src/dreamer-ui.css` and `src/index.css` whenever applicable; do not modify them unless required.

```tsx
import { join } from '@moondreamsdev/dreamer-ui/utils';

export function Test({ variant, className }: TestProps) {
  return (
    <div
      className={join(
        'px-4 py-2 rounded',
        variant === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-secondary',
        className,
      )}
    >
      Click me
    </div>
  );
}
```

**❌ Never do this:**
```tsx
className={`base-class ${condition ? 'conditional-class' : ''}`}
className={`base-class ${isActive ? 'active' : 'inactive'}`}
```

**✅ Always do this:**
```tsx
className={join('base-class', condition && 'conditional-class')}
className={join('base-class', isActive ? 'active' : 'inactive')}
```

### Component library priority
- Check the repo's shared components first, then Dreamer UI, before creating custom components.
- **Before writing any UI behavior by hand, check two places in this order: the repo's shared components (`src/components`, `src/ui`), then Dreamer UI's exported components.** A shared component wins over the raw Dreamer UI one because it already carries this repo's fixes and conventions (`AppToggle` over `Toggle`). If one already does the job, use it — never re-implement it with `Button` + `useState` + a timeout. Examples: `AppToggle`, `UserAvatar`, `IconBadge`, `SectionHeader`, `DeleteIconButton` (shared); `CopyButton` for copy-to-clipboard with a copied state (Dreamer UI, `@moondreamsdev/dreamer-ui/components`). `grep` the repo for the behavior and skim `node_modules/@moondreamsdev/dreamer-ui/dist/src/components` before building it.
- Import from `@moondreamsdev/dreamer-ui/components`, `/hooks`, `/symbols`, and `/utils` when possible.
- Review existing Dreamer UI props before applying custom styling or behavior.
- **No raw HTML form/interactive elements.** Never write `<button>`, `<input>`, `<select>`, `<textarea>`, or `<a>` directly — always use the Dreamer UI equivalent (`Button`, `Input`, `Select`, `Textarea`, a `Button` with `href`). This applies even to small/internal-looking components (list-item toggles, filter chips, category pickers) — there is no size threshold under which raw HTML becomes acceptable.
- **Any UI that collects more than one or two fields must use the `Form` component with `FormFactories`** (`input`, `textarea`, `select`, `radio`, `checkbox`, `custom`, etc. from `@moondreamsdev/dreamer-ui/components`) instead of hand-rolled `useState` + raw elements. `FormFactories.custom` lets you embed a bespoke picker (search/filter list, calendar, etc.) as one field while still getting the shared value/validation/submit wiring. See `src/apps/nine-lives/components/VaccinationFormFields.tsx` (straightforward form) and `CatConditionFormFields.tsx` (a form with a `custom` field embedding a searchable library browser) for the pattern.
- Before submitting a PR, grep the diff for `<button`, `<input`, `<select`, and `<textarea` — any match on a `.tsx` file under `src/` is almost certainly a bug.
- **Use `AppToggle` (`@/components/AppToggle`), never the raw `Toggle` from Dreamer UI directly** — it patches a dark-mode thumb-contrast bug. Grep the diff for `Toggle` imported from `@moondreamsdev/dreamer-ui/components` to catch this.
- **Use a `Toggle`, not a `Checkbox`, for any control whose change takes effect immediately** (a live filter like "assigned to me", a "show archived" switch). Reserve `Checkbox` for values staged inside a form until submit, or for a to-do-style completion mark.

### Cards and layout density
- **Never nest a bordered/`bg-card` container inside another bordered/`bg-card` container.** Cards within cards read as visual clutter. Pick one layer to carry the card treatment (usually the smaller, most specific unit — e.g. a single list item) and let the parent section be plain (heading + spacing, no border/background) instead of also boxing it.
- Default to plainer layout — a heading, a divider (`divide-y`/`border-b`), or spacing — over a bordered card, especially for secondary/de-emphasized content. Reserve cards for content that should visually stand out as its own unit (a stat tile, a single record, a modal's content).
- Before adding another `rounded-lg border border-border bg-card p-4` wrapper, check whether it's already inside one — if so, drop it.

### Forms: custom/"other" inputs and progressive disclosure
- When a select-style field offers a "Custom"/"Other" option that needs a follow-up text input, only render that input once that option is actually selected — never show it unconditionally alongside the preset options. Model this as one composite field (a small component holding `{ preset, customValue }`) so the two are visually and logically tied together. See `src/apps/nine-lives/components/BreedField.tsx` for the pattern.
- For larger forms, don't dump every field into one flat, always-visible layout, and don't squeeze one into a modal: keep the essentials visible, ask the details the user's path depends on as visible questions, and tuck only truly optional extras behind "+ Add X" chips (`AddFieldChips`/`RemovableField`) or an `Accordion`/`Disclosure` (both from Dreamer UI). If it can scroll on a phone, it is a subview, not a modal. See `src/apps/waypoint/components/EventFormModal.tsx` (essentials, journey questions, then chips) and `src/apps/nine-lives/components/CatProfileForm.tsx` (essentials up top, an accordion of the rest).

### Avoid CRUD terminology in headers
- **Modal/section titles use a plain noun for the thing being edited, not the database verb** — "Expense", "Visit", "Clinic", "New cat", not "Add Expense"/"Edit Visit"/"Create Clinic". The same title applies whether the modal is creating or editing, since the object being worked on hasn't changed. See `src/apps/nine-lives/components/ExpenseFormModal.tsx` (`title={... ? 'Log an expense for this visit' : 'Expense'}`) and `VisitFormModal.tsx` (`title={showOutcome ? 'Complete visit' : 'Visit'}`) for the pattern — a contextual phrase is fine, a bare CRUD verb isn't.
- This is a title/heading rule, not a ban on the words anywhere — a primary action button (`Add expense`, `Save`) and a destructive confirm dialog (`useActionModal().confirm({ title: 'Delete visit', ... })`) still need to say plainly what will happen, since that clarity is safety-relevant. "Truly necessary" means: the reader needs the verb to understand the consequence of clicking, not just to locate the modal.
