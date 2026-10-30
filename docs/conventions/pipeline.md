# Pipeline

How work moves from an idea to a merged PR, who does each step, on which model, and when a step is skipped. Each step has one owner file; everything else points at it.

```
idea ─▶ plan-app ─▶ issues ─▶ orchestrate ─▶ push ─▶ pr-gate ─▶ pr-wrap-up ─▶ status comment ─▶ owner merges (or hands the merges over: orchestrate "Merging a run's PRs")
         (3 planners         (implementer,          (Stop hook:  (screenshots,
          in parallel)        validator)             what this    regression,
                                                     push needs)  sized review)
```

| Step | Owner file | Who runs it | Model | Skipped when |
|---|---|---|---|---|
| Plan an app | `.claude/skills/plan-app/SKILL.md` | the session, with `product-planner`, `design-planner`, `tech-planner` per round | session (Opus) + opus planners | never for a new app |
| Create issues | `scripts/createGithubIssues.ts` (`npm run issues:create`) | the owner locally, or the session with MCP then the owner once | – | the roadmap already has issues (re-run is safe) |
| Put issues on the board | `.github/workflows/issue-to-board.yml` (`scripts/board`, `check:board`) | the workflow, when an issue is opened or given an app label; a manual run sweeps every open issue | none | the issue has no `<App name> (App)` label, or two |
| Large or multi-issue work | `.claude/skills/orchestrate/SKILL.md` | the session, delegating build chunks and checks | session + sonnet `implementer` + haiku `validator` | a few tool calls, or a change that needs the conversation's context |
| A new app's MVP | `.claude/skills/build-app-mvp/SKILL.md` | the session, as an orchestrator | as above | – |
| What a push needs | `.claude/hooks/pr-gate.sh` (Stop hook) | the hook, in bash, once per pushed clean HEAD | none | the branch is the default, dirty, unpushed, or the HEAD was already gated |
| Wrap-up | `.claude/skills/pr-wrap-up/SKILL.md` | the session | session | the parts the gate didn't name (a docs-only push gets none) |
| Review | `orchestrate` "Sizing the review" + `.claude/agents/` | Copilot, then the agents for the size | haiku validator, sonnet reviewers, opus `lead-reviewer` for L | docs-only diffs (validator only) |
| Status | `orchestrate` "The PR status comment" | the session, after each push and review | session | never on a PR you drive |
| Merge on a standing go | `.claude/skills/automerge/SKILL.md` ("automerge" or `/automerge`), gated by `orchestrate` "Merging a run's PRs" | the session, for the PRs it drives once the owner says automerge | session | anything the owner should decide or know is open on the PR |
| One merge at a time | `orchestrate` "Merging a run's PRs", `scripts/mergeLock.sh` (`npm run merge:lock`), the pinned "🔀 Merge queue" issue | every session about to merge, on any go: it joins the line, waits out another session's merge and every deploy, and takes the lock for its own | git for the lock; the session for the line and the wait | never: a lock older than 90 minutes whose session doesn't answer may be broken |
| Take over someone else's PR | `.claude/skills/finish-feature-pr/SKILL.md` | the session, when asked | session | not run by any hook |
| Improving the pipeline | `docs/conventions/pipeline.md` "The pipeline improves itself", `pipeline-log.md` | the session, every task | session | never |
| Keep PRs current | `orchestrate` "Keeping your PRs current", `scripts/prSync.sh` (`npm run prs:check` / `prs:sync`), `.github/workflows/pr-sync-check.yml` | the workflow labels every open PR on each push to main; the session watching each PR syncs it on that event (one command, or `pr-syncer` for several) and resolves its conflicts | git only for checks and clean merges; the session model for conflicts, Sonnet for mechanical ones | when no session watches a PR it is only labelled |
| Hint to orchestrate | `.claude/hooks/orchestrate-hint.sh` (UserPromptSubmit) | the hook | none | prompts that aren't in plan mode and name fewer than two issues |
| Pipeline view | `.claude/hooks/pipeline-pulse.sh` (UserPromptSubmit and Stop), `recordPipelineEvent`, the admin dashboard's Pipeline view | the hooks (session state and the last reply's 🚩 lines) and `owner-inbox.yml` (each open PR's status) | none | sessions without `PIPELINE_KEY` in their environment, and every pull_request run of the inbox workflow |

## Why it is shaped this way

- **Two facts about the setup, so no session asks again:** the repository is **public** (GitHub Actions on standard runners cost nothing, and everything committed, every branch included, is readable by anyone, so cost figures, session data and anything private never go into a branch), and the owner is on the **Claude Max plan (5× Pro)**, so a token costs no money but spends a shared usage limit: cost is weighed as usage, and an API-price figure is only a way to compare one step with another.
- **The owner's machine has the `gh` and `firebase` CLIs and Claude Code**, signed in; `gcloud` may not be installed. A step for the owner is a command for those tools or a repo script (CLAUDE.md "What you need to do"). A script that stores one value in several places checks every CLI is signed in before it makes the value, sets the places in an order where a stop leaves the old value working, and on any failure says which places hold the new value and that re-running starts over (`scripts/pipelineSecrets.sh`).
- **The owner is visual.** Where the point is structure or flow (how the pipeline's parts move together, a data path, a sequence of states), show a diagram, and keep it current when the thing it draws changes; where it is a list, a comparison or a number, tabs, tables and tiles are better. A diagram is for when it explains faster than words, never decoration.
- **Every issue a session opens carries its app label and its tier label** (`Runway (App)` and `Next Steps`: the label names an app as `APP_REGISTRY` does), so `issue-to-board.yml` puts it on board 3 with Apps set and Status Ready without anyone running a script. The workflow never changes what the owner set by hand: it fills Apps and Status only while they are empty (a board whose built-in "Item added" workflow sets a default Status keeps that one), and it skips closed issues and pull requests. It needs the `PROJECT_TOKEN` secret, a classic token with the `project` scope (and `repo` for a private repository): fine-grained tokens can't reach a user-owned board. A follow-up for every app gets no app label and stays off the board until the owner places it; a new app's first issues still go through `npm run issues:create`, which adds the Apps option the workflow only reads (owner: follow-up issues were landing off the board).

- **The session model holds the context; agents hold a brief.** Opus (or whatever the owner picked) plans, decides, briefs and reads every diff; Sonnet builds and reviews from a written brief; Haiku runs checks whose output is pass or fail. An agent never commits or pushes, except `stack-pr-reviewer`, whose job is to commit its fix and merge it up a stack it was handed.
- **A hook decides in bash, not in tokens.** `pr-gate.sh` reads the diff since the last gated HEAD and the PR's size and names only the parts that push needs, so a typo fix doesn't buy a full review and a rules change can't skip its regression rows.
- **A pipeline script that reads shared state over the network tells "could not reach it" from "it is empty".** An unreachable origin exits as an error, never as free or nothing to do (`mergeLock.sh` read a failed fetch as a free lock until review).
- **Review cost follows risk.** Lines changed are a floor; rules, functions, public pages and shared components raise a PR to L whatever its size, where shards run in parallel and one Opus reviewer verifies them.
- **One status comment per PR** is the owner's view of a PR during a long run of issues: what blocks the merge, what is optional, what is next, and where it sits in the plan.
- **The owner reads two views, neither of which costs a model call:** the pinned "📥 Owner inbox" issue, rebuilt by `owner-inbox.yml` from every open PR's status comment and grouped by session (a switchboard line per session, then that session's 🚩 items, its PR stack, its new screenshots and its ⚠️ notes), and the end-of-round card that closes a session's last reply. A status comment without the session marker groups by the session link in its PR body, a PR with no status comment folds into "Without a status comment", and items not written in the shape are not counted, so the shape is part of the contract. The inbox is one issue for good: closing it only lasts until the next rebuild reopens it.

## The pipeline improves itself

Every part of the pipeline is open to change, not only the review agents: the skills, both hooks, every agent file, the conventions files, the issue script, the PR body's shape and the status comment. Whoever is running it (you, the session model) watches for the signals below in every task, and acts on each one in the same turn as the work that showed it.

**Signals.** The owner corrects a choice or rejects a finding; the owner finds a problem a step passed; a hook fires when it shouldn't or stays quiet when it should; an agent's brief comes back wrong or it reaches past its scope; a step costs more than it catches (a review that found nothing on a kind of change it always finds nothing on); a manual step is done twice; a skill's instruction contradicts another's; an agent can't do its job with its tools; something added mid-session can't be used yet (a new agent file loads only on a new session).

**For each signal, decide:**
1. **Name the class, not the instance**, and the one owner file that should change (the table above). A fix that would touch two owners means one of them is the owner and the other points at it.
2. **Pick its scope: one app, or every app.** Ask three questions:
   - Does the rule name an app's things or its look (a recipe, a trip, Pinch's paper theme, A-List's theater rows)?
   - Would a second app meet the same situation and want the same answer?
   - Does another app already do it, the same way or worse?

   Then file it by what the answers say:
   - **One app's look, words or flow** goes in that app's rules file (`.claude/rules/<app>.md`) and its `UX.md`.
   - **A pattern any app would follow** (a component, a layout, a copy or interaction convention) goes in the shared conventions file for its topic, with its line in CLAUDE.md's Pattern index. The apps that already do it differently are listed as follow-ups, or fixed in the PR when the change is small.
   - **Something a second app needs now** moves from the app's rules file to the shared set in that PR, and its app line becomes a pointer (`design-ux.md` "Record the pattern you establish").
   - **An agent's check** stays general (no app's words), and points at the rules files for app detail.

   When you are sure it holds for the app but not that it generalizes, keep it in the app and make the generalizing step a pipeline proposal naming the other apps where it would apply. Never copy one rule into two apps' files: the second copy is the signal to move it to the shared set.
