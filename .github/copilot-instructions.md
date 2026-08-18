# GitHub AI Instructions for project

## Core project rules

### Quick reference
- Component syntax: `export function ComponentName` (or `function ComponentName` + `export default ComponentName`).
- **Class names: always use `join()` for conditionals; never use template literals in `className`.**
- Check Dreamer UI first before building custom UI.
- Always use the project import aliases instead of relative paths when available.
- Follow the existing folder organization and keep responsibilities separated by feature, UI, hooks, context, routes, lib, and utils.

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

### Documentation quality
- Keep the root `README.md` and relevant mini-app docs current and minimal whenever code or behavior changes.
- Preserve the existing structure and tone of existing docs; do not rewrite them into a different format or voice.
- Update, remove, or compress stale content instead of adding long commentary.

### Critical reminders
- **Template literals with `${` in `className` are FORBIDDEN.**
- **Always import and use `join` from `@moondreamsdev/dreamer-ui/utils`.**
- **Before writing any conditional className, ask: “Am I using `join()`?”**
- **Always prefer configured project aliases over relative paths.**
- **Treat time fields as timestamps, not strings.**
- **Keep Firestore rules and app data lifecycle logic aligned.**
- **Keep the root README and mini-app docs current, concise, and aligned with the existing format and tone.**

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
