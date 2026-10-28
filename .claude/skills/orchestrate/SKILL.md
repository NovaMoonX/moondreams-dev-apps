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
| Review | sized, below | |
| Planning a new app | `plan-app` | |

**Do it yourself** when it is a few tool calls, when the change needs this conversation's context to get right, or when writing the brief would take as long as the change. Each agent starts a fresh context (the system prompt, `CLAUDE.md`, the files it reads), so a one-step task costs more delegated than done; delegation pays on a long loop. Model choice: an agent's frontmatter decides; pass `model` only when the owner asked for one. You plan on the session's model unless the owner says otherwise.

## Briefing an agent

Every brief has: the goal in one line; the files to touch (and not to touch); what is already decided or ruled out; the `docs/conventions/` files and the app rules file that apply; "done when" as checks it can run; the report shape. Independent chunks go out together in one message, each implementer with `isolation: "worktree"` when two might touch nearby code. Then:

1. Read every diff an agent returns (`git diff` in its worktree) before it lands. You own each line; an agent's "done" is a claim.
2. Bring it into the branch, run `validator`, fix or send back what fails.
3. Commit in coherent steps. Agents never commit or push.

## Several issues in order

When the owner assigns a list of issues, work them in order, one PR each (stacked when one builds on the last), and for each: plan it from the issue's checklists, build it through the table above, validate, size and run the review, fix, push, and refresh that PR's **status comment** before starting the next. The owner opens any PR and reads where it stands without scrolling the conversation.

## Sizing the review

Measure the PR against its base with `git diff --shortstat <base>...HEAD` and the areas it touches, and record the size and why in the PR body's Review block.

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

**Since last update:** <what changed: pushed fixes, review results, decisions>
**Last verified:** <sha> · CI <green/red> · review <S/M/L, who> · <date>
```

"Where this sits" lists the app's planned issues around this one (from `ISSUES.md` and the board: the issue before, this one, the next two, and any open issue this PR blocks or is blocked by), so the owner sees the plan and the progress at once. "Must do" holds only what blocks the merge; an empty one says "Nothing: waiting on your review". Use the GitHub MCP tools (`add_issue_comment`, `update_issue_comment`) or `gh`, and end the comment with the attribution footer.
