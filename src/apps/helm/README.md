# Helm 🧭

Helm is a private companion for one person's whole life, and you mostly talk to it. Keeping track is the hard part: who said what, who matters for what, what you prefer, what you worked out last time, what fits today. Open Helm and speak (or type) to its assistant, Nomos unless you rename it; it answers briefly in a natural voice and keeps what you said as tasks, people, pets, places, preferences, procedures and living notes, each saying where it came from, with Undo. It is on every screen and knows what is in view. It reads Google Calendar, Gmail, Drive and the site's other apps if you connect them, but never changes them, never speaks first, and keeps everything you tell it encrypted. One person per account, nothing shared.

## How it works

1. Home is a conversation, with a dock: Browse (tiles sized by importance: Today, Needs you, People and Projects big, the rest small), Talk and Type. Interrupt it any time; it answers briefly, and speaks only when you spoke. Say "Hey Nomos" (or the name you chose) instead of tapping, if you turn that on.
2. What you say, and the photos, PDFs, voice notes and Markdown files you send, become records shown in the conversation with Undo; files worth keeping stay on the record they changed.
3. Every page with content has the same "Ask about this" control in the same place ("Ask about Grandpa"); the assistant then knows what's on the page: "move this to Friday", "who's this?", "add a step".
4. People, pets and organizations have pages, photos and how much they matter to you, with roles in your projects, the dates that come back (birthdays, anniversaries; on Today the week before and in Coming up) and the moments of their lives (moves, jobs, graduations); pick people in from Google Contacts. "How Nomos sees you" shows who you are, what you like and how you write, all editable.
5. Knowledge keeps topics as living documents written from what you tell it, nested up to three deep (Car care › Washing), each part showing where it came from, with a history you can undo; your own words change only when you ask; procedures are routines you run again and again, each run ticked on its own.
6. Projects, tasks and Today (your fixed events and a few suggestions for real gaps) are each one tap away in Browse.
7. Answers come from your records and connected apps first, with sources; general knowledge only when they don't say, marked "Not from your records".

## Status

