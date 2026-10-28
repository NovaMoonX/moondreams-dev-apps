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
| Hint to orchestrate | `.claude/hooks/orchestrate-hint.sh` (UserPromptSubmit) | the hook | none | prompts that aren't in plan mode and name fewer than two issues |

## Why it is shaped this way

- **The session model holds the context; agents hold a brief.** Opus (or whatever the owner picked) plans, decides, briefs and reads every diff; Sonnet builds and reviews from a written brief; Haiku runs checks whose output is pass or fail. An agent never commits or pushes.
- **A hook decides in bash, not in tokens.** `pr-gate.sh` reads the diff since the last gated HEAD and the PR's size and names only the parts that push needs, so a typo fix doesn't buy a full review and a rules change can't skip its regression rows.
- **Review cost follows risk.** Lines changed are a floor; rules, functions, public pages and shared components raise a PR to L whatever its size, where shards run in parallel and one Opus reviewer verifies them.
- **One status comment per PR** is the owner's view of a PR during a long run of issues: what blocks the merge, what is optional, what is next, and where it sits in the plan.

## Changing the pipeline

A change to any step updates its owner file and this table in the same PR. Before adding a step, ask what it costs per push and which failure it catches that no step already does; before adding a check to a skill, put it in the agent that owns that kind of check instead (`agents.md`).
