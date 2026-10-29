# Pipeline

How work moves from an idea to a merged PR, who does each step, on which model, and when a step is skipped. Each step has one owner file; everything else points at it.

```
idea ─▶ plan-app ─▶ issues ─▶ orchestrate ─▶ push ─▶ pr-gate ─▶ pr-wrap-up ─▶ status comment ─▶ owner merges
         (3 planners         (implementer,          (Stop hook:  (screenshots,
          in parallel)        validator)             what this    regression,
                                                     push needs)  sized review)
```

| Step | Owner file | Who runs it | Model | Skipped when |
|---|---|---|---|---|
| Plan an app | `.claude/skills/plan-app/SKILL.md` | the session, with `product-planner`, `design-planner`, `tech-planner` per round | session (Opus) + opus planners | never for a new app |
| Create issues | `scripts/createGithubIssues.ts` (`npm run issues:create`) | the owner locally, or the session with MCP then the owner once | – | the roadmap already has issues (re-run is safe) |
| Large or multi-issue work | `.claude/skills/orchestrate/SKILL.md` | the session, delegating build chunks and checks | session + sonnet `implementer` + haiku `validator` | a few tool calls, or a change that needs the conversation's context |
| A new app's MVP | `.claude/skills/build-app-mvp/SKILL.md` | the session, as an orchestrator | as above | – |
| What a push needs | `.claude/hooks/pr-gate.sh` (Stop hook) | the hook, in bash, once per pushed clean HEAD | none | the branch is the default, dirty, unpushed, or the HEAD was already gated |
| Wrap-up | `.claude/skills/pr-wrap-up/SKILL.md` | the session | session | the parts the gate didn't name (a docs-only push gets none) |
| Review | `orchestrate` "Sizing the review" + `.claude/agents/` | Copilot, then the agents for the size | haiku validator, sonnet reviewers, opus `lead-reviewer` for L | docs-only diffs (validator only) |
| Status | `orchestrate` "The PR status comment" | the session, after each push and review | session | never on a PR you drive |
| Take over someone else's PR | `.claude/skills/finish-feature-pr/SKILL.md` | the session, when asked | session | not run by any hook |
| Improving the pipeline | `docs/conventions/pipeline.md` "The pipeline improves itself", `pipeline-log.md` | the session, every task | session | never |
| Keep PRs current | `orchestrate` "Keeping your PRs current", `scripts/prSync.sh` (`npm run prs:check` / `prs:sync`), `.github/workflows/pr-sync-check.yml` | the workflow labels every open PR on each push to main; the session watching each PR syncs it on that event (one command, or `pr-syncer` for several) and resolves its conflicts | git only for checks and clean merges; the session model for conflicts, Sonnet for mechanical ones | when no session watches a PR it is only labelled |
| Hint to orchestrate | `.claude/hooks/orchestrate-hint.sh` (UserPromptSubmit) | the hook | none | prompts that aren't in plan mode and name fewer than two issues |

## Why it is shaped this way

- **The session model holds the context; agents hold a brief.** Opus (or whatever the owner picked) plans, decides, briefs and reads every diff; Sonnet builds and reviews from a written brief; Haiku runs checks whose output is pass or fail. An agent never commits or pushes, except `stack-pr-reviewer`, whose job is to commit its fix and merge it up a stack it was handed.
- **A hook decides in bash, not in tokens.** `pr-gate.sh` reads the diff since the last gated HEAD and the PR's size and names only the parts that push needs, so a typo fix doesn't buy a full review and a rules change can't skip its regression rows.
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
