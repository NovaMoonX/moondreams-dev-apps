---
paths:
  - "src/apps/runway/**"
---

# Runway rules

Applies on top of CLAUDE.md to everything under `src/apps/runway/`. Keep `.github/instructions/runway.instructions.md` identical to this body.

- **Tone: plain and matter-of-fact, an exception to "Playful by default".** Runway reports what happened and what it affects ("Dining is $18 over. It would take $18 from Everyday spending."). No scoring, streaks, scolding or cheerleading, and no cute emoji: an emoji appears only where the person chose one for an envelope, bill or goal. Empty states use a lucide icon in `EmptyCard`, not an emoji.
- **Theme: restrained blue.** `runway.css` sets the tokens on `html.runway-theme` (cool near-white surfaces, a deep slate-blue primary, a pale blue tint for selections), switched on by `useRunwayTheme()` while the app is mounted. Components use semantic tokens (`bg-primary`, `bg-accent`), never raw palette colors. Body and row text is the normal text color; blue is for filled buttons and real links. Check a filled button, a selected pill, a badge and a highlighted card in light and dark after any token change.
- **The level decides the wording.** An envelope figure reads *assigned* at Plan, *left* at Track and *safe to spend* at Link, never one word for all three. **Hidden, not disabled:** what depends on a level the person is not using (a Spend tab, Add purchase, Needs a home, Check an amount) is not on screen at all; `LevelGate` draws its children only at the level that needs them. Data for a hidden level is still listened to.
- **A range is always labelled** wherever it drives a figure ("planned at the low end, $140"), through the one `RangeNote` component.
- **Money is integer cents, dates are date-only UTC midnight.** Format money with `formatCents` and `MoneyInput`; display a date-only value with `formatDateUTC`, write it with `fromDateInputValue`. Schedules use `getUTC*` math and "today" is `todayAsUtcDate()`.
- **Sealed documents.** A document has a few readable fields (ids, dates, enums, flags, `createdAt`) and one `sealed` payload for every sensitive value. A readable field never holds a name, an amount, a merchant or a note. Only `security.ts` seals and opens; the data key lives in the query cache and `security.ts` closures, never in Redux or storage.
- **The engine is pure.** Everything under `engine/` takes values and returns values and imports nothing from React, the store or Firebase. The draft for an income day is computed, never stored or edited in place; the same inputs always give the same lines. Every engine change adds cases to `npm run check:runway-engine`.
- **Phone first, nothing disabled to explain.** Home, Days and Plan are the only tabs; every other section is a `Subview` or sheet reached from them. A figure says what it counts and what it leaves out, and a gap in the plan is never shown as a gap in the person's finances.
- **Scale.** Lists of envelopes, bills, goals and purchases are checked at 5 and at 50. `scripts/seeds/runwayScale.ts` is the oversized fixture; extend it whenever a list is added, and judge performance on it per CLAUDE.md.
- **An envelope's priority and emoji wear one badge each.** `PriorityBadge` is a soft tint (Must a primary tint, Should the accent, Want muted), never a solid fill; `ItemBadge` is the envelope's emoji, or the first letter of its name when it has none. A row pins both to its first-line band so a long name wraps without moving them.
- **Stopping an item is not erasing it.** A row's "More" (`ItemActionsSheet`) pauses a goal, ends an item after a last day, or archives it; each shows its effect on the coming income days first and asks "Why?" once. Ending and archiving set a write-once header field and leave every version, record and confirmed day as it was. A change that lasts for a stretch is a version with `effectiveUntil`, and the draft says so on the first day the earlier amount is back ("Vacation fund returns to $300.00 this time").
