---
name: orchestrate
description: Run large or multi-issue work as an orchestrator. You (the session model) plan, brief, integrate and verify, and cheaper agents (implementer, validator, reviewers) do the building, checking and reviewing, with the review sized to the PR. Also keeps each PR's status comment. Use without being asked whenever a task spans more than one issue, will likely change about 1,000 lines or more, was planned in plan mode, a plan was just approved, or several issues are assigned to be worked in order.
---

# Orchestrate

You are the one who knows everything: the request, the plan, the conventions, what each agent did. Agents know only their brief. So you keep the decisions and the final read, and you hand out work whose outcome you can check by reading a diff or a report.

## Who does what

| Work | Who | Why |
|---|---|---|
| The plan, the decisions, the briefs, cross-file integration, the final read of every diff, the PR body and status | **you** | Needs the whole context. |
| A planned chunk with named files and a clear "done when" (a component, a thunk and its callers, a migration of N call sites, a doc rewrite) | `implementer` (sonnet) | Long edit loops are cheaper on Sonnet; the brief carries what it needs. |
| Typecheck, eslint, `check:*`, the repo-rule greps | `validator` (haiku) | Mechanical; a long output reduced to failures. |
| A search across many files when you need only the answer | `Explore` | Keeps file dumps out of your context. |
| Keeping several PRs current with their bases at once | `pr-syncer` (haiku) over `scripts/prSync.sh` | Git answers it exactly; for one PR, run the command yourself. |
| Review | sized, below | |
| Planning a new app | `plan-app` | |

**An agent added in this session** (a new `.claude/agents/*.md`) can't be spawned by name until the next session; until then spawn `general-purpose` with `model` from that file's frontmatter and a prompt that starts "Read `.claude/agents/<name>.md` and follow it as your instructions", then the brief.

**Do it yourself** when it is a few tool calls, when the change needs this conversation's context to get right, or when writing the brief would take as long as the change. Each agent starts a fresh context (the system prompt, `CLAUDE.md`, the files it reads), so a one-step task costs more delegated than done; delegation pays on a long loop. Model choice: an agent's frontmatter decides; pass `model` only when the owner asked for one. You plan on the session's model unless the owner says otherwise.

## Briefing an agent

Every brief has: the goal in one line; the files to touch (and not to touch); what is already decided or ruled out; the `docs/conventions/` files and the app rules file that apply; "done when" as checks it can run; the report shape. Independent chunks go out together in one message, each implementer with `isolation: "worktree"` when two might touch nearby code. Then:

1. Read every diff an agent returns (`git diff` in its worktree) before it lands. You own each line; an agent's "done" is a claim.
2. Bring it into the branch, run `validator`, fix or send back what fails.
3. Commit in coherent steps. Agents never commit or push (the one exception is `stack-pr-reviewer`, which commits its fix and syncs the stack it was handed), and an agent that needs another revision works in its own `git worktree`, never a checkout in yours.
4. **Prove each push landed.** Read `git push`'s own output (never piped through `tail` or `-q`) and check `git status -sb` names your branch, not `HEAD (no branch)`. Before a review starts, check the SHA it reads contains every fix commit (`git merge-base --is-ancestor <fix> origin/<branch>`). A detached checkout once turned two pushes into silent no-ops and a whole fix round went unreviewed.

## Writing a plan

The plan is for the owner, and its job is to lighten their mental load (owner: "the plan is so dense"). Keep it to a short page with plain bullets:

- **The idea** in a line or two, and **what the person will see or be able to do**.
- **What counts** (the criteria) when the request has them, with any change you made to them in a clause.
- **Decisions for the owner**, only the ones that are uncertain or risky, each a 🚩 question with your recommendation. When none are left, say "No open decisions."

Leave out the files, selectors, data paths, verification steps, docs to update and review sizing. They are yours to get right, and they belong in the PR's How it works and evidence blocks. Keep paragraphs and nested bullets out of the plan. These rules replace plan mode's default template, whose Context, Files and Verification sections never appear; in plan mode the prompt hook states them, and `.claude/hooks/plan-check.sh` (before ExitPlanMode) sends back a plan with paths, code spans, nested bullets, those sections or more than 350 words (owner: "it should not have been missed").

**Back in plan mode with nothing new to plan.** A restarted session can come back in plan mode after the owner approved the plan and switched to Auto, though nobody switched it. When nothing new needs a decision, the plan is one line ("Nothing new: PR #N is built and waiting on you."), never a repeat of what was already agreed (owner: "there's nothing new for me to look at").

**Iterating on owner feedback.** When the owner answers a review or adds follow-ups (in plan mode or not), the plan covers only that message: each answer and what it changes, and the questions they asked. Never re-output the earlier plan or what is already built (owner: "the plan should be focused on my last message").

## Several issues in order

When the owner assigns a list of issues, work them in order, one PR each (stacked when one builds on the last), and for each: plan it from the issue's checklists, build it through the table above, validate, size and run the review, fix, push, and refresh that PR's **status comment** before starting the next. The owner opens any PR and reads where it stands without scrolling the conversation.

## Keeping your PRs current

"Current" means one thing: the PR's own base (main, or the PR beneath it in a stack) is merged into its branch. Its diff against that base stays exactly its own changes; nothing from another open PR ever enters it, and unrelated PRs are never stacked on each other. The session that opened a PR keeps it current for as long as it watches it, so the owner never has to ask.

1. **Watch every PR you open.** Subscribe to its activity right after opening it, without asking (`CLAUDE.md` "Every PR ends the same way"). A stacked PR also records its base: `git config branch.<head>.prBase <base>`.
2. **Main moving wakes you, at no cost until it does.** The `PR sync check` workflow (`.github/workflows/pr-sync-check.yml`, git only, no tokens) runs on every push to main, on each PR push and every six hours, and labels each open PR `behind-base` or `merge-conflict`. On a PR you watch, that label is an event, as is the harness's merge-conflict notice. The Stop hook also checks your current branch on every push. A label is not sure to wake you, so **every wake on a PR you watch starts with `npm run -s prs:check -- <head>:<base>`** (a CI result, a review, ready for review, a check-in), before you report anything about it; "CI green" never stands for "mergeable" (owner: a PR went ready for review with a conflict the session had not looked for).
3. **On the event, run one command.** `npm run -s prs:sync -- <head>:<base>` merges the base in and pushes when it merges cleanly (`scripts/prSync.sh`, `git merge-tree`, no checkout; it never touches a branch you didn't name), then `git pull --ff-only` in your checkout. That is one tool call: spawn `pr-syncer` (haiku) only when you drive several PRs at once (a stack or a run, bottom of the stack first), where its loop saves your turns.
4. **On a conflict, resolve it yourself and tell the owner; never ask them to.**

   | What conflicts | Who resolves it | How |
   |---|---|---|
   | Lockfiles, generated files | you, or `implementer` (sonnet) when it is large | Regenerate with the repo's tooling, never by hand. |
   | Both sides adding to the same list, table or doc | you, or `implementer` | Keep both, in the order each side meant. |
   | Code | you | You hold the PR's intent: keep both sides' behaviour where they combine, and main's behaviour with the PR's change rebuilt on top where they can't. |

   Merge, never rebase or force-push. Validate as for any push, push, and say in the status comment what conflicted and what you chose. Only where one side's behaviour had to give way, add a "Must do: check the conflict resolution in `<file>`" line to the status comment so the owner knows to look.
5. **Stay cheap between events.** Your safety-net check-in rules stand (about 50 minutes after the last activity, then every four hours, stopping after three quiet ones). A quiet check-in re-arms without a message. Put the PR's freshness in its status comment's "Last verified" line.

## Merging a run's PRs

The owner merges, unless they hand the merges over. "Merge them through" (in chat or in a PR comment) lets you merge this run's open PRs down their merge order; it covers the PRs open when it was given, and a PR opened later needs its own go. "automerge" (the `automerge` skill) is a standing go for the PRs a session drives, held back by anything the owner should decide or know. Say in each status comment's Next moves that you are merging, and on whose go.

**One merge into main at a time, across every session.** Every merge, on any go (automerge, "merge them through", a PR the owner asked you to merge), goes through the merge lock, and nothing merges while a deploy runs. The go is permission to join the line, never to merge at once.

- **Busy** means the lock is held (`npm run merge:lock -- status` exits 2 and names the PR and session; exit 1 means origin could not be read, which is never free) or `firebase-hosting-merge.yml` has a run queued or in progress (`actions_list` `list_workflow_runs` with that file). The owner merging by hand shows up as the deploy.
- **The line** is the pinned "🔀 Merge queue" issue ([#573](https://github.com/NovaMoonX/moondreams-dev-apps/issues/573); search the title if it moves). A PR that is ready (every gate below holds but the conflict and the lock) gets one comment there from its session: the PR link, the session link, what it builds on, the areas it touches, and the time it became ready; the session edits that comment's time each time it checks, and once its PR merges or leaves the line edits it to one line, "Merged" or "Left the line" (a session may not be able to delete a comment). Order: a PR goes after anything it is stacked on; otherwise the oldest ready time goes first. A comment whose time is over 30 minutes old is a session that stopped checking, and is skipped (and named in your status comment), never deleted by another session.
- **Waiting** is said where the owner looks: the status comment's Next moves reads "Waiting to merge: behind [#N](link) (its session's link), lock held since 16:05" or "behind the deploy of [#N](link)", and so does your reply. Check again every 10 minutes (`send_later`) and on every event from your PR; never poll with `sleep`. Reading another session's queue comment, lock or deploy is the one place this session looks at another's PRs, and it is only to wait its turn.
- **Your turn:** the lock is free, nothing is deploying, and no live comment is ahead of yours. Take it (`npm run merge:lock -- take <pr> <your session link>`; exit 2 means someone took it first, so wait again), then merge the base into your branch and wait for CI on that head. Right before merging, fetch main again: if it moved (a merge by hand takes no lock), merge it in and wait for CI again. Merge, mark your queue comment merged, and keep the lock until the deploy has finished, checking with `send_later`; release it (`npm run merge:lock -- release <pr>`) when the deploy succeeds or fails. A run that stops anywhere between taking and releasing releases before it hands back: a failed gate, a conflict that needs the owner, the owner saying stop.
- **A stuck lock** (the holder's PR merged or closed, or its session idle, and the lock over 90 minutes old): message that session first (`send_message`), and break it only when that gets no answer (`npm run merge:lock -- break <pr> "<why>"`), saying so in your status comment.

For each PR, in order:

1. **Gate it.** Merge only when every one holds on the current head, and never with admin rights or past a failing check:
   - CI is green.
   - There is no conflict with the base.
   - Claude Approvals passes, where the repo runs it.
   - Every `(who: owner)` decision on it is answered. A PR with an open decision is skipped, along with those after it that depend on it, and the rest go on.
   - No owner comment or review on it is left unanswered.
   - The last review and screenshots covered this head; otherwise run what the push needed first.
   - A stacked PR's base has merged.
   - You hold the merge lock and nothing is deploying (above). A run of several PRs takes it once per PR, so another session's PR can go between them.
2. **Merge it.** Mark it ready for review, then merge it the way the repo's history does (squash, the PR's title as the commit title, its number appended).
3. **Wait for its deploy.** `firebase-hosting-merge.yml` must succeed on the merge commit before the lock is released. A failed deploy stops the run: release the lock, report it, and fix it if it is yours.
4. **Keep the rest current.** Merge the new base into the remaining PRs (above), and wait for their CI on the new heads before the next merge.

Stop and tell the owner when:
- a gate can't be made to pass within the PR's own scope;
- a conflict needs one side's behaviour to give way;
- a deploy fails;
- the owner says stop.

After the last merge, check that each `Resolves` issue closed and that the workflows finished, then unsubscribe from the merged PRs and say what shipped in one line each.

## Improving as you go

Every task feeds `docs/conventions/pipeline.md` "The pipeline improves itself": change a step when you are confident, propose it to the owner when you are not, log both, and end an orchestrated run with its short retro.

## Sizing the review

Measure the PR against its base with `git diff --shortstat <base>...HEAD -- . ':(exclude)*.md'` (lines of code: Markdown and lockfiles never raise the size, since a doc moved between files counts twice) and the areas it touches, and record the size and why in the PR body's Review block. A change to the convention docs or agent files is checked by reading it against what it replaces (a line check that nothing was lost, and the moved rules read in their new place), not by its line count.

| Size | When | Review |
|---|---|---|
| **S** | ≤300 changed lines, and no rules, indexes, functions, public page or shared component (`src/components`, `src/ui`, `src/hooks`, `src/index.css`) | `validator`, then one `technical-reviewer`. Copilot is asked but not waited on. |
| **M** | ≤1,500 lines, or any visible change | `validator`; Copilot's 20-minute window (`pr-wrap-up` §3); `technical-reviewer`, plus `product-reviewer` and `design-reviewer` when anything visible changed (two separate agents: a product brief never also asks for the design pass, which measures what a product walk only glances at). |
| **L** | >1,500 lines, or touches rules, indexes, functions, a public page or a shared component | `validator`; Copilot's window; split the diff into **shards** by area (rules and data, functions, each app's UI, shared components, docs) of about 1,500 lines at most; one reviewer of the fitting kind per shard in parallel (technical for code and rules; product and design per app with visible changes); then `lead-reviewer` (opus) gets the shard map and every report, verifies each finding against the code, drops noise and does the cross-shard pass. You fix what it confirms. |

Reviewers that run at the same time against one emulator never share a seeded account they may write to: give each its own account (or tell all but one to only read), and tell each to list what it wrote. Two Runway passes on one account reported each other's saves as bugs (a cut line that "moved", a group count that changed). An app that won't start (the emulators fail in the sandbox) never skips the product and design reviewers: give them the harness page's URL and fixtures (`pr-wrap-up` "An environment failure is not a reason to skip"); A-List release days shipped two misses the reviewers would have caught. A docs-only or comment-only change needs no review agents; `validator` is enough. A follow-up push reviews only what changed since the last review, at the size of that delta, unless it touches an area the last review didn't cover. When the owner says a review should have caught something, fix the agent per `docs/conventions/agents.md`.

## The PR status comment

Each PR you drive has one comment that starts with `<!-- pr-status -->`, which you rewrite in place (never a new comment) after every push, review round and decision. `owner-inbox.yml` rebuilds the pinned "📥 Owner inbox" issue from these comments, grouped by the `session` marker, so the shape below is a contract: an owner decision is an unchecked `- [ ]` line carrying `(who: owner)` (the inbox counts those as 🚩), written as a question a person can answer from the inbox alone, with each option's screenshot on a line indented under it (the inbox shows them beside the question; owner: "I'd like to see the question and then the screen that's in question"), notes go under **Good to know** and images under **New screenshots** (`scripts/ownerInbox/inbox.ts` parses them; `check:owner-inbox`). The PR body's first line under the `Resolves` lines links to it: `📋 Status: <one line>`. Its shape:

```markdown
<!-- pr-status -->
<!-- session: <this session's URL, from the Claude-Session line> -->
## 📋 Status · <ready to merge | blocked | in progress> · <short sha>
**Session:** <a two-to-four-word name for what this session is doing, the same on every PR it drives ("Runway cards")>

**Must do before merge**
- [ ] <red CI, conflicts, a blocking finding, an owner decision, a secret to create> (who: you / owner)

**Should do**
- [ ] <optional findings carried, a follow-up worth doing in this PR>
- [ ] <a decision, asked as a question with its options: "History's header: A, B or C?"> (who: owner)
  - A, <what it is>: <screenshot URL>
  - B, <what it is>: <screenshot URL>

**Next moves**
- <what you would do next, or suggest the owner does: a decision to make, a device to try it on, the next issue>

**Where this sits**
| Merge | Issue | PR | State |
|---|---|---|---|
| – | <App> 3: … (#123) | #456 | ✅ merged |
| 1st | <App> 4: … (#124) | this PR | ✅ ready |
| 2nd | <App> 5: … (#125) | #457 | ✅ ready |
| – | <App> 6: … (#126) | – | ⏭ next |

**Merge order:** <one line on why this order: smallest and least shared first; a PR whose code another builds on before it; the one touching shared files last; or "stacked: bottom first">

**Pipeline proposals** (only when there are any; `docs/conventions/pipeline.md` "The pipeline improves itself")
- <a change to a skill, hook, agent or convention you aren't sure the owner wants: the change, the evidence, the cost either way>

**Good to know** (only when there is any: risks, what couldn't be checked, a changed default; the reply's ⚠️ lines)
- <one line each>

**New screenshots** (only the latest push's; replaced, never appended)
- <the image URLs `publish-screenshots.sh` printed, space-separated>

**Since last update:** <what changed: pushed fixes, review results, decisions>
**Last verified:** <sha> · CI <green/red> · base <up to date / N behind / conflicts> · review <S/M/L, who> · <date>
```

"Where this sits" lists the app's planned issues around this one (from `ISSUES.md` and the board: the issue before, this one, the next two, and any open issue this PR blocks or is blocked by), so the owner sees the plan and the progress at once. When a run has several open PRs that are not stacked, the table carries a **merge order**, the same in every PR's comment: smaller and lighter first, a PR whose code another builds on before it, and the PRs that touch shared files or overlap most with the others last. After each merge, sync the rest at once (conflicts in docs and `constants.ts` are yours to resolve) and say in the next one's comment that it is current and green, so the owner can keep merging down the list.

**An answer in chat closes its question in every status comment that asked it, in the same turn.** When the owner answers a `(who: owner)` question in the conversation, rewrite each PR comment carrying it (tick it or drop it, and say in "Since last update" what was decided), including PRs where the answer changes no code: the inbox reads only these comments, so an answered question left there stays a 🚩 (owner: "if nothing is waiting for me, why didn't the inbox update?").

**The owner's PR comments are their feedback channel.** A comment or review left on any PR you drive (on a phone or a laptop; it persists, a chat draft does not) reaches you as a PR event: treat it as the owner's request, answer on its thread, fix and push as you would a chat message, and say in the status comment's "Since last update" what it changed. One comment that says it applies to several PRs is acted on in each. On every wake and when you take a PR over, read the comments and review threads newer than the last status comment, so feedback left while you were away is never missed. "Must do" holds only what blocks the merge and isn't a given: never "mark it ready for review", "merge it", "approve it" or anything else every PR needs. An empty one says "Nothing: ready when you are". Anything checkable after the merge (a workflow run, a label landing) is yours: check it when the merge event wakes you and report it, never a "check after merge" line for the owner. Use the GitHub MCP tools (`add_issue_comment`, `update_issue_comment`) or `gh`, and end the comment with the attribution footer.
