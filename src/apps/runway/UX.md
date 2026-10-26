# Runway UX

How Runway is laid out and how a person moves through it. The product vision is in `README.md`. The screens themselves are drawn on the **Runway UX** canvas (an artifact); this file holds what a picture cannot: the sitemap, the rules behind each screen, the component list, the journeys and the form fields.

The canvas has one clickable screen set (Home, Days, Plan, Spend) with a Tweak that switches the level between Plan, Track and Link, plus static screens grouped by journey.

---

## 1. What is specific to Runway

| Rule | What it means on screen |
|---|---|
| The level decides the wording | An envelope figure reads *assigned* at Plan, *left* at Track and *safe to spend* at Link. Never one word for all three. |
| Emoji is optional on anything that appears as a line | Envelopes, bills and goals can each have one. It shows in a small badge on Home tiles and draft lines; with none set, the badge shows the name's first letter. |
| Hidden, not disabled | At Plan there is no Spend tab, no Add purchase, no Needs a home. They appear, with their data, when tracking is on. |
| A range is always labelled | A figure built on a range says so ("planned at the low end, $140"). |
| Nothing moves until you confirm | A draft is a suggestion. A change shows its effect on each upcoming income day before it applies. |
| Over is shown, never blocked | A purchase can push an envelope below zero. The envelope shows how far over, and Free to spend drops by the same amount. |

---

## 2. Sitemap

```
Sign in
 └─ Plan has an income source?
     ├─ No  → Starting Out → Home
     └─ Yes → Home

Bottom tabs        Home · Days · Plan · Spend (Track and Link only)

Home
 ├─ Free to spend, in detail
 ├─ Income day (next)
 ├─ Envelope
 ├─ Check an amount            Track and Link
 ├─ Needs a home               Track and Link, only when something waits
 └─ Where your cash is         Link

Days
 ├─ Income day
 │   ├─ Confirm money arrived (sheet)
 │   │   └─ Checklist: bills to pay, money to move
 │   ├─ Planned and confirmed (record)
 │   └─ Correct a confirmed day
 └─ Expected (expense or income) → the Bill or Income form (proposals: later)

Plan  (pills: Income · Bills · Envelopes · Goals; a pill is drawn once its screen exists)
 ├─ Income source → Pay line
 ├─ Bill
 ├─ Envelope → Purchases (Track and Link) · History
 ├─ Goal
 └─ More
     ├─ Change log → Planned and confirmed
     ├─ Settings → Tracking and linking → Where is your money now?
     │   └─ Delete your plan (typed phrase, destructive confirm, back to first run)
     ├─ Priorities          later
     ├─ What if             later
     ├─ Accounts            later
     └─ Plan as of a date   later

Any item → Change (from when, effect) → Cover it

Spend  (Track and Link)
 ├─ Purchase → notes, links, receipts, group
 ├─ Add purchase
 ├─ Import a CSV
 ├─ Needs a home
 ├─ Card reserve
 └─ Check a balance
```

Home, Days and Plan are always present. Everything not a tab is a full screen or a sheet over the screen it came from.

---

## 3. Screens

Drawn on the canvas, in these groups. Each row names what the picture does not show.

