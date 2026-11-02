# Going Once — UX & Interaction Design

The boards are in the Design canvas ([Going Once UX canvas](https://claude.ai/artifact/2GsmF9uwETxxrCmPWnczVg), private to the owner until shared). This file carries what a picture can't: who sees which screen, the sitemap, per-screen rules, components, journeys and form fields. Every name, price and date is the seeded sale in `canvas.md` "Example data", and the boards reconcile to it. Board ids (S, T, R, B) are the canvas's.

Words used everywhere, matching PRODUCT.md's glossary:
- A **sale** holds **things**.
- A thing is **Available**, **Pending** or **Sold**. It can also be **Not listed yet** or **Taken off the list**, which buyers never see.
- A buyer's message is an **inquiry**. It is **New** until someone marks it **Handled**.
- The private lowest acceptable price is the **floor price**.
- The people are the **seller** and **co-sellers**. A co-seller is never called a helper on screen.
- Copy never says apartment, move or moving.

## What is specific to this app

| Rule | Means |
|---|---|
| Two audiences on every thing | Private values sit in one kraft-tinted band captioned "🔒 Only you and your co-sellers". The band holds the asking price, floor price, original price (and whether buyers see it), where it was bought (with the store's link as a `LinkPreviewCard` that opens it) and the notes. It sits above the public details in the thing's drawer, so negotiating needs no second tap. A private value shown anywhere else carries the 🔒. The buyer page has no locks: it never has those fields. |
| A walk-through, not a form | Adding a thing is a photo-first `QuestionFlow` in a `Subview` that saves as it goes, from the first photo. There is never an Add button at the end. The review's primary is **Next thing**, so a room is one loop: photos, name, price, condition, next. |
| Status is a sticker | Available, Pending and Sold are an 8px dot plus the word (green, amber, muted). They look the same on the list, the drawer, the inbox and the buyer page. Sold never shows to buyers. |
| The co-seller's loop is one tap each | Mark pending, Mark sold, Copy listing text, Save photos and Text/Call/Email are each one tap from where the co-seller stands. Save all photos is one tap from the list's ⋯. |
| The buyer page is the same things, smaller | It is a signed-out page in the app's look. Cards are two across on a phone, and each thing opens a drawer whose one action is **I'm interested**. It never names the seller, co-sellers or anyone's contact. |

Look: **the tag sale** (owner kept it, round 4; they may compare it later with a plain white-space version, so every colour stays a token). Kraft price-tag accent, ink-green primary, paper neutrals, everything round. A price is a kraft tag chip. Tokens are in `canvas.md` "Look", and they go into `going-once.css` and `.claude/rules/going-once.md`.

## Who sees which screen

| Screen | Seller | Co-seller | Buyer |
|---|---|---|---|
| Your sales (S17; only with 2+ sales, or none) | yes | yes | no |
| Start a sale (S2) | yes | yes, as seller of their own sale | no |
| Things tab (T1–T3, T12) | yes | yes | no |
| New thing (S4–S9) | yes | yes | no |
| Thing drawer (T4, T6, T8), Mark pending, Mark sold, Change what was paid, History | yes | yes | no |
| Thing's More (T10) | with Delete thing | Take off the list; Delete only for a thing they added in the last 10 minutes that was never Pending or Sold (T10a) | no |
| Thing form (Modify) | yes | yes | no |
| Post it somewhere else, Save photos (R3–R5) | yes | yes | no |
| Save all photos (R6–R8) | yes | yes | no |
| Inbox and an inquiry (R1, R2, R9, R10) | yes | yes | no |
| Notifications ask (R0–R0c) | yes | yes | no |
| Sale tab: tiles, link Copy and Open, notifications switch, people | yes | yes (people read-only) | no |
| Sale tab: link switch and ⋯, Add co-seller, Remove, Details editing, Finish, Reopen, Delete this sale | yes | no (not drawn) | no |
| Public page, thing, I'm interested, Sent (B1–B7, B10) | yes, with B9's band | yes, with B9's band | yes |
| Not here (B8) | yes | yes | yes |
| Removed from the sale (E1) | no | yes | no |
| Reopen confirm (S16a), delete-with-a-hold confirm (E2) | yes | no | no |

## Sitemap

```
/going-once                         (one open sale: opens it; none or 2+: Your sales)
├── Your sales                      open sales, then "Finished"; header "New sale"
│   └── Start a sale (FormSheet)
└── A sale  ?sale=<id>&tab=&thing=
    ├── Things (tab, home)           search from 8, status switch, header "New thing", sort, ⋯
    │   ├── New thing (Subview: QuestionFlow, saves as it goes)
    │   ├── "N not listed yet" door  → the list narrowed to them, with a chip to clear
    │   ├── ⋯ Save all photos        (FormSheet: size → building → Download)
    │   ├── ⋯ Open the public page   → /going-once/s/<token> in this tab
    │   └── Thing (DetailSheet)
    │       ├── Mark pending ─ Mark sold ─ Change what was paid   (swapped in)
    │       ├── ⋯ More (swapped in): Mark sold, Back to available, Not sold after all,
    │       │                         Take off the list / Put it back, History, Delete thing (seller)
    │       ├── an inquiry row       → that inquiry (swapped in, ‹ Back)
    │       ├── Copy listing text    (in place, "Copied")
    │       ├── Save photos          → the phone's share sheet, or downloads (leaves the app)
    │       └── Modify               → Thing form (FormScreen overlay; the drawer closes first)
    ├── Inbox (tab)                  capsule (until notifications are settled), New · n / Handled · n
    │   └── Inquiry (DetailSheet)
    │       ├── Text / Call / Email  → the phone's own app (leaves the app)
    │       ├── Hold <thing> for <name> → Mark pending, preset (swapped in)
    │       └── the thing row        → the thing (swapped in, ‹ Back)
    └── Sale (tab)
        ├── Collected / Pending / Left → Things on that status
        ├── Public page card: switch, Copy link, Open, ⋯ Get a new address (seller)
        ├── Notifications: "Tell me when someone's interested" switch, this phone's state
        ├── People: rows, "Add co-seller" (seller) → FormSheet; a row → its sheet (Remove; or Leave for yourself)
        ├── Details: name, pickup area, note for buyers (SummaryEditor rows, seller)
        ├── Finish the sale (seller) → FormSheet; finished: a band with Reopen
        └── Delete this sale (seller, last, red)

/going-once/s/<token>               public page (signed out works; noindex)
└── Thing (DetailSheet; modal from sm)
    └── I'm interested (swapped in) → Sent (the same view, as its own confirmation)
```

## Screens

What each board doesn't show. The board's own spec is in `canvas.md`. The canvas publishes 25 boards (listed in `canvas.md` "What is published"). For every other screen this table is the rule the build follows, marked **spec only**.

| Board | What the picture doesn't show |
|---|---|
| 0 Shell | Tabs live in the URL (`?tab=`) so the app resumes there. The floating tab pill has three tabs (Things, Inbox, Sale) like Pinch's and is hidden in a subview. Inbox's `IconBadge` shows the New count only above zero. The sale's title gets a chevron `BackLink` to Your sales only with 2+ sales. |
| S1, S3 First run | One `EmptyCard` each and nothing else. No search, switch, sort or ⋯ until a thing exists. |
| S2 Start a sale | `FormSheet`. The Name `SuggestionChips` fill only an empty field. Pickup area and Note for buyers are `AddFieldChips`. Start lands on S3. |
| S4 Photos | Take a photo opens the camera (`capture`); after each shot the screen returns here with the strip grown and **Take another** as the big button. Choose photos picks several at once. Each photo shrinks to the listing size as it lands, and Next works meanwhile. Up to 12 photos; at 12 the camera button gives way to the line "That's 12, the most a thing can have". "Skip photos for now" leaves it Not listed yet. Tapping a thumb opens S4b. Remove is a ✕ with `UndoSnackbar`. |
| S5–S7 | The thing exists from the first photo, or from the name if photos were skipped. Each answer saves on Next or blur. The header is the name as typed ("New thing" until then). Condition moves on with one tap. |
| S6 Price | **It's free** swaps the hero for "Free" and makes the price $0. The floor price is a `RevealChip`, a smaller `MoneyInput` with its lock line. A floor above the asking price is a footer note, never a block (S6b). |
| S8 Review | Every answer is a summary row that reopens its question in a sheet. Extras are `AddFieldChips`; once added they become `OptionalDetailRows` under "More about it". The Show-to-buyers switch lives in Original price's sheet. The footer note always says the state: "Saved · Listed" or "Saved · Not listed yet: add a price". |
| S9 Next thing | Opens a fresh flow in the same subview, with a status line under the header: "Added Oak desk · Undo · 6". Undo deletes the new thing and its photos. |
| S10 | Leaving mid-thing loses nothing, so there is no Keep editing / Discard. A row whose photos are still uploading says so in its line and finishes in the background. If the app closes mid-upload, the row says "2 photos didn't upload · Add again". |
| T0 Joined | `IntroCard`, once per sale per person, carrying the notifications capsule. Dismissing it never turns notifications off. |
| T1–T3 Things | Search from 8 things. The thin status switch counts follow the search. Taken-off things end the Sold view under a divider, so the switch never grows a fourth pill. The "1 not listed yet" door is a thin row, only when there are any. A row is a top-aligned 48px cover, the name (`line-clamp-2`), one muted line and a price tag; its one flag is a New inquiry ("10:57 AM · Priya asked"). Under each view sits a total in the rows' right edge. Default sort is newest first; `SortControl` also offers Price and Name. |
| T4, T6, T8 Thing drawer | Photo strip (tap opens `ImageViewer` at that photo), name, sticker line, the private band, condition and description, Interest rows (time first, New ones bold), then "Post it somewhere else" (Available and Pending only). Footer: Modify, ⋯ and the phase's primary from a pure helper, `getThingOffer(status, role)`: Available → Mark pending; Pending → Mark sold; Sold → none; Taken off → Put it back on the list. The drawer follows the live record: if someone else changes the status while it's open, it re-renders. |
| T5 Mark pending | Swapped in. Nothing is preselected except from an inquiry (R2d). "Someone else" reveals a name field. The pickup day is a chip that reveals day pills (today and the next six) with "Other day". |
| T7 Mark sold | Swapped in. The hero is prefilled with the asking price. How they paid is optional. The day is folded and pre-answered as Today. Under the floor, a warning `InlineNotice` appears and it still saves (T7b). A refused transaction stays open with the reason in the footer (T7c). |
| T9 | Change what was paid shows the effect on Collected once the figure differs. |
| T7d Sold confirmation (spec only) | After Mark sold the view stays open as its own confirmation: what was paid, how, by whom, and the new Collected figure. If anyone copied the listing text, a warning notice follows: "Theo copied this listing on Oct 28. Take that listing down too." It names the most recent copy and reminds rather than promises. **Not sold after all** is a chip on the panel, and Done returns to the drawer. |
| T10 More (spec only; T10a, T10b too) | `ActionGroup isRoomy` with consequence subtitles, the same order for every thing: the status acts, then Take off the list or Put it back, then History. Delete thing is last, red and alone. The seller always gets it. A co-seller gets it only while `getThingOffer` says the thing is theirs, under 10 minutes old and never Pending or Sold, with the sub-line "You added it 4 minutes ago"; the row is gone, never locked, once that passes. The confirm is E2. |
| T11 History (spec only) | Swapped in under ‹ History. Read-only rows, newest first: what changed, who and when ("Sold for $170 · Theo · Oct 31, 6:20 PM"). Corrections show both figures ("Changed what was paid $170 → $160"). After the clearing, a buyer's name in a row reads "a buyer". |
| Take off the list / Put it back (spec only) | Direct acts with no confirm. The drawer stays open, its sticker says "Taken off the list", and an Undo line sits in the footer for 6s. Taken off: it leaves the public page and every total, and its primary becomes **Put it back on the list**. Putting it back returns it as Available. |
| Thing form, Modify (spec only) | A `FormScreen` overlay, titled with the thing's name. S8's summary rows in two sections: "Buyers see" (Photos, Name, Price, Condition, Description, Brand or model, Size, Original price's Show to buyers) and "🔒 Only you and your co-sellers" (Floor price, Original price, Where you got it, Notes). Each row saves on its sheet's Done, so there is no Save button and the footer says "Saved". Photos opens `PhotoSetPicker` in its sheet. Status is not here. The seller's footer has the trash (`DeleteIconButton`, E2's confirm). A co-seller has a trash only within T10a's window. If someone else edits the same field meanwhile, the row shows their value once their write lands; there are no drafts to merge, since each row saves on Done. |
| People row sheet (spec only) | A tap on a person opens a small sheet: their name, role and "Added Oct 28". The seller sees **Remove from this sale** on a co-seller ("They lose access at once. What they marked keeps their name.") behind a destructive confirm. A co-seller tapping themselves sees **Leave this sale**, with its confirm. A waiting email row ("Waiting for them to sign in") offers **Remove** with no confirm, plus Undo. The seller's own row opens nothing and has no chevron. |
| Get a new address, turn off (S14 spec only) | Each has a confirm that says everyone with the old link loses it at once. Turning off keeps the address dormant: turning it on again offers "Use the same link" or "Get a new address" as two rows. |
| R0–R0c Notifications | Notifications are on by default for every member (the Sale tab's switch), but each phone has to allow them once. The capsule shows on the first Inbox open and on T0, never on load. Its modal (R0b) explains, then **Turn on** brings up the browser's prompt on that tap. After a yes the capsule is gone for good. After Not now it is gone for this visit and comes back on the next Inbox open, up to 3 times in all. Blocked or unsupported shows R0c once. The Sale tab's switch is the one place to turn notifications off (and on again); with the switch off, the capsule never shows. |
| R1, R9 Inbox (R9 spec only) | Newest first by last sent. Rows lead with the time. An inquiry about a Pending thing says "(Pending)", one about a Sold thing "(Sold)", one about a deleted thing "(No longer listed)" under the name it had (E4). A resend rises to the top of New with a "Sent 2 times" chip on its first line (E3). After the clearing, rows read "A buyer asked about Gray sofa · Oct 30" (S16b). |
| R2 Inquiry | The buyer's name is the title. The thing is a row that opens it in place. Text and Call appear only for a phone, Email only for an email (each a native link). "Hold … for …" shows only while the thing is Available. If the thing is Sold, an info notice takes its place ("Road bike sold. Let Marcus know?", E4). **Mark handled** writes in the background (no lock); after it the line says who and when, and ⋯ offers Back to New and Delete. Opened from a push for an inquiry that has since been deleted or cleared, it lands on Inbox with one line: "That message isn't here anymore." |
| R3–R5 Save photos | The drawer starts fetching the thing's photos when it opens, so the tap can hand them to the share sheet at once. While they're coming, the row says "Getting 5 photos ready… 3 of 5" (R3b), and a tap does nothing. Once ready it says "5 photos to your phone". A browser that can't share files says "Download photos" (R5). A failure says so on the row (R4b). Copy listing text uses `CopyTextButton`'s "Copied" on the row itself. |
| R6–R8 Save all photos | Always Available and Pending things. The sheet states the count and size before anything is built. While it builds (R7) the sheet can close and the build carries on; reopening shows where it is. Ready (R8) offers **Download** and the iPhone Files line. |
| R11 Push, bundled (R11b–d spec only) | The push names a thing and the sale only, never the buyer, the message, a contact or a price. Pushes are at most one per person per 15 minutes: the first goes at once, later ones in the window wait and go as one when it ends. Overnight ones (quiet hours) go as one at 8:00 AM local. Wording (product's, from one pure helper with a check case per shape): one, "New interest in Gray sofa"; several, "3 new inquiries · Gray sofa and 2 more" (the newest inquiry's thing, then how many other inquiries); overnight, "4 new inquiries overnight · Gray sofa and 3 more"; several sales, "3 new inquiries in Fall clear-out and Garage sale". The second line is the sale's name and "Open your inbox to reply." A resend pushes only when it turned a Handled inquiry back to New. A tap on one inquiry opens it, on several opens Inbox on New, and on several sales opens Your sales. |
| S11, S11b Sale tab | `StatTile`s, each opening Things on its status. Then the public page card, the notifications card, People (`SectionHeader` with Add co-seller), Details (`SummaryEditor` rows), Finish the sale (an `ActionRow` with its consequence), and Delete this sale (red, alone). The co-seller's tab hides the seller-only rows; it doesn't show them locked. |
| S12 Add co-seller | Says **Add**, never Invite, and says no email is sent. A pending added email shows as a row "theo@example.com · Waiting for them to sign in", which opens a sheet with Remove. |
| S13, S14 Link | The off state says what turning it on shares before it does. Get a new address and turning it off each have a confirm that says everyone with the link loses it. |
| S15, S16 Finish (S16a–c spec only) | Finish needs no typing. Its confirm names what's left ("7 things didn't sell. 2 are still pending: Oak desk for Nate on Sat, 27\" monitor for Dev") and says what it does: the page closes, notifications stop, and buyers' names, contacts and messages clear on a named date 30 days on; nothing is deleted. A finished sale's Things switch is **Didn't sell · n** / **Sold · n**. Didn't sell lists the Pending things first (stickers kept), then the Available ones with what they were asking, and a total. A finished sale offers nothing that finds a new buyer: no New thing, Mark pending, public page, "Post it somewhere else" or Save all photos. A Pending thing keeps **Mark sold** and Not sold after all (S16c). The band says "Buyer details are cleared on Dec 2", then "Buyer details were cleared on Dec 2". The seller's band has **Reopen** (S16a): before the date it cancels the clearing, after it the details stay cleared and the confirm says so; either way the link stays off until she turns it on. After the clearing, Pending and Sold records read "a buyer" in place of a name. The sale moves under "Finished" in Your sales, and co-sellers keep read access. |
| E0, E1 Removing and removed (spec only) | Remove's confirm (E0) says Theo loses access now, his notifications stop, and what he marked stays with his name, counting his open holds ("2 pickups he set up are still Pending"). On Theo's phone his next action is refused and the sale gives way to one centred card, "You're no longer on Fall clear-out", with Your sales as the one way out; it is never an error toast. Open sheets close first. |
| E2, E2b Deleting a thing (spec only) | The confirm names what goes with it: the hold ("Nate is set to pick this up Sat"), how many people asked, that its photos go and that their messages stay in the inbox. For a Sold thing it states the effect on the total instead ("Collected goes from $225 to $55"). **Take it off the list instead** is the first button, an outline; **Delete** is red; Cancel is last. |
| E3 Sent 2 times (spec only) | A resend from the same phone or email about the same thing updates the one inquiry, never a second row. The new message replaces the old, the inquiry moves to the top of New, and its row carries "Sent 2 times". A Handled one becomes New again. The buyer's Sent screen is the same either way. |
| E4 Gone things in the inbox (spec only) | Sold elsewhere has no separate flow: Mark sold, Other when it fits. That thing's inquiries read "(Sold)", and their drawer swaps the Hold row for "Road bike sold. Let Marcus know?" and keeps the contact buttons. A deleted thing's inquiries read "(No longer listed)"; their thing row is plain text and opens nothing. |
| E5 Finished with things unsold (spec only) | See S15, S16. The Sale tab's Left tile becomes **Didn't sell** with what they were asking. |
| E6 Sold while a buyer reads (spec only) | The public drawer doesn't close under the buyer. On the next read it swaps its primary for the line "This one just sold, sorry." and Done; the grid behind it has already lost the card. |
| S17 Your sales | Open sales first, then finished ones under a `SectionDivider`. A sale someone else runs says "Rosa's sale · co-selling". |
| B1, B10 Public page | `useNoIndex`. The note clamps at 2 lines with Show more. Search appears from 8 things. Available first, then a "Pending" divider. Cards load as they scroll (`LazyMount`). Refreshed when the tab returns. |
| B1b | A thing whose public photo copy doesn't exist yet shows the kraft placeholder with a camera glyph. The same placeholder stands in for a failed image (`FallbackImage`). |
| B2, B3 | Drawer (modal from `sm`). Only public fields. Pending adds the info notice and keeps I'm interested. |
| B4–B6 Interest | Swapped into the drawer, no overlay. Send stays off until there's a name and a phone or email that looks real; the footer says which is missing. Sent is the same view as its own confirmation, quoting the contact back. A failure keeps everything typed, with one sentence per real reason. The service's limits (TECHNICAL.md) decide the wording. |
| B7, B8 | Everything sold is a friendly card under the sale's name. Not here is one identical page for every bad, renewed, turned-off, finished or deleted link. |
| B9 | Members see a kraft band "This is your sale's public page" with **Back to Going Once**. |

## Not yet drawn

Everything below has its rule in "Screens" but no board and no spec board.
- Desktop: Things beside the open thing from `lg`; the public page at three or four cards across.
- Dark mode (tokens are in `canvas.md`).
- The store's link: its row in "Where you got it" and its preview card in the private band (rules above; `LinkAttachField` and `LinkPreviewCard` as Waypoint's forms use them).
- Next steps: who holds the money; what happens to what's left when finishing (keep, give away, donate); a later sale from what didn't sell.

## Where the screen set stops

- **Things per sale:** drawn at 14 and 50. Rows sit under `LazyMount`, with search from 8. There is no manual reordering: the list sorts, so nothing has to cross a long list.
- **Photos per thing:** up to 12, always a sideways row, never a growing grid.
- **Inquiries:** New is the work queue. Handled grows and loads in pages (technical).
- **Sales per person:** a short list, finished sales folded under their divider.
- **Co-sellers:** a few per sale.

## Reusable components

**Existing:**
- Containers: `Subview`, `FormScreen`, `FormSheet`, `ModalFooterActions`, `DetailSheet`, `BackLink`.
- Asking for things: `QuestionFlow`, `AmountHero`, `MoneyInput`, `RevealChip`, `AddFieldChips`, `OptionalDetailRows`, `SummaryEditor`, `SummaryRow`, `PillGroup`, `SuggestionChips`, `FoldedDateField`, `AppToggle`.
- Actions: `ActionGroup`, `ActionRow`, `EllipsisDropdown`, `CopyTextButton`, `UndoSnackbar`.
- Lists: `SearchInput`, `SortControl`, `SectionDivider`, `SectionHeader`, `LazyMount`, `ShowMoreButton`.
- Figures and notes: `StatTile`, `EmptyCard`, `IntroCard`, `InlineNotice`, `HelpTip`, `IconBadge`.
- People and pictures: `UserAvatar`, `FallbackImage`, `ImageViewer`.
- Shell and hooks: `AppEntryFallback`, `useImageUpload`, `useNoIndex`, and the site's `askNotificationPermission`/`enablePushNotifications`.

**New, shared** (other apps will want these; no app words):

| Component | Lives in | Does |
|---|---|---|
| `PhotoSetPicker` | `src/components/forms` | Several photos for one record: a camera loop, a library multi-pick, cover first, Make cover / Move earlier / Move later / Remove with undo, a count cap. Each photo is shrunk to the listing size on the device and saved on its own; `usePhotoSetUploads` holds those uploads in the screen that owns the record, so they outlive the picker's question. |
| `PhotoStrip` | `src/components` | A sideways snap row that peeks the next photo, shows "1 / 5" and opens `ImageViewer`. |
| `shareOrDownloadFiles` | `src/utils/fileUtils.ts` (technical's name) | Hands prefetched files to the share sheet, otherwise downloads them, and reports which it did. |
| `PermissionCapsule` | `src/components` | The quiet "Turn on" capsule plus its explainer modal, from `product.md` "An opt-in is offered where the need starts". Pinch's timer capsule moves onto it when touched. |

**New, in the app:**
- Rows and pieces: `ThingRow`, `StatusSticker`, `PriceTag`, `PrivateBand`.
- The thing: `ThingDrawer` with `getThingOffer`, `MarkPendingView`, `MarkSoldView`, `RelistBlock`.
- Inbox: `InquiryRow`, `InquiryDrawer`.
- Public page: `BuyerCard`, `BuyerThingDrawer`, `InterestView`.
- Sale tab: `LinkCard`, `SaveAllPhotosSheet`, `FinishSaleSheet`, `FinishedBand`.

## User journeys

- **Maya adds a room:** Things → New thing → Take a photo ×4 → Next → "Oak desk" → Next → $150, + floor $120 → Next → Good → review, + Original price $400 with Show to buyers → **Next thing** → Take a photo … → Done → Things, newest at the top.
  - Skip photos → it stays Not listed yet, behind the door.
  - App closed mid-upload → the row says what didn't upload.
- **Maya hands off:**
  - Sale → Add co-seller → email → Add → Copy the Going Once link → her chat app.
  - Sale → Public page on → Copy link → anywhere.
- **Theo joins:** signs in → the sale is there → T0 → Turn on → R0b → browser prompt → allowed.
  - Not now → the capsule asks again on Inbox, at most three times.
- **A buyer asks, Theo answers:** the push ("New interest in Gray sofa") → Priya's inquiry → Text (leaves to Messages) → back → Hold Gray sofa for Priya → Mark pending → Mark handled.
  - The thing is already Pending → no Hold row; the inquiry stays as a backup.
- **Theo sells it:** Things → Pending → Oak desk → Mark sold → $150 → Cash → Mark sold → Sold; it leaves the public page.
  - $110 → the under-the-floor notice → it still saves.
  - Maya got there first → T7c.
  - The pickup fell through → ⋯ → Back to available.
  - A typo → ⋯ → Change what was paid.
- **Theo relists one thing:** Gray sofa → Copy listing text ("Copied") → Save photos (R3b while getting them) → share sheet → Save 5 Images → Marketplace, paste.
- **Theo relists everything:** Things → ⋯ → Save all photos → 41 photos, about 45 MB → Get the download → building → Download → Files or Downloads.
- **A buyer asks:** a link in a chat → public page → Oak desk → I'm interested → name, phone, message → Send → Sent → Done.
  - The thing just sold → "This one just sold, sorry", and the card goes.
- **Maya checks in:** Sale → Collected $225 of $245 → tap → Things on Sold.
- **Maya finishes:** Sale → Finish the sale → the confirm names 7 didn't sell and 2 pending → Finish → Things shows Didn't sell · 9. Saturday: Oak desk → Mark sold → recorded. On Dec 2 buyer details clear.
- **Several at once:** three inquiries in ten minutes → "New interest in Gray sofa" at once, then "2 new inquiries · Road bike and 1 more" when the window ends → Inbox on New. Overnight ones → one push at 8:00 AM.
- **Theo is removed:** Maya → Sale → Theo → Remove from this sale → E0 ("2 pickups he set up are still Pending") → Remove. On Theo's phone his next action shows "You're no longer on Fall clear-out" → Your sales.
- **Maya deletes a held thing:** Oak desk → ⋯ → Delete thing → E2 ("Nate is set to pick this up Sat. 2 people asked about it.") → Take it off the list instead, or Delete → its inquiries read "(No longer listed)".
- **Priya writes again:** her inquiry rises to the top of New with "Sent 2 times" → Theo opens it → Text → Mark handled.
- **Sold on Marketplace:** Road bike → Mark sold → $190 → Other → Mark sold → T7d ("Theo copied this listing on Oct 28. Take that listing down too.") → Done → Inbox → Marcus (Sold) → "Let Marcus know?" → Email → Mark handled.
- **Theo undoes an add:** S9's Undo within 6s. Or later, within 10 minutes: the thing → ⋯ → Delete thing → confirm.
- **Maya reopens:** the finished band → Reopen → S16a → Reopen → Sale → turn the public page on (same link or a new one).
- **The link ends:** Sale → ⋯ → Get a new address → confirm. Or switch off → B8 for anyone with the old link.

## Form field organization

| Entity | Initial set | Later set | Entry point for later fields | Grouping | Fixed choices |
|---|---|---|---|---|---|
| Sale | Name | Pickup area, Note for buyers | Inline reveal on Start a sale; catch-all edit in the Sale tab's Details | None needed | None |
| Thing | Photos (up to 12), Name, Asking price or Free, Condition; Floor price by inline reveal on the price question | Description, Brand or model, Size, Original price (+ Show to buyers switch in its sheet), Where you got it (where, when, and the store's link in `LinkAttachField` with its preview and a Clear control), Notes | Inline reveal (`AddFieldChips`) on the review; catch-all edit (Modify) in two sections, "Buyers see" and "🔒 Only you and your co-sellers" | A `QuestionFlow` on create; the edit's two sections are headings over summary rows | Condition: New, Like new, Good, Fair, Well used; closed, no Other |
| Pending (a status change) | Who's picking it up: one of the thing's inquiries, Someone else (a typed name), or no one | Pickup day | Inline reveal chip on the same view | None | None |
| Sold (a status change) | What they paid (prefilled with asking) | How they paid; Sold on (Today pre-answered, folded) | On the same view; How is optional | None | How they paid: Cash, Venmo, Zelle, Other; closed, Other takes no text |
| Inquiry (buyer) | Your name, Phone or email, Message (prefilled) | None | None | None | None |
| Co-seller | Email | None | None | None | None |
| Finish | Nothing to type | None | None | None | None |

"Status" is never a field of the thing's form: it changes only through Mark pending, Mark sold and More's rows. "Condition" (how worn it is) and "Status" (where it is in the sale) never share a control.
