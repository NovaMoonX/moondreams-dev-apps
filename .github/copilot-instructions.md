# GitHub AI Instructions for project

## Core project rules

### Quick reference
- Component syntax: `export function ComponentName` (or `function ComponentName` + `export default ComponentName`).
- **No IIFEs: never write an anonymous function that is immediately invoked in place (`(() => { ... })()`). Arrow functions passed as arguments to another call (`.map()`, `onClick={() => ...}`, etc.) are fine and idiomatic — the rule is about self-invoking anonymous functions, not callbacks.**
- **Class names: always use `join()` for conditionals; never use template literals in `className`.**
- Check Dreamer UI first before building custom UI.
- **Never write raw `<button>`, `<input>`, `<select>`, or `<textarea>` elements — use Dreamer UI's `Button`, `Input`, `Select`, `Textarea` (or the `Form`/`FormFactories` system for anything with more than one field) instead.**
- **Never call `setState` synchronously inside a `useEffect` body or during render to mirror props/derive values — see "React and state patterns" below.**
- Always use the project import aliases instead of relative paths when available.
- Follow the existing folder organization and keep responsibilities separated by feature, UI, hooks, context, routes, lib, and utils.
- Use shared date/time formatting helpers from `src/utils/formatUtils.ts` for timestamp display instead of inline `Date` formatting.
- When showing a user or member avatar in the UI, prefer the shared `UserAvatar` component from `src/ui/UserAvatar.tsx` instead of raw `Avatar` components.
- **Bump `SITE_VERSION` in `src/lib/app/app.constants.ts` on every PR that changes app code or behavior** — patch (`1.0.x`) for fixes/small tweaks, minor (`1.x.0`) for new features. It's the single site-wide version, shown in the corner badge and logged once on mount across every mini-app; it must never go stale.

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
- Do not add string-based or Firestore `Timestamp`-style values unless the feature truly requires them.
- Keep Firestore rules and app state lifecycle logic aligned when creating or updating lifecycle-related fields such as `createdBy`, `members`, `pendingRequests`, or invite codes.
- In Firestore rules, place repeated field assertions in helper functions instead of duplicating long inline checks inside `allow` expressions.
- **Every Firestore listener whose data is read anywhere other than the single component that owns it belongs in `store/listeners/` as a plain `startXListener(key, onChange)` function, started once from the mini-app's top-level orchestrator via a `useXSync` hook (Nine Lives' `useNineLivesSync.ts` is the reference implementation; Waypoint's `useWaypointSync.ts` follows the same shape) — never from inside a leaf/tab/panel component's own `useEffect`.** A leaf component (a tab, a panel inside a modal) mounts and unmounts far more often than the page around it — switching tabs, reopening the same trip/household — and an `onSnapshot` embedded there tears down and resubscribes on every one of those, instead of once per actual key change. The `useXSync` hook dispatches into a slice; the leaf component reads that slice with `useAppSelector` and has no listener of its own. Split listeners into tiers exactly like `useNineLivesSync.ts` does: one effect for data scoped to the signed-in user (not tied to any single open resource), a second for data scoped to whichever resource is currently open, keyed on that resource's id so it restarts only when the open resource actually changes.
- **A static option list consumed by more than one file (UI dropdown options, a validation allowlist) is declared exactly once and imported everywhere it's needed — never redeclared per file.** Put it next to the type it constrains (e.g. `ASSIGNABLE_MEMBER_ROLES`/`MEMBER_ROLE_LABELS` beside `UserRole` in `types.ts`) and derive UI `options` arrays from it at render time instead of hand-writing a parallel literal.
- **Firestore document field types are the exception to the "prefer optional `?:`" rule below: model every field on a Firestore-backed type as a required key typed `T | null` (no `?`), and always write an explicit `null` (never `undefined`, never an omitted key) when a value is absent.** `setDoc`/`updateDoc` reject fields explicitly set to `undefined`, and this repo's `firestore.rules` are written expecting the key to exist (e.g. `request.resource.data.phone == null || request.resource.data.phone is string`) — a missing key throws a rules-evaluation error, not a passing check. Do not reach for `ignoreUndefinedProperties` on the Firestore client as a workaround; fix the type and the value instead. `create*` action thunks that accept a `Partial<Entity>` from callers (so quick-create/partial UI flows can omit fields) must normalize every non-required field to `?? null` when assembling the final document before calling `setDoc`.

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