| Canvas group | Screen | Notes the picture does not carry |
|---|---|---|
| The app | Home, Days, Plan, Spend | **As built (lists redesign):** Home opens on "Your plan holds through Oct 29", the Free to spend card (its range caveat behind a help icon in the card), one "N things to fix" row that opens the list of problems (each a door to its day or the bills), the next income day as one row, and the envelopes: two-column tiles at Track (the figure large, "left" or "over") and rows at Plan, each opening the envelope's sheet. Days has one headline line (the stance and range caveat behind its help icon) with "+ Expected", the same counted problems row, and the income days as rows with one line of detail (the day and pay, or what runs short). Plan's rows are the one anatomy (badge, name, one muted line, the figure, a chevron) and open the item's sheet; the goals' range caveat is a help icon by the section title. Home's "Needs a home" and "Where your cash is" rows appear only when there is something behind them. Days lists three income days and folds the rest behind "Show N more". Plan shows a search from 8 rows. On the Bills pill, bills sit under their group (for example Subscriptions) with the group's monthly total; a bill with no group is listed after the groups. Spend loads one date window at a time. |
| The app | Expected | **As built:** "+ Expected" asks Income or Expense first (nothing preselected) and opens the Bill or Income form, which saves at once; Group, Ends as a separate row and the proposal summary with Apply / Edit / Not now are later (Cover it, Put it to work). Repeats offers Once, Weekly, Every other week and Monthly. **Design intent:** Reached from "+ Expected" on Days. "Group" is optional and picks an existing group or names a new one. "Starts" can be any future date; nothing changes before the first income day that has to fund it. "Repeats" is Once, Weekly, Monthly or More (every N weeks, yearly). "Ends" appears only when it repeats and offers never, on a date, after N times, or after a total; the proposal summary states the total and the last date. A range is planned at the stance's end (high for expenses by default) and the amount is spread over the income days before the date. Free to spend is drawn on first; when it is not enough, the proposals take from other envelopes and the person picks which ("Take it from Vacation fund instead"). |
| The app | Expected income | The Income choice on the Expected screen. Adds a "From" row (an existing source or a new one) and reads "Arrives" for a one-time income and "Starts" when it repeats; the Ends choices (never, on a date, after N times, after a total) appear once it repeats, as they do for an expense. A range is planned at the low end under a conservative stance. It shows as a new income day marked expected, and if the real amount is higher the extra goes to Free to spend. A repeating one gets the same Ends choices as an expense. |
| Payday | Income day (draft) | **As built (lists redesign):** the title is the day ("Thu, Oct 29"); a header card holds the source and pay, the pay as the hero figure and one status line (which end of a range it is planned at, or "Expected. A draft until the money arrives."). Funded lines follow in funding order as rows (badge, name, one line, amount: a held line reads "Held until you choose", a short one "Short by $30.00", a bill its share, anything else its cadence), "Left from this day" is the last row of that list, and a line the money did not fully cover sits under "Not fully funded". A line opens its sheet: what it got, its priority and reason, and Top up, Leave it short or Undo my choice for a held line, then the item's Change (from this income day, or for this day alone) and the rest of the item sheet. "More about this day" holds Funds, Undo my choices for this day and Did not arrive. "Confirm money arrived" is pinned at the foot, off while a line is held, with the reason beside it. Opening it changes nothing. |
| Payday | Confirm | "Confirm money arrived" is the income day's primary and opens a sheet (a drawer on a phone, a modal from `sm`) with the amount that arrived (it starts at the expected figure), the date it arrived (today, never later) and, once the amount differs, an optional note. A line under the amount says what the difference does: the extra goes to Free to spend, a shortfall comes out of it. The button is off while a held line is unresolved (the day says so) and the sheet says what it needs while the lines take more than arrived. Offline, the sheet stays open and says confirming needs a connection. A "Lines" row under the amount ("Choose where the $100 goes", "Choose where the $50 comes from", or "Adjust the lines" when the amount matches) swaps the sheet's content in place to the draft lines, each with an amount field and, once changed, its planned figure and an optional note; extra money stays in Free to spend unless a line takes it, and a shortfall deeper than Free to spend is pre-filled lowest priority first for the person to change. "Did not arrive" sits under the lines; the day then shows that it is off the plan with "Put this day back". |
| Payday | Checklist | A "Mark everything done" checkbox covers the whole list and each group (Bills to pay, Move to accounts) has its own once there is more than one; both show a partial state when some items are ticked, with an "N of M" count. "Move to accounts" appears only once accounts are named. A bill that is not set aside in full (rent that is half funded) waits under "Waiting for more money" with its progress and no box. Tapping a bill row ticks it and its chevron opens the bill's sheet, where "Mark paid" ("Mark not paid" once paid) lives; ticking never marks a bill paid, marking a bill paid ticks it. *As built (lists redesign):* the confirmed day opens on a header card with what arrived, then the checklist, the lines with "Left from this day" as the last row, and "More about this day" (Planned and confirmed, Correct this day). |
| Payday | Planned and confirmed | Reached from the confirmed income day. Money and Free to spend each show what was planned and what arrived, "What differed" lists the amount with its note, and the lines that matched the draft fold behind one row. Only differing lines are marked, each as planned against confirmed with its note, and the rest fold behind one row. |
| Changing the plan | Change log | Plan > More > Change log, a `Subview`. Newest first, one window of dates at a time: pills pick the window length (30 days, 3 months, a year), "Older" and "Newer" move it, and an Item row (a drawer on a phone, a popover from `sm`, with a search past twelve names) filters to one item by name. Each entry shows its kind, when it was made, what it was ("Rent: Amount $1,250.00 to $1,300.00, from Dec 1, 2026."), "Covers income days from December 1" and the reason, if one was given. An entry that shaped an income day since confirmed has a "Planned and confirmed" chip that opens that day's record. Search appears from eight entries and covers only the window in view, which a line under it says; thirty entries show before "Show more". An entry that will not open here shows as unreadable, never as a gap. The starting point, level moves and applied what-ifs join the log when they exist. |
| Changing the plan | Envelope, over | "Cover it" is drawn only while the envelope is over and no overflow is set. An envelope with an overflow target pays an overspend from it on its own, and the fallback balances are listed under the envelope as separate lines. Overflow target and funding rule open the Change flow. |
| Changing the plan | Overflow | Opened from the envelope's "overflow goes to" row. Two choices: nothing (Cover it applies) or an ordered list of envelopes, any number of steps. The example shows how a purchase splits across the steps. Money moves only when a purchase goes over, each move appears in the change log, and fallback balances are never added into one number. |
| Changing the plan | Change | *As built (lists redesign):* every income, bill, envelope and goal row opens the item's sheet (`ItemSheet`): its figure large with up to three short facts (priority, schedule, progress) and any change ahead ("From December 1: Amount $1,250.00 to $1,300.00"), then Change it, Mark paid (bills), What it funds (income), Spending (envelopes at Track), Stop or pause (Pause saving, End it, Archive, each swapped in place behind ‹ Back) and History (the change log filtered to it). Change it closes the sheet and opens the item's form. *Before:* each row had a "Change" chip that opened its form with the saved values (a pay line, a source's name, what it funds). Under the fields: "From when" (From now on, From a date ahead with a date) and "What this changes", the first three affected income days with Free to spend now and after and the lines that move, then "Show all N". "Next" swaps in "Why the change?" (starter chips, one note) with "Save without a reason". A change that has not started shows on its row ("From December 1: Amount $1,250.00 to $1,300.00"). "Top up" and "Cover it" appear only when a day goes short (later issues). |
| Changing the plan | What if | A banner stays on every screen while one is open. Apply turns each change into an ordinary change with its own "from when". |
| Levels, starting out, purchases | Tracking and linking | *As first shipped (Issue 22), Settings > Tracking, with no accounts or linking yet.* One choice for the whole plan, "Plan only" or "Plan and track spending", with a line of what each means and, at Track, "Tracking since October 23." Choosing Track opens "Where is your money now?"; choosing Plan asks once ("Stop tracking") and says everything stays in history. A tracking history lists each stretch (three shown, then "Show all"). Moving up again starts fresh from a later day, and the sheet says when the earliest day is. The accounts block appears only while tracking is on. It lists every account by name and kind. Each one is linked on its own, or shows that linking is not available for that institution and the balance stays by hand. |
| Levels, starting out, purchases | Where is your money now? | *As first shipped (Issue 22): one money-on-hand total, then the envelopes, goals and bills as one-line amount rows, with Assigned and Free to spend (or "Over-assigned $X") in a card above them; Amounts from days you already confirmed are filled in; the rest you add.* One row per account, with its institution and kind, and "+ Add an account". Each account is counted toward the total or left out, so a brokerage or retirement account can be listed without being spent. Reads "Over-assigned $X" when more is assigned than held. Used again when tracking starts and when an account is linked. |
| Levels, starting out, purchases | Starting out and Free to spend | Five steps, one question each: income (required), bills, envelopes and goals, where things stand, then the next income day. Every step but income has a Later, and each form is the one used on Plan. Where things stand is a sheet with the day, the money on hand and one-line rows for each goal and bill that open their own amount (six shown, then "Show all"). Home leads with Free to spend, which says "Not set yet" until money on hand is entered; its detail lists money on hand and what is assigned to bills, goals and envelopes and holds the one door to change the starting amounts. |
| Levels, starting out, purchases | Check an amount | *As built (lists redesign):* at Track the Spending group of each envelope's sheet and a row on the Free to spend detail open it; Home no longer has its own button, and the prompt sits behind a help icon by the Amount label. *Before:* a "Check an amount" button under Home's envelopes and the Spending group of each envelope's More sheet at Plan (Track) open a `Subview`: an amount, the envelope pills, and one answer card that updates as you type ("Dining out would be $18.00 over.", then where it could come from (Free to spend first when it holds money, then the other envelopes lowest priority first), with what each would give and leave, and any rest that nothing could cover; or "It fits. Groceries would have $12.00 left."). Nothing moves. |
| Levels, starting out, purchases | Purchase | Notes, links and receipts never change a balance. *As first shipped (Issue 24), Spend tab and "New purchase".* The tab is drawn only at Track. Its header says "Purchases" with "+ New purchase"; below, a search from 8 rows, thin filter pills for the envelopes that have purchases (with counts), then purchases newest first under month dividers, 30 at a time. A row is where, the day and the envelopes it came out of, and the amount; a refund reads "+$20.00". *As shipped (Issue 25):* a row opens the purchase (a `Subview` with the amount, day, where, note and each envelope's part, a trash icon that asks "Remove this purchase?" naming the place, amount and what comes back, and "Change this purchase", which opens the same form as New purchase with its fields filled in; "This is a refund" is not offered there). An edit or a removal is kept in the change log as a Purchase entry. Another device's change since the purchase was opened is said in the footer and nothing is saved. Nothing spent yet is one friendly card. The form is a sheet: amount, one envelope (pills; "Split between envelopes" opens a view with each envelope's share and "Split evenly"), the day (today), and "Add where" and "Add a note" chips. "This is a refund" asks which purchase it is for (or "Not tied to a purchase", returning to Free to spend or a picked envelope). The line under the envelopes says what it does before saving ("Dining out would be $18.00 over. Free to spend drops by $18.00."); over is shown, never blocked. At Track an envelope's sheet has a Spending group: "Add purchase" (already pointed at that envelope), "Purchases" (the Spend list filtered to it) and "Check an amount"; Home's envelope tiles open that sheet and Home has its own "+ Add purchase". *As built (lists redesign):* the filter pills are one thin row that scrolls sideways (name and count), and a purchase row is the badge, where, one line (the day and the envelopes) and the amount. Home and Plan envelope figures read "left", or "−$18.00 over". |
| Levels, starting out, purchases | Needs a home | A rule is offered after three identical assignments and never applied on its own. |

**Not yet drawn:** the income source and pay line detail screens, bill and goal detail screens, Priorities, Accounts, Plan as of a date, Check a balance, Card reserve, Import a CSV, Where your cash is, Cover it as its own screen, Notification settings (four switches with a one-line explanation each, Next Steps). They follow the same patterns as the drawn ones.

**Where this screen set stops.** Envelopes, bills and income days stay in the tens. Purchases and history do not, so Spend and the change log load one date window at a time and search covers the window in view, not all time (encrypted fields cannot be searched on the server). *As built:* the change log has Older and Newer windows; Spend and Days list the months since the newest monthly closing (every figure still counts older purchases), and a window for older purchases and income days is not built yet, so an older purchase cannot be opened, edited or picked as a refund's original.

**Updating your history (Issue 28).** Figures from earlier months are added up once a month and kept as closings, so a plan opens on the months since the newest one, however old it is. The one thing a person sees of it is a card, "Updating your history", drawn in place of every screen while closings are rebuilt: the first open of a plan with months behind it (about a minute at four times slower than a laptop for five years, once), after a purchase, income day or payment in an earlier month was changed, or when two months have passed unopened. It says that nothing is changed or lost and is one card with no button, so no figure from before the change is ever drawn beside it. When it cannot finish (offline), the plan opens on what it has, or says "Your history could not be updated right now" with "Try again" when it has nothing. Spend and Days then list the months since the newest closing, and Spend says so ("Showing purchases from Oct 1. Earlier purchases are counted in your figures but not listed."); "Where is your money now?" asks for a day inside that window.

---

## 4. Reusable Components

Existing repo components are used as they are. A new component whose props name no money concept goes in central `src/components`; one that does stays in the app.

| Name | Used in | Purpose | Status |
|---|---|---|---|
| `Subview`, `BackLink` | Income day, Envelope, Purchase, Needs a home, Record, Starting Out | Full screens with a back control | Existing |
| `FormSheet`, `ModalFooterActions`, `DeleteIconButton` | Every form | Drawer on phones, modal from `sm`, pinned footer | Existing |
| `SectionHeader`, `SectionDivider` | Plan, Spend, Days | Titles with one action; day groups | Existing |
| `PillGroup` | Plan pills, From when, Needs a home | One of a few options | Existing |
| `SummaryEditor`, `SummaryRow` | Envelope, Purchase, forms | A value shown as a row that opens its editor | Existing |
| `RevealChip` | Forms | "+ Add a note", "+ Add an ending" | Existing |
| `MoneyInput` | Every amount | Cents in, formatted at the edge | Existing |
| `StatTile`, `HelpTip` | Home, Envelope | A number with a caveat or explanation | Existing |
| `EmptyCard`, `SearchInput`, `ShowMoreButton`, `UndoSnackbar` | Lists | Empty state, search, folds, undo | Existing |
| `UnderlineTabs` | Envelope, Income source | One tab bar per detail screen | Existing |
| `AmountField` | Pay line, Bill, Envelope, Goal | Exact amount, range, or rate × hours, with a stance label; a percentage of a caller-named thing (whole and half percents) and the rest are modes on the envelope and goal forms | New, in the app |
| `EffectPreview` | Change, What if, Expected | Before and after for each affected income day | New, in the app |
| `FromWhenPicker` | Change | From now on, from this income day on (from an income day), from a date ahead, this income day only (envelopes and goals), for a stretch (N income days or until a date); only the answers that apply are drawn | New, in the app |
| `ItemRow` | Every list | The one row: badge (or a date chip), name, one muted line, the figure, a chevron; a checklist row ticks on a tap and opens from its chevron | New, in the app |
| `ItemSheet` | Every list row | The item's figure and facts, then Change it, Mark paid, What it funds, Spending, Pause saving or Start saving again (goals), End it, Archive (each in its own view with the effect and a reason) and History | New, in the app |
| `IncomeDayCard` | Home, Days | An `ItemRow` with a date chip: source, one line (day and pay, status, or what runs short), amount | New, in the app |
| `DraftLine` | Income day | An `ItemRow` for a line (name, one fact, amount) that opens the line's sheet with its reason and choices | New, in the app |
| `PriorityBadge` | Confirm, Correct | Must, Should, Want as a soft tint; rows say the priority in their sheet instead | New, in the app |
| `HoldsThroughLine`, `LookaheadWarnings` (in `CoverageHeadline.tsx` and its own file) | Home, Days | "Your plan holds through Dec 18" (with a help icon on Days for the stance cushion and ranges), and one "N things to fix" row that opens every warning (a Must or a bill that runs short, a bill with no income before it is due, a bill past due and not marked paid, income that ends) in a sheet; the line and the warnings are drawn just after the screen's own figures, since the walk over a year of income days is the slowest thing on it (`useDeferredLookahead`) | New, in the app |
| `LevelGate` | Home, Plan, Spend | Draws its children only at the level that needs them | New, in the app |
| `BeforeAfterRow` | Record, What if | A line with two values, changed ones highlighted | New, in `src/components` |

---

## 5. User Journeys

Arrows read left to right. A branch is in parentheses.

1. **First session.** Sign in → add an income source (schedule, amount, next date) → add a bill → add an envelope → say where things stand (or "Later") → Home with a draft for the next income day. Only the income source is required.
2. **Payday.** Home → next income day → read the draft → (change a line for this day) → Confirm money arrived → enter amount and date → Confirmed → checklist → tick bills and transfers → Done.
3. **The money was not what was planned.** Confirm → enter the real amount → (same: confirm) → difference shown → Free to spend by default, or edit the draft lines → add a note → Confirm → History keeps planned and confirmed.
4. **Change the plan.** Plan → open Groceries → Change → new amount → from when → effect on each upcoming day → (a day is short: Top up or Cover it, pick what gives) → Apply change → change log entry with an optional note.
5. **Add a purchase** (Track and Link). Envelope or Spend → Add → amount → envelope (already set from an envelope) → date → Save → (over the envelope: it shows how far over, Free to spend drops, Cover it is offered).
6. **Link an account** (leaves the app). Settings → Tracking and linking → Link → explainer (read-only, sign in at the bank) → the bank's own sign-in in a new tab → (not approved: back in Runway, nothing linked) → pick a start date → Where is your money now? → hand-entered purchases offered as matches → Linked.
7. **Move down a level.** Settings → Tracking and linking → (unlink an account: new purchases stop, history stays) or (stop tracking: purchase screens hide, history stays) → figures change from *safe to spend* to *left*, or to *assigned* → recorded in the change log.
8. **An expected expense or income.** (As built the form saves the bill or income at once; the proposal step is later.) Days → + Expected → expense or income → name, amount or range, start date, repeats (and ends, if it repeats) → proposed changes for each income day it touches, with the total and the last date → (Edit) / Apply / Not now → applied changes appear in the change log as ordinary changes.

---

## 6. Form Field Organization

Container for every form: `FormSheet`. "Other" means the field offers "Other — add your own".

| Entity | Initial fields | Later fields | Later-set entry point | Grouping | Fixed-choice fields |
|---|---|---|---|---|---|
| Income source | Name, first pay line (schedule, amount, next date) | Start date, end date | Inline reveal: "+ Add an end date" | None | Schedule: weekly, every 2 weeks, twice a month, monthly, one time, irregular. No Other. |
| Pay line | Name, schedule, amount, next date | Hours and rate, ending (date, count, total), pairing, gross breakdown *(later)* | "+ Add an ending" inline; pairing from the source's detail ("Funds…"); hours and rate from the amount field's switch | None | Amount form: exact, range, rate × hours. No Other. |
| Bill | Name, amount, due date, repeat, priority (starts at Should), funded from (suggested, or income days you pick, offered only for a one-time bill) | Emoji, group, range, ending (asked once it repeats), window instead of a date, already set aside | "+ Add a range" and "+ Add an ending" inline; "already set aside" from the line-up screen and the bill's detail (contextual modal); funded-from days from a summary row on the detail | None | Repeat: none, weekly, every N weeks, monthly, yearly. No Other. Priority: Must, Should, Want, starts at Should. |
| Envelope | Name, amount (exact, percentage or the rest), funding rule | Priority, overflow target, emoji, chosen days | Priority, overflow and emoji are summary rows on the detail (emoji opens a picker; with none set, tiles show the name's first letter); chosen days open a day picker from the funding-rule row | None | Funding rule: every income day, every other, every third, monthly first, monthly last, monthly split, chosen days. No Other. |
| Goal | Name, target | Date, priority, what it holds now, account | "What it holds now" from the line-up screen (contextual); date and account as inline reveals | None | None. State (active, paused, completed, archived): pause and archive are actions in the row's More, completed is worked out from the target. |
| Purchase *(Track and Link)* | Amount, envelope, date (today) | Where, note, link, receipt, paid by, split, group | *As first shipped (Issue 24): where and note are chips; split is a chip that opens its own view; refund is a chip that adds a "Refund of" row; link, receipt, paid by and group come later.* Summary rows on the purchase detail; split from a "Split" row | None | Paid by: cash or debit, card. No Other. |
| Change | New value, from when | Note | "+ Add a note" inline | None | From when: this income day, from now on, from a date, for a stretch. Ending is its own row action ("End it", last day picked there), since an edit's fields would not apply. No Other. |
| Expected | Expense or income (asked first, nothing preselected; an expense opens the Bill form and an income the Income form), name, amount, starts (today or later), repeats (once by default) | Group, range, ending (only when it repeats) | "Use a range" switch on the amount; "Ends" row appears once Repeats is not Once | None | Expense or income. Repeats: once, weekly, every other week, monthly ("More" is drawn when yearly and every N weeks exist; hiding one pill behind it saves nothing). Ends: never, on a date, after N times (after a total comes later). No Other. |
| Account | Name, institution, kind, balance held | Counted toward the total (on by default except investment), interest rate, goals and envelopes held | Rate and holdings from the account's detail; counted switch on the account row | None | Kind: checking, savings, cash management, investment, other. Other is a label, not a new kind. |
| Loan *(Next Steps)* | Name, balance, rate, payment, next payment date | Extra payments | A "Make an extra payment" row on the loan's detail | None | None. |
| Tax or deduction *(Next Steps)* | Name, percentage or exact amount | Whether it builds an asset | Inline reveal | One `Disclosure` per group on the pay line | Type: tax, deduction. Other allows a custom name. |

Notes on the table:
- "Amount" is always `AmountField`: exact by default, with Exact or A range pills above it. A range shows both ends and the plan's stance ("Planned at the low end").
- "Priority" is Must, Should or Want on a bill, envelope or goal. "Funding rule" is when an envelope receives money. They are different fields and never share a row.
- No entity has an initial set long enough to need steps or `Disclosure`, apart from the later tax and deduction list.
- Priority is asked on the form of a bill, envelope or goal, and starts at Should so a quick add never has to answer it.
