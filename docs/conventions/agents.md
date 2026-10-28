# Agents

The repo's subagents live in `.claude/agents/`, one file each, with their model and tools in the frontmatter. The orchestrator (the session model) spawns them by name with the Agent tool; never paste an agent's checklist into a prompt, and never copy a check into a skill, `CLAUDE.md` or a conventions file: the agent file is its one home.

| Agent | Model | Edits? | Spawned by | Job |
|---|---|---|---|---|
| `implementer` | sonnet | yes | orchestrate | Builds one planned, file-bounded chunk to a brief and runs the fast checks. |
| `validator` | haiku | no | orchestrate, pr-wrap-up | Typecheck, eslint, `check:*`, the repo-rule greps; reports failures only. |
| `technical-reviewer` | sonnet | no | pr-wrap-up | The diff (or one shard) for defects with a production state. |
| `product-reviewer` | sonnet | no | pr-wrap-up, build-app-mvp polish | Drives the app: journeys, phases, doors, numbers, copy, docs. |
| `design-reviewer` | sonnet | no | pr-wrap-up, build-app-mvp polish | Measures the app: containers, reach, alignment, state, colour. |
| `lead-reviewer` | opus | no | pr-wrap-up (size L) | Verifies the shard findings and does the cross-shard pass. |
| `stack-pr-reviewer` | sonnet | yes | build-app-mvp | Reviews, fixes and syncs one stacked PR when Copilot didn't review. |
| `product-planner`, `design-planner`, `tech-planner` | opus | drafts only | plan-app | The three planning tracks, drafted in parallel each round. |

A brief may override an agent's model when the owner asks (`model` on the Agent call); otherwise the frontmatter decides. Reviewers are read-only: before spawning the product and design reviewers, the orchestrator has the emulators, the seeded data (Alex full, Jamie empty, Taylor scale) and a dev server running on a **frozen worktree at the head commit** (fixes made meanwhile must not move what they read; a "before" build on a second port for comparisons). Agents never reset or reseed data and never edit repo files unless the table says they edit.

## Keeping the agents useful

Revise these sections **on your own, without being asked**, whenever you are confident a change makes a review catch more, and in the same turn as the work that showed it. Any moment of feedback is a signal to re-evaluate them: the owner reporting a problem on a screen a review passed (whether or not they say "the agent should have caught this"), the owner correcting a design or product choice, a finding the owner rejects (a check that is wrong or noisy), a bug you or an implementer find after a review passed, and an audit or test that turns up a class of problem. For each, ask which agent's section should have caught it or should stop flagging it, and change **that agent's file** (its Checks section) as an audit of the whole section, never an append:
1. Name the **class** of failure (not the instance) and why the section missed it: no check, a check too vague to act on, a check buried among many, or one that measured the wrong thing.
2. Put it in the group that owns the class and **sharpen that check** (add the measurement that would have caught it); add a group only when none fits.
3. While in the section: merge checks that overlap, replace checks the new one subsumes, delete checks that only restate a `CLAUDE.md` rule (point to the rule instead) or never caught anything, and fix stale wording. Skills and prompts point at the agent; they never keep their own copy of a check.
4. Keep each role to about ten groups an agent can run in full, each a test with its measurement and the owner round that taught it. A section that only grows stops being run.
5. A finding the owner rejected, or a check that keeps flagging what the owner accepts, is deleted or narrowed the same way: a check that misleads costs as much as one that is missing.
6. Leave a change out only when you are not confident it is right (one ambiguous instance, a preference the owner has not stated); then put it to the owner as a one-line proposal instead.
7. Tell the owner in one line what was added, merged, replaced and deleted, and why.