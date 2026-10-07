---
paths:
  - "src/apps/a-list/**"
---

# A-List Tracker rules

Applies on top of CLAUDE.md to everything under `src/apps/a-list/`. Keep `.github/instructions/a-list.instructions.md` (the source of truth) identical to this body.

- **Theme: AMC and the theater.** Casual, warm and playful, never corporate or masculine. The palette (AMC red primary, theater-gold accent, rose-tinted neutrals) lives in `a-list.css` as tokens on `html.a-list-theme`, switched on by `useAListTheme()` while the app is mounted so portaled modals and drawers match. Change the look there, not per component, and use semantic tokens (`bg-primary`, `bg-secondary`, `bg-accent`) rather than raw colors.
- **Round everything.** Inputs are `rounded='full'` (also on `FormFactories` fields), buttons that are pills or CTAs are `rounded='full'`, cards and sheets `rounded-2xl`, badges `rounded-full!`. Options a user toggles or picks among are `Pill`s, never radio buttons or tab strips.
- **Emoji carry meaning.** Every status, priority, stat and empty state gets its own fitting emoji (`WATCH_PRIORITY_EMOJIS`, `ViewingStatusBadge`); never reuse one emoji across a list. No green check marks for "seen".
- **Badges are ours.** Use `PriorityBadge`, `ViewingStatusBadge` and `FormatBadge` from `components/shared`, not a stock `Badge` with ad-hoc text.
- **Subviews, not tall drawers.** A flow that needs search, several steps or a long settings form (adding a movie, Membership settings) is a full-page `@/components/Subview` that renders its own back control (`AddSubview`, `MembershipSettingsSubview`); see CLAUDE.md "Subviews" for when to use one; the app's screens stay mounted underneath. Short lists and details use a `Drawer` that swaps its content in place with a "‹ Back" link (`DayDrawer`); never stack one overlay on another.
- **No "Back home" in the page.** The app shell gives Home through the avatar menu and the header's home icon. Only the app's landing page (`AppEntryFallback`) says "Back home".
- **Setup can be dismissed.** Closing the setup modal lands on `AppEntryFallback` (Enter app / Back home), like the other mini-apps.
- **Ticket price is part of the journey, not an extra.** The add form asks "🎟️ Already bought your ticket?" with `Pill`s ("Yes, I paid" / "Not yet", defaulting to "Not yet") and reveals the ticket fields in place on yes. Never a "+ Add ticket details" link; unpaid tickets still surface under "Needs a price". Any new detail the savings math depends on follows the same shape.
- **Theaters are optional and quiet.** Setup's last step is skippable, the Calendar offers a one-line nudge only when none are saved, and a showing's theater is a row of `Pill`s with the favorite preselected, never a required field. For now a theater is a name the member types; it carries no address.
- **Time-based helpers are quiet.** Something that appears because of the clock but isn't asking a question right now (the trailers bubble around a showing) is a small nudge anchored to the nav that folds into a chip so it can be reopened, never a drawer, modal or auto-opened screen. Only a question that needs an answer (the Seen prompt) may be an overlay, and it never stacks on another.
- **Money inputs** use the shared `@/components/MoneyInput`, which settles to two decimals on blur. Date-only fields that can't be in the future get `max` set to the viewer's local today.
- **Pointer vs touch.** Hover-only affordances (the calendar's day peek) are `max-sm:hidden` and never the only way to reach something; touch goes through the day's drawer.
- **Check lists at scale.** A-List needs an oversized seed fixture like Waypoint's (`scripts/seeds/waypointScale.ts`): many viewings, a long watchlist and a busy calendar. Open new lists on it at phone width with the dev build throttled, and keep per-row work cheap (see CLAUDE.md "Performance is a design check").
