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

This skill is also triggered automatically once a feature branch is pushed
and has a clean working tree, via a Stop hook
(`.claude/hooks/finish-feature-pr-stop.sh`, registered in
`.claude/settings.json`) that fires once per new HEAD commit. When entering
this way, do steps 0a/0b below before anything else, then continue with the
rest of step 0.

## 0. Orient

- **0a. Find or create the PR.** Look up whether an open pull request already
  exists for the current branch (list pull requests filtered by head branch —
  `gh pr view --json number,url,isDraft` if `gh` is available in this
  environment, otherwise the equivalent GitHub API/MCP call). If none exists,
  push the branch if it isn't already pushed, then open one as a **draft**
  pull request (never a ready-for-review PR — only open it non-draft if the
  user explicitly says to) with a title/body describing what's actually on
  the branch. If a PR already exists, use it as-is (don't flip an
  already-non-draft PR back to draft).
- **0b. Skip straight to step 1** when the PR was just created in 0a — there's
  no PR body, linked issue, or review comments yet to read. Otherwise
  continue below.
- Identify the PR (number or URL). `gh pr view <n> --json ...` for title,
  body, branch, mergeable state, base branch.
- Check out the PR's head branch locally (`gh pr checkout <n>` or manual
  fetch+checkout). Confirm `git status` is clean before touching anything.
- **After checking out, verify the branch is actually current before doing
  any fix work**: `git fetch origin <head-branch>` and compare `git
  rev-parse HEAD` against `git rev-parse origin/<head-branch>`. The coding
  agent can still be pushing commits (including its own conflict-resolution
  merges) right up to when you start, and diagnosing/fixing against a stale
  local checkout wastes work or reintroduces something already fixed
  upstream. If the remote has moved, re-pull/re-checkout before proceeding.
  If it's a long-running session, re-check this before step 1 as well, not
  just once at the very start.
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
- **A resolved conflict is not "done" until you've confirmed neither side's
  behavior regressed, not just that the merged code compiles.** Combining
  two sides' additions (e.g. two `allow update` branches folded into one
  `||` expression) is exactly the shape of edit that silently drops a
  clause or narrows an existing permission while looking correct at a
  glance. Give special weight to `firestore.rules`/`storage.rules` conflicts
  specifically — a dropped clause there doesn't fail loudly, it just starts
  denying (or, worse, allowing) writes that used to behave differently, and
  nothing in a typecheck or build catches that. After resolving, identify
  every pre-existing feature that touches the merged file(s) — not just the
  one this PR is about — and re-verify it in step 5's UI pass alongside the
  PR's own feature, not only the new behavior. Don't defer this to "someone
  will notice if it breaks."

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
- **Modal/section titles avoid CRUD terminology** — a plain noun for the
  thing being edited ("Expense", "Visit", "New cat"), not the database verb
  ("Add Expense", "Edit Visit", "Create Clinic"); the same title applies
  whether the modal is creating or editing. See `.github/copilot-instructions.md`'s
  "Avoid CRUD terminology in headers" section — the verb still belongs on
  the primary action button and on a destructive confirm dialog's title,
  since there the reader needs it to understand the consequence of
  clicking.
- Optional secondary fields use a "+ Add X" reveal-link, not "(optional)" in
  the label.
- A modal component that's always-mounted (visibility via an `isOpen` prop)
  needs `key={editingX?.id ?? 'new'}` at its call site or its internal
  `useState` goes stale across edit targets — this is a real, recurring bug
  in this codebase, not a hypothetical.
- Deletes go through `useActionModal().confirm(...)` with `destructive:
  true`, not a bare `window.confirm` or no confirmation at all.
- **A form modal's delete action belongs in the footer as an icon-only
  trash button on the bottom-left, never a "Delete" text button mixed in
  with Cancel/Save on the right.** Use the shared `DeleteIconButton`
  (`apps/waypoint/components/DeleteIconButton.tsx`, mirrored in
  `apps/nine-lives`) as `leftActions` of the shared `ModalFooterActions`
  (`leftActions`/`rightActions` props — `rightActions` holds Cancel then
  the primary submit button), not a `variant='destructive'` text `Button`
  stacked into the same `flex justify-end` row as Cancel/Save.
  `ChecklistItemFormModal.tsx` and `ExpenseFormModal.tsx` are the reference
  shape. Grep the diff for `variant='destructive'` on a text `Button` inside
  a form modal's footer to catch this.
