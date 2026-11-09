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
- Words typed but not sent are still there when the phone closes the page, kept only sealed; opened offline or with the key refused, home says so, with Try again.
- As you type, chips under the field show what was read for certain (`@` people, `#` places, `^` procedures or notes, `!` urgent, and dates like "Friday at 3"); a date chip opens a calendar, its ✕ reads it as text, and the reading is sealed with the turn.

Next (Core MVP):
- [ ] A voice-first home: natural cloud voice online, offline voice on any phone after a one-time download, barge-in, short answers, an optional wake phrase
- [ ] The assistant on every screen, knowing what is in view
- [ ] Questions in several shapes (pick one or several, yes or no, a few words, a date, a person, a number), answered by tap or voice or skipped
- [ ] Photos, PDFs, voice notes and Markdown files, kept on the right record or let go
- [ ] People, pets and organizations with photos, levels and project roles; key dates; places with photos; Google Contacts picker
- [ ] Preferences, favorites and who you are; how you write; "How Nomos sees you"
- [ ] Knowledge as nested topics that read as documents, with sources on every part and a history of versions
- [ ] Procedures run each time, attached to a trip, event or project
- [ ] Tasks with steps, projects with health from evidence, the Inbox, Today
- [ ] Connected apps, read only: Google Calendar, Gmail, Drive and every site app, each sharing only what you switch on
- [ ] Encrypted from day one; Trust this browser; Activity with Undo; search

Later:
- [ ] Drafting in your style, video, app cards (a Pinch recipe card), a life timeline and milestones from the moments Helm keeps, writes to other apps
- [ ] A browser extension and other ways to reach the assistant, orders, Apple contacts and sign-in

## Docs

- [PRODUCT.md](PRODUCT.md): the full product doc (who it is for, how each part works in detail, build plan)
- [UX.md](UX.md): screens and journeys
- [TECHNICAL.md](TECHNICAL.md): data model, rules, architecture