Built:
- Helm on the site, in its own look, with home's dock and the Browse sheet.
- Type a line and see it on home as a sealed turn, earlier sessions a scroll up; Needs you lists what's new since you looked.
- Opened offline in a browser that isn't trusted, typing still works: each line is sealed on this device to a key only the server can open, listed as "Saved on this device", and sent and sorted once you're back online; signing out with some still waiting asks first. Plain HTTP pages and private windows say Helm needs a connection.
- Words typed but not sent are still there when the phone closes the page, kept only sealed; opened offline or with the key refused, home says so, with Try again.
- As you type, chips under the field show what was read for certain (`@` people, `#` places, `^` procedures or notes, `!` urgent, and dates like "Friday at 3"); a date chip opens a calendar, its ✕ reads it as text, and the reading is sealed with the turn.
- Each sent turn is read by the assistant and filed as tasks, with a reply under the turn saying what it did; Today lists what is overdue or due within a week.
- A turn the assistant can't read yet is kept as written and read again on the next open, when the connection returns or when you come back; Needs you lists what couldn't be read or sorted (Try again, Make it a task as written, Delete) and what is waiting, with why.
- Facts with their source: a sentence like "Dana is the florist" is kept as a fact about Dana, with a filled ring when you said it and a hollow one when the assistant inferred it; a who's or place's page lists them with "Add a fact", a fact opens to Confirm, Correct or Forget (each with Undo), and People shows "Inferred · N" when any wait for you.
- When something you say contradicts a fact it keeps ("Dana says centerpieces are $2,100 now" against $1,800), both are kept and it asks "Which is true now?" with nothing chosen for you; the one you pick is confirmed, the other is kept as "Was … until …", and "Neither" lets you write what is true; Undo reverses it.
- Every card of what the assistant did has an Undo that takes back what you haven't changed since, and says what it kept; Settings opens Activity, every change newest first, and What the AI sees.
- Tasks: open one from Today or Tasks to change its day, steps, importance, length, energy, context, when it can start and what it waits on, tick it with an Undo, or delete it with an Undo; New task in a page's ⋯ makes one by hand; Today's All tasks lists every open one, with those that can't start yet folded.
- Today, Tasks and an open task end in an ask bar ("Ask about today"): it opens the conversation over the page with an "About …" chip you can remove, the assistant reads the records the page shows, and Back returns to the page where it was.
- Several messages sent before the reply starts are one turn: each stays its own bubble, one reply covers them all, and a message sent after the reply starts is a new turn; it works offline too.
- Talk: tap Talk (or the mic in the ask bar), say it and tap again, say "that's all" or pause; the browser's recognition writes a spoken turn that is filed like a typed one, a short "Got it" line is said in this phone's voice once it is sorted, and "undo that" takes the session's latest turn back. Typed turns are never spoken, and Mute silences spoken lines until Helm is closed.
- The voice benchmark (a developer tool, not in the app): `npm run voice:benchmark` renders twelve replies through three cloud voices, times and prices them and opens a page to listen beside the natural voice; the pick is the owner's and `docs/voice-benchmark.md` records it.
- Online, what you say is heard by the cloud listener (Deepgram) as you speak; past 60 minutes a day, or once the site's $5 voice cap is reached, the phone's own listening takes over with one quiet line, and Settings → Voice keeps listening in the browser.
- The assistant's own voice is ready for answers: a reply or a long read is spoken by the site's cloud voice online and within 30,000 characters a day, and by this phone's voice otherwise or when the cloud voice is slow to start; the quick "Got it" lines stay on this phone's voice so they start at once. Spoken answers arrive with questions in a later issue, so for now every line you hear is this phone's.
- Short, plain turns ("add milk", "done with the dentist", "thanks") are sorted by a quick, light model; a question, a longer turn or "sort the rest" goes to the fuller one, and the quick one can hand a turn over once. Each route has its own allowance.
- Ask a question and the answer comes from your tasks and what your connected apps and calendars share, with each source one tap away; what they don't say comes from general knowledge, below "Not from your records" with a caution (a bold one on health), and a question about your own things with nothing behind it says "Nothing in your records answers this." Activity lists each answer.
- Today plans the day: a strip of days, your events and up to three suggested tasks in real gaps ("40 min · fits before Standup"), each kept, moved to another time or set aside for today; "Plan my day" or "plan tomorrow" asks for it, a past day reads as it was with Bring to today, and Settings sets your day's hours and how full to plan it.
- The day after a night shift or a late night stays empty with "Plan my day anyway"; a kept task that now overlaps a new event says so and offers another time; a calendar that stopped sharing or couldn't load says so with Reconnect or Try again; an event's sheet gives its day and time and, for an all-day one, "Keeps me busy all day".
- One event on your calendar and in A-List or Waypoint (or on two Google accounts) shows once with both marks; the calendar's time is shown, and when the app's differs one line says so ("A-List Tracker says 7:00 PM").
- Dates that come back: say "Mum's birthday is June 3" or add one on a person's page (birthday, anniversary or a custom yearly date such as "Gotcha day", a year optional); Today lists the next week's few, Coming up lists the next twelve months by month, Contacts brings in birthdays, and each date has Undo. Dates are sealed with your key like everything else; only whose they are is readable.
- Moments: say "I met @Dana in March 2015" or "Grandpa lived in Lisbon in the 80s", or add one on a person's page (met, moved, a job started or left, graduated, adopted, passed away, or something else), known to the day, month, year or decade; a page shows the newest three and "See all" lists them by decade and year. A moment never reaches Today or Coming up. A different birthday or passing-away date than the one kept is never written over: the assistant asks "Which is true now?" and Undo takes a pick back.
- Name a friend, a pet or a shop in a turn ("call @Dana", "buy Miso's food at Acme Bakery") and it links to the one you meant, or is added as new; People (in Browse) lists them Close, Regular and Others, each with a page of the tasks and turns that name them, and a task row shows who and where it is about.
- When a name could be one of several people or places (two Sams), the task is made at once and the turn asks "Which Sam?" under its card, by tap or by voice: each candidate with what tells it apart, then "Someone new" and "Don't link anyone", or Skip, which leaves it in Needs you. A person's or place's page has a ⋯ to change its name, kind and details, how close they are, or forget them, with an Undo that puts them back on the tasks they were taken from.
- Give a person, pet, organization or place a photo from the library or the camera, with one main photo that shows beside their name in People and several more under it (up to 12), each opening full screen; the main one can change and a photo can be removed with an Undo. Every photo is sealed on your phone before it is stored.
- Topics grow from the conversation: a note that fits a part is added to it in the same turn with Undo, "make the intro shorter" changes only what you asked, a topic can move under another, and related topics are offered a parent as a question; editing or deleting a note brings its topics up to date.
- Send up to 5 photos or screenshots with a turn (a photo of any size is shrunk on the phone first); the assistant reads them with your words and keeps one on the task or fact it changed ("Kept the photo on Dana's quote") or lets it go, "Read the photo. Didn't keep it" with "Keep it" for 24 hours before it is deleted; a kept photo shows on its task or fact, Undo takes it back, and a photo can be sent with no words. PDFs (up to 20 pages) are read and kept on the task they made or let go; a Markdown file becomes a note, or a topic when it reads as one; a voice note is written out into the field so you can fix it before sending, and the recording is let go unless you keep it. Keeping a file on a project or a person is still to come.
- Procedures: say "make me a packing routine for work trips", or tap "Make these steps a procedure" on a task, and the routine is kept once, its steps in named groups; edit it by hand or ask ("add a step for the laptop charger"), every change is a version you can open and restore, and Copy as Markdown puts it on the clipboard. Procedures is always in Browse. Start a run of one for a trip, event or project (or just to run it), tick its steps by tap or by saying "done with the charger", add a step just this time, and finish it; its runs stay listed on the procedure, the project and the trip.
- How you write: after every 25 messages you type, the assistant notes how you write ("Short sentences", "Signs off 'Cheers,'") and what you leave out, each with how many of your messages it was seen in; How Nomos sees you lists them under "How you write", where you add, edit or remove one (Undo puts it back), and a note you set is never written over. Only the notes are kept, never what you wrote, and the assistant uses them when it writes for you. With Gmail connected you can also switch on learning from your sent mail (up to 300 emails from the last 6 months, read once): notes then show by occasion and person, and switching it off removes them.
- Runway's Transactions, off until you switch it on: ask "what did I spend at Costco in the last 30 days?" and the answer gives the total and the rows as a short list, with one link into Runway; Helm looks the purchases up only when you ask and keeps just the few rows an answer quotes.

