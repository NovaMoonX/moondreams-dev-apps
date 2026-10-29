## Phase 2: UX & Interaction Design

Once PRODUCT.md's vision is settled, work out how the app actually feels to use before locking anything into a data model — decisions made here (how data entry is paced, how surfaces are presented) shape the TDD's schema and component architecture in Phase 3, not the other way around.

### What gets produced

| Output | Purpose |
|---|---|
| **UX canvas** (a Design artifact) | The screens, drawn as phone-sized boards. This is what gets reviewed. |
| **`UX.md`** (committed as `src/apps/<app-name>/UX.md`) | What a picture cannot carry: sitemap, per-screen rules, components, journeys, form fields. Read together with the canvas, and opens with a link to it. |

Neither repeats the cross-app design rules (one border per card, phone first, and so on) — those live in the repo's `CLAUDE.md`. `UX.md` opens with a short table of rules **specific to this app** only. Use the Design artifact type for the canvas and follow its instructions for look, layout, and publishing; this skill only says what the canvas must cover and what `UX.md` must contain. If the session lists no Design artifact type, say so and agree a fallback with the user before drawing anything.

No Mermaid: it does not render reliably for the reviewer. Use a text tree for the sitemap and arrow chains for journeys.

### Canvas structure

- **One interactive board first.** The app shell with its tabs, and a Tweak for anything that changes the whole app (e.g. a level, or a Plan / Track / Link mode). Everything the reviewer can click lives here.
- **Static boards after it, grouped by journey**, one row per group, each row with a title note (e.g. "Payday: draft, confirm, check off").
- **One sticky note** saying how to use the first board.
- **Boards are 390 x 844.** Keep a height budget: header 60, bottom action bar about 86, so about 700 for content. A board that overflows is clipped, not scrolled.
- **Example data has to reconcile across boards.** Balances, totals, and any headline figure shown on one board must match the others. Check this before publishing.
- **Draw the unusual states, not just the default.** Over, short, empty, partial, a repeating item, a one-time item.

### Review loop

Reviewers comment directly on the canvas. For each comment sent to Claude:

1. Re-read the live file first (the reviewer may have edited it, and the canvas rewrites `canvas.json`).
2. Make the change, or answer the question.
3. Update `UX.md` in the same pass so it does not drift from the canvas.
4. Reply in the thread with what changed and what is **not** drawn yet.
5. Resolve the thread. Leave it open only if it was a question the reviewer still needs to read, or it is not sent to Claude.

### Checklist before asking for approval

Run this against the canvas. Each item is a problem a real review turned up.

**Controls**
- [ ] Every control that opens something shows what it opens. A chevron to an undrawn list was not findable. When the choice is the point, show the options inline as pills.
- [ ] Button labels say what happens. "Put it somewhere else" and "Amend" were both unclear; prefer "Choose where the $100 goes" and "Correct this day".
- [ ] Check labels for words not everyone knows.
- [ ] Primary actions on phones sit where a thumb reaches, such as the bottom of the screen or bottom right.
- [ ] Lists you tick through have a checkbox for each group and one for the whole list, with a partial state and an "N of M" count.

**Coverage**
- [ ] Every segmented choice has a board for each side (an Expense / Income switch needs both).
- [ ] Anything with money or time has a start (including a future one), a repeat, and an end condition (never, on a date, after N times, after a total).
- [ ] Anything a person has several of allows several: accounts at different banks, and institutions that fit no category.
- [ ] Lists that can grow are groupable, with totals on the group.
- [ ] Named things can carry an emoji.

