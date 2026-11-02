# Going Once — Design canvas

## How to publish this

The spec for the Design artifact, board by board. Read with `UX.md`, which carries what pictures can't.

- **Boards** are 390 x 844 phone frames. In an app screen, the site header is 60px (hamburger, the 🔨 Going Once logo and name, avatar) and the floating tab pill is about 86px, so about 700px is left for content. A subview has no site header: it is a rounded card on a kraft-tinted backdrop, with its own 56px title row and a 72px pinned footer. A board that overflows is **clipped, not scrolled**. Each element list below runs top to bottom, with the approximate height of each block, and marks where the board clips.
- **Rows** are laid out by person: seller, co-seller (list and thing), co-seller (inbox and relisting), buyer, then a row of states that cut across all three. Each row starts with a title note.
- **Person tag:** a small pill in each board's top-right corner, outside the phone frame: `Seller`, `Co-seller`, `Seller · Co-seller` or `Buyer`.
- **Emoji:** only the 🔒 on private values, the 🔨 logo and the emoji chip that `EmptyCard` and `IntroCard` draw (🏷️). A thing carries no emoji.
- **Light mode** throughout. The dark tokens are listed so a reviewer can ask for a dark pass.

## What is published

Published as 25 boards: 0 (Main), S4, S6, S8, S9, S11, S12, S15, S16, T0, T3, T4, T5, T7, R0b, R1, R2, R3, R6, R11, B1, B3, B4, B5, B8. Several of these carry their variants as states (B4's four footer notes, R3's getting / ready / copied / failed rows, R6's size / building / ready / failed, T7's under-the-floor and refused, B1's own-page band).

Every other board below is a spec only. Its per-screen rule is in `UX.md` "Screens" (marked "spec only") and it gets drawn if a review asks for it. Round 3's edge states (the E boards) are spec only too.

## Look: the tag sale

| Token | Light | Dark | Used for |
|---|---|---|---|
| background | #FBF8F2 (paper) | #16130E | page |
| card | #FFFFFF | #221E17 | drawers, cards, the subview card |
| primary / -foreground | #1F4D3A (ink green) / #F7F2E8 | #8CC7A6 / #10241A | the one filled button, selected pill fill |
| accent / -foreground | #EAD6AE (kraft) / #4A3519 | #4A3A22 / #F1E3C4 | price tags, the private band, EmptyCard, subview backdrop |
| muted / -foreground | #F1EBDF / #6E6556 | #2A251C / #B5AA97 | quiet blocks, captions |
| border | #E3DACB | #3A3327 | hairlines |
| Available dot | #2E8B57 | #5DBB86 | status sticker |
| Pending dot | #D9952B | #E8B25A | status sticker |
| Sold dot | #9A9183 | #8A8273 | status sticker |
| destructive | #B3261E | #F2B8B5 | Delete, Remove |

Shapes: cards and drawers are `rounded-2xl`. Inputs, pills and buttons are fully round. A **price tag** is a kraft chip, `rounded-lg`, 13px semibold tabular text with a 4px punched hole drawn on its left edge. A **status sticker** is an 8px dot followed by the word, 13px. Type: titles 22px semibold, row titles 16px, muted lines 14px, captions 12px.

## Example data (every board reconciles to this)

Sale **Fall clear-out**. Pickup area "Capitol Hill, Seattle". Note for buyers: "Evenings and weekends. Cash or Venmo." Seller **Maya**, co-seller **Theo**. Today is **Mon Nov 2**.

| Thing | Photos | Condition | Asking | Floor 🔒 | Original | Status | Paid |
|---|---|---|---|---|---|---|---|
| Gray sofa | 5 | Like new | $350 | $300 | $900, hidden; from West Elm, 2021 | Available | |
| Dining chairs (set of 4) | 4 | Good | $120 | | | Available | |
| Coffee table | 4 | Good | $60 | | | Available | |
| Floor lamp | 3 | Good | $25 | | | Available | |
| Area rug | 4 | Well used | $30 | | | Available | |
| Plant stand | 3 | Like new | $15 | | | Available | |
| Road bike | 6 | Good | $200 | $160 | | Available | |
| Oak desk | 5 | Good | $150 | $120 | $400, shown as "Was $400" | Pending for Nate, pickup Sat Nov 7 | |
| 27" monitor | 7 | Good | $90 | | | Pending for Dev | |
| Stand mixer | 4 | Like new | $180 | | $380, hidden | Sold Oct 31, Venmo | $170 |
| Bookshelf | 3 | Fair | $40 | | | Sold Oct 30, Cash | $40 |
| Cast iron pan | 2 | Good | $25 | $20 | | Sold Nov 1, Cash ("Sold under your floor price") | $15 |
| Bluetooth speaker | 1 | Good | none | | | Not listed yet (no price) | |
| Desk chair | 3 | Fair | $40 | | | Taken off the list ("Kept") | |

**Figures**
- Available: 7 things, $800 asked.
- Pending: 2 things, $240 asked.
- Sold: 3 things, collected **$225 of $245 asked**.
- Left: 7 things at $800, plus "1 has no price yet".
- The public page shows **9 for sale** (7 Available, 2 Pending).
- Save all photos covers Available and Pending: 9 things, **41 photos, about 45 MB**.
- Gray sofa's 5 photos: about 5 MB.

**Inquiries (7)**
- **New 3:**
  - Priya, Gray sofa, 10:57 AM: "Could I come see it Thursday after 6?", phone 206-555-0142.
  - Marcus, Road bike, 9:12 AM: "What size is the frame?", marcus.l@example.com.
  - Lena, Oak desk, yesterday: "If the pickup falls through I'd take it", 206-555-0177.
- **Handled 4:** Nate (Oak desk, by Theo), Dev (27" monitor, by Theo), Jo (Stand mixer, by Maya), Kim (Bookshelf, by Theo).

**Scale fixture** (boards T12 and B10): 50 things. Available 38 ($4,120 asked), Pending 4, Sold 8; **42 for sale** publicly.

## Sticky note (beside board 0)

> Board 0 is clickable. **Viewing as** switches between Maya (the seller), Theo (the co-seller) and a buyer on the public link. **Data** switches between the seeded sale, a first run and 50 things. Tap a thing to open it, use the three tabs, walk New thing from the header, and try Mark pending and Mark sold. The rows below are each person's screens, still, with the person in each board's corner.

## Board 0 — Interactive shell

**Tweaks** (the canvas's tweak panel)
- **Viewing as:** Maya, seller / Theo, co-seller / Buyer.
  - Maya and Theo see the same app. Only Maya gets Delete thing, Add co-seller, the link switch and its ⋯, Details editing, Finish the sale and Delete this sale (see `UX.md` "Who sees which screen").
  - Buyer swaps the whole board to B1.
- **Data:** Seeded / First run / 50 things.

**Frame** (Things tab, seeded)
- Site header, 60px.
- Title row, 48px: "Fall clear-out" (22px). On the right: + New thing (a filled pill), the sort icon, ⋯.
- Search, 48px: "Search 14 things".
- Status switch, 32px: thin pills **Available · 7**, Pending · 2, Sold · 3.
- Door row, 40px: "1 not listed yet" on the left, chevron on the right.
- Rows, 72px each: T1's seven Available rows (about 504px, clipped after the sixth).
- Tab pill floating 16px above the bottom: **Things**, Inbox (with a 3 badge), Sale.

**Clickable**
- Status pills, which switch the rows.
- A row, which opens the thing's drawer (T4/T6/T8 by status). Inside it: Mark pending (T5), Mark sold (T7), ⋯ (T10) and Back.
- New thing, which walks S4 → S5 → S6 → S7 → S8 → S9.
- The Inbox tab (R1), and an inquiry (R2).
- The Sale tab (S11 or S12 by person). Its tiles jump to Things on that status.
- ⋯ → Save all photos (R6 → R7 → R8).

## Row 1 — The seller: start, walk through and add, hand off

Title note: **"Maya adds each thing once, photos first, then hands the sale to Theo."**

**S1 · First run** · `Seller`
- Site header.
- 24px gap.
- EmptyCard, 112px: chip 🏷️, "Sell your things with a little help. Add them once, and someone you trust does the selling." A chip **Start a sale**.
- Nothing else. No tab pill (there is no sale yet).

**S2 · Start a sale** · `Seller` · a drawer over S1
- Drawer title "Sale".
- Name field, filled "Fall clear-out".
- Under it, a caption "Ideas" and dashed chips: Clear-out, Garage sale, Estate sale.
- Pickup area, added: "Capitol Hill, Seattle", with the hint "An area, never your address. Buyers see this."
- Add chip: + Note for buyers.
- Pinned footer: Cancel, **Start**.

**S3 · Things, first run** · `Seller`
- Site header.
- Title row: "Fall clear-out", + New thing.
- EmptyCard 🏷️: "Add your first thing: photos first, then a name and a price."
- No search, switch or ⋯.
- Tab pill (Things, Inbox, Sale).

**S4 · New thing: photos** · `Seller` · subview
- Title row: ‹, "New thing".
- Question, 28px: "Take a few photos".
- Hint: "Different angles help. The first one is the cover."
- Strip, 96px: 3 square thumbs, 88px each.
  - The first is tagged "Cover" (kraft).
  - Each has a ✕ in its corner.
  - The third shows a small progress ring (still shrinking).
- Big round button, 56px, full width: 📷 **Take another**.
- Secondary button: Choose photos.
- Quiet line: "Skip photos for now".
- Counter at the strip's right end: "3 of 12".
- Footer: note "Saved", **Next**.

**S4b · A photo's sheet** · `Seller` · a drawer over S4
- The thumb shown at 120px.
- Rows: Make cover, Move earlier, Move later, Remove (red).
- Done.

**S5 · Name** · `Seller` · subview
- Title row: ‹, "Oak desk" (it changes as the name is typed).
- Summary row "Photos": 3 thumbs, "+2", chevron.
- Question: "What is it?"
- Field with "Oak desk" typed.
- Footer: note "Saved", **Next**.

**S6 · Price** · `Seller` · subview
- Summary rows: Photos, Name "Oak desk".
- Question: "What are you asking?"
- AmountHero, 48px: **$150**.
- Dashed chip under it: It's free.
- Revealed under that: "🔒 Floor price" MoneyInput $120, with the line "Only you and your co-sellers see this. Buyers never do."
- Footer: note "Saved", **Next**.

**S6b · Floor above asking** · `Seller` · subview
- S6 with the floor at $180.
- Footer note: "Floor is above the asking price". Next stays on.

**S7 · Condition** · `Seller` · subview
- Summary rows: Photos, Name, Price "$150 · 🔒 floor $120".
- Question: "What shape is it in?"
- Pills, 40px, wrapping: New, Like new, **Good** (pressed), Fair, Well used.

**S8 · Review** · `Seller` · subview
- Summary rows: Photos (5), Name "Oak desk", Price "$150", 🔒 Floor "$120", Condition "Good".
- Heading "More about it". One row: Original price "$400", with a sub-line "Buyers see Was $400".
- Add chips: + Description, + Brand or model, + Size, + Where you got it, + Notes.
- Footer: note "Saved · Listed", Done, **Next thing**.

**S8b · Original price** · `Seller` · a drawer over S8
- MoneyInput $400.
- Switch row, on: "Show to buyers".
- Line: "Buyers see: Was $400, now $150".
- Footer: Remove (small, left), Done.

**S8c · Not listed yet** · `Seller` · subview
- S8 for "Bluetooth speaker": no price, so the Price row reads "Add a price".
- Footer note: "Saved · Not listed yet: add a price".

**S9 · Next thing** · `Seller` · subview (published; matches the board)
- S4 fresh (empty strip, big **Take a photo**).
- Under the title row, a line: "Added Oak desk · **Undo** · 6".
- Under the buttons, a quiet count: "6 things added this sitting".
- Footer: Done.

**S10 · Uploading in the list** · `Seller`
- Things with the newest row (Oak desk) at the top. Its thumb has a progress ring and the muted line "Uploading 2 of 5 photos".

## Row 2 — The seller: the sale, people, link, finishing

Title note: **"Where the sale stands, who is helping, the public link, and finishing up."**

**S11 · Sale tab** · `Seller`
- Site header.
- Title "Fall clear-out".
- Tiles, 2-column grid, 2 rows (about 200px):
  - **Collected $225**, "of $245 asked".
  - **Pending 2**, "$240 asked".
  - **Left 7**, "$800 asked · 1 has no price yet". This tile takes the full row.
- Card "Public page", about 150px:
  - Switch row: "Public page", on.
  - The link, shortened: `apps.moondreams.dev/going-once/s/k7Q…`.
  - Buttons: **Copy link**, Open, ⋯.
- Card "Notifications", 56px: switch row "Tell me when someone's interested", on (yours, for this sale). Sub-line: "This phone: allowed". On a phone that hasn't allowed it yet: "This phone hasn't allowed it yet · **Allow**", which opens R0b.
- People (SectionHeader with + Add co-seller), clipped from here down:
  - Maya (you): "Seller".
  - Theo: "Co-seller".
- Not drawn below the clip: Details rows, Finish the sale, Delete this sale.
- Tab pill (Sale active).

**S11b · Sale tab, scrolled** · `Seller`
- People rows.
- Heading "Details". Summary rows: Name, Pickup area, Note for buyers.
- An ActionRow, framed: **Finish the sale**, "Turns the public page off. Buyers' contact details are cleared 30 days later."
- Last, red, on its own: Delete this sale.

**S12 · Add a co-seller** · `Seller` · drawer
- Title "Co-seller".
- Email field: "theo@example.com".
- Line: "They'll see everything about this sale, floor prices and notes included, once they sign in with this email. No email is sent, so let them know."
- Chip: Copy the Going Once link.
- Footer: Cancel, **Add**.

**S13 · Public page off** · `Seller`
- The Public page card with the switch off.
- InlineNotice (info): "Turning it on makes a link that shows photos, names, condition and prices of Available and Pending things. Never your floor prices, notes, buyers or who's selling."

**S14 · Get a new address** · `Seller` · confirm dialog
- Title: "Get a new address?"
- Body: "Anyone with the old link sees that the sale isn't there anymore. You'll share the new one."
- Buttons: Cancel, **Get a new address**.

**S15 · Finish the sale** · `Seller` · drawer
- Title "Finish Fall clear-out".
- Tiles: Collected **$225** of $245 asked, and Didn't sell **9**.
- What's left, named, so nothing is finished by surprise: "7 things didn't sell. 2 are still pending: Oak desk for Nate on Sat, 27" monitor for Dev."
- Three one-line facts, each with an icon column:
  - "The public page closes for everyone with the link, and notifications stop."
  - "On Dec 2, buyers' names, contact details and messages are cleared. Each inquiry keeps its thing and day."
  - "Nothing is deleted. Pending pickups can still be marked sold."
- Quiet line: "You can reopen it until Dec 2. Reopening stops the clearing."
- Footer: Cancel, **Finish the sale**.
- **The published board still says "Their messages stay" and doesn't name what's left; it needs this wording** (lead R2, product round 3).

**S16 · Finished sale** · `Seller` (the co-seller sees the band without Reopen)
- Things tab.
- A tinted band under the title, 56px: "Finished Nov 2 · Buyer details are cleared on Dec 2", with a chip **Reopen**.
- The status switch becomes **Didn't sell · 9** / Sold · 3.
- Didn't sell, in two parts:
  - The 2 Pending things first, each with its amber sticker: Oak desk "Pending for Nate · pickup Sat", 27" monitor "Pending for Dev".
  - Then the 7 Available things, each showing what it was asking: Gray sofa $350 … Plant stand $15.
- Footer line: "9 things · $1,040 asked".
- No + New thing, no ⋯ (Save all photos is gone).
- Quiet line under the list: "Reopen keeps the link off until you turn it back on."

**S16c · A pending thing in a finished sale** · `Seller · Co-seller` · drawer
- Oak desk as T6, with its sticker "Pending for Nate · pickup Sat Nov 7".
- Footer: Modify, ⋯, **Mark sold**. ⋯ holds Not sold after all and History.
- An Available thing here has no filled button, no Mark pending in ⋯ and no "Post it somewhere else". Its ⋯ holds Take off the list and History.

**S16a · Reopen** · `Seller` · confirm dialog
- Title: "Reopen Fall clear-out?"
- Body: "Buyers' details won't be cleared. The public page stays off until you turn it on in Sale."
- Buttons: Cancel, **Reopen**.
- After Dec 2 the body says instead: "Buyers' details were cleared on Dec 2 and stay cleared. The public page stays off until you turn it on in Sale."

**S16b · After the clearing** · `Seller · Co-seller`
- Inbox, Handled, in a finished sale.
- Rows read "Cleared · Gray sofa · Oct 29".
- An inquiry drawer has no name, contact or message. Its title is "Someone asked about Gray sofa", with one muted line, "Cleared Dec 2 when the sale had been finished 30 days", and no buttons.

**S17 · Your sales** · `Seller · Co-seller`
- Title "Your sales", + New sale.
- Rows:
  - Fall clear-out: "9 for sale · 3 sold".
  - Garage sale: "Rosa's sale · co-selling · 4 for sale".
- SectionDivider "Finished".
- Row: Spring clear-out, "Finished May 3 · $1,180 collected".

## Row 3 — The co-seller: the list and a thing, start to sold

Title note: **"Theo works the list: hold it, sell it, record what was paid."**

**T0 · Joined** · `Co-seller`
- Things, seeded.
- IntroCard 🏷️ above the search, 120px:
  - "Maya added you to Fall clear-out. Buyers' messages land in Inbox, and you can see floor prices and notes."
  - Capsule: "Get a buzz when someone's interested · **Turn on**".
  - ✕.

**T1 · Things, Available** · `Seller · Co-seller`
- Board 0's frame. The 7 rows, newest first:
  - Gray sofa: muted line "10:57 AM · Priya asked". Tag $350.
  - Road bike: "9:12 AM · Marcus asked". $200.
  - Dining chairs: "Good · 4 photos". $120.
  - Coffee table: "Good". $60.
  - Floor lamp: "Good". $25.
  - Area rug: "Well used". $30.
  - Plant stand: "Like new". $15.
- After the last row: "7 things · $800 asked", right-aligned under the tags. Below the clip; noted beside the frame.

**T1b · The ⋯ menu** · `Seller · Co-seller`
- A drawer with two roomy rows:
  - Save all photos: "Every thing for sale, as one download".
  - Open the public page: "See what buyers see".

**T2 · Things, Pending** · `Seller · Co-seller`
- Oak desk: "For Nate · pickup Sat". $150.
- 27" monitor: "For Dev". $90.
- Footer line: "2 things · $240 asked".

**T3 · Things, Sold** · `Seller · Co-seller`
- Stand mixer: tag $170, line "Asked $180 · Venmo · Oct 31".
- Bookshelf: $40, "Cash · Oct 30".
- Cast iron pan: $15, "Asked $25 · Sold under your floor price".
- Footer line: "Collected $225 of $245 asked".
- SectionDivider "Taken off the list".
- Desk chair: "Kept". No tag.

**T4 · Gray sofa, Available** · `Seller · Co-seller` · drawer
- Photo strip, 180px: 5 photos, sideways, peeking the second; "1 / 5" in the corner.
- "Gray sofa" (22px).
- Sticker line: Available.
- Private band (kraft tint, `rounded-xl`), about 120px:
  - Caption "🔒 Only you and your co-sellers".
  - Grid: Asking $350 · Floor $300 · Original $900 (hidden from buyers) · From West Elm, 2021.
  - Notes: "Small stain on the back cushion, faces the wall fine." Two lines at most.
- Like new · "Deep three-seater, washable covers." Two lines at most, then Show more.
- Heading "Interest · 1". Row: "10:57 AM · Priya", "Could I come see it Thursday after 6?", chevron.
- Clipped. Below: "Post it somewhere else" (see R3).
- Footer: Modify, ⋯, **Mark pending**.

**T5 · Mark pending** · `Seller · Co-seller` · swapped into T4
- Title line: ‹ chevron, "Who's picking it up?"
- Rows, each with a letter chip:
  - A: Priya, 10:57 AM.
  - B: Someone else.
- Chip: + Add a pickup day.
- Line: "Buyers still see it, marked Pending."
- Footer: **Mark pending**. Off until a row is picked; the note says "Pick who, or Someone else".

**T5b · Someone else, with a day** · `Seller · Co-seller` · swapped in
- B is picked, revealing a name field: "Nate".
- Pickup day: day pills Today, Tue, Wed, Thu, Fri, **Sat**, Sun, then "Other day".

**T6 · Oak desk, Pending** · `Seller · Co-seller` · drawer
- Photos.
- "Oak desk".
- Sticker: Pending, "for Nate · pickup Sat Nov 7".
- Private band: Asking $150 · Floor $120 · Original $400 (buyers see Was $400).
- Good · description.
- Interest · 2:
  - Nate: Handled by Theo.
  - Lena: New, yesterday.
- Footer: Modify, ⋯, **Mark sold**.

**T7 · Mark sold** · `Seller · Co-seller` · swapped into T6
- ‹ "What did they pay?"
- AmountHero **$150**.
- Line: "Asking $150 · 🔒 floor $120".
- Caption "How they paid (optional)". Pills: Cash, Venmo, Zelle, Other.
- Folded row: "Sold on · Today".
- Footer: **Mark sold**.

**T7b · Under the floor** · `Seller · Co-seller`
- T7 at **$110**.
- Warning notice under the hero: "That's under your floor price of $120. It still saves."

**T7c · Someone else got there first** · `Seller · Co-seller`
- T7 with the footer note in red: "Maya already marked this sold for $140."
- The primary is gone. Done.

**T7d · Sold, the confirmation** · `Seller · Co-seller` · swapped in, after Mark sold
- The Mark sold view stays open as its own confirmation:
  - Sticker Sold.
  - **$150**, with "Cash · today · by Theo".
  - The line: "Collected is now $375 of $395 asked".
- When someone copied the listing text: a warning notice, "Theo copied this listing on Oct 28. Take that listing down too."
- A chip: **Not sold after all**, which undoes the sale in one tap.
- Footer: **Done**, back to the drawer front.
- If nobody ever copied the listing text, there is no notice.

**T8 · Stand mixer, Sold** · `Seller · Co-seller` · drawer
- Photos.
- Sticker: Sold. "$170 · Venmo · Oct 31 · by Theo".
- Private band.
- No "Post it somewhere else".
- Footer: Modify, ⋯. No filled button.

**T9 · Change what was paid** · `Seller · Co-seller` · swapped in
- AmountHero **$160**.
- Effect line: "Collected goes from $225 to $215".
- Footer: **Save**.

**T10 · More, Available** · `Seller · Co-seller` · swapped in
- Roomy rows:
  - Mark sold: "Skip Pending, it's gone".
  - Take off the list: "Keeping it or gave it away. Leaves the public page and the totals."
  - History: "Who changed what, and when".
- Alone, red: Delete thing, with a corner sticker "Seller only".

**T10a · More, as Theo, right after adding** · `Co-seller`
- T10 plus, last and red, **Delete thing**, with the sub-line "You added it 4 minutes ago".
- Shown only within 10 minutes of Theo adding it, and only while it has never been Pending or Sold. Otherwise the row isn't drawn and Take off the list is his way.

**T10b · More, Pending** · `Seller · Co-seller`
- Back to available: "The pickup fell through. Buyers see it as Available again."
- Mark sold.
- History.

**T11 · History** · `Seller · Co-seller` · swapped in
- ‹ "History".
- Rows:
  - "Pending for Nate · Theo · Oct 31, 4:10 PM".
  - "Listed · Maya · Oct 28, 7:02 PM".

**T12 · Things at 50** · `Seller · Co-seller`
- Search: "Search 50 things".
- Switch: Available · 38, Pending · 4, Sold · 8.
- Rows to the clip.
- Noted beside the frame: "38 things · $4,120 asked".

**T13 · No match** · `Seller · Co-seller`
- Search "lamp shade".
- One framed block: "Nothing called that. Try another word."

## Row 4 — The co-seller: inbox and relisting

Title note: **"Interest arrives once, for everyone selling. Relisting elsewhere takes two taps."**

**R0 · First open of Inbox, asking** · `Seller · Co-seller`
- Inbox with the capsule above the switch: "Get a buzz when someone's interested · **Turn on**".

**R0b · The ask** · `Seller · Co-seller` · small modal (published; matches the board)
- "Turn on notifications?"
- "We'll buzz this phone when a buyer asks about something. The lock screen shows only the thing, never who asked or what they wrote."
- Quiet line: "If several come in at once, you get one buzz for all of them."
- Buttons: Not now, **Turn on**. Turn on is what brings up the browser's own prompt.

**R0c · Can't on this phone** · `Seller · Co-seller` · capsule
- "Notifications are blocked for this site. Allow them in your browser's settings."
- Or, on an iPhone outside the installed app: "On iPhone, add the site to your Home Screen first."

**R1 · Inbox, New** · `Seller · Co-seller`
- Thin switch: **New · 3**, Handled · 4.
- Rows, 76px each, with a 48px thumb of the thing:
  - **Priya**: "10:57 AM · Gray sofa · Could I come see it Thursday after 6?" (two lines).
  - **Marcus**: "9:12 AM · Road bike · What size is the frame?"
  - **Lena**: "Yesterday · Oak desk (Pending) · If the pickup falls through I'd take it".
- Tab pill with Inbox active.

**R2 · Priya** · `Seller · Co-seller` · drawer
- Title "Priya". Sub-line: "10:57 AM · New".
- The thing as a row: thumb, "Gray sofa", "$350 · 🔒 floor $300", chevron.
- Message in full.
- Caption "Reach Priya". Buttons: **Text**, Call. Under them, "206-555-0142".
- ActionRow: "Hold Gray sofa for Priya", "Marks it Pending. Buyers see someone's picking it up."
- Footer: **Mark handled**.

**R2b · Marcus** · `Seller · Co-seller` · drawer
- The same, with one button **Email** and "marcus.l@example.com" under it.

**R2c · Handled** · `Seller · Co-seller`
- R2 with the sub-line "Handled by Theo · 2:14 PM".
- No filled button. ⋯ holds Back to New and Delete.

**R2d · Hold, preset** · `Seller · Co-seller` · swapped into R2
- T5 with Priya picked: the one preselection, because she was chosen by opening her message.

**R3 · Post it somewhere else** · `Seller · Co-seller` · T4 scrolled to its end
- Caption "Post it somewhere else". A muted block of two rows:
  - Copy listing text: "Name, condition, price and description".
  - Save photos: "5 photos to your phone".

**R3b · Getting the photos** · `Seller · Co-seller`
- The Save photos row's sub-line reads "Getting 5 photos ready… 3 of 5", with a small spinner.
- A tap now does nothing and says nothing new: the row is already saying it.

**R3c · Copied** · `Seller · Co-seller`
- The Copy row reads "Copied" for 2s.
- Beside the board, the copied text:
  > Gray sofa: $350
  > Condition: Like new
  > Deep three-seater, washable covers.
  > Pickup in Capitol Hill, Seattle.

**R4 · The share sheet** · `Seller · Co-seller`
- The phone's own sheet over the drawer: 5 thumbnails, "Save 5 Images".

**R4b · Couldn't get them** · `Seller · Co-seller`
- Save photos row: "Couldn't get the photos. Tap to try again."

**R5 · Download fallback** · `Seller · Co-seller`
- On a browser that can't share files, the row reads "Download photos": "5 photos to your Downloads".

**R6 · Save all photos** · `Seller · Co-seller` · drawer
- Title "Save all photos".
- Figure: **41 photos**, "from 9 things for sale · about 45 MB".
- One-line facts:
  - "One zip file, a folder per thing."
  - "Sold and taken-off things are left out."
  - "Best on Wi-Fi."
- Footer: Cancel, **Get the download**.

**R7 · Building** · `Seller · Co-seller`
- R6 with a spinner in place of the figure: "Packing 41 photos. This takes up to a minute."
- Line: "You can close this; it keeps going."
- Footer: Cancel only.

**R8 · Ready** · `Seller · Co-seller`
- "Fall clear-out photos.zip · 45 MB".
- Line: "On iPhone it goes to Files. Tap it there to unzip."
- Footer: **Download**.

**R8b · Couldn't build** · `Seller · Co-seller`
- Footer note: "Couldn't pack the photos. Try again in a minute."
- Footer: **Try again**.

**R9 · Inbox, Handled** · `Seller · Co-seller`
- Four rows with "Handled by Theo" or "Handled by Maya" in the muted line.

**R10 · Inbox, empty** · `Seller · Co-seller`
- EmptyCard 🏷️: "No one has asked yet. Share the public link to get things moving."
- Chip: **Copy the public link**.

**R11 · The push** · `Seller · Co-seller` (published)
- A lock screen. Title: "Going Once". Body: "New interest in Gray sofa". Second line: "Fall clear-out · Open your inbox to reply."
- Never the buyer's name, message, phone, email or a price.
- A tap opens that inquiry.

**R11b · Bundled** · `Seller · Co-seller` · spec only
- Two more inquiries arrive within 15 minutes of the last push. They go out as one push when the window ends: "3 new inquiries · Gray sofa and 2 more" (the newest inquiry's thing, then how many other inquiries).
- Several on the same thing read the same way: "2 new inquiries · Gray sofa and 1 more".
- A tap opens Inbox on New.

**R11c · The morning one** · `Seller · Co-seller` · spec only
- Overnight inquiries arrive as one push at 8:00 AM local time: "4 new inquiries overnight · Gray sofa and 3 more".
- A tap opens Inbox on New.

**R11d · Several sales** · `Seller · Co-seller` · spec only
- One person on two sales gets one bundle that names the sales instead of the things: "3 new inquiries in Fall clear-out and Garage sale".
- A tap opens Your sales.

## Row 5 — The buyer: the public page

Title note: **"Signed out, on a phone: what's still for sale, and one way to ask."**

**B1 · Public page** · `Buyer`
- Signed-out site header: logo, Sign in.
- "Fall clear-out" (26px).
- Line: "9 for sale · Capitol Hill, Seattle".
- Note: "Evenings and weekends. Cash or Venmo."
- Cards, two across, 4:3 photo, 2-line name, price tag:
  - Gray sofa $350
  - Dining chairs (set of 4) $120
  - Coffee table $60
  - Floor lamp $25
  - Area rug $30
  - Plant stand $15
  - Road bike $200
- Clipped. Below: divider "Pending", then Oak desk "$150 · ~~$400~~" and 27" monitor $90, each with the amber dot.

**B1b · Photo not ready yet** · `Buyer`
- The newest card (Road bike) shows the placeholder in place of the photo: a kraft block with a centred outline camera glyph and no words.
- It swaps to the photo on the next read. Its price and name are already shown.

**B2 · Gray sofa** · `Buyer` · drawer
- Photos, 240px.
- "Gray sofa".
- Tag $350.
- Like new.
- Description.
- No floor price, no original price (its switch is off).
- Footer: **I'm interested**.

**B3 · Oak desk, Pending** · `Buyer` · drawer
- Tag "$150", "Was $400" struck through.
- Info notice: "Pending: someone's picking this up. You can still ask in case it falls through."
- Footer: **I'm interested**.

**B4 · I'm interested** · `Buyer` · swapped into B3
- ‹ "Oak desk".
- Fields:
  - Your name: "Lena".
  - Phone or email: "206-555-0177".
  - Message: "Hi! Is the Oak desk still available?"
- Line: "Only the people running this sale see this."
- Footer: **Send**.

**B5 · Sent** · `Buyer` (published: adds "About: Oak desk · $150" under the line)
- The same view, now saying: "Sent. The seller will reach out to you at 206-555-0177."
- Footer: **Done**.

**B6 · Couldn't send** · `Buyer`
- B4 with everything typed kept, and the footer note "This sale isn't taking messages right now. Try again tomorrow."
- The other notes, listed beside the frame:
  - "This one just sold, sorry."
  - "Couldn't send. Check your connection and try again."

**B7 · Everything sold** · `Buyer`
- Sale name.
- EmptyCard 🏷️: "Everything's found a home. Thanks for looking!"

**B8 · Not here** · `Buyer`
- Centred: "This sale isn't here anymore."
- Nothing else.

**B9 · Your own page** · `Seller · Co-seller`
- B1 with a kraft band on top: "This is your sale's public page", and a chip **Back to Going Once**.

**B10 · Public at 50** · `Buyer`
- "42 for sale".
- Search: "Search 42 things".
- Cards to the clip.

## Row 6 — Edge states (spec only)

Title note: **"When things go sideways: people leave, things move, buyers write twice."**

**E0 · Remove Theo** · `Seller` · confirm dialog
- Title: "Remove Theo from Fall clear-out?"
- Body: "Theo loses access now and his notifications stop. What he marked stays, with his name: 2 pickups he set up are still Pending."
- Buttons: Cancel, **Remove** (red).

**E1 · You're no longer on Fall clear-out** · `Co-seller`
- His next tap or read is refused. The screen becomes one centred card: "You're no longer on Fall clear-out." with a chip **Your sales**.
- Any open drawer or subview closes first.
- What he added or marked keeps his name for the others ("Sold by Theo").
- With no other sale, the chip says **Back to Going Once** and lands on S1's first run.

**E2 · Delete a thing with a pickup set** · `Seller` · confirm dialog
- Title: "Delete Oak desk?"
- Body: "Nate is set to pick this up Sat. 2 people asked about it. Its photos go; their messages stay in the inbox."
- Buttons, stacked on a phone:
  - **Take it off the list instead**: the gentler way, first, as an outline button.
  - **Delete** (red).
  - Cancel.

**E2b · Delete a sold thing** · `Seller` · confirm dialog
- "Delete Stand mixer?"
- Body: "It sold for $170. Collected goes from $225 to $55."
- The same three buttons.

**E3 · Sent 2 times** · `Seller · Co-seller`
- Inbox: Priya's inquiry is back at the top of New, with a badge chip "Sent 2 times" on its first line. Its muted line reads "3:40 PM · Gray sofa · Could I come Friday instead?".
- The drawer shows her latest message only, with the line "Sent 2 times · latest 3:40 PM".
- If it had been Handled, it is New again (and pushed as new). If it was still New, nothing is pushed.

**E4 · Inquiry rows about gone things** · `Seller · Co-seller`
- Inbox, New:
  - Marcus: "9:12 AM · Road bike (Sold) · What size is the frame?"
  - Lena: "Yesterday · Oak desk (No longer listed) · If the pickup falls through I'd take it".
- Marcus's drawer: an info notice "Road bike sold. Let Marcus know?" in place of the Hold row, the Email button, then **Mark handled**.
- Lena's drawer: the thing row is plain text, "Oak desk · no longer listed", and opens nothing. The Text and Call buttons stay.

**E5 · Finished with things unsold** · `Seller`
- S16 seeded, scrolled to the Sold view: 3 sold, "Collected $225 of $245 asked".
- The Sale tab's tiles read Collected $225, and Didn't sell 9, "$1,040 asked".
- Buyers on the old link see B8.

**E6 · A thing changes while the buyer reads** · `Buyer`
- B2 open on Gray sofa when it sells.
- On the next read the drawer stays, the I'm interested button gives way to the line "This one just sold, sorry.", and Done closes it. The card is gone behind it.

## Unusual states, where each is drawn

| State | Board |
|---|---|
| First run | S1, S3 |
| Joined as a co-seller | T0 |
| Not listed yet | S8c, the T1 door |
| Free | S6 chip |
| Floor above asking | S6b |
| Under the floor | T7b, T3 |
| Someone else marked it first | T7c |
| A correction | T9 |
| A pickup that fell through | T10b |
| Taken off the list | T3 |
| Asking about a Pending thing | R1, B3 |
| Photo upload in progress | S10 |
| A public photo not ready | B1b |
| Getting photos | R3b |
| Couldn't get photos | R4b |
| Download fallback | R5 |
| The zip: building, ready, failed | R7, R8, R8b |
| Push: ask, refused, iPhone not installed, the notification | R0, R0b, R0c, R11 |
| Push bundled, overnight, several sales | R11b, R11c, R11d |
| Reopen before and after the clearing | S16a |
| Co-seller deletes what they just added | T10a |
| Removing a co-seller, and being removed | E0, E1 |
| The Sold confirmation, with the take-down reminder | T7d |
| A finished sale's Didn't sell, with a Pending thing | S16, S16c |
| Deleting a sold thing | E2b |
| Inquiries about sold or deleted things | E4 |
| Delete with a hold | E2 |
| Sent 2 times | E3 |
| Sold somewhere else | E4 |
| Finished with things unsold | E5 |
| Sold while a buyer reads | E6 |
| An empty inbox | R10 |
| A finished sale, and after the clearing | S16, S16b |
| Everything sold | B7 |
| A dead link | B8 |
| The sale's limit | B6 |
| 50 things | T12, B10 |
| Your own public page | B9 |
| No search match | T13 |

## Layout check before publishing

- Each board is under 844px, or marks where it clips.
- The row that opens a drawer and the drawer's header show the same name and figure.
- Every figure matches "Example data".
- Each board has its person tag.
