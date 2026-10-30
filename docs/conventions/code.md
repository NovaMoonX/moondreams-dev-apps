# Code

Part of the repo conventions (see `CLAUDE.md` "Read before you touch"). These files are the source of truth; nothing else keeps a copy.

## Shared helpers to reach for first

- Use the project import aliases instead of relative paths when available.
- Timestamp display goes through the shared date/time helpers in `src/utils/formatUtils.ts` (`formatDateTime` for a shared timestamp), never inline `Date` formatting.
- A user or member avatar is the shared `UserAvatar` (`src/ui/UserAvatar.tsx`), not a raw `Avatar`.
- Press and hold (with right-click and the context-menu key on a computer) is `@/hooks/useLongPress`, never a timer in a component.
- Debounce with `@/hooks/useDebounce` (`useDebouncedValue` / `useDebouncedCallback`) and its shared `DEBOUNCE_MS` presets, never a hand-rolled `setTimeout` debounce or a per-file delay constant.
- Component syntax is `export function ComponentName` (or `function ComponentName` + `export default ComponentName`).

## File structure and imports

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

## File structure

Follow the existing structure:
```text
src/
├── apps/       # Apps
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

## React and state patterns

- **Shareable screen state (which view, which item, which tab) lives in the URL via `nuqs`** (`NuqsAdapter` from `nuqs/adapters/react-router/v7` at the router root, `useQueryStates` with parsers declared beside the feature, wrapped in one `use<Feature>UrlState` hook with named actions). `push` for a step deeper (marked in `history.state` so Back can pop it; nuqs writes don't move `history.state.idx`), `replace` for peers, tabs and an overlay such as a sheet. Drafts stay in React state. See docs/conventions/state-data.md "State, data, and performance" and `src/screens/admin/useDashboardUrlState.ts`.
- **Never stack two tab bars (tab bar, thin content, tab bar).** One tab bar per screen; a phone shows a list that opens its detail, a wide screen a left panel beside it. See docs/conventions/design-ux.md "Design & UX".
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

## Coding styles

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
- Don't declare a `let` and then assign it in each branch of an `if`/`else if`/`else` chain (or a `switch`) to feed a later `return`. Put the branching in a small function whose branches `return` the value directly (early returns), then call it once and destructure or use the result. This is what keeps a component's branches, their data, and their handlers colocated instead of scattered across mutated variables.
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
- **Before writing any UI behavior by hand, check two places in this order: the repo's shared components (`src/components`, `src/ui`), then Dreamer UI's exported components.** A shared component wins over the raw Dreamer UI one because it already carries this repo's fixes and conventions (`AppToggle` over `Toggle`). If one already does the job, use it — never re-implement it with `Button` + `useState` + a timeout. Examples: `AppToggle`, `UserAvatar`, `IconBadge`, `SectionHeader`, `DeleteIconButton` (shared); `CopyTextButton` (`@/components/CopyTextButton`) for copy-to-clipboard with a copied state (it also works on plain-HTTP pages; Dreamer UI's `CopyButton` needs the Clipboard API and hands its `Button` a Fragment). `grep` the repo for the behavior and skim `node_modules/@moondreamsdev/dreamer-ui/dist/src/components` before building it.
- Import from `@moondreamsdev/dreamer-ui/components`, `/hooks`, `/symbols`, and `/utils` when possible.
- Review existing Dreamer UI props before applying custom styling or behavior.
- **No raw HTML form/interactive elements.** Never write `<button>`, `<input>`, `<select>`, `<textarea>`, or `<a>` directly — always use the Dreamer UI equivalent (`Button`, `Input`, `Select`, `Textarea`, a `Button` with `href`). This applies even to small/internal-looking components (list-item toggles, filter chips, category pickers) — there is no size threshold under which raw HTML becomes acceptable.
- **Any UI that collects more than one or two fields must use the `Form` component with `FormFactories`**, except a create form that asks one question at a time (`@/components/QuestionFlow`), which holds its answers in plain state because `Form` reads `initialData` once (`input`, `textarea`, `select`, `radio`, `checkbox`, `custom`, etc. from `@moondreamsdev/dreamer-ui/components`) instead of hand-rolled `useState` + raw elements. `FormFactories.custom` lets you embed a bespoke picker (search/filter list, calendar, etc.) as one field while still getting the shared value/validation/submit wiring. See `src/apps/nine-lives/components/VaccinationFormFields.tsx` (straightforward form) and `CatConditionFormFields.tsx` (a form with a `custom` field embedding a searchable library browser) for the pattern.
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
