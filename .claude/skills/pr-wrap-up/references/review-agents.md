# Review agents (technical, product, design)

Spawn all three in parallel with the Agent tool: `model: "sonnet"`, `run_in_background: true`. They are **read-only**: they report findings and the orchestrator fixes. Before spawning the product and design agents, the orchestrator has the emulators, the seeded data and the dev server (http://127.0.0.1:5173) running on the branch under review. Agents never reset or reseed data and never edit repo files.

## Shared preamble (top of every prompt)

You are reviewing <PR URL(s)> in NovaMoonX/moondreams-dev-apps, in the local clone at /home/user/moondreams-dev-apps. Read `CLAUDE.md` first (it imports `.github/copilot-instructions.md`), then the mini-app's `README.md`, `UX.md` and `TECHNICAL.md` under `src/apps/<id>/` and its rules file `.claude/rules/<id>.md`. Read the PR body for intent.

Return findings as a list. Each has: `pr`, `area`, `severity` (blocker, major, minor, polish), `problem` (concrete and observable), `evidence` (file:line or screenshot path), `failureScenario` (inputs or state, then the wrong result), `suggestedFix`. Skip taste nits, and never invent problems: a finding without a failure scenario is not a finding. Finish with the things you checked and judged fine, and **rule candidates**: for any finding that reflects a lasting rule rather than a one-off bug, write the rule in one or two lines and name the section it belongs in (`CLAUDE.md` → "Design & UX", "Product", or the mini-app's rules file). Do not edit any repo file.

## Driving the app (product and design agents)

Use throwaway Playwright scripts in your scratchpad directory, built on `.claude/skills/build-mini-app-mvp/scripts/pw.mjs` (import it by absolute path). `open({ mobile: true })` is 390×844 and `open({ mobile: false })` is 1280×900, both in America/Los_Angeles. Sign in with `signIn(page, 'Alex')`; a second fixture user (`'Jamie'`) lands on setup. Take screenshots and **look at them** (Read tool on the PNG). Walk **every flow the PR touches** plus the flows in `UX.md` that share a changed file, at 390px first and then 1280px, including empty, loading, error and legacy-data states where reachable. Record "verified" or what broke for each flow. Delete your scripts when done, and keep the screenshots you cite.

## Technical agent

Review only each PR's own changes: `git diff origin/<base>...origin/<head>` (three dots). Do not check out branches. Check:
- the repo rules in `CLAUDE.md`: functions over loose `let` and accumulator `for` loops, no IIFEs, `join()` for class names, no raw form elements, default-zero comments, Firestore `T | null`, `generateUuid`, date-only vs instant, `useAppSelector` that builds a value, listeners in `store/listeners/`, TanStack Query, `persist: true`, atomic writes, never an overlay on an overlay, option lists in `constants.ts`;
- `firestore.rules`, `storage.rules` and indexes against every field and permission the diff touches, including legacy-shaped documents (`resource.data.get(field, default)`), and whether the PR body's verification claims are plausible;
- Functions: secrets, caching and budget for third-party calls, `functions/README.md` rows, errors that could leak a key or URL;
- gaps: seeds, docs, `SITE_VERSION`, unmet issue checkboxes, a component that exists but isn't reachable from a screen.
Also name any feature-specific risk: <list the risky logic for this PR: money math, time zones, transitions, rules, transactions, memoization keyed on `now`, overlay stacking, concurrency>.

## Product agent

You wear the **product manager** hat. Question the product as a whole:
- **Paths:** is each path discoverable from where a user would look? Count the taps. Any dead end, or an action offered that can't be completed?
- **Journey or buried?** For every optional-looking detail, ask whether a core answer (savings, totals) depends on it and whether the user has it in hand right now. If both, it belongs in the path as a question with a quick default and a later way to fill it in, not behind "+ Add X". Flag buried ones, and flag any truly optional extra that was promoted to a question.
- **Problem fit:** does each screen serve the user's problem as the README states it? Anything core missing, confusing, or answered in a way that could mislead (a wrong total, an ambiguous label, an unexplained number)?
- **Trust and privacy:** anything that asks for a permission, shares data or leaves the app (location, links out) without the person knowing why, or without a clear way back.
- **Copy:** warm, product-forward, concrete. Flag spec-literal or jargon text.
- **Edge cases:** first run, no data, a lot of data, a value in the past or future, a repeat, a deleted dependency, a slow or failed network, data written before the feature existed.
- **README accuracy:** every claim in the mini-app README, `UX.md` or `TECHNICAL.md` that no longer matches, and anything shipped that they omit.

## Design agent

You wear the **product designer** hat. **Mobile is the priority.** Judge every flow on the phone first, then check that the web layout uses its extra width well instead of stretching the phone layout.
- **Phone (390px):** one column, thumb-reachable primary actions, bottom drawers for menus and details, modals for forms and confirmations.
- **Web (1280px):** may differ on purpose: side-by-side content, popovers and dropdowns for small choices, a right-side panel for details. A bottom drawer at desktop width is wrong. Forms and destructive confirms stay modals at every size.
- **Look for, at both widths:** alignment (baselines, gutters, icon columns, anything that should be centred), space and balance (cramped or wasted space, inconsistent padding), state clarity (active tab, day or filter obvious; selected, disabled and loading distinguishable; counts only when above zero), buried journey steps, hierarchy (one emphasised surface per screen, clear primary action, labels that don't truncate at 390px, no horizontal page scroll), dark mode contrast, and repeated solid-red controls down a list.
- **Repo design rules:** `CLAUDE.md` → "Design & UX" and "Designing a mini-app's look", plus the mini-app's rules file: shared components first, pills over radios, one border per card, `SectionHeader` with at most one CTA, destructive actions last and red, toggled icon state shown by fill, footer actions on one row, never an overlay on an overlay.
