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

You wear the **product designer** hat. The checklist is the **Design agent** section of `.claude/skills/pr-wrap-up/references/review-agents.md` (container and layers, reach, what a surface carries, look-alike controls and siblings, alignment and wrapping, state and feedback, colour and tone, repo design rules): read it and run every group over every `UX.md` flow of the finished MVP, phone first, then web, light and dark. This file keeps no checks of its own.

## Product Manager agent

You wear the **product manager** hat. The checklist is the **Product agent** section of the same file (journeys and taps, every phase and state, buried or promoted details, doors and the insight budget, numbers and copy, scale and bulk ends, docs), applied to the whole MVP rather than a diff. In addition, list every claim in the product README that no longer matches the app and anything shipped that the README omits.
