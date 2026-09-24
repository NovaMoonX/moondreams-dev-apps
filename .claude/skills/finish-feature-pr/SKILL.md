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

Run every step below. Don't skip validation because the diff "looks right." Coding standards live in `CLAUDE.md` at the repo root — read it first.

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

Confirm the feature is wired into a screen a user can actually reach, at the
location the request specified — a component that exists but is never rendered
doesn't satisfy a CRUD/browse requirement. For Nine Lives placement (household
section vs cat-scoped tab, `catId` → `catIds`, migrating collections), follow
"Nine Lives placement" in `CLAUDE.md`.

## 3. Audit against CLAUDE.md

`CLAUDE.md` (repo root) is the single source of truth for coding style and
norms, and it imports `.github/copilot-instructions.md`. Read it before this
step and audit the whole diff against it — don't rely on memory of the rules.
This checklist names the sections to walk; the rules themselves live there:

- **Code style** — functions over loose `let`/`for` accumulators, comment
  audit (do it on every file touched this session, including your own edits,
  and re-check right before wrap-up), no IIFEs, no setState-in-effect, Dreamer
  UI components, `AppToggle`, toggle-vs-checkbox.
- **Forms, modals, and CRUD conventions** — noun titles, submit disabling,
  reveal links, `key` on modals, confirm dialogs, delete icon placement,
  requester-side cancel on pending-request features, single-declaration
  option lists.
- **State, data, and performance** — listeners in `store/listeners/`,
  TanStack Query, `persist: true` audit, `shallowEqual`, transactions for
  read-modify-write. Grep the diff for `onSnapshot(`, `fetch(`,
  `httpsCallable(`, `getDoc`/`getDocs`, `persist: true`, `useAppSelector(`,
  `variant='destructive'`, `Toggle`, `let `, and `for (` to catch violations.
- **Dates** — grep the diff for `formatDate(`, `formatDateTime(`,
  `toLocaleDateString(`, and local getters (`getDate()`, `getMonth()`,
  `getFullYear()`) applied to a date-only field (anything written with
  `fromDateInputValue`); those need `formatDateUTC`/`getDayLabel`/`getUTC*`.
  Check any instant-vs-end-date comparison uses `endDate + 1 day`.

## 4. Sync Firestore + Storage rules with the final data model

Walk "Firestore and Storage rules" in `CLAUDE.md` against every rule, index,
and Storage path the diff touches or should have touched.

## 5. Validate

Follow "Validation" in `CLAUDE.md`: `npx tsc -b --force` and `npx eslint .`,
update the mini-app seed, drive the feature end-to-end in a real browser
against the emulators, re-drive every pre-existing feature that touches a
changed file (seed whatever state that needs), and verify rule denials and
atomicity directly against the emulator. Delete throwaway scripts; leave the
dev server and emulators running and finish with `npm run seed:reset`.

## 6. Wrap up

- **Re-sync with main immediately before this step, every time** —
  `git fetch origin main && git merge origin/main` again, exactly like
  step 1, resolving any new conflicts the same way. This skill's steps can
  span a long session (research, multiple rounds of user feedback,
  emulator testing); main can pick up new commits during that time, and
  step 1's sync only covers what existed when the session started. Do not
  skip this because step 1 already ran once — treat every push in this
  skill as needing a fresh sync first, not just the first one.
- **Bump `SITE_VERSION`** per "Release hygiene" in `CLAUDE.md` — check before every commit in this skill and compare against `origin/main` first (finishing a feature PR is a minor bump; bump once per PR).
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