- Use `AppToggle` (`@/components/AppToggle`), never the raw `Toggle` from
  Dreamer UI — grep the diff for `Toggle` imported from
  `@moondreamsdev/dreamer-ui/components`.
- Use a `Toggle`, not a `Checkbox`, for any control whose change takes effect
  immediately (a live filter, a "show archived" switch); keep `Checkbox` for
  form-staged values and to-do-style completion marks.
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
- **Every `useAppSelector` whose selector builds a new array or object
  (`.filter`, `.map`, a spread, an object literal, a `[]` fallback) must
  pass `shallowEqual` from `react-redux` as the second argument** — e.g.
  `useAppSelector(selectStaysForDay(i), shallowEqual)` — or come from a
  `createSelector`-memoized selector. Otherwise React Redux logs "Selector
  unknown returned a different result when called with the same
  parameters" and the component re-renders on every store change. Grep
  the diff for `useAppSelector(` and open each selector it calls; one that
  just returns a slice field or an existing item (`.find(...) ?? null`) is
  fine as-is.
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
  to the type it constrains — but in a sibling `constants.ts`, not `types.ts`
  itself (`types.ts` holds type/interface declarations only; runtime values
  belong in `constants.ts` — `src/apps/waypoint/constants.ts` is the
  reference shape) — and have every consumer import and derive from it.
- **An action thunk that reads a document, derives a new value for a field
  another action can also mutate concurrently (a shared map like `members`,
  a counter — anything read-modify-written rather than replaced outright),
  and writes it back must do the read and the write inside one
  `runTransaction`, not a `getDoc`/Redux-cache read followed by a separate
  `setDoc`/`updateDoc`/`writeBatch`.** The read-then-write shape loses
  silently under concurrency: two admins changing two different members'
  roles near-simultaneously can each read the same stale map, and the
  second write overwrites the first's change with no error surfaced to
  either user. `src/apps/waypoint/store/actions/membershipActions.ts`'s
  `changeRole`/`removeMember`/`approveJoinRequest` are the reference shape —
  always `transaction.get()` the document fresh inside the transaction,
  never from a Redux-cached copy read before the transaction started. Skip
  this for a thunk that only assigns literal caller-supplied values to
  disjoint scalar fields (e.g. editing a title or toggling an archived
  flag) — nothing is derived from the field's prior value, so there's
  nothing for a race to lose.
- **Audit every comment in the diff — the coding agent's and any you add
  yourself while working this session — not just the code.** Default is
  zero comments. A comment describing what code does (restating a
  param/field name in prose, explaining what a function call or pattern
  accomplishes) is noise, even when accurate and short, as long as a
  reader who knows the language/platform can infer that from the code
  itself. A comment earns its place only when the *process* doesn't make
  sense on its own even to that reader — a hidden constraint, a workaround
  for a specific bug, a non-obvious invariant, a reason the approach isn't
  the one a reader would expect. That bar is rarely cleared. Delete
  anything that doesn't clear it, cap what survives at 3 lines, and strip
  any mention of a specific app/file/function name from what's left (see
  the comment-necessity memory). Do this pass on every file touched this
  session, not just the ones inherited from the coding agent or the ones
  with an obvious CRUD/UX issue — re-check it right before wrap-up, since a
  fix added late in the session is easy to skip.

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
- **This same pass must also re-drive every pre-existing feature that
  touches a file this session's merge/edits changed — not just the PR's own
  feature.** If step 1 found conflicts in `firestore.rules`, drive the
  other features gated by the rules you touched (a sibling `allow update`
  branch, a different collection's rule sharing a helper function) to
  confirm they still behave the same as before the merge — seed whatever
  data state that requires (a second trip, a second household member, a
  pending request alongside an existing member) rather than skipping the
  check because the seed data doesn't happen to cover it yet. Treat "the
  new feature works" and "nothing else regressed" as two separate things to
  verify, not one — a change that visibly adds the new behavior can still
  silently narrow or drop an existing `allow` clause it was merged next to.
  For anything hard to reach through the UI (a security-rule denial, an
  atomicity/race guarantee), verify it directly against the rules/Firestore
  emulator instead of only trusting what renders on screen — e.g. a raw
  REST write against the emulator to confirm a write is actually rejected,
  not just that no button for it exists in the UI.

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
