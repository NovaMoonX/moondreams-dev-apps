---
name: build-mini-app-mvp
description: Build a brand-new mini-app's whole MVP from its planning docs. Use it when the user runs /build-mini-app-mvp with the app's README/UX/TECHNICAL/ISSUES files attached. It stores the docs, creates the GitHub issues, builds one stacked PR per MVP issue (validated, Copilot-reviewed or subagent-reviewed, fixes synced up the stack), then opens a final polish PR driven by product and design review agents, carrying the pre-merge overview comment.
---

# Build a mini-app MVP end to end

The user attaches the planning docs for a new mini-app and runs this command. They expect to come back to the following, with nothing left but the steps the overview comment lists:
- a fully built, reviewed stack of PRs, one per MVP issue;
- one polish PR on top.

Work autonomously. Don't ask questions you can answer from the docs, the code or `CLAUDE.md`. Ask only when a decision is genuinely theirs and blocks progress.

Read `CLAUDE.md` (it imports `.github/copilot-instructions.md`) before writing code. Every rule there applies to every PR, as does every checklist in `.claude/skills/finish-feature-pr/SKILL.md`.

The app's look is one `<app>.css` on a theme class, built per `CLAUDE.md` → "Designing a mini-app's look" (including "Where a visual rule lives" and "Text color is part of the theme"): tokens, radius and field padding, selected-pill tint, and quiet tappable text. Anything every app should get goes in `src/index.css` once, never copied per app.

Every PR in this skill also ends with `.claude/skills/pr-wrap-up/SKILL.md`: screenshots in the PR body, a regression check (rules first), Copilot with a 20-minute window, then technical, product and design agents. Where that skill and this one differ on review, `pr-wrap-up` wins.

## Inputs

- **Attached docs:** usually `README.md`, `UX.md`, `TECHNICAL.md`, `ISSUES.md`, and sometimes the issue-creation `init.sh`.
- **App id:** the kebab-case folder name under `src/apps/`. Take it from the docs, or derive it from the app name.
- **Label:** `<App Name> (App)`, using the app's real display name with its punctuation, e.g. `A-List (App)`.
- **Project board:** https://github.com/users/NovaMoonX/projects/3 (number 3, status "Ready"), unless the user says otherwise.
- **MVP issues:** the issues in the ISSUES.md tier marked MVP. Later tiers ("Next Steps", "Beyond") get issues created but no PRs.

## Session facts (learned the hard way)

- **GitHub access:**
  - Use the GitHub MCP tools, or `gh api` REST, which the proxy authenticates.
  - **GraphQL is blocked.** So are Discussions, user-scoped Projects (v2) and `gh pr ready`/`gh pr edit --base`. For draft/ready, auto-merge and review threads, use the CCR routes: `POST repos/{o}/{r}/pulls/{n}/ccr/ready_for_review`, `GET …/pulls/{n}/ccr/review_threads`, `POST …/pulls/{n}/ccr/comments/{id}/resolve`.
  - Changing a PR's base works with `gh api -X PATCH repos/{o}/{r}/pulls/{n} -f base=…`.
- **Emulators** fail behind the sandbox proxy. Run them with `env -u HTTPS_PROXY -u https_proxy -u JAVA_TOOL_OPTIONS -u GLOBAL_AGENT_HTTPS_PROXY -u npm_config_https_proxy -u YARN_HTTPS_PROXY`.
  - Use `.claude/skills/build-mini-app-mvp/scripts/runval.sh` from this skill for one-shot validation (emulators:exec + seed:reset + your command).
  - Background tasks die after 2 hours, so prefer `runval.sh` over a long-lived emulator.
