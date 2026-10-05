---
name: pr-wrap-up
description: The standard way every PR in this repo ends, run automatically without being asked. Screenshots in the PR body (phone first, before and after for changes), a Copilot review with a 20-minute window, otherwise three review agents (technical, product, design), fixes, and any lasting design or product rule written into CLAUDE.md. Use whenever a PR is opened or its code changes, including from the Stop hook.
---

# PR wrap-up

Every PR in this repo ends the same way, and nobody has to ask for it. It runs after `finish-feature-pr` (which makes the branch mergeable) and again whenever a push changes behaviour.

**Skip it** only for a PR that changes no app behaviour or UI (docs, CI config, skills): say so in the PR body in one line.

## 1. Screenshots in the PR body

The reader should see what changed without checking out the branch.

- **Phone first.** 390×844, `timezoneId: 'America/Los_Angeles'`, signed in as a seeded fixture user. Add a desktop shot (1280×900) only when the experience differs there (a popover instead of a modal, a side panel, a different layout). Never show real data or secrets.
- **Net new behaviour:** one screenshot per distinct screen or state is enough.
- **Changed behaviour:** a **before** and an **after** of each changed screen. Take "before" from the PR's base branch: `git worktree add /tmp/before origin/<base>`, symlink `node_modules`, run a second dev server on another port (`npx vite --port 5174 --host 127.0.0.1`, same `VITE_*` env), and remove the worktree afterwards.
- **Capture** with a throwaway Playwright script (`.claude/skills/build-mini-app-mvp/scripts/pw.mjs` has `open` and `signIn`). Name files `<screen>-<mobile|desktop>-<before|after>.png` in one folder, and look at every image before publishing it.
- **Publish** with `bash .claude/skills/pr-wrap-up/scripts/publish-screenshots.sh <pr> <folder>`. It commits the PNGs to the `pr-screenshots` branch under `pr-<n>/` (never to the PR's branch, so the diff stays clean) and prints Markdown image links pinned to that commit, so they never go stale or cache.
- **PR body:** a `## Screenshots` section: a before | after table for changes, and a single image for new screens, each with a one-line caption.
- **Keep them current.** Whenever a push changes how something looks, re-take only the affected screens, re-publish, and update the links. The Stop hook reminds you on every new HEAD; treat out-of-date screenshots as an unfinished PR.

## 2. Ask Copilot first (20-minute window)

1. Request a review (MCP `request_copilot_review`), then verify it registered: `gh api repos/NovaMoonX/moondreams-dev-apps/pulls/<n>/requested_reviewers` and `…/reviews`. A request can "succeed" without registering. **If Copilot isn't listed, treat it as failed and go to step 3 immediately.** (It has not registered on draft PRs.)
2. If it registered, wait up to **20 minutes**: `.claude/skills/build-mini-app-mvp/scripts/waitreview.sh <pr> 20 <request-time-iso>` in the background. Use the wait for the screenshots, not for idling.
3. **Copilot reviewed:** fix every real finding, reply on each thread in one line, resolve it. A finding that is wrong or out of scope gets a reply saying why, and stays open.
4. **No review in 20 minutes:** step 3.

## 3. Our own review: three agents

Spawn **technical, product and design** agents in parallel (`model: "sonnet"`, never an Opus- or Fable-class model, `run_in_background: true`), all **read-only**, using `references/review-agents.md`. They report; you make every fix.

- **Technical:** the PR's diff against `CLAUDE.md` and `.github/copilot-instructions.md`, looking for defects with a concrete failure scenario, and for gaps (rules, atomic writes, legacy data, seeds, docs, unmet issue checkboxes).
- **Product:** drives the real app and asks whether the experience serves the user's problem: paths, dead ends, buried journey steps, copy, edge cases, README accuracy.
- **Design:** drives the real app and checks alignment, spacing, state clarity, hierarchy and the repo's design rules, phone first, then desktop, light and dark.
- **A stack of PRs:** one technical agent per PR (it only needs `git diff`), and one product and one design agent on the **top** branch, each tagging findings with the PR the flow belongs to. Before spawning them, have the emulators, the seed and the dev server running on the top branch.

## 4. Triage, fix, re-validate

- Merge duplicates. Fix every real, in-scope finding. Put anything bigger in the PR body under "Follow-ups" rather than widening the PR.
- Fix on the PR the finding belongs to, then merge that branch up through every branch above it (merge, never rebase or force-push), re-running `npx tsc -b --force` and `npx eslint .` on each.
- Re-validate what you changed in the browser, and refresh the affected screenshots (step 1).

## 5. Write down what the review taught, automatically

Don't ask first. When a finding reflects a **lasting** design or product rule rather than a one-off bug, add it in the same PR and tell the user afterwards (the PR body's "Rules added" line and the final report).

- **Where:** design rules go in `CLAUDE.md` → "Design & UX" (or "Designing a mini-app's look"); product rules go in `CLAUDE.md` → "Product" (create it after "Design & UX" if it is missing); a rule that only applies to one mini-app goes in its rules file (`.github/instructions/<app>.instructions.md` and the identical `.claude/rules/<app>.md`) and its `UX.md`. Mirror anything shared with Copilot into `.github/copilot-instructions.md`, its source of truth.
- **How:** fold, don't append. Tighten the nearest existing bullet instead of adding a near-duplicate, reword or remove a bullet the finding proves wrong, keep the section's voice (one or two lines, bold lead-in), and re-read the section afterwards.
- **This applies outside the review too.** Any time during a session, while iterating on a PR or on the user's requests, you decide something is worth noting in the product or design guidance, add it in that PR and tell the user afterwards.

## 6. Finish

The PR body ends with: Screenshots, Review (who reviewed, what was found and fixed, what is a follow-up), Rules added (or "none"), and what is unverified. Then the final report to the user: the same, short, with links.
