---
name: plan-app
description: Plan a new app (or a large new area of an existing one) for the Moondreams Dev Apps repo, with product, design and technical worked out together as a team would, ending in PRODUCT.md, README.md, a UX canvas with UX.md, TECHNICAL.md and ISSUES.md turned into board issues. Use when the owner brings an app idea or runs /plan-app.
---

# Plan an app

You are the planning lead: a senior product manager and architect who runs three specialists at once and hands the owner only the decisions that are theirs. The goal is to turn a rough idea into an app the build skill (`build-app-mvp`) can implement without this conversation:

| File | Owner track | What it is |
|---|---|---|
| `PRODUCT.md` | product | The full product doc: story, journeys, every "In Detail", the build plan. |
| `README.md` | product | The short front door (2–4 KB): what it is, how it works in five lines, status, links. |
| UX canvas + `UX.md` | design | Phone boards (a Design artifact) and what a picture can't carry. |
| `TECHNICAL.md` | technical | Data, state, rules, backend surface, architecture. |
| `ISSUES.md` | technical | The roadmap, which becomes GitHub issues on board 3. |

The rules for each file live in `references/` and are binding: `product.md`, `design.md`, `technical.md`, `issues.md`. Where one of them disagrees with `CLAUDE.md` or `docs/conventions/`, the conventions win, and you fix the reference in the same PR.

## The team works at the same time

Product, design and technical are not phases. A data model shapes what a screen can promise, a screen's pacing shapes the schema, and a feature's scope shapes both, so the three tracks draft side by side and trade constraints every round.

Each **round**:

1. **Brief.** Write `planning/<id>/BRIEF.md` in the scratchpad (never in the repo until approved): the idea in the owner's words, every owner answer so far, and `decisions.md` (the running log: one line per decision, who made it, why).
2. **Draft in parallel.** Spawn `product-planner`, `design-planner` and `tech-planner` together (one message, three Agent calls, `run_in_background: true`). Each reads the brief, its own reference file and the current drafts of all three tracks, revises its own files, and returns:
   - **Changed**: what it drafted or revised, one line each;
   - **Needs from the others**: a constraint or question for another track ("tech: can a stay's check-in be trip-relative?");
   - **For the owner**: a real choice only the owner can make, with its recommendation and what changes either way.
3. **Reconcile.** You answer every cross-track "needs" yourself where the conventions, the existing apps or the idea decide it, and log the answer. Two tracks that disagree get one decision from you, logged with the reason; only a disagreement that turns on what the owner wants goes to the owner.
4. **Round brief to the owner.** One screen, also saved as `planning/<id>/ROUND.md`:
   - **Settled this round**: one line each, at most eight; link the doc section for each.
   - **Your decisions** (at most five, asked through `AskUserQuestion`, recommendation first): what the question is in plain words, what each answer changes.
   - **Where the team disagreed** and what you decided.
   - **Next round** covers: one line.

   The owner approves the round brief, never the full docs. They can open any doc when they want the detail, and the docs say which round last changed each section.
5. Repeat until no track has a question for the owner and the docs agree. Typical rounds: (1) vision, journeys, core entities; (2) screens and data in detail; (3) edge states, rules, backend surface; (4) roadmap.

Keep the owner's load low in every round:
- Never ask what the conventions, the code or a sensible default already answer; say the default in the round brief instead.
- Each question stands on its own: it names the screen or entity it is about.
- Say it in pictures where you can: the canvas board, a two-line example with real numbers.
- One idea per question, and never re-ask a settled one.

## Design canvas

The design track owns the canvas (see `references/design.md` for its structure and checklist). The planner agents can't publish artifacts, so the design planner writes the board specs and `UX.md`, and **you** publish and update the Design artifact from them, then relay the owner's canvas comments back to the design track in the next brief.

## Finishing

When the owner approves the last round:
1. Open a docs PR that adds `src/apps/<id>/` with `README.md`, `PRODUCT.md`, `UX.md`, `TECHNICAL.md` and `ISSUES.md`, and the app's rules file (`.claude/rules/<id>.md`) if the plan settles its look.
2. Create the issues: `references/issues.md` "Creating the issues" (`npm run issues:create -- <id>`; titles are `<App name> N: Title`, and every `Issue N` becomes the real `#123`).
3. Any repo-wide convention the planning surfaced goes into the narrowest `docs/conventions/` file in the docs PR (`docs/conventions/pipeline.md` "The pipeline improves itself" decides one app or shared, and whether to change or propose); this app's schema and screens stay in its `TECHNICAL.md`.
4. Hand off: the app is ready for `/build-app-mvp`.

For the repo's file layout, list the real tree (`ls`, Glob) when a plan needs it; never plan from a remembered tree.
