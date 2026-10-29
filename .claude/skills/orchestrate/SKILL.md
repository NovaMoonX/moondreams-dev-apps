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

## Iterating on owner feedback

When the owner answers a review or adds follow-ups (in plan mode or not), the plan covers only that message: each answer and what it changes, the questions they asked, and the checks that follow. Never re-output the earlier plan or what is already built (owner: "the plan should be focused on my last message").

## Several issues in order

When the owner assigns a list of issues, work them in order, one PR each (stacked when one builds on the last), and for each: plan it from the issue's checklists, build it through the table above, validate, size and run the review, fix, push, and refresh that PR's **status comment** before starting the next. The owner opens any PR and reads where it stands without scrolling the conversation.

## Keeping your PRs current

"Current" means one thing: the PR's own base (main, or the PR beneath it in a stack) is merged into its branch. Its diff against that base stays exactly its own changes; nothing from another open PR ever enters it, and unrelated PRs are never stacked on each other. The session that opened a PR keeps it current for as long as it watches it, so the owner never has to ask.

1. **Watch every PR you open.** Subscribe to its activity right after opening it, without asking (`CLAUDE.md` "Every PR ends the same way"). A stacked PR also records its base: `git config branch.<head>.prBase <base>`.
2. **Main moving wakes you, at no cost until it does.** The `PR sync check` workflow (`.github/workflows/pr-sync-check.yml`, git only, no tokens) runs on every push to main, on each PR push and every six hours, and labels each open PR `behind-base` or `merge-conflict`. On a PR you watch, that label is an event, as is the harness's merge-conflict notice. The Stop hook also checks your current branch on every push.
3. **On the event, run one command.** `npm run -s prs:sync -- <head>:<base>` merges the base in and pushes when it merges cleanly (`scripts/prSync.sh`, `git merge-tree`, no checkout; it never touches a branch you didn't name), then `git pull --ff-only` in your checkout. That is one tool call: spawn `pr-syncer` (haiku) only when you drive several PRs at once (a stack or a run, bottom of the stack first), where its loop saves your turns.
4. **On a conflict, resolve it yourself and tell the owner; never ask them to.**

   | What conflicts | Who resolves it | How |
   |---|---|---|
   | Lockfiles, generated files | you, or `implementer` (sonnet) when it is large | Regenerate with the repo's tooling, never by hand. |
   | Both sides adding to the same list, table or doc | you, or `implementer` | Keep both, in the order each side meant. |
   | Code | you | You hold the PR's intent: keep both sides' behaviour where they combine, and main's behaviour with the PR's change rebuilt on top where they can't. |

   Merge, never rebase or force-push. Validate as for any push, push, and say in the status comment what conflicted and what you chose. Only where one side's behaviour had to give way, add a "Must do: check the conflict resolution in `<file>`" line to the status comment so the owner knows to look.
5. **Stay cheap between events.** Your safety-net check-in rules stand (about 50 minutes after the last activity, then every four hours, stopping after three quiet ones). A quiet check-in re-arms without a message. Put the PR's freshness in its status comment's "Last verified" line.

## Improving as you go

Every task feeds `docs/conventions/pipeline.md` "The pipeline improves itself": change a step when you are confident, propose it to the owner when you are not, log both, and end an orchestrated run with its short retro.

## Sizing the review

Measure the PR against its base with `git diff --shortstat <base>...HEAD -- . ':(exclude)*.md'` (lines of code: Markdown and lockfiles never raise the size, since a doc moved between files counts twice) and the areas it touches, and record the size and why in the PR body's Review block. A change to the convention docs or agent files is checked by reading it against what it replaces (a line check that nothing was lost, and the moved rules read in their new place), not by its line count.

| Size | When | Review |
|---|---|---|
| **S** | ≤300 changed lines, and no rules, indexes, functions, public page or shared component (`src/components`, `src/ui`, `src/hooks`, `src/index.css`) | `validator`, then one `technical-reviewer`. Copilot is asked but not waited on. |
| **M** | ≤1,500 lines, or any visible change | `validator`; Copilot's 20-minute window (`pr-wrap-up` §3); `technical-reviewer`, plus `product-reviewer` and `design-reviewer` when anything visible changed. |
| **L** | >1,500 lines, or touches rules, indexes, functions, a public page or a shared component | `validator`; Copilot's window; split the diff into **shards** by area (rules and data, functions, each app's UI, shared components, docs) of about 1,500 lines at most; one reviewer of the fitting kind per shard in parallel (technical for code and rules; product and design per app with visible changes); then `lead-reviewer` (opus) gets the shard map and every report, verifies each finding against the code, drops noise and does the cross-shard pass. You fix what it confirms. |

A docs-only or comment-only change needs no review agents; `validator` is enough. A follow-up push reviews only what changed since the last review, at the size of that delta, unless it touches an area the last review didn't cover. When the owner says a review should have caught something, fix the agent per `docs/conventions/agents.md`.

## The PR status comment

Each PR you drive has one comment that starts with `<!-- pr-status -->`, which you rewrite in place (never a new comment) after every push, review round and decision. The PR body's first line under the `Resolves` lines links to it: `📋 Status: <one line>`. Its shape:

```markdown
<!-- pr-status -->
## 📋 Status · <ready to merge | blocked | in progress> · <short sha>

**Must do before merge**
- [ ] <red CI, conflicts, a blocking finding, an owner decision, a secret to create> (who: you / owner)

**Should do**
- [ ] <optional findings carried, a follow-up worth doing in this PR>

**Next moves**
- <what you would do next, or suggest the owner does: a decision to make, a device to try it on, the next issue>

**Where this sits**
| Issue | PR | State |
|---|---|---|
| <App> 3: … (#123) | #456 | ✅ merged |
| <App> 4: … (#124) | this PR | 🔨 in review |
| <App> 5: … (#125) | – | ⏭ next |

**Pipeline proposals** (only when there are any; `docs/conventions/pipeline.md` "The pipeline improves itself")
- <a change to a skill, hook, agent or convention you aren't sure the owner wants: the change, the evidence, the cost either way>

**Since last update:** <what changed: pushed fixes, review results, decisions>
**Last verified:** <sha> · CI <green/red> · base <up to date / N behind / conflicts> · review <S/M/L, who> · <date>
```

"Where this sits" lists the app's planned issues around this one (from `ISSUES.md` and the board: the issue before, this one, the next two, and any open issue this PR blocks or is blocked by), so the owner sees the plan and the progress at once. "Must do" holds only what blocks the merge and isn't a given: never "mark it ready for review", "merge it", "approve it" or anything else every PR needs. An empty one says "Nothing: ready when you are". Anything checkable after the merge (a workflow run, a label landing) is yours: check it when the merge event wakes you and report it, never a "check after merge" line for the owner. Use the GitHub MCP tools (`add_issue_comment`, `update_issue_comment`) or `gh`, and end the comment with the attribution footer.
