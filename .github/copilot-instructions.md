# GitHub AI Instructions for project

## Core Development Rules

### 1. Component Creation
- Use `export function ComponentName` syntax (NOT `React.FC` or arrow functions)

### 2. Return Value Debugging
- Always store return values in variables before returning them for easier debugging
- This applies to all callbacks, computed values, and complex expressions

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
```

### 3. Styling & Class Names
- Use TailwindCSS exclusively
- **ALWAYS** use `join` from `@moondreamsdev/dreamer-ui/utils` for conditional class names
- **NEVER** use template literals with `${` for className - always use `join()` instead
- Use existing styles and colors from `src/dreamer-ui.css` and `src/index.css` when applicable (do not modify them)

```tsx
import { join } from '@moondreamsdev/dreamer-ui/utils';

export function Test({ variant, className }: TestProps) {
  return (
    <div 
      className={join(
        'px-4 py-2 rounded',
        variant === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-secondary',
        className
      )}
    >
      Click me
    </div>
  );
}
```

**❌ NEVER DO THIS:**
```tsx
// Bad - template literals for conditional classes
className={`base-class ${condition ? 'conditional-class' : ''}`}
className={`base-class ${isActive ? 'active' : 'inactive'}`}
```

**✅ ALWAYS DO THIS:**
```tsx
// Good - use join() for all conditional classes
className={join('base-class', condition && 'conditional-class')}
className={join('base-class', isActive ? 'active' : 'inactive')}
```

### 4. Component Library Priority
- Always check Dreamer UI first before creating custom components
- Import from `@moondreamsdev/dreamer-ui/components`, `/hooks`, `/symbols`, `/utils`
- Always check existing props of Dream UI components before setting custom styles

### 5. File Structure
Follow the existing structure:
```
src/
├── apps/       # Mini-apps
├── components/ # Reusable UI components
├── contexts/   # React context providers (Should always import the context from its hook file)
  ├── AuthContext.tsx  # Auth context provider
├── hooks/      # Custom React hooks (should always declare the context they use)
├── lib/        # Utilities and constants
├── routes/     # Router configuration
  ├── AppRoutes.tsx  # Main app router
├── screens/    # Page/route components

├── store/      # State management (i.e. Redux store)
├── styles/     # Additional CSS/styling files
├── ui/         # Layout and core UI components
  ├── Home.tsx   # Home page component
  ├── Layout.tsx # Main layout component
├── utils/      # Utility functions
├── App.tsx     # Main app entry point w/ providers
```

### 6. Import Patterns
```tsx
// Dreamer UI imports
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useTheme } from '@moondreamsdev/dreamer-ui/hooks';

// Project imports using aliases
import { APP_TITLE } from '@lib/app';
import Layout from '@ui/Layout';
import { router } from '@routes/AppRoutes';
import MyComponent from '@components/MyComponent';
import { useCustomHook } from '@hooks/useCustomHook';
import { MyContext } from '@contexts/MyContext';
import { store } from '@store';
import { helper } from '@utils/helper';
```

### 7. Available Import Aliases
- `@/` → `src/`
- `@apps/` → `src/apps/`
- `@components/` → `src/components/`
- `@contexts/` → `src/contexts/`
- `@hooks/` → `src/hooks/`
- `@lib/` → `src/lib/`
- `@routes/` → `src/routes/`
- `@screens/` → `src/screens/`
- `@store/` → `src/store/`
- `@styles/` → `src/styles/`
- `@ui/` → `src/ui/`
- `@utils/` → `src/utils/`

## Quick Reference
- Component syntax: `export function ComponentName`
- **Class names: ALWAYS use `join()` for conditionals - NEVER template literals**
- Check Dreamer UI first
- Use import aliases: `@components/`, `@hooks/`, `@lib/`, `@apps/`, `@ui/`, etc.
- Follow structured folder organization with proper separation of concerns

### 8. App Data Must Be Namespaced Per Mini-App
- Keep each mini-app’s data isolated under its own namespace, such as `apps/worth-the-wait/...`, instead of relying on a generic or shared app path when the app is known.
- For app-specific state, prefer the official collection path for that mini-app and keep other mini-app data separate to avoid cross-app collisions and rule drift.
- Shared user profiles belong in the global `users` collection and should be resolved by `uid` when a mini-app needs display data or avatar metadata.

### 9. Timestamp Handling Across Mini-Apps
- Treat time fields as real timestamps in milliseconds as numbers, not plain strings or JS date strings in app state.
- Use `Date.now()` for new timestamp values unless a real server-generated timestamp is required by the platform.
- Keep app-side type shapes and Firestore data contracts aligned so `createdAt`, `updatedAt`, and request timestamps use consistent millisecond-number semantics in the client.
- Do not add string-based or Firestore `Timestamp`-style values unless the feature truly requires them.

### 10. Firestore Rules and App State Must Stay in Sync
- When a mini-app uses lifecycle state such as created-by, members, pending requests, or invite codes, the Firestore rules should reflect that same behavior.
- If the app writes a doc with a lifecycle field, the rules should allow only the matching valid transitions.
- Do not let app code and Firestore rules drift apart; if a write pattern changes in code, update the rules to reflect the same contract.
- Keep equality checks, membership checks, and pending-state transitions consistent with the app’s actual flow.

### 11. Avoid `setState` Synchronously Inside Effects or Render
- Do not call `setState` inside `useEffect` or during render just to mirror props or derive values from current data. This is a common React anti-pattern and often triggers the "state update during render/effect cycle" warning or cascading re-renders.
- Prefer deriving the value directly during render, or move the state update to event handlers or computed values.
- A hook or component should not do things like `if (!userUid) { setSpace(null); setPendingMember(null); }` during render. That is forbidden.
- Reference: React docs on avoiding unnecessary effects: https://react.dev/learn/you-might-not-need-an-effect

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

- Rule of thumb: if the value can be computed from the current props or a boolean guard, compute it in render; if it depends on async data, keep the effect focused on fetching or subscribing, not synchronizing local state from a prop.

## ⚠️ Critical Reminders
- **Template literals with `${` in className are FORBIDDEN**
- **Always import and use `join` from `@moondreamsdev/dreamer-ui/utils`**
- **Before writing any conditional className, ask: "Am I using join()?"**
- **Treat time fields as timestamps, not strings**
- **Keep Firestore rules and app data lifecycle logic aligned**