**Form and context**
- [ ] Every view that orders, compares or sums many items names its form (a list, a chart, a pyramid, a map) and why that form fits its one job, and it is drawn at 5 and at 50 items on a 390px board, with amounts hidden where the app hides them. A chart that cannot name its items, be reordered or be drawn while amounts are hidden is not the view's form (Runway's Priorities view reached a build plan with its form undecided).
- [ ] Every view says what it opens on and why that is the context the person needs; a figure, day or example the job does not need is left out, and a row reuses the facts the person already knows from the item's own list unless the view's job needs a new one (Runway's Priorities first opened on the next pay with "Gets $40 of $120" rows the owner could not read).
- [ ] Reordering many items on a phone is planned at 50: how an item crosses a long list or a group line in a few taps, not only "drag" or "move up".

**Consistency**
- [ ] Where two features can cover the same case, state which applies when, and draw each state. Do not show both firing on one board.
- [ ] A word means one thing everywhere (e.g. "Free to spend", "left", and "safe to spend" are not three names for one number).
- [ ] Hidden, not disabled: nothing greyed out for a level or setting that is off.
- [ ] The same organizing concept uses the same UI pattern everywhere it appears (if "day" groups things, it is day-tabs on every screen that groups by day).
- [ ] If a dedicated screen already shows something in full, other screens link to it rather than re-rendering a miniature version.
- [ ] Two conceptually different actions are not collapsed into one form just because they're related ("add an expense" and "split an expense") — model them as distinct steps with a sensible default so the fast path still costs one step.
- [ ] A value that might be exact or might be a range ("$10–$30 estimated") supports both.

### What `UX.md` contains

1. **What is specific to this app.** Five or fewer rules that change how screens look.
2. **Sitemap**, as a text tree. Tabs, then what hangs off each.
3. **Screens**, one row per board: the group it is in, and what the picture does not show (when something appears, what it opens, limits). A detail view showing one entity in full follows Phase 3's Entity Detail View Conventions (identity header, tabs for multiple sections), so its board shows that structure.
4. **Not yet drawn.** A plain list, so no one assumes a missing screen was forgotten.
5. **Where the screen set stops.** Anything that grows without limit and how it is loaded.
6. **Reusable components**, split into existing and new, with where each new one lives (central `src/ui/` or app-scoped).
7. **User journeys**, as arrow chains with branches in parentheses. Map out any button whose destination isn't obvious as its own journey — a button that turns out to be a native map deep-link that exits the app needs one just as much as an in-app flow does.
8. **Form field organization**, one row per entity: initial fields, later fields, the entry point for later fields, grouping, fixed-choice fields. Spell out any shorthand that risks ambiguity between similar-sounding concepts (a category field vs. that category's one detail field vs. a "who's involved" field) rather than compressing them into adjacent cells. The rules that govern this section:
   - **Progressive disclosure**: before an entity's schema gets finalized in Phase 3, check whether creating one would mean asking for a long list of fields up front (as a rough guide, more than a handful). A car is the easy example: year/make/model is enough to create a useful record — engine details, seat count, door count, tire age don't need to be asked for on day one just because they're part of the entity. If the list is long, split into an **initial set** — just enough to create a useful record, captured on the create form — and a **later set** — everything else, deferred past the create form. The TDD's Data Schema section then types every later-set field as nullable (`Type | null`, defaulting to `null` — see that section's Firestore-null rule, never `field?: Type`), and the Issue Roadmap's create issue for that entity only needs the initial-set form (see Create+Read Pairing in Phase 4 — the later set arrives through whichever entry point below actually captures it).
   - **Later-set entry point**: a later-set field doesn't default to "buried in the generic edit form until someone goes looking for it." Pick the entry point per field, or per small related cluster of fields — from these three, most-common-first:
     - **Catch-all edit** (the default when nothing below fits better): the field lives in the entity's normal edit flow alongside every other later-set field, reached the usual way (see Entity Detail View Conventions in Phase 3).
     - **Contextual entry point**: when a field is more naturally encountered somewhere else in the app than "open this entity and edit it" — the car's door count, say, entered from wherever doors actually come up in this app's UI, not from a generic "edit car" form — give it its own small, focused modal, triggered from that other location, that writes back to the same entity as a partial update (see Phase 3's UI Component Conventions). Name both the field(s) it covers and the triggering location explicitly; this is a genuinely different surface from the entity's own edit flow, not another label for the same thing.
     - **Inline reveal**: for a field that could arguably belong in the initial set but isn't always needed, a small link-style control on the create (or edit) form itself reveals the extra input(s) in place — same form, same step, no modal or navigation change (see Phase 3's UI Component Conventions for the exact pattern). This is the right fix for "a few extra fields some users want right away," before reaching for a bigger initial set or deferring something unnecessarily.
   - **Container by content, phone first.** A form is a `FormSheet` (a drawer on phones, a modal from `sm`), a modal only for a handful of inputs that never scroll, a `Subview` for a search, a sequence or a page-sized task (`docs/conventions/design-ux.md` "Pick the container by the content"); a create form is a `QuestionFlow`. Note an exception here only if this app genuinely needs one.
   - **Grouping choice**, when an entity's initial set still feels like a lot in one flat list: **Disclosure** (DreamerUI's `Disclosure`, stacked one per group) is the default for fields that group into categories, since nothing about grouping needs Accordion's exclusive-open behavior; **Accordion** only when that exclusive-open behavior is specifically wanted. **Steps** (a small sequential flow within the modal — DreamerUI has no dedicated stepper, build it as local step-index state) is the exception here, not a third co-equal default: a multi-step entry flow should be rare. Reach for it only when the initial set is both genuinely long *and* has a real sequential order to it (e.g. a multi-stage sign-up) — and check first whether Disclosure, or the inline-reveal pattern above, solves the problem without the extra navigation a multi-step flow adds. A short initial set often needs none of these — say so in the row rather than picking one by default.
   - **Fixed-choice fields**: for any Select, note whether it offers an "Other — add your own" option — that single UX decision is what Phase 3's Data Schema section uses to decide whether the field is a closed enum or needs a persisted, user-extensible entity (see that section's enum-expansion note).

### Order of work

1. README and PRODUCT.md (what the app is).
2. Canvas, with the first board and one row of static boards. Get comments before drawing every row.
3. `UX.md`, written from the canvas.
4. Review loop until approved.
5. Technical design, then issues.

### Working notes for Claude

- Write each board, publish it, then write the next. Do not batch.
- Publish with `root` set to the canvas folder. Small changes can use `edits` on the publish call.
- Read the live copy of any file before editing it, and the live `canvas.json` before adding a board.
- The canvas is not rendered or screenshotted unless asked. Offer a layout check at the end, because height overflow is the most likely defect.
- No emoji in the design itself. Emoji appear only where the user chooses them for their own items.
- Keep the companion file honest: when a board changes, change its row.


**If a TDD already exists before this depth of UX work happens** (Phase 2 is supposed to inform Phase 3, but a TDD sometimes gets written first): don't try to keep it in sync turn-by-turn while the canvas and UX.md are still moving — that's wasted rework every time the UX doc changes again. Instead, accumulate an explicit, itemized "pending reconciliation" list (a callout at the top of the TDD file works well) capturing every schema-level implication the UX work surfaces, and do one deliberate reconciliation pass once the UX is actually settled, not before.