### Critical reminders
- **No IIFEs — never self-invoke an anonymous function (`(() => {...})()`). Arrow functions passed as arguments (`.map()`, `onClick={() => ...}`, `setState((current) => ...)`) are normal and fine. See "No IIFEs" under Coding Styles.**
- **Template literals with `${` in `className` are FORBIDDEN.**
- **Always import and use `join` from `@moondreamsdev/dreamer-ui/utils`.**
- **Before writing any conditional className, ask: “Am I using `join()`?”**
- **Always prefer configured project aliases over relative paths.**
- **Treat time fields as timestamps, not strings.**
- **Keep Firestore rules and app data lifecycle logic aligned.**
- **Firestore document fields: no optional `?:` — required `T | null` keys, and always write `null` (never `undefined`) for an absent value.**
- **Never nest a bordered/`bg-card` container inside another one — pick one layer for the card treatment.**
- **A "Custom"/"Other" follow-up input only renders once that option is selected, never unconditionally.**
- **Large forms: keep only essential fields always visible; put optional/secondary fields in an Accordion or Disclosure.**
- **Use `formatDateTime` from `src/utils/formatUtils.ts` for shared timestamp display formatting.**
- **In Firestore rules, move repeated assertions into helper functions.**
- **Keep the root README and mini-app docs current, concise, and aligned with the existing format and tone.**
- **Invite/join flows: always use the flat, sibling `apps/{appId}/pendingRequests` collection pattern — never nested, never a `collectionGroup`. Ship the requester's own Remove/cancel action in the same PR as approve/decline, not as a later follow-up.**
- **A pending (not-yet-approved) requester must never be treated as an active member for presence, avatars, or reads of a resource document that carries sensitive data.**
- **Any Firestore `onSnapshot` belongs in `store/listeners/`, started once from a `useXSync` hook at the mini-app's top-level orchestrator (see `useNineLivesSync.ts` / `useWaypointSync.ts`) — never embedded inside a tab/panel/leaf component's own effect.**
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
- Check Dreamer UI first before creating custom components.
- Import from `@moondreamsdev/dreamer-ui/components`, `/hooks`, `/symbols`, and `/utils` when possible.
- Review existing Dreamer UI props before applying custom styling or behavior.
- **No raw HTML form/interactive elements.** Never write `<button>`, `<input>`, `<select>`, `<textarea>`, or `<a>` directly — always use the Dreamer UI equivalent (`Button`, `Input`, `Select`, `Textarea`, a `Button` with `href`). This applies even to small/internal-looking components (list-item toggles, filter chips, category pickers) — there is no size threshold under which raw HTML becomes acceptable.
- **Any UI that collects more than one or two fields must use the `Form` component with `FormFactories`** (`input`, `textarea`, `select`, `radio`, `checkbox`, `custom`, etc. from `@moondreamsdev/dreamer-ui/components`) instead of hand-rolled `useState` + raw elements. `FormFactories.custom` lets you embed a bespoke picker (search/filter list, calendar, etc.) as one field while still getting the shared value/validation/submit wiring. See `src/apps/nine-lives/components/VaccinationFormFields.tsx` (straightforward form) and `CatConditionFormFields.tsx` (a form with a `custom` field embedding a searchable library browser) for the pattern.
- Before submitting a PR, grep the diff for `<button`, `<input`, `<select`, and `<textarea` — any match on a `.tsx` file under `src/` is almost certainly a bug.

### Cards and layout density
- **Never nest a bordered/`bg-card` container inside another bordered/`bg-card` container.** Cards within cards read as visual clutter. Pick one layer to carry the card treatment (usually the smaller, most specific unit — e.g. a single list item) and let the parent section be plain (heading + spacing, no border/background) instead of also boxing it.
- Default to plainer layout — a heading, a divider (`divide-y`/`border-b`), or spacing — over a bordered card, especially for secondary/de-emphasized content. Reserve cards for content that should visually stand out as its own unit (a stat tile, a single record, a modal's content).
- Before adding another `rounded-lg border border-border bg-card p-4` wrapper, check whether it's already inside one — if so, drop it.

### Forms: custom/"other" inputs and progressive disclosure
- When a select-style field offers a "Custom"/"Other" option that needs a follow-up text input, only render that input once that option is actually selected — never show it unconditionally alongside the preset options. Model this as one composite field (a small component holding `{ preset, customValue }`) so the two are visually and logically tied together. See `src/apps/nine-lives/components/BreedField.tsx` for the pattern.
- For larger forms, don't dump every field into one flat, always-visible layout — it overwhelms the user. Keep only the essential/required fields visible by default, and group optional/secondary fields into an `Accordion` or `Disclosure` (both from Dreamer UI) so the user can expand what's relevant to them. See `src/apps/nine-lives/components/CatProfileForm.tsx` for the pattern (essential fields up top, an accordion of "Origin & identification" / "Insurance" / "Key dates & notes" below).
