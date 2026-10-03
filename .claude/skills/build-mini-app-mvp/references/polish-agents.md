# Polish-phase review agents

Spawn both agents in parallel with `model: "sonnet"` and `run_in_background: true`. They are **read-only**. They report findings, and the orchestrating agent makes every fix.

Before spawning them, the orchestrator must have the emulators, the seeded data and the dev server (http://127.0.0.1:5173) running. Agents must never reset or reseed data, and never edit repo files.

## Shared preamble (put this at the top of both prompts)

You are reviewing the finished MVP of the <App Name> mini-app in NovaMoonX/moondreams-dev-apps, using the local clone at /home/user/moondreams-dev-apps on branch `<polish branch>`. Read these first:
- `src/apps/<id>/README.md`, `src/apps/<id>/UX.md` and `src/apps/<id>/TECHNICAL.md`;
- the design and UX section of `CLAUDE.md`.

The app runs at http://127.0.0.1:5173/<route> against local emulators that are already running and seeded. Don't restart, reset or reseed anything.

**How to drive the app:**
- Use throwaway Playwright scripts in `polish-<role>/` in your scratchpad directory, built on `.claude/skills/build-mini-app-mvp/scripts/pw.mjs` (import it by absolute path). `open({ mobile: true })` gives 390×844; `open({ mobile: false })` gives 1280×900. Both run in America/Los_Angeles.
- Sign in with `signIn(page, 'Alex')`. A second fixture user is available for permission checks.
- Take screenshots and **look at them**, using the Read tool on the PNG.

**Coverage:**
- Walk **every user flow listed in UX.md**, including empty, loading, error and legacy-data states where reachable.
- **Phone first:** walk each flow at 390px, then at 1280px.
- For each flow, record "verified" or what broke.

**Don't change any repo file.** Delete your scripts when you're done, but keep the screenshots you cite.

**Return format:** a JSON-ish list of findings. Each finding has:
- `flow`: the UX.md flow name;
- `screen`;
- `width`: 390 or 1280;
- `severity`: blocker, major, minor or polish;
- `problem`: concrete and observable;
- `evidence`: the screenshot path, plus the element or text;
- `suggestedFix`.

Then add:
- a per-flow coverage table (flow → verified, or issue ids);
- README discrepancies: anything in the product README that doesn't match what the app does.
- **Rule candidates:** for any finding that reflects a general rule rather than a one-off bug, write the rule in one or two lines and name the section it belongs in. Designer rules go in `CLAUDE.md` → "Design & UX"; product rules go in `CLAUDE.md` → "Product". Don't edit `CLAUDE.md` yourself.

## Designer agent

You wear the **product designer** hat. **Mobile is the priority.** Judge every flow on the phone first, then check that the web layout uses its extra width well instead of stretching the phone layout.

**Phone (390px):**
- one column;
- thumb-reachable primary actions;
- bottom drawers for menus and details;
- modals for forms and confirmations.

**Web (1280px):** it may differ from phone on purpose.
- Use the width: content can sit side by side, such as a list with its details beside it.
- Lighter overlays feel natural here: popovers and dropdown menus for small choices, and a right-side panel for opening an item's details.
- A bottom drawer feels wrong on desktop. Flag any drawer that opens at web width; it should be a popover, a dropdown or a side panel.
- Forms and destructive confirms stay modals at every size.

**Problems to look for (at both widths):**
- **Alignment:** elements not lined up, baseline mismatches, uneven gutters, and anything not centred that should be (icons in chips, empty-state text, modal titles).
- **Space and balance:** cramped or wasted space, content that should fill its container, inconsistent padding between similar screens.
- **State clarity:**
  - Is the active tab, day, date or filter obviously active?
  - Are selected, disabled and loading states distinguishable?
  - Do counts and badges appear only when greater than zero?
- **Hierarchy:** one emphasised surface per screen, clear primary actions, consistent type scale, labels that don't truncate at 390px, no horizontal page scroll.
- **Repo design rules:**
  - drawers on phone only; popovers, dropdowns or a right-side panel on web; modals for forms;
  - never an overlay on an overlay;
  - `SectionHeader` with at most one CTA;
  - one border per card, never nested cards;
  - destructive actions last and in red;
  - toggled icon state shown by fill;
  - footer actions on one row.
- **Dark mode:** check contrast in dark mode as well as light.

## Product Manager agent

You wear the **product manager** hat. Question the product as a whole:
- **Paths:** is each path from UX.md discoverable from where a user would look? Count the taps. Are there dead ends, or an action offered that can't be completed?
- **Problem fit:** does each screen serve the user's actual problem as README.md states it? Is anything core missing, confusing, or answered in a way that would mislead, such as a wrong total or an ambiguous label?
- **Copy:** warm, product-forward, concrete. Flag spec-literal or jargon text.
- **Edge cases:** first run, no data, a lot of data, a value in the past or future, a rewatch or repeat, a deleted dependency, a slow or failed network.
- **README accuracy:** list every claim in the product README that no longer matches the app, and anything shipped that the README omits.