Next (Core MVP):
- [ ] A voice-first home: natural cloud voice online, offline voice on any phone after a one-time download, barge-in, short answers, an optional wake phrase
- [ ] The assistant on every screen, knowing what is in view
- [x] Questions in several shapes (pick one or several, yes or no, a few words, a date, a person, a number), answered by tap or voice or skipped
- [x] Photos, PDFs, voice notes and Markdown files, kept on the right record or let go
- [ ] People, pets and organizations with photos, levels and project roles; key dates; places with photos; Google Contacts picker
- [ ] Preferences, favorites and who you are; how you write; "How Nomos sees you"
- [ ] Knowledge as nested topics that read as documents, with sources on every part and a history of versions
- [x] Procedures run each time, attached to a trip, event or project
- [ ] Tasks with steps, projects with health from evidence, the Inbox, Today
- [ ] Connected apps, read only: Google Calendar, Gmail, Drive and every site app, each sharing only what you switch on
- [ ] Encrypted from day one; Trust this browser; Activity with Undo; search

Later:
- [ ] Drafting in your style, video, app cards (a Pinch recipe card), a life timeline and milestones from the moments Helm keeps, writes to other apps
- [ ] A browser extension and other ways to reach the assistant, orders, Apple contacts and sign-in

## Production setup

`npm run helm:setup` does every production setup step Helm needs, in order: both keyrings and their canaries, the Anthropic, Google OAuth, Deepgram and (optionally) Gemini secrets, Google Text-to-Speech, the alerts and a test alert, then offers to copy each keyring to the clipboard for your password manager. It skips what is already done, never prints a secret, and is safe to re-run. The alerts need the merge deployed first, so run `npm run helm:setup -- --after-deploy` after it; `npm run helm:setup -- --dry` prints the plan without changing anything. The few clicks only a browser can do (spend caps, the Google consent screen) are shown as they come up.

## Docs

- [PRODUCT.md](PRODUCT.md): the full product doc (who it is for, how each part works in detail, build plan)
- [UX.md](UX.md): screens and journeys
- [TECHNICAL.md](TECHNICAL.md): data model, rules, architecture
