---
name: finish-feature-pr
description: Take an in-progress feature PR in this repo (usually a Copilot-authored coding-agent PR) the rest of the way to mergeable — resolve conflicts with main, correct entry points and CRUD/UX gaps, sync Firestore/Storage rules with the data model, add seed data, and validate. Use when the user says "finish PR #NNN", "get this PR ready to merge", or points at a stale/incomplete PR link.
---

# Finish a feature PR

This repo regularly gets feature branches from an automated coding agent that
are functionally plausible but incomplete: merge conflicts with `main`,
features bolted onto the wrong UI location, missing seed data, and rules that
don't match the final data model. This skill is the checklist for taking one
of those branches to an actually-mergeable state — not just "compiles."

Run every step below. Don't skip validation because the diff "looks right."

## 0. Orient

- Identify the PR (number or URL). `gh pr view <n> --json ...` for title,
  body, branch, mergeable state, base branch.
- Check out the PR's head branch locally (`gh pr checkout <n>` or manual
  fetch+checkout). Confirm `git status` is clean before touching anything.
- Read the PR body and the linked issue (`Fixes #NN`) to recover original
  intent — but treat both as a starting point, not ground truth. The user's
  live instructions in this conversation always win over what the PR body
  says the feature should do.
- **Fetch every review comment before touching code**: `gh api
  repos/<owner>/<repo>/pulls/<n>/comments --paginate`. These are almost
  always the repo owner's own line-level feedback on the coding agent's
  work — not optional style nits, but requirements you haven't seen yet.
  Read every one and its file/line context before planning the rest of the
  pass; they routinely call for real design/UX changes (e.g. "allow
  proposing more than one X", "use the existing Y component instead of
  reinventing it", "this needs an edit-mode, not always-editable fields")
  that are easy to miss just by reading the diff. Treat each comment as a
  requirement to implement, not a suggestion to weigh — if a comment turns
  out to be out of scope or superseded, say so explicitly in the wrap-up
  rather than silently skipping it.

## 1. Resolve merge conflicts with main

- `git fetch origin main && git merge origin/main`. Do this even if the
  branch's `git status`/PR mergeable-state already looks clean — "clean
  right now" only means clean as of whenever the branch was last synced,
  not as of this moment, and running this once at the start of a long
  session doesn't cover changes main picks up mid-session.
- Where main and the branch both touched the same shared file (household
  sync hooks, `selectors.ts`, `types.ts`, `store/index.ts` are the recurring
  offenders in this codebase because every feature wires into the same few
  files), resolve by combining both sides' additions — don't just pick one.
  Read both halves of the conflict before resolving; a hook or selector
  conflict here usually means two independent features each added their own
  listener/selector and both need to survive.
- Rebuild and typecheck after resolving (see step 5) before moving on.

## 2. Fix entry points and placement

Nine Lives features are either:
- **Household-level sections** rendered directly in `NineLives.tsx`, each
  wrapped in `DetailsDisclosure` (see `ClinicsSection.tsx`, `ExpensesSection.tsx`)
  and using a household-scoped Firestore collection
  (`apps/nine-lives/households/{householdId}/{collection}/{id}`), synced via
  `useNineLivesSync.ts`.
- **Cat-scoped tabs** inside `CatDetailsModal.tsx`, backed by a
  `households/{householdId}/cats/{catId}/{collection}` subcollection, synced
  via `useCatDetailSync.ts`.

Check what the user actually asked for. If a feature was implemented as a cat
details tab but should be its own top-level section (this has happened with
both Expenses and Health Records), migrating means:

- Move the Firestore collection from per-cat to flat household-level (or
  vice versa), updating every action/listener/selector that references it.
- If the entity should attach to multiple cats, change `catId: string` to
  `catIds: string[]` on the type, and thread that through actions (create
  dedupes with `Array.from(new Set(...))`), the form (a `FormFactories.checkboxGroup`
  field, first in the form, options built from `selectCatsByHousehold`), the
  list view (resolve cat names for display), and the Firestore rule (`catIds
  is list && catIds.size() > 0` instead of an `== catId` identity check).
- Remove the old tab/trigger from `CatDetailsModal.tsx` and wire the new
  section into `NineLives.tsx` at the position the user specified (read the
  existing section order — Visits, Expenses, Vet Clinics are the established
  anchors to place something "under" or "at the bottom").

## 3. Audit CRUD + UX against established conventions

Don't just confirm Create/Read/Update/Delete all technically exist — check
they match this codebase's established patterns, since the coding agent
regularly gets the shape right but the UX wrong:

- Submit buttons disable until required fields are valid, rather than
  showing required-field asterisks (check `onDataChange` + `isValid` state
  in sibling form modals for the current convention).
- Optional secondary fields use a "+ Add X" reveal-link, not "(optional)" in
  the label.
- A modal component that's always-mounted (visibility via an `isOpen` prop)
  needs `key={editingX?.id ?? 'new'}` at its call site or its internal
  `useState` goes stale across edit targets — this is a real, recurring bug
  in this codebase, not a hypothetical.
- Deletes go through `useActionModal().confirm(...)` with `destructive:
  true`, not a bare `window.confirm` or no confirmation at all.
- **Any Firestore listener the coding agent wrote directly inside a leaf
  component's `useEffect` — a tab, a panel inside a modal, anything that
  isn't the mini-app's single top-level orchestrator — is a bug, not a
  style preference.** That component mounts/unmounts every time its tab or
  panel opens and closes, so the listener tears down and resubscribes on
  every one of those instead of once per actual key change. Move it into
  `store/listeners/` as a plain `startXListener(key, onChange)` function,
  dispatched from a `useXSync` hook called once at the top-level page
  (`useNineLivesSync.ts` is the reference shape: one effect for data scoped
  to the signed-in user, a second for data scoped to whichever resource is
  currently open, each keyed only on the id it actually depends on). The
  leaf component becomes a pure `useAppSelector` reader with no listener of
  its own — grep the diff for `onSnapshot(` outside `store/listeners/` to
  catch this.
- **A pending-request/invite feature that ships approve/decline but not a
  requester-side cancel/withdraw action is incomplete**, even if the
  original issue didn't call it out — `.github/copilot-instructions.md`'s
  Invite/join/pending-request pattern requires both sides in the same PR.
  Add the Remove/cancel action (delete the requester's own doc, confirm
  destructive) rather than leaving it for a follow-up issue.
- **A static option list (UI dropdown options, a role/status allowlist)
  declared separately in more than one file is a duplication bug.** Grep for
  the option values (e.g. `'EDITOR'`, `'COMMENTER'`) across the feature's
  files; if more than one file hand-writes the same list, hoist it once next
  to the type it constrains (typically `types.ts`) and have every consumer
  import and derive from it.

## 4. Sync Firestore + Storage rules with the final data model

- `firestore.rules`: identity check matches the collection's actual path
  (flat household-level docs check `householdId`, not a removed `catId`
  path segment). Shape validation covers every field on the type, using this
  repo's `T | null` convention (never `undefined`) — see the memory on this.
  Immutable-fields check only truly immutable fields (id, householdId,
  createdBy, createdAt, file metadata) — don't accidentally lock a field the
  UI needs to let users edit (e.g. a stop/resume date).
- `storage.rules`: file paths mirror wherever the Firestore doc actually
  lives now — if you flattened a collection from per-cat to household-level,
  flatten the matching Storage path too.
- `firestore.indexes.json`: remove indexes for queries that no longer exist
  (e.g. a `collectionGroup` index left over after reverting to a per-cat
  listener); add any new composite index a new query actually needs.
- Never introduce a global `match /{path=**}/X` rule for something that's
  properly scoped under an app path — that's a known anti-pattern flagged in
  this repo before. Prefer a body-check (`resource.data.householdId ==
  householdId`) over a global collectionGroup match unless there's a real,
  currently-implemented cross-cat/cross-household query that needs it.

## 5. Validate

- `npx tsc -b --force` (or `npm run build`) — **not** `tsc --noEmit -p .`,
  which silently checks nothing against this repo's solution-style root
  `tsconfig.json`. Fix every error this surfaces; don't assume a looser
  check that passed earlier means the code is clean.
- Update `scripts/seeds/nineLives.ts` to cover the feature: at least one
  multi-attachment example if the entity supports multiple cats, matching
  the batch-write loop pattern used by sibling collections (`expenses`,
  `visits`). Update the `firestoreDocuments` count at the bottom of the seed
  function.
- Run the app against the local Firebase Emulator Suite and actually drive
  the feature end-to-end (add/edit/delete, filters, totals) via a throwaway
  Playwright script signed in as the "Taylor" dev fixture — see the `run`
  skill's driving guidance. Delete the script when done. A passing typecheck
  is not evidence the feature works; only driving it is.

## 6. Wrap up

- **Re-sync with main immediately before this step, every time** —
  `git fetch origin main && git merge origin/main` again, exactly like
  step 1, resolving any new conflicts the same way. This skill's steps can
  span a long session (research, multiple rounds of user feedback,
  emulator testing); main can pick up new commits during that time, and
  step 1's sync only covers what existed when the session started. Do not
  skip this because step 1 already ran once — treat every push in this
  skill as needing a fresh sync first, not just the first one.
- **Bump `SITE_VERSION` in `src/lib/app/app.constants.ts` — check this
  before every commit in this skill, not just the first.** It's a
  site-wide, single-source version bumped on every PR that changes app
  code or behavior; this is a checklist item per
  `.github/copilot-instructions.md`'s Critical reminders, not optional.
  `grep SITE_VERSION src/lib/app/app.constants.ts` to see the current
  value first. Patch (`1.0.x`) for a fix or small tweak; minor (`1.x.0`)
  for a feature — finishing an in-progress feature PR (which is what this
  skill does) is a minor bump, even when the individual commit is "just"
  a bug fix or refactor on top of it. If this skill produces more than one
  commit on the branch, bump once, in the first commit that changes app
  code — don't re-bump per commit.
- Commit with a message describing the actual end state, not the original
  PR title if it no longer matches.
- Push to the PR's branch.
- Update the PR body (`gh api repos/<owner>/<repo>/pulls/<n> -X PATCH -f
  body="..."` — `gh pr edit --body-file` can fail on unrelated GraphQL
  errors like a deprecated Projects-classic field; fall back to the REST API
  if it does) so it reflects what's actually in the branch now, not the
  agent's original plan.
- Resolve every review comment thread you addressed. Comments from the repo
  owner don't need a reply — just resolve the thread once the code change is
  in. Resolving is a GraphQL mutation, not the REST comments endpoint:
  first get each thread's node id (`gh api graphql -f query='query { repository(owner:"<owner>", name:"<repo>") { pullRequest(number: <n>) { reviewThreads(first: 100) { nodes { id isResolved comments(first: 1) { nodes { body path line } } } } } } }'`),
  then `gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "<id>" }) { thread { isResolved } } }'`
  for each thread whose comment you actually acted on. Never resolve a
  thread you didn't address, and never resolve by replying and walking
  away — the code has to actually change first.