- **Third-party sites** (the API provider, the brand's website) are usually blocked.
  - Mock the API through emulator fixtures, and paraphrase brand copy.
  - Flag both in the overview comment as "not verified live".
- **Prettier:** run it only on code (`npx prettier --write "src/apps/<id>/**/*.{ts,tsx}"`). Never run it on markdown, because it reflows the docs and causes stack-wide churn.
- **Chained commands:** use `&&` (never `;`) before a commit or push, and read the output. A silently failed edit script once produced an empty commit.
- **The repo Stop hook** (`.claude/hooks/finish-feature-pr-stop.sh`) fires on every new pushed HEAD. It asks you to open a *draft* PR and run `finish-feature-pr`.
  - Open each PR yourself, non-draft, right after pushing, so the hook finds it.
  - When the hook fires mid-loop, do the cheap parts: check main hasn't moved, run tsc and eslint.
  - Don't re-run the whole checklist on a branch a subagent is working in.
- **Copilot review requests** can "succeed" without registering. After requesting, check `gh api repos/{o}/{r}/pulls/{n}/requested_reviewers` and the reviews list. If Copilot isn't listed, treat the request as failed immediately.
- **Model identifiers** never go in commits, PRs, code comments or any pushed file.

## Phase 0: Intake and docs PR

1. Create `src/apps/<id>/` with the attached `README.md`, `UX.md`, `TECHNICAL.md` and `ISSUES.md`, following the existing mini-apps' doc layout.
   - Keep the README's "Build Plan" checklist; each MVP PR ticks its own line.
2. Read all four docs fully. Note:
   - the MVP issue list and dependencies;
   - the data paths;
   - any third-party API (secret, budget, cache);
   - every user flow in UX.md, which the polish phase re-verifies.
3. Commit them on the session's designated branch, push, and open the **docs PR** against `main`. This is the bottom of the stack.
4. Write a state file to the scratchpad, `mvp-state.md`, and keep it updated after every step:
   - the issue number map;
   - each PR's number, branch, base and SITE_VERSION;
   - Copilot/subagent review status;
   - open threads and pending decisions.

   The conversation will be compacted several times, and this file is how you resume without re-deriving anything.

## Phase 1: Issues

1. Make sure the label exists with the exact name. Rename a near-duplicate label rather than creating a second one, and delete strays you created.
2. Create the issues in ISSUES.md order, so issue N maps to a predictable number. Try in this order:
   1. **The gist script** from the repo root. Pass the label explicitly, since `npm run issues:create` derives "A List (App)" from the folder name and loses punctuation:
      ```bash
      ../_gists/create-github-issues/init.sh src/apps/<id>/ISSUES.md --label "<App Name> (App)" --project-number 3 --project-status-value Ready
      ```
   2. **Otherwise**, the MCP `issue_write` tool or `gh api repos/{o}/{r}/issues`, with the label and a tier label.
   3. **If both fail**, abandon issue creation, tell the user, and continue with the PRs, using "Implements Issue N of ISSUES.md" in the bodies.
3. The project board is usually unreachable from the sandbox, because user-scoped Projects need GraphQL. Don't fight it. Record the exact local command for the overview comment.
4. Each issue body links its prerequisites as full issue URLs.

## Phase 2: One stacked PR per MVP issue

Branch names: `claude/<id>-NN-<slug>`. Each branch is cut from the previous PR's branch, so the first one is cut from the docs branch.

For each MVP issue, in order:

1. **Re-read the issue.** All of its checklists (Success Criteria, CRUD & Entry-Point Requirements, Documentation) are binding.
2. **Implement it** following `CLAUDE.md`.
   - Firestore fields are `T | null` and rules ship in the same PR.
   - Every write uses a field-scoped `updateDoc` or a transaction.
   - Readers and actions handle legacy documents.
   - Update the seed (`scripts/seeds/<id>.ts`, its document count, `SEEDING.md`) when there's new state worth seeding.
3. **Issue 1 only:**
   - **Register the app:** `APP_REGISTRY`, route, manifest, logo and banner placeholders, the home-page tile, and the root README's "Current apps" line.
   - **Design the logo icon as SVG**, in two versions, saved as temporary files (scratchpad, not committed):
     - `<id>-icon.svg`: light ticket/glyph on a transparent background, for dark backgrounds.
     - `<id>-icon-dark.svg`: the same, filled `#111111`, for light backgrounds.
   - **Icon design checks:**
     - Render both with Playwright at 400px and 32–48px, and look at them.
     - Centre the mark in its 1024×1024 frame and fill it (about 75% of the width).
     - Centre every element within its own region.
     - Keep clear space between all elements: no glyph touching a notch or an edge.
     - Make cut-outs real holes via a `<mask>` so the icon works on any background.
     - Use no text in the icon.
     - Give the two files distinct mask ids.
   - **Use it** as the placeholder logo in the app, and include both SVG sources inline in the polish PR's overview comment. The user builds the final logo and banner assets from them.
4. **Bump `SITE_VERSION`:** minor, once per PR, continuing from the previous PR's number. Check `origin/main` first. Tick this PR's line in the app README's Build Plan.
5. **Validate** (see "Validation" below) before pushing.
6. **Commit, push, and open the PR, non-draft:**
   - **Title:** `<App Name>: <what it does>`.
   - **Base:** the previous branch.
   - **Body:**
     - first line `Resolves <full issue URL>`;
     - "Stacked on <previous PR URL>";
     - What changed;
     - Rules / schema / seed: state when no change was needed and why;
     - Validation: concrete results, not "tested";
     - the attribution footer.
7. **Review:**
   1. Request a Copilot review (MCP `request_copilot_review`).
   2. Verify it registered (see Session facts). If it did, wait up to **20 minutes** with `.claude/skills/build-mini-app-mvp/scripts/waitreview.sh <pr> 20` in the background. Don't sit idle meanwhile: read the next issue and plan it, but don't push the next PR until review is handled.
   3. **If Copilot reviewed:**
      - Fix every real finding.
      - Reply on each thread with one line, then resolve it.
      - If a finding is wrong or out of scope, reply explaining why and leave it open.
   4. **If Copilot didn't register or didn't review within 20 minutes:**
      - Spawn the review agents per `.claude/skills/pr-wrap-up/SKILL.md` (technical, product and design), or, for a quick pass on a small PR, one review subagent using `references/review-agent.md`. Always `model: "sonnet"`, never an Opus- or Fable-class model.
      - Wait for its report.
      - Verify its fix commit yourself: read the diff, and check stack ancestry with `git merge-base --is-ancestor` for each adjacent pair.
8. **Sync the stack after any fix** to a lower PR. Merge it up through every branch above it, in order: merge, never rebase or force-push. Push each branch, and confirm tsc and eslint stay green.
9. Update `mvp-state.md`, then move to the next issue.

## Validation (every PR)

- **Static checks:** `npx tsc -b --force` and `npx eslint .` must both pass, plus prettier on the app's `.ts`/`.tsx` files.
- **Browser:** drive the feature in a real browser against the emulators.
  - Write a throwaway Playwright script built on `.claude/skills/build-mini-app-mvp/scripts/pw.mjs` from this skill: a 390px viewport, `timezoneId: 'America/Los_Angeles'`, signed in through the dev fixture switcher.
  - Run it through `.claude/skills/build-mini-app-mvp/scripts/runval.sh "node <script>.mjs"`.
  - Check dates against the date picker's value.
  - Re-drive every pre-existing flow that touches a file you changed.
- **Rules:** for every role-sensitive rule touched, run one allowed and one denied REST write per role against the emulator. Use `.claude/skills/build-mini-app-mvp/scripts/rules.py` with the auth emulator tokens. Then write a legacy-shaped document (new keys removed) and drive the read and edit paths over it.
- **Functions:**
  - Functions with secrets use `defineSecret`.
  - The emulator answers from fixtures when no key is set (`FUNCTIONS_EMULATOR === 'true'`).
  - Keep `functions/README.md`'s tables current.
- **Cleanup:** delete throwaway scripts. Finish with `npm run seed:reset`.

## Phase 3: Polish PR

Start this once every MVP PR is merged up and reviewed.

1. **Checkpoint:** bring `mvp-state.md` fully up to date. The conversation compacts on its own as it grows, so you don't trigger it yourself. The state file plus the PR bodies are the handoff, and nothing should depend on scrollback.
2. **Branch** `claude/<id>-polish` from the top MVP branch.
3. **Start shared infrastructure once, in the background:** the emulators (proxy env unset), the seed, and `npm run dev -- --host 127.0.0.1`. Run the functions build before the emulators start; the `preemulators*` hooks do it.
4. **Spawn two review agents in parallel**, both with `model: "sonnet"` and both read-only, using `references/polish-agents.md`:
   - a **Product Manager** agent;
   - a **Designer** agent.

   Both must walk **every user flow in `src/apps/<id>/UX.md`** in a real browser in `America/Los_Angeles`, at 390px first and then at desktop width. They use the shared dev server and emulators, and never reset seeds. Each returns structured findings and rule candidates.
   - **Phone first:** a phone screen that's wrong outranks a desktop nicety.
   - **Web may differ on purpose:** it can use its width for side-by-side content, popovers, dropdowns and a right-side detail panel.
   - **No bottom drawers at desktop width.**
5. **Triage the findings.**
   - Merge duplicates.
   - Fix everything that is a real problem and in MVP scope: alignment, centring, empty space, unclear active state, a confusing path, a missing affordance, copy, an outdated README.
   - Note anything bigger as a follow-up in the overview comment instead of widening scope.
   - Re-validate as in Phase 2, including re-driving each flow you touched.
6. **Keep `CLAUDE.md` current while you fix.** It's a working rulebook, and both agents' rule candidates feed it.
   - **Where rules go:**
     - Design rules go in its "Design & UX" section.
     - Product rules go in a "Product" section. Create it after "Design & UX" if it doesn't exist yet, covering user paths, problem fit, copy voice, first-run and empty states, and README upkeep.
   - **How to edit:**
     - **Fold, don't append.** Put each rule beside the related rule in the right section. If an existing bullet already covers it, tighten that bullet instead of adding a near-duplicate.
     - Reword or remove a bullet the finding proves wrong.
     - Keep the voice of the section: one or two lines per bullet, with a bold lead-in.
     - Skip one-off bugs; only lasting rules belong there.
   - **Re-read after editing:** re-read each section you changed and check it's still short and easy for a person to scan. Mirror any rule that's shared with Copilot into `.github/copilot-instructions.md`, its source of truth.
7. **Update the product README** (`src/apps/<id>/README.md`) to match what was actually built. Also update the root README and `functions/README.md` if they're affected.
8. **Bump `SITE_VERSION`** (patch for polish), commit, push, and open the polish PR with the top MVP branch as its base. Run the same Copilot → subagent review loop.
9. **Post the overview comment on the polish PR**, built from `references/overview-comment.md`. It replaces any per-PR "what's left" notes.

## Final report to the user

- the stack in merge order, with PR links;
- what each review caught;
- what's unverified (live API, brand copy);
- the overview comment's link;
- the `CLAUDE.md` rules the polish phase added or changed.

Keep it short; the comment holds the detail.
