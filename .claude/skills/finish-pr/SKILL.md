---
name: finish-pr
description: "Drive an open PR (esp. Copilot-authored ones) to a genuinely mergeable state: verify CRUD completeness, entry points, design/UI conventions, copilot-instructions.md compliance, and seed data, fix what's missing, run all verification, and push/update the PR. Use when the user says \"finish this PR\", \"drive PR #N to execution\", or asks to close out a Copilot agent PR."
---

# Finish PR

This repo's Copilot coding-agent PRs routinely satisfy the first checklist in an
issue (e.g. `Success Criteria`) while silently skipping later ones (`CRUD &
Entry-Point Requirements`, `Documentation`) — see
`.github/copilot-instructions.md`'s "Definition of done for a GitHub issue" and
the `copilot_instructions_reinforcement` memory. Never trust the PR description
or the issue's checked boxes at face value. Verify each claim by reading the
actual diff and grepping the target files.

## Inputs

The user gives a PR number or URL (e.g. `#78`). Resolve it with:

```
gh pr view <N> --json title,body,headRefName,baseRefName,number,url,state,files
```

Find the linked issue (look for `Fixes #N`/`Closes #N` in the body, or ask if
absent) and read it in full:

```
gh issue view <N> --json title,body,labels
```

## Procedure

Work directly on the PR's branch. If the current working tree has uncommitted
work unrelated to this PR, use a worktree (`EnterWorktree` / `git worktree
add`) instead of switching the main checkout out from under it.

```
git fetch origin <headRefName>
git checkout <headRefName>   # or worktree add if the main tree is dirty
```

### 1. Re-read the issue as the acceptance criteria, not the PR body

Every checklist section in the issue is mandatory (Success Criteria, CRUD &
Entry-Point Requirements, Documentation, rules/seed notes, etc — whatever
sections exist). Build a literal checklist from the issue text before touching
code.

### 2. CRUD completeness

For every entity the issue introduces or touches, confirm Create, Read,
Update, and Delete all exist where the issue implies they should — not just
the ones exercised by the happy-path demo in the PR description. Check:
- A store/actions layer (`createAsyncThunk` thunks in this repo's
  `*Actions.ts` files) for each operation the issue calls for.
- A listener/selector wired into the relevant `store/index.ts` and
  `selectors.ts` so data actually reaches the UI.
- Firestore rules covering each operation (`allow create/read/update/delete`),
  not just `read`/`create`.

### 3. Entry points — the "built but unreachable" trap

A component that exists but is never rendered from a screen a user can reach
does **not** satisfy the requirement. For each new component/section named or
implied by the issue:
- `grep` the parent screen/modal/tab file the issue names (e.g.
  `CatDetailsModal.tsx`) and confirm the new tab, route, button, or section is
  actually rendered there, not just imported-and-unused or built in isolation.
- If the issue says "a dedicated tab on X, following the same pattern as Y",
  diff the new tab's wiring against Y's wiring line by line.
- Confirm delete/cancel/edit affordances the issue asks for are reachable from
  the UI, not just implemented as an unused action creator.

### 4. Design and coding conventions (`.github/copilot-instructions.md`)

Grep the full diff for violations — do not rely on skimming:
- `grep -n '<button\|<input\|<select\|<textarea' <changed .tsx files>` — must
  be empty. Same elements must use Dreamer UI (`Button`, `Input`, `Select`,
  `Textarea`) or `Form`/`FormFactories` for multi-field UI.
- `grep -n 'className={\`' <changed files>` — must be empty; conditional
  classNames must use `join()` from `@moondreamsdev/dreamer-ui/utils`.
- Firestore-backed types: every field required and typed `T | null`, no `?:`,
  explicit `null` writes (never `undefined`, never an omitted key).
- No `setState` synchronously inside a `useEffect` body or render to mirror
  props/derive values.
- No bordered/`bg-card` container nested inside another one.
- Array-driven hooks (`useUserInfo`, `usePresence`-style) key their effect on
  array *content* (`ids.join(',')`), not identity.
- Invite/join/pending-request features use the flat, sibling
  `apps/{appId}/pendingRequests` shape — never nested, never
  `collectionGroup`.
- Import aliases (`@/`, `@apps/`, `@lib/`, etc.) used instead of relative
  `../` paths where the target is inside the aliased tree.
- Large forms: essential fields visible, optional/secondary fields in an
  `Accordion`/`Disclosure`.

### 5. Seeded data

If the feature adds new Firestore-backed entities or fields that the seed
scripts should populate for local dev/testing, check `scripts/seed.ts` (and
its per-app scope) for whether it needs a new seed generator or field
addition. Not every PR needs this — only when the new data type is core to
exercising the feature locally (e.g. a new top-level entity like visits,
conditions, vaccinations). If it's missing and warranted, add it; if the issue
or existing seed scope doesn't call for it, don't invent scope.

### 6. Documentation

Update the root `README.md` and the relevant mini-app's `README.md`/
`TECHNICAL.md`/`ISSUES.md` to reflect the new feature, matching existing tone
and structure — compress/replace stale content rather than appending
commentary.

### 7. Verify

Run, in order, fixing anything that fails before moving on:

```
npx tsc --noEmit -p .
npm run lint
npx prettier --check <changed files>
npm run build
```

If the feature touches Firestore rules, validate them against the emulator
(`firebase emulators:exec --only firestore,auth "echo ok"` at minimum, or a
scoped scenario test if one exists).

### 8. Commit, push, update the PR

Commit fixes in logically separate commits (don't squash unrelated fixes
together). Push to the PR's existing branch — do not open a new PR for an
existing one. After pushing, update the PR body/description if the checklist
state changed meaningfully (e.g. note what was added: "Wired X into Y's
details tab", "Added delete Firestore rule", "Added seed data for Z"). Leave
a review comment or PR comment summarizing what was verified and what was
fixed, so the record shows this wasn't just a rubber-stamp.

### 9. Final report

Report back a concrete checklist: what was already correct, what was missing
and fixed, and what (if anything) remains for the user to decide (e.g. a
product/UX call, or a manual step like GCP IAM). Do not claim "done" on any
item you did not verify by reading code or running a command.