3. **Confident** (the owner said so, or the evidence is plain and the change is small and reversible): make the change in the PR you are on, as an audit of the section it lands in (merge, sharpen, delete; never only append), and tell the owner in one line what changed and why. "The owner said so" includes a correction about one case that plainly applies to its whole class.
4. **Not confident, but worth it** (it changes cost or behaviour the owner may not want, it rests on one instance, or it trades one good against another): don't change it. Put it to the owner as a **pipeline proposal**: one line with the change, the evidence, and what doing it or not costs. Proposals go in the PR's status comment under "Pipeline proposals" and in your final message, and are applied only when the owner says yes. A proposal the owner declines is logged so it isn't raised again without new evidence.
5. **Not worth it** (a one-off, or a fix that costs more than it prevents): leave it, and say nothing.
6. **Log it** in `pipeline-log.md`: one row per change or proposal, with its scope (an app id, or 'shared'), newest first. Before changing a step, read its rows: three corrections of one agent or hook mean its design is wrong, not its wording, and that is a proposal to redesign it.

**A retro ends every orchestrated run** (a multi-issue run, a new app, a size L PR): in your final message, three lines at most on what cost the most, what a review missed or flagged as noise, and which briefs came back; each line becomes a change or a proposal by the rules above, or is dropped.

## Changing the pipeline

A change to any step updates its owner file and this table in the same PR. Before adding a step, ask what it costs per push and which failure it catches that no step already does; before adding a check to a skill, put it in the agent that owns that kind of check instead (`agents.md`, whose procedure is this section applied to an agent's checks).
