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
- modals only for short forms and confirmations; a form that can scroll on a phone is a drawer (a subview only for a search, a sequence or a page-sized task); selected states stay readable with emoji in light and dark; text is inset inside rounded fields.

**Web (1280px):** it may differ from phone on purpose.
- Use the width: content can sit side by side, such as a list with its details beside it.
- Lighter overlays feel natural here: popovers and dropdown menus for small choices, and a right-side panel for opening an item's details.
- A bottom drawer feels wrong on desktop. Flag any drawer that opens at web width; it should be a popover, a dropdown or a side panel.
- A form that is a drawer or subview on phones is a modal at web width; destructive confirms stay modals at every size.

**Problems to look for (at both widths):**
- **Alignment:** elements not lined up, baseline mismatches, uneven gutters, and anything not centred that should be (icons in chips, empty-state text, modal titles).
- **Space and balance:** cramped or wasted space, content that should fill its container, inconsistent padding between similar screens.
- **State clarity:**
  - Is the active tab, day, date or filter obviously active?
  - Are selected, disabled and loading states distinguishable?
  - Do counts and badges appear only when greater than zero?
- **Buried journey steps:** a detail the app's core numbers depend on (what a ticket cost, a total, a due date) tucked behind a small "+ Add X" link, a muted text button or a collapsed section. When the user has the answer in hand, it should be a visible question with pill answers that reveals its fields in place, not an easy-to-miss extra.
- **Hierarchy:** one emphasised surface per screen, clear primary actions, consistent type scale, labels that don't truncate at 390px, no horizontal page scroll.
- **Repo design rules:**
  - drawers on phone only; popovers, dropdowns or a right-side panel on web; the form container fitted to the content (a short form is a modal; one that can scroll on a phone is a drawer, never a long modal);
  - never an overlay on an overlay;
  - `SectionHeader` with at most one CTA;
  - one border per card, never nested cards;
  - destructive actions last and in red;
  - toggled icon state shown by fill;
  - footer actions on one row.
- **Dark mode:** check contrast in dark mode as well as light.
- **Review the back gesture as a phone user:** for every new drawer, sheet or swap-in view, open it over a tab and over a subview, press the browser back once, and write down what is open and which tab shows. One back closes one layer; never a different tab, never out of the app while a layer is open. Re-tapping the active tab scrolls it to the top, and a tab opens where the person left it (its own scroll, pill, search and period), never at another tab's scroll. Every dialog that can open on a tab screen (a help note, a confirm) takes the press itself: open each over a tab, press back once, and the tab must stay.
- **A door must not look like a filter:** for every control that opens another screen (an entry to a related list, a "see all"), check at 390 and at 320 with the longest status that it cannot be mistaken for a pill or a filter: its computed `border-radius` is under half its height, it holds a chevron, it carries no count and no dot, and it is not in the same row as a list's scope pills. Every door label's `scrollWidth <= clientWidth` (cut short, never wrapped), doors in one row share one height, each is at least 40px tall, and print the first list row's top with and without the doors (they add at most one tile row, about 110px with a two-line status). A door's status counts only what its landing view shows first, or the landing view opens on what the status names: open each door with something due and read the first thing the landing shows. A row of pills under a search that goes somewhere else is a finding (owner, round 6: Kitchen).
- **Front matter budget:** on every details drawer, count what sits between its title and its subject as visually distinct groups (distinct combinations of font size, text color, emoji column and background): at most three, one style per group, plus one chip row; no fact said twice (a total in a line and again in a tile); a line that isn't a decision is either in the facts line or a row that opens something. Print the subject's top edge (the Ingredients or "On the plate" section) minus the title's bottom for the heaviest seeded record at 390 and at 320 in dark; it is no larger than the previous build's. At 320×568 the first ingredient or plate row starts above the pinned footer and the chips are two to a row at most (print both). A source, a last-changed date, a prep count and a stock line each in their own treatment is a finding (owner, round 6: the recipe drawer).
- **A tick control matches the app's shape language:** in an app whose radii are raised (pills, round chips), print every `[role=checkbox]`'s computed `border-radius` (at least half its width) and, in light and dark, checked, unchecked and disabled, the ticked fill's contrast with the surface and the tick's with the fill (at least 3:1 each), that `:focus-visible` shows an outline, and the hit area with any pseudo-element (at least 40×40). A square tick in a round app, or a theme rule that loses to a component's inline style, is a finding (owner, round 6).
- **A switch between two big groups:** wherever a screen has two groups that can both grow, check the switch is thin, has counts in the unit of the rows beneath them (never items minus rows), keeps a stable order, fits one line at 320 (or wraps cleanly), shows exactly one group, and that the screen's bulk action sits with the shown group's header. Then ask whether the person ever needs both groups at once (the shopping list: what is left and what is already in the cart). If so it needs an "All · n": n equals the sum of the other counts under the same search, the second group sits under a `SectionDivider` in the same list, the bulk action shows with that divider, a search never switches away from All, and the three thin pills fit one line at 320 with the largest real counts (owner, round 6).

## Product Manager agent

You wear the **product manager** hat. Question the product as a whole:
- **Paths:** is each path from UX.md discoverable from where a user would look? Count the taps. Are there dead ends, or an action offered that can't be completed?
- **Journey or buried?** For every optional-looking detail, ask whether a core answer (savings, totals, what's due) depends on it and whether the user has it right now. If both, it belongs in the path as a question with a quick default and a later way to fill it in, not behind "+ Add X". Flag buried ones, and flag any truly optional extra that was promoted to a question without that dependency.
- **Problem fit:** does each screen serve the user's actual problem as README.md states it? Is anything core missing, confusing, or answered in a way that would mislead, such as a wrong total or an ambiguous label?
- **Copy:** warm, product-forward, concrete. Flag spec-literal or jargon text.
- **Edge cases:** first run, no data, a lot of data, a value in the past or future, a rewatch or repeat, a deleted dependency, a slow or failed network.
- **README accuracy:** list every claim in the product README that no longer matches the app, and anything shipped that the README omits.
