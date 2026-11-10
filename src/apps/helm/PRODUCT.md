# Helm 🧭

> Everything below is the product vision; the UX doc and the technical design come after this is approved.

> **The assistant's name.** Helm's assistant is called Nomos until the person renames it. This document says "the assistant" in prose; in quoted screen copy and spoken lines, `[name]` stands for whatever name the person chose, and the wake phrase is "Hey [name]" (see Your Assistant, In Detail). No screen or spoken line ever hard-codes "Nomos": it is only the default value of the name.

## Who It Is For

Every change names the person it serves and is walked as that person. Each person uses Helm alone: one person per account, their own assistant, nothing shared with anyone else. A change for one never breaks another's journey.

### The owner, carrying a wedding, a job and a full life

- **Situation.** A full-time job, a wedding at Ridgeline Barn eight months out, two cats, a car they care for, and the people around all of it: a florist and a baker who matter until June, a sister who matters always, a coworker mentioned once. Their life is spread over two Google accounts (calendar, mail, Drive), the site's other apps (the honeymoon in Waypoint, the wedding fund in Runway, meals in Pinch, the cats in Nine Lives), photos of quotes on their phone and a long chat elsewhere where they keep refining how they wash the car.
- **Journey they repeat.** Open Helm and talk: "Dana's quote came in at twenty-one hundred, and remind me to call her Friday" while walking to the car; send a photo of the quote; hear "Got it" and see what changed, with Undo. On a person's page, "she's key for the wedding" and "Maya's birthday is March 3"; see "Maya's birthday · Sat, Mar 3" on Today a few days before, and ask "what did I get her last year?"; on the Car care › Washing topic, "what did I decide about the ceramic coat?" and "I switched to two buckets", then tap a paragraph to see it came from a file sent last week. Ask "what's on today?" and hear a two-sentence answer. Glance at "How [name] sees you" now and then and fix what's wrong.
- **Level.** Everything in the MVP: the voice conversation with the wake phrase on, attachments, people with tiers, roles and photos, pets, Google Contacts picked in, preferences, living notes, procedures, projects, Today, and Connected apps on both Google accounts and most of the site's apps.
- **Never wants to see.** The assistant speaking first, sending or changing anything outside Helm, or keeping a photo without showing where it went. A guess about a person, a preference or who they are shown as if they had said it. Helm treated as a calendar with extras, a project shown as "62% done", a long spoken answer when a sentence would do.

### A nurse on rotating shifts, who talks and forgets

- **Situation.** Works twelve-hour shifts that change week to week, posted in a Google Calendar called "Shifts". Has a steady stream of small things (renew the license, return the parcel, book the dentist) that get lost between shifts, and is too tired to type after one.
- **Journey they repeat.** Sitting in the car after a shift, tap once and say three things in a row; hear "Got it, three things" and drive home. Before a night shift, run their "Before a night shift" procedure and tick it. On a day off, ask "anything for today?" and hear one or two things suggested around rest, and nothing at all on the day a night shift ends.
- **Level.** The voice conversation by tap (never the wake phrase), tasks, one procedure, and Today with only Google Calendar connected and the Shifts calendar marked. No projects, no contacts, no settings opened.
- **Never wants to see.** Setup before the first sentence, a list of apps to connect, a required syntax, a spoken reply blaring in the break room when they typed, a plan that treats a rest day as free time to fill, streaks or "you're behind".

### Someone handling a parent's care from a distance

- **Situation.** Coordinates their mom's appointments, medicines and paperwork from another city: two doctors, a pharmacy, an insurer, a care coordinator. Gets letters as photos and discharge summaries as PDFs. Does not use Google Calendar and does not want to connect anything. Cares a great deal that this stays private.
- **Journey they repeat.** After each call, send a voice note or say what was said ("Dr. Patel moved the cardiology follow-up to Mar 12, keep the metoprolol at 25 mg"); send the insurer's letter as a photo and see what was kept from it; before each appointment, start a run of "Before Mom's appointment" for that visit; check Mom's page for what is known, where each fact came from and who is key for her care.
- **Level.** The conversation (mostly typed in waiting rooms, voice at home), attachments, one project (Mom's care) with people in roles, Mom as a close person, facts with sources, a few notes, one procedure. Nothing connected, no browser trusted.
- **Never wants to see.** An inferred dose or date shown as confirmed, a newer fact silently replacing an older one, general knowledge passed off as a doctor's words, Mom's health read aloud when they typed, a letter kept without saying where, anything about Mom readable by anyone else or handed to another app, a nudge to connect anything.

**Each person sees only what they use.** Projects, procedures, Knowledge, pets and contacts stay out of the way until the person makes one, Today works without a calendar, the wake phrase is off until chosen, and the assistant's name, tone and "How [name] sees you" are never pushed at anyone. Connections are offered only where one would help (Today's calendar row, a person's page for Google Contacts) and otherwise wait in Settings → Connected apps.

## The Short

Helm is a private companion for one person's whole life, and you mostly talk to it. Its assistant (Nomos, or whatever you rename it) answers in a natural voice, briefly, and keeps what matters: the people in your life and how much each matters, your pets, places, projects and tasks, what you like and who you are, the routines you repeat, and the things you've learned, kept as living notes you can ask about and refine. Send it a photo, a PDF, a voice note or a Markdown file and it keeps what's useful and shows where it went. Wherever you are in Helm, it knows what's on the screen, so "move this to Friday" just works. Connect Google Calendar, Gmail, Drive, Google Contacts and the site's other apps and it can read them, saying where each thing came from, but never change them. Your day and calendar are one view among several, not the centre. It organizes inside Helm on its own, shows what it did with Undo, never speaks first, and keeps everything you tell it encrypted.

## The Story

Most of the effort of a full life is not the doing but the keeping track: who said what, who matters for what, what you prefer, what you worked out last time, which deadline is real. To-do apps hold the list but not the context; chat assistants hold the context for one conversation and forget it, and what they help you work out ends up in a chat you have to go back and find. Helm is the owner's attempt at a calm chief of staff you can simply talk to: something that remembers meaningfully, keeps what you learn in a form you can use, plans realistically, acts responsibly and asks before anything leaves the house. It started as a planner and grew, in the owner's review, into a companion for the whole of a life; this document cuts that to what the people above need first.

## How It Works

1. **Open Helm and talk.** Home is a conversation: tap once and speak, or type. The assistant answers briefly in a natural voice and keeps listening for your reply until you stop.
2. **It keeps what you said.** One sentence can hold several things; each becomes a task, a fact, a person, a place, a preference or a note, shown right in the conversation with one Undo.
3. **Show it things.** Send a photo, a screenshot, a PDF, a voice note or a Markdown file; it keeps what's useful on the right record, or reads it and lets it go, and says which.
4. **Ask about what you're looking at.** Every page with content has the same "Ask about this" control in the same place ("Ask about Grandpa"); tap it, or say "Hey [name]" if you turned it on, and the assistant knows what's on the page: "move this to Friday", "who's this?", "add a step".
5. **Answer what it can't settle.** When it truly needs you, the assistant asks one question at a time, in the shape that fits (pick one, pick several, yes or no, a few words, a date, a person or a number), answered by tap or voice; skip it and it waits in Needs you.
6. **Know your people.** People, pets and organizations each have a page, a photo if you like, how much they matter to you, their role in each project, and key dates like birthdays. Pick people from Google Contacts to bring them in.
7. **See how it sees you.** "How [name] sees you" lists who you are, what you like and how you write, as it understands them; change or remove anything.
8. **Keep what you learn.** Knowledge keeps topics as living documents the assistant writes from what you tell it, nested up to three deep (Car care › Washing): read one like a page, see where each part came from, ask about it, change it, and undo any version.
9. **Repeat what works.** A procedure is a routine you run again and again (packing for a trip, before Mom's appointment); each run is ticked off on its own and attached to its trip, event or project.
10. **Group work into projects.** A project has an objective, milestones, tasks, its people in their roles and its procedures, with health stated from evidence, never a percentage.
11. **Connect your apps, if you like.** The assistant can read Google Calendar, Gmail, Drive and the site's other apps, each sharing only what you switch on; Helm changes nothing in them.
12. **Look at your day when you want to.** Today shows your fixed events and a few tasks suggested for real gaps; it is one view among the others, first in Browse, with a quiet line for the week's birthdays and anniversaries.
13. **Ask anything.** Answers come from your own records first, with sources, and from general knowledge only when they don't say, marked "Not from your records".
14. **Undo anything it did, and make it yours.** Activity lists every change; rename the assistant, pick its tone, and trust your browser so Helm opens offline.

### Home: a Conversation, In Detail

The owner's words: "the main view to be a communication interface. Not necessarily a chat UI, but one which leans into voice-first communication."

- **What home is.** One calm surface for talking with the assistant: the current conversation above the voice dock. There is no tab bar.
- **The voice dock, on home only.** Three controls at the bottom of home: **Browse** (opens the views, below), **Talk** (the large centre control: starts listening) and **Type** (opens the field). The dock belongs to home and appears nowhere else. Every other page has Back and a way home; a content page asks through its own built-in "Ask about this" control instead (What's on Screen, In Detail).
- **Browse is tiles, sized by how much they matter.** Browse opens a sheet of tiles pulled up from the dock of mixed sizes, so the views used most are the biggest and the rest stay small:
  - Search across the top.
  - **Big tiles:** **Today** (the widest, with its one-line state, "2 events · 1 planned"), **Needs you** (grows while it has questions, showing the first one; shrinks to a small tile saying "Nothing waiting" when empty), **People** (a few faces and a count) and **Projects** (the next deadline and a count).
  - **Small tiles or a compact row:** Places, Knowledge, Procedures, Coming up and How [name] sees you, each with its count.
  - **The foot row:** Connected apps · Settings · Activity.
  A small tile shows only once its view has something in it. Sizes are fixed by Helm in the MVP, never by the person; a section added later is a small tile, never a big one, so Browse stays calm as Helm grows. Ordering by the person's own use is Next Steps. The exact layout is the design track's.
- **What it shows when idle.** The assistant's mark, a one-line hint ("Tap to talk, or type"), and at most two quiet lines when they are true: the next fixed thing today ("Cake tasting at 3:00 PM") and "2 need you", a door to the Inbox. Nothing else competes with the conversation, and an empty Helm shows only the hint.
- **The conversation, not a log.** Home shows this sitting's turns: what the person said (their words, as heard or typed), what the assistant said, and what it did. Turns from an earlier visit fold under "Earlier today" and then leave home; every turn stays findable in Activity, with what it changed. There is no endless thread to scroll.
- **A reply reads as an answer.** The assistant's words come first ("Got it. I'll remind you Friday."), then what it did as one compact card under them, then any question. A turn never reads as a system log.
- **Several messages in a row.** Each message the person sends shows on its own. Messages sent while the assistant is still thinking join the same turn and get one reply that covers them all ("Got all three." then one card with everything it did); a message sent after a reply starts a new turn. Spoken, a pause long enough to end a turn followed by more speech before the reply begins joins the same turn too.
- **What it did, in the conversation.** Each change is one line in the past tense on the reply's card ("Made a task: Call Dana · Fri, Nov 13", "Added Dana to Wedding as key", "Kept the photo on Dana's quote"), each opening its record, with one Undo for the turn. Past 5 lines it shows 5 and "Show 4 more". A question the assistant needs answered shows as the last line ("1 needs you: Which Sam?"), answerable right there.
- **Opening Helm is silent.** The assistant never greets aloud, never speaks first and never starts listening on load (the wake phrase, once chosen, is the one exception, and it only listens). The first thing that happens is the person's tap or words.
- **Typing is always there.** Every turn can be typed; the voice is the easy way in, never the only one. A typed turn gets a written reply (Speaking and Listening, In Detail).
- **Shorthand, dates and limits** work in a typed turn as before (Capture, In Detail).
- **Empty, first time.** "Tell [name] anything: a task, someone's name, something to remember." with Talk and Type in the dock. The first reply ends once with a quiet door: "You can rename [name] and choose how it sounds."

### Speaking and Listening, In Detail

The owner chose a hybrid voice: natural cloud voices online, the phone's own when offline, behind one voice service that can swap providers, with its own budget apart from the assistant's thinking.

- **Tap, then hands-free.** One tap on Talk starts listening (with the soft rising chime the site uses). The person talks; a pause ends their turn; the reply plays; and the assistant listens again for an answer, without another tap. After 8 seconds with nothing said, listening ends on its own; a tap on the lit control ends it at once. "That's all" or "thanks" ends it too.
- **Barge-in.** Speaking while the assistant talks stops its voice at once and takes what the person says as the next turn. Whatever it hadn't said yet stays on screen.
- **"Hey [name]", while Helm is open.** A switch in the Voice sheet, off until the person turns it on (the one-time offer on the third spoken conversation, "Say 'Hey [name]' instead of tapping Talk, while Helm is open on your screen · Turn on", is not built yet). On, Helm listens for the phrase only while it is open and on screen, never with the screen off or the tab hidden, and says so in the switch's own words. The phrase counts only at the start of what was heard. Until it is heard, nothing is sent to Helm's voice service: Hear me offline listens for it on the phone once downloaded, and the browser's own recognition until then.
- **Concise by default.** A spoken reply is a sentence or two (about 40 words at most): the answer, not the reasoning. A longer answer is spoken as its short version and shown in full on screen, ending "The rest is on your screen." "Tell me more" reads on. A confirmation is short: "Got it." or "Got it, three things."
- **Spoken when you spoke.** A turn the person spoke gets a spoken reply and a written one; a typed turn gets a written reply only. Mute, shown at the top while the assistant speaks, silences spoken replies until the person leaves Helm (replies are still written): the control reads "Mute", and while on, "Muted", with one line in the conversation: "Replies muted until you leave Helm. Tap Muted to hear them." Coming back to Helm starts unmuted. While a spoken conversation is going, everything the assistant shows is also said: what it did ("Made a task: call Dana Friday"), questions ("Which Sam: work, or your cousin?") and refusals.
- **Undo by voice.** "Undo that" or "take that back" undoes the last turn's changes, and says what it took back.
- **One voice.** Helm has one voice identity: warm, a natural pace, never over-cheerful, urgent without alarm, concise. Whichever provider speaks, it is set to match. Tone (Your Assistant, In Detail) shapes the words; the voice is the same in every tone. Choosing among voices is Next Steps.
- **"Got it" is instant.** Quick confirmations are spoken by the phone's own voice the moment the change is saved, so nothing waits on the network; answers use the natural cloud voice.
- **Voice offline, on every phone.** "Hear me offline" is a one-time download of a speech recognizer that runs on the phone (about 40–75 MB until it is measured), off until the person turns it on. It is offered once, the first time Talk is tapped with no connection or with the cloud voice unavailable, and always sits in Settings → Voice; it is kept per phone, removable, and offered only where the phone can run it. Once downloaded, Talk works offline, interrupting included, and replies use the site's natural voice (if downloaded too) or the phone's system voice. What needs the assistant's thinking is kept on the device and done once back online: "Saved on this device. [name] will sort it once you're back online."
- **"Hear me offline", word for word.**
  - Row (Settings → Voice): "Hear me offline" · "Talk to [name] with no connection. Runs on this phone."
  - Offer (first Talk with no connection): "Talk without a connection? A one-time download, about 40–75 MB. · Download"
  - Turn-on sheet, title: "Hear me offline"
  - Sheet, what it does: "Your phone turns your speech into words itself, so Talk works with no connection."
  - Sheet, size and where: "A one-time download of about 40–75 MB from [host], kept on this phone only."
  - Sheet, what leaves: "What you say offline stays on this phone until [name] reads it online."
  - Sheet, licence: "Uses [recognizer], open source under [licence]." (plus, if it carries copyleft: "It includes [part], under the GPL.")
  - Sheet, buttons: "Download" · "Not now"
  - Downloading: "Downloading… 23 of 60 MB" (the real size once known)
  - Ready: "Ready. Talk works offline on this phone."
  - Failed: "The download stopped. · Try again"
  - Can't run: "This phone can't run offline listening. Talk needs a connection here."
  - Remove: "Remove from this phone" → "Removed. Talk needs a connection again on this phone. · Undo" (Undo downloads it again)
- **Before the download.** Offline, Talk uses the browser's own recognition where it works without a connection; where it doesn't, Talk offers the download and Type and voice notes carry on: "Voice needs a connection on this phone until you turn on Hear me offline." Nothing is ever lost.
- **The microphone, on a tap.** The first tap on Talk opens a short sheet before the browser's prompt: what is heard, by whom ("Your speech goes to [voice provider] to be turned into text, and the replies you hear come from it too. It keeps neither." once the provider's terms say so), and that Helm keeps the words, not the sound. Denied: "The microphone is off for Helm in your browser's settings. You can still type." Asked once, never in a loop.
- **When the voice runs short.** Each person has a daily cloud allowance: 60 minutes of listening and 30,000 characters of speech (a few hundred short replies); the whole site's voice spend is capped at $5 a day. Past either, Helm keeps talking in the phone's own voice and recognition (the offline model if downloaded) and says so once, in the conversation: "Using your phone's voice for the rest of today. It may sound less natural." (Issue 14 builds the listening half: "Listening with this browser for the rest of today." Issue 15 builds the speaking side without the line: past the allowance answers are read by the phone's voice silently; the line arrives with spoken answers, issue 27.) Nothing stops working, and the allowance starts again at midnight in the person's time zone.
- **What is kept.** The words of each turn, sealed, as the source of what they made. The sound of the person's voice is never stored (a voice note they send is the one exception, Sending a Photo, File or Voice Note, In Detail).

### What's on Screen, In Detail

- **Content pages, and the rest.** A content page is one that shows something the person might ask about: a person, pet or organization, a place, a project, a task, a Knowledge topic or note, a procedure or a run, Today, Needs you, the People and Projects lists, Knowledge, "How [name] sees you", Coming up, and an answer's sources. Utility screens (Settings, Connected apps, Activity, Search, and any form or sheet that edits something) have no ask control. Home has the dock.
- **One "Ask about this" control, the same everywhere.** Every content page has the same built-in control, always in the same place on the page and part of its layout, never floating over it, and drawn so it reads as asking the assistant, not as a generic action. Where it sits is the design track's choice; that it never moves between pages is the rule.
- **Its words, per page, exactly:**
  - A person, pet, organization or place: "Ask about Grandpa", "Ask about Miso", "Ask about Sweet Layer Bakery"
  - A project: "Ask about Wedding"
  - A task: "Ask about this task"
  - A Knowledge topic or note: "Ask about this topic", "Ask about this note"
  - A procedure or a run: "Ask about Packing for a trip", "Ask about this run"
  - Today, or another day: "Ask about today", "Ask about Sat, Mar 3"
  - Needs you: "Ask about these 3 questions"
  - A list (People, Projects, a filtered task list, Coming up): "Ask about these 24 people", "Ask about these 6 projects", "Ask about these 12 tasks", "Ask about what's coming up"
  - Knowledge: "Ask about your knowledge"
  - How [name] sees you: "Ask about how [name] sees you"
  - An answer's sources: "Ask about these sources"
  A name too long for the line is cut with an ellipsis ("Ask about Sweet Layer Bak…"); the full name is on the chip.
- **What a tap does.** It opens the conversation about this page, listening at once if the person last talked by voice and with the field open if they last typed (both are always one tap apart). At the top of the conversation sits a chip naming what it is about: "About Grandpa", "About this topic: Washing", "About today", "About 12 tasks". The chip's × removes it ("About anything"), and that turn then carries nothing from the page. "Hey [name]" on a content page opens the same conversation with the same chip.
- **The way back.** Closing the conversation returns to the page, scrolled where it was, with any change already showing there. The close control reads "Back to Grandpa" ("Back to today", "Back to this topic"); swiping the conversation down does the same. The turns stay on home's conversation too.
- **The assistant knows what you're looking at.** Every screen tells the assistant which records it shows: the open task, person, place, project, note or procedure (or the rows in view). Helm's server reads those records itself, under the person's own account, so what the assistant knows is what is really saved. "Move this to Friday" on a task moves that task; "who's this?" on a person's page answers from what Helm knows about them; "add a step" on a procedure adds it to that procedure, with Undo.
- **"This" means what's in view.** On a list, "this" is the row the person last opened or the one on screen if there is only one; when two could be meant: "Which one: Call Dana or Order flowers?" The thing in view is searched first for any question, then the rest of the person's records.
- **Only what the screen shows.** The screen names only the records on it, a few at most, and nothing from another screen; it never sends its own words or anything typed but unsaved. A copied thing from a connected app can be asked about but not changed: "move this to Friday" on a Waypoint activity says "Helm can't change Waypoint. Change it there?" with Open Waypoint.
- **One conversation everywhere.** Asking from a page and talking on home are one conversation: the reply and what changed show where they were asked, with Undo, and the same turns show on home.
- **Asking from a topic.** While a topic is open, a question is answered from that topic first, then the rest of the person's records, then general knowledge marked as such (Knowledge, In Detail).

### Sending a Photo, File or Voice Note, In Detail

The owner's words: "Nomos would know if these should be stored and, if so, how so a user can view them as it relates to any changes. After all, life exists in mediums."

- **What can be sent.** Photos and screenshots, PDFs, voice notes recorded in Helm, and Markdown (`.md`) files, from home or from the conversation on any screen. Video is Next Steps. Up to 5 at once.
- **Said before anything is sent.** The attach control says, before the picker opens: "[name] reads what you send to sort it, and keeps only what's useful. You'll see what it kept."
- **Real input.** A phone photo of any size is shrunk on the device first. A PDF can be up to 20 pages and 10 MB; past that, the first 20 pages are read and the reply says so. A voice note can be up to 5 minutes. A Markdown file is read as text, up to 20,000 characters, like a note. Several files at once are read together as one turn, so a quote's photo and "this is Dana's" make one change.
- **Kept or let go, and said either way.** The assistant decides for each file. Kept: it is stored sealed, on the record it changed ("Kept the photo on Dana's quote"), shown there with "From what you sent on Nov 9", and in the conversation. Let go: "Read the letter. Didn't keep it · Keep it", with a muted line under it, "Deleted in 24 hours unless you keep it." After 24 hours the file is deleted and the line reads "Read the letter. Didn't keep it" with no button. Keep it: "Kept the letter on Mom's care · Undo". What it read always leaves its trace in what it made (a fact's source says "From the letter you sent on Nov 9").
- **What each kind becomes.** A photo of a quote or a letter: facts and tasks, with the photo kept when the person would want to see it again. A photo the person says is of someone ("this is Dana") or of a place: offered as that record's photo, set with Undo. A PDF: its facts and dates, the file kept on the record or project when it is a document worth having (a contract, a discharge summary). A Markdown file: filed into a Knowledge topic (or kept as a loose note), or attached to a record, when it is something to keep; otherwise read like a long typed message. A voice note: turned into words, which become its turn; the sound is let go unless the person taps "Keep the recording".
- **Never recognizes faces.** The assistant never works out who is in a photo from their face; a person's photo is set only when the person says who it is, picks it, or brings it from Google Contacts.
- **Kept media is the person's.** Each kept file shows on its record with Remove (with Undo); "Media" on a record lists all of them. Delete all my Helm data removes every file.
- **When it can't read one.** "Couldn't read this PDF. It may be protected or scanned too faintly." with Try again and "Keep it as it is" (attaches it to the record in view, unread). A failed upload keeps the file in the field to retry.

### Capture, In Detail

A capture is any turn the assistant files: spoken, typed, or sent as a file. These rules hold however it arrives.

- **What a capture really is.** Real input is messy: a run-on spoken sentence, three things in one line ("Mom's birthday is June 3, buy the rings, call Dana Friday"), a pasted vendor email, a half-thought with no verb, a question with a task tacked on. The assistant splits it into as many items as it holds and files each one; the original words stay attached to everything they produced, as their source. A typed capture can be up to 4,000 characters (a long pasted email fits).
- **Shorthand is exact, when typed.** `@`, `#`, `^` and `!` are read by Helm itself, not guessed by the AI: `@Dana` always means a person, pet or organization, `#Sweet Layer Bakery` always a place, `^Packing for a trip` always a procedure or note by that name, `!` always urgent. A project is named in words ("for the wedding"), never by a symbol. Speaking never needs shorthand.
- **Dates are worked out by Helm.** "Friday", "next Tue", "Mar 12", "tomorrow at 3" are read by plain code from today in the person's time zone, never by the AI. "Next Friday" on a Wednesday means the Friday of next week, always the same rule.
- **What Helm read shows before Send.** As the person types, a chip line under the field shows what Helm read for certain (Dana · Fri, Nov 13 · Urgent). Tapping a date chip opens a calendar to fix it; tapping any chip offers "Read as text". The AI only ever adds to this; it never overrides a chip. A spoken turn is sent when the person stops talking; its words show as heard, and what Helm read is in what it did, with Undo.
- **Addressing the assistant is fine.** A turn that opens with the assistant's name ("Nomos, call Dana Friday", or the new name after a rename) drops the address. The name is never read as a person.
- **Reading.** While the assistant works, the turn shows "Thinking…" under the person's words; more messages sent meanwhile join the turn and are answered together (Home: a Conversation, In Detail), each still the source of what it made. A typical turn takes a few seconds; past 15 seconds it adds "Still working. You can leave this; it'll be in your Inbox." Leaving never loses anything.
- **Too much for one turn.** A capture is filed as at most 20 changes. One that holds more files the first 20 and leaves the rest as "Too much to file at once" in Needs you, with "Sort the rest".
- **"Remember that…"** Something true in general rather than about the person's own life ("remember that cakes keep 3 days in the fridge") is filed into the topic it belongs to, or asks where the first time (Knowledge, In Detail), with Undo.
- **Too long.** From 3,600 typed characters a quiet count shows what is left; a paste longer than 4,000 stays in the field with "Too long by 312 characters. Split it into two, or save it to your knowledge." "Save to my knowledge" keeps the whole text as a note as written (up to 20,000 characters, read by no AI), so nothing is cut silently.
- **A lot in a short time.** Quick turns ("add milk", "done with the dentist", "thanks") use a lighter model and have their own allowance: 60 in 10 minutes and 400 a day. A question, and turns that plan or file several things, use the fuller model: 20 in 10 minutes and 150 a day. Helm's whole AI spend is capped at $10 a day. Past a 10-minute allowance, a turn is saved as written with "Saved. [name] will sort this in a few minutes." Past a day's allowance (or the site's cap), "Saved. [name] will sort this tomorrow." Spoken, the same words are said. Neither loses anything, and both are sorted on their own when the wait is over and Helm is open. No screen shows a count of what is left.
- **Without AI.** If the AI service is unreachable, the capture is saved as written, with its chips applied: "Saved as written. [name] will sort it when it's back." It waits in the Inbox and is read again the next time Helm opens. After three failed tries it says why in a sentence that names the cause and offers Try again, "Make it a task as written" and Delete.
- **Offline.** A capture made with no connection is kept encrypted on this device: "Saved on this device. [name] will sort it once you're back online." A question asked offline is answered once Helm is back online, and the answer waits in "New since you looked". Signing out with captures still on the device asks first: "2 things you told [name] haven't been saved yet. Sign out anyway?", with Stay as the safe choice.
- **An unsent turn survives.** Text typed but not sent is still in the field when the person comes back, even after the phone closes the app.
- **Couldn't read it.** Words the assistant can't make sense of (a bare link, a fragment, a mumble) are never filed on a guess. Spoken, it asks once: "Sorry, I didn't catch that." Typed, it waits in Needs you as "Couldn't read this", with "Make it a task as written", "Add more and try again" and Delete.

### The Inbox, In Detail

- **Two parts.** "Needs you" (questions the assistant won't guess) at the top, newest first, then "New since you looked" (turns whose results the person hasn't seen, such as one sorted after being offline). Home's "2 need you" line counts Needs you only and opens the Inbox.
- **Asked in the conversation too.** A question a turn raises is asked right there, aloud if the turn was spoken; left unanswered, it waits in Needs you. "What do you need from me?" reads the waiting questions one at a time. The assistant never brings one up on its own in a later conversation.
- **The questions.** Any of the shapes in Questions, In Detail; the ones Helm builds itself keep their fixed wording:
  - *Which person?* "Lunch with Sam Thursday" when Memory has two Sams: each candidate with the one detail that tells them apart ("Work · Design team", "Cousin"), then "Someone new" and "Don't link anyone".
  - *Which is true now?* A new capture contradicts a fact ("Dana says centerpieces are $2,100 now" against $1,800): both with their sources and dates, nothing preselected. The one not picked is kept as "Was $1,800 until Nov 8". "Neither" opens Correct.
  - *Which day?* Only when the words hold two dates Helm can't choose between ("the 3rd or the 10th"): the two as choices, plus a calendar.
  - *Couldn't read this*, *Couldn't sort this*, *Too much to file at once*: as in Capture, In Detail.
- **Answering.** One tap or one spoken answer (or Done, for several) answers and files, with Undo, and the question leaves Needs you. Questions never expire and are never answered by default.
- **Seen.** A turn leaves "New since you looked" once its result was seen or the person taps "Mark all seen" (shown at 2 or more). It stays in Activity and on each record it made.
- **Empty.** "Nothing waiting. [name] asks here when it isn't sure."

### Questions, In Detail

The owner's words: "Agent should be able to ask different types of questions, like most chats today. For example, multi-select or free response."

- **When it asks, and when it acts.** Inside Helm the assistant organizes freely and shows what it did with Undo; anything that would leave Helm is proposed, never done. A question is only for what it can't settle itself, where a guess would file something wrong: which of two people, which of two facts is true now, which day, which of several things the words point to, or a preference it needs to make what was asked for ("Which of these should the packing procedure include?"). It never asks to confirm something it can just do and undo, never asks what Helm's records already say, and never asks to make conversation.
- **One at a time when spoken.** In a spoken conversation it asks one question, waits for the answer, then asks the next. On screen a turn shows at most 3 questions; any more wait in Needs you with "2 more questions in Needs you".
- **The shapes:**
  - **Pick one** (2 to 6 options), with "Something else" opening a short answer when the options may not cover it.
  - **Pick several** (2 to 8 options), with "None of these" and Done.
  - **Yes or no.**
  - **A few words** (a short answer, typed or spoken, up to 500 characters).
  - **A date or a time**, with a calendar or time picker; a spoken "next Friday" is read by Helm's code like any date.
  - **A person, place or project**, from the person's own records, with "Someone new" (or "New place", "New project") at the end.
  - **A number**, with its unit when there is one ("How many guests? · people").
- **Who writes the words.** The assistant may write a question and its options, which Helm checks and caps (6 or 8 options, 80 characters each) before showing. Questions Helm builds itself ("Which Sam?", "Which is true now?", "Which day?") keep their fixed wording in every tone.
- **Word for word.**
  - None of these (pick several): "None of these". Picking it clears the other ticks.
  - Something else (pick one): "Something else", which opens a field: "Tell [name] what you mean".
  - Skip (every shape): "Skip". After it: "Skipped. It's waiting in Needs you." Spoken the same way.
  - Done (pick several): "Done", reading "Done · 2" once two are ticked; with nothing ticked it reads "Pick at least one, or None of these" when tapped.
  - Spoken, pick several with two options: "Which of these? Cake tasting, venue walk, or both?"
  - Spoken, pick several with more: "Which of these? Cake tasting, venue walk or florist call. You can say more than one."
  - Spoken, pick one: "Which one: Cake tasting or venue walk?"
  - Spoken, more than 4 options: the first 3, then "or one of 3 more on your screen."
  - Spoken, yes or no: the question as written; "Yes or no?" is added only when the question doesn't already make it plain.
  - Spoken, a few words: the question, then listening, with no prompt word.
- **Answering by voice.** An option's name, "the first", "the second one", "the first two", "both", "all of them", "none of these", "yes", "no", a date, a number, "skip". An answer that fits none of the options is asked once more ("Sorry, which one? Cake tasting or venue walk?"), then the question waits on screen and in Needs you.
- **Skipped or left unanswered.** It waits in Needs you, never expires and is never answered by default; nothing it would have changed is done in the meantime.
- **Recorded, with Undo.** Each answer is kept with its question in Activity ("Asked: Which of these? · You picked Cake tasting and Venue walk"), and what the answer changed has one Undo, like any turn.

### Asking a Question, In Detail

- **Your records first.** "When is the cake tasting?" is answered from Helm's tasks, facts, people, preferences, notes, procedures and what your connected apps share, with each source shown (a filled ring for what you said, a hollow one for what was inferred, the book mark for a note, with "not checked" on one saved from a general answer, a connected app's logo for what came from it) and a door to the record. An inferred source is named in the answer itself ("[name] inferred this from what you told it on Nov 3"). When two of your records disagree, both are shown with their dates and neither is picked. On a screen, the thing in view is looked at first (What's on Screen, In Detail).
- **Spoken answers are short.** Spoken, the answer is its first sentence or two and its main source in a few words ("Today at 3, at Sweet Layer Bakery. From your calendar."); the full answer and every source show on screen.
- **Then your mail and documents.** With Gmail or Drive connected, a question Helm's records don't fully answer and that mail or a document plausibly could ("what did Dana quote?") is also searched there. Each message or file used is cited by sender or name, date and account, with "Open in Gmail" or "Open in Drive", and the answer ends with what was searched: "Searched your records and your mail (personal)." A search that finds nothing says so, then falls through to general knowledge only for questions about the world.
- **General knowledge only when your records don't say.** A question about the world ("how long does a cake keep?") that nothing in Helm or your connected apps answers gets a general answer in its own block under the label **Not from your records**, with one line of caution: "From general knowledge, not checked against anything you've told Helm. It may be out of date." Spoken, the answer begins "This isn't from your records, and it may be out of date." and then gives the answer; the full caution stays on screen. Helm doesn't search the web.
- **Never in one sentence.** Records, connected apps, mail and documents are all sourced, so one sentence may draw on several of them, each cited. General knowledge is the one kept apart: when records answer part of a question and general knowledge the rest, the answer is two blocks, and no sentence draws on both. A general block that differs from one of the person's notes says so on its own line ("Your note 'Cake storage' says 5 days.").
- **Health and medicine carry a stronger caution.** A general answer about symptoms, medicines, doses or treatment says instead: "General information, not medical advice. Check with a doctor or pharmacist before acting on it." Spoken, it begins "This isn't from your records, and it isn't medical advice." and ends "Check with a doctor or pharmacist before acting on it." Neither caution changes with tone, and neither names a person from Memory.
- **Questions about your own things never fall back.** "What's Dana's number?" or "when is Mom's follow-up?" can only be answered from records and connected apps; with nothing there it says "Nothing in Helm says when Mom's follow-up is." and never guesses.
- **An answer is not a record.** A general answer is never stored as a fact or a note on its own. Under it, "Save to my knowledge" keeps it (Knowledge, In Detail); otherwise it lives only in Activity.
- **A question writes almost nothing.** An answer has no Undo, with one exception: when a mail or Drive search finds something that disagrees with an event, the answer notes it on the event as one fact, with Undo ("Noted the 2:30 PM on Cake tasting"). A turn that mixes a question and things to file gets both.
- **When it can't answer yet.** With the AI unreachable, the question is kept ("Saved. [name] will answer when it's back.") and its answer joins "New since you looked" once it comes.

### What the Assistant Does on Its Own, In Detail

- **Inside Helm, it acts and tells.** Creating, linking, tagging and moving tasks, people, pets, organizations, places, facts, preferences, projects, roles and procedures, adding to a note, setting a photo the person named, and keeping or letting go of a sent file happen straight away and show as one line with Undo, in the conversation and in Activity.
- **Nothing leaves Helm in the MVP.** Helm only reads its connections and changes nothing in them; the only thing that leaves is what the person copies with their own tap. Proposals that would leave Helm, approved one by one, start in Next Steps. Acting outside Helm without asking (levels 3 and 4) is a Stretch goal, opt-in per kind of action.
- **Never speaks first, never interrupts.** The assistant answers when spoken or typed to. It may offer a plan or a procedure, but only where the person will look (Today, a task, an event); it sends no push, opens no conversation and says nothing aloud unprompted.
- **Never shows an attempt as done.** A change is shown (and spoken) as done only after it is saved. A failed one says so in words and keeps what was said.
- **Undo is honest about later changes.** Undo re-reads what is there now. A single record changed since ("You edited this task after [name] made it") is kept and the Undo says so. Undo for a whole turn goes on past the records changed since and reports them: "Took back 1 task and 2 links. Kept 1 task you changed since." Each Undo adds its own line to Activity; the original is marked undone, never removed. An undone change can't be undone again.
- **Every offer can be declined.** A suggested plan slot, procedure, link or role has "Not now", and a declined suggestion of the same kind for the same thing is not offered again.

### Your Assistant, In Detail

- **Where.** Settings → "Your assistant": the name, tone and the "Hey [name]" switch ("Nomos · Composed"). Nothing asks for them at first run.
- **Rename.** One text field, 1 to 16 characters, letters, numbers, spaces, hyphens and apostrophes. Clearing it, or "Use the default name", goes back to Nomos. The new name shows everywhere at once and is the name the assistant answers to: the wake phrase becomes "Hey [name]", and a turn that opens with the name drops it. Activity reads the current name for every line, old ones included.
- **A name you can call.** When the wake phrase is on, the rename field adds "Say 'Hey [name]' to try it" and listens once; a name the phone's recognition doesn't catch twice in a row says "Your phone has trouble hearing 'Hey Sam'. Tap to talk still works." The rename is never refused for it. The wake phrase always follows the name.
- **Copy works for any name.** No line uses a pronoun for the assistant (no he, she, his, her), a possessive of its name, or a sentence that only reads right with "Nomos". The assistant's mark is the first letter of the chosen name (a feather when it doesn't start with a letter).
- **The name isn't a person.** It is never matched to someone in Memory, so naming it "Sam" never touches the two Sams.
- **Tone.** Four choices, each shown and played with the same sample answer before saving (a fixed sample, no AI call):
  - **Composed** (the default): plain, complete sentences. "Your cake tasting is today at 3:00 PM at Sweet Layer Bakery."
  - **Warm**: friendlier, a few more words. "Your cake tasting is today at 3:00 PM at Sweet Layer Bakery. Hope it's a good one."
  - **Brief**: the fewest words. "Cake tasting: today, 3:00 PM, Sweet Layer Bakery."
  - **Formal**: measured and courteous, like a seasoned butler. "The cake tasting is this afternoon at 3:00 PM, at Sweet Layer Bakery."
- **What tone changes.** Only what the assistant says or writes freely: answers (spoken and written; a general answer's label and caution stay fixed), and the intro line on a procedure or note it drafts. Every tone is concise when spoken.
- **What tone never changes.** Facts, names, dates, times and amounts; the words of anything it files; result lines, sources and "You said" / "[name] inferred"; questions; Undo, failure and confirm wording; buttons, chips, labels and empty states; the voice itself; what it does, how much it suggests and what it asks before acting. No tone adds emoji, exclamation marks, cheerleading or praise.
- **From now on.** A new name or tone applies to what is said next; an answer already given keeps its words.

### People, Pets and Organizations, In Detail

The owner's words: "not all are equal… there'll be key people for a project and others which just come up", and "how do we store pets and other identities which aren't necessarily people".

- **One kind of record for "who".** A person, a pet or an organization (an insurer, an employer, a clinic you deal with) is one record with its kind, a name, how it relates to the person ("sister", "florist", "our cat", "Mom's insurer"), how to reach it, an optional photo, its facts and its projects. `@` finds any of them. Groups and households are Next Steps.
- **Pets are who, not what.** A pet has a name, species and birthday, and its facts (its vet, its food, its medicine) like anyone. A Nine Lives cat, once connected, shows its app's details on the same page when the names match for sure, with both sources; the Nine Lives part stays read only.
- **An organization or a place.** A place is somewhere the person goes (`#Sweet Layer Bakery`); an organization is someone they deal with that isn't a person (`@Blue Shield`). One may link to the other ("Sweet Layer Bakery · place" on the organization's page); the assistant doesn't turn one into the other.
- **How much each matters.** Each who has one of three levels:
  - **Close**: the people who matter always (family, partner, closest friends, a pet). Listed first everywhere, and the first match when a name is ambiguous.
  - **Regular**: people the person deals with (a florist, a doctor, a coworker). Listed normally.
  - **Passing**: someone who just came up ("the guy at the tire shop"). Kept with their facts and findable in Search and answers, but left out of People lists, folded under "Passing (12)", until they matter.
  - New people start Passing when only mentioned, and Regular when the person says how they relate or gives a way to reach them; the assistant may suggest Close from family words ("my sister"), shown as inferred until the person confirms it. A Passing person becomes Regular, with a line and Undo, when any one of these happens: they come up three times on at least two different days, a task is linked to them, or they get a Key or Involved role in a project (a Mentioned role leaves them Passing). The person can change any level on the page or by saying so ("Maya is close").
- **Roles in a project.** On a project, each who has a role: **Key** (the people the project depends on: Dana the florist for the Wedding), **Involved** (part of it), **Mentioned** (came up once). A project's page lists Key first with their photos. "She's key for the wedding" on Dana's page sets it. A who can be in many projects, with a different role in each.
- **Photos.** A person, pet, organization or place can have a photo (several for a place): picked from the phone or camera, kept from something sent ("this is Dana"), or brought from Google Contacts. Kept sealed like everything else. A who without one shows their initials.
- **Matching.** `@Dana` or "Dana" links to an existing who only when there is exactly one sure match (a Close one wins a tie with a Passing one only when the others are Passing); otherwise the Inbox asks.
- **Forgetting.** The confirm names what goes: "Forget Dana Ruiz? The 6 facts and 1 photo go too; 3 tasks stay, with no person." Merging two records is Next Steps; a duplicate is fixed by Undo on the turn that made it.

### Key Dates, In Detail

The owner's words: "in order to have a timeline for the user and for their people, I think we should store key dates", then in round 6d: "I don't think they're going to scale for a user's lifetime." So key dates come in two kinds, kept and shown differently: a few dates that come back every year, and an open-ended run of moments that belong to a timeline.

- **Dates that come back.** **Birthday**, **Anniversary** and **Custom yearly** ("Gotcha day", "Sobriety date"). A who has a few at most. They feed Today and Coming up, and answers ("When is Maya's birthday?"). The year may be unknown: a birthday can be just "March 3".
- **Moments.** **Moved**, **Started a job**, **Left a job**, **Graduated**, **Adopted**, **Met**, **Passed away** and **Custom one-time** ("Ran the Chicago marathon"). There is no limit to how many a life holds. They never show on Today or in Coming up; they are the record a life timeline will read (Next Steps). A moment can be a full date, a month and year, or a year alone ("Moved to Denver · 2009").
- **Who has them.** People, pets and organizations ("Sweet Layer Bakery · Opened · 2015"), and the person themself, whose own show on "How [name] sees you" under Who you are, in the same shape as a who page.
- **How they get in.** Said in conversation ("Maya's birthday is March 3", "we adopted Miso in June 2023", "Grandpa moved to Tucson in the 80s"), filed with Undo: "Noted Maya's birthday: March 3", "Noted a moment for Miso: Adopted · June 2023". A relative date is worked out by Helm's code, as other dates are; one that can only be pinned to a month, a year or a decade is kept that way ("the 80s" is kept as 1980s) and shown that way, never made more exact. Picked people from Google Contacts bring their birthday. Each date keeps its source and is said or inferred like any fact; a date that disagrees with one already kept is the usual "Which is true now?" question.
- **On a who page, word for word.** One "Key dates" section:
  - Heading: "Key dates"
  - The dates that come back, soonest first:
    - "Birthday · March 3, 1994 · turns 32 on Tue"
    - "Birthday · March 3" with a muted "Year not known · Add year"
    - "Anniversary · June 20 · 1 year on Jun 20"
    - "Gotcha day · June 4"
  - A muted divider "Moments", then the latest 3, newest first:
    - "Started a job · Jan 2025 · Northwind"
    - "Moved · Aug 2024 · to Denver"
    - "Graduated · 2016"
  - Then "See all 14 moments" when there are more than 3.
  - Add: "Add a date"
  - Empty: "No key dates yet. Tell [name] a birthday or a moment, or add one."
  - A row opens a small sheet with its source, Edit, Remove (with Undo) and, for a date that comes back, "Show on Today" (on by default for Birthday, Anniversary and Custom yearly). Adding or changing a date that comes back by hand needs a connection, and the sheet says "Needs a connection to save"; a date said in a turn while offline waits with the turn.
- **All moments, word for word.** "See all 14 moments" opens a page titled "Grandpa's moments", grouped by decade, then year, newest first:
  - Decade heading: "2020s", "2010s", "1980s"
  - Year heading under it: "2024", "2016"; a moment known only to its decade sits under the decade with no year heading, last ("Sometime in the 1980s")
  - Row: "Aug 12 · Moved to Denver", "Jan · Started at Northwind", "Graduated" (year only)
  - Each decade shows its count and folds after the newest one: "1990s · 3" opens on a tap.
  - Empty: "No moments yet. Tell [name] about a move, a new job or another milestone."
  - It has "Ask about Grandpa's moments" like any content page.
- **Coming up, word for word.** One view for everyone's dates that come back, reached from Today's "+2 more this week" and from a small tile in Browse:
  - Title: "Coming up"
  - Subtitle: "Birthdays, anniversaries and other dates that come back, for the next 12 months."
  - Month headings: "November", "December", then "January 2027" once the year turns.
  - Row: "Thu, Nov 12 · Maya's birthday · turns 32", "Fri, Nov 20 · Your anniversary with Maya · 5 years", "Thu, Dec 3 · Miso's gotcha day · 3 years", "Tue, Dec 8 · Dana Ruiz's birthday" (no year known, so no age)
  - Today and tomorrow say so: "Today · Maya's birthday · turns 32"
  - Close people first within a day, then regular; passing people's dates show only behind "Show everyone" at the top.
  - Search from 8 rows; a month with more than 20 dates shows 20 and "Show 14 more in March".
  - Empty: "No birthdays or anniversaries yet. Tell [name] one, or add it on someone's page."
- **On Today, word for word.** Under the summary, at most 3 lines for dates that come back in the next 7 days, close people (and pets and the person themself) first, then regular, soonest first within each; passing people never:
  - "Maya's birthday · Sat, Nov 14", "· tomorrow", "· today"
  - With a known year: "Maya turns 32 · Thu, Nov 12"
  - "Your anniversary with Maya · Fri, Nov 20 · 5 years"
  - "Miso's gotcha day · Thu, Dec 3"
  - More: "+2 more this week", opening Coming up at this week.
  It is a view: never spoken, never a push, and the assistant never brings one up on its own; "anything coming up this week?" reads them.
- **In answers.** "When is Maya's birthday?" gets "Saturday, November 14." with its source; "how old is Grandpa?" uses a known year or says "Nothing in Helm says what year Grandpa was born."; "when did Grandpa move to Tucson?" answers from moments ("In the 1980s, from what you said on Nov 9."). A date with no year never gets an age.
- **No pronouns.** Copy names the person and never guesses a pronoun ("Grandpa · 3 years since passing", never "since he passed").
- **February 29.** A Feb 29 date that comes back shows on Feb 28 in years without one.
- **At 2,000 people and decades.** The design holds for about 2,000 who and 20,000 dates: a who page shows a few yearly dates and 3 moments, never the whole run; the moments page folds by decade; Coming up covers only dates that come back, a year ahead, grouped by month with its own cap per month; Today shows 3. No screen lists every date at once, and nothing slows as moments pile up.
- **Later.** Moments are what the life timeline and milestones for the person and their people will read (Next Steps); nothing in the MVP draws a timeline.

### Importing From Google Contacts, In Detail

- **Pick people, never all.** "Bring in from Google Contacts" on People (a thin row under the search) connects Google Contacts read only on that tap, or from the account's page in Connected apps, then shows a searchable picker of the person's contacts with nothing ticked. They tick the people they want (up to 50 at a time); "Bring in" brings in only those. People already brought in from that account sit at the end as "Already in People", and when everyone is in the picker says so instead of listing them.
- **What comes in.** Name, photo, phone number and email, as a Regular person, with "From Google Contacts" on their page. To draw the picker, Helm reads each contact's name, photo, email and phone from Google and keeps none of it; only the people ticked are saved. Birthdays and companies are not read yet (Issue 43 adds them as key dates). Notes, addresses and groups are never read, and nothing changes in Google Contacts (Helm's permission is read only).
- **Already in Helm.** A contact that matches someone already in People by email or phone, or by the same name when that person has no email or phone that disagrees and was not brought in from another contact, adds only what that person's page lacks and never overwrites. Two contacts with one name are two people, and a name that matches nobody sure makes someone new. The first account that shares contacts is the one the picker opens on.
- **A copy, then Helm's own.** Imported people are Helm's own records: editable, with their source kept. Helm doesn't keep them in step with Google in the MVP; "Bring in from Google Contacts" again brings in more, and "Update from Google" on an imported person refreshes details they haven't edited on a tap. Kept in step is Next Steps. Undo takes back the people who came in, and keeps (and says so) anyone you have since edited or used.
- **Several accounts.** The picker has an account switch when more than one Google account is connected. Apple contacts are later, as a site-wide choice.

### Preferences, Favorites and Who You Are, In Detail

The owner's words: "store user preferences for different topics (stores, brands, gas station) and favorites (favorite movies). Maybe this is fully accounted for under Facts?" It is: they are facts about the person themself, with a kind and a topic.

- **Three kinds of facts about you.** **Who you are** ("vegan", "lives in Seattle", "works in product design", "allergic to penicillin"); **preferences** by topic ("Groceries: Costco for bulk, Trader Joe's for the rest", "Gas: the Shell on Main", "Coffee: oat milk"); **favorites** ("Movies: Arrival, Spirited Away"). Each has its source and is said or inferred, like any fact.
- **How they get in.** Said outright ("I'm vegan", "my favorite movie is Arrival") they are confirmed. Inferred from what the person does or says ("you've mentioned Costco four times for bulk") they are shown as inferred until confirmed. A favorite can come from a connected app's category the person switched on (A-List's movies you rated).
- **Never inferred: the sensitive things.** Health, religion, politics, sexuality and similar are kept only when the person says them about themself, never inferred from anything.
- **Where they're used.** In answers and suggestions ("a vegan bakery near the venue" draws on "vegan"), cited like any fact. A preference never changes what Helm does on its own; it only informs.
- **Change and remove.** On "How [name] sees you", every one can be corrected, confirmed or removed, with Undo; a removed one is never brought back by an old turn.

### How [name] Sees You, In Detail

The owner's words: "Allow user to see how the assistant views them."

- **Where.** A view of its own, one tap from home and from Settings, titled "How [name] sees you".
- **What it shows, in sections, each shown once it has something:**
  - **Who you are**: identity facts, and your own key dates (Key Dates, In Detail).
  - **What you like**: preferences grouped by topic, then favorites.
  - **How you write**: the style notes (How You Write, In Detail).
  - **How you like answers**: the tone, "Short spoken answers", and the wake phrase setting, each a door to change it.
- **Every line is editable.** Each shows its source and whether it was said or inferred (the hollow ring), with Confirm, Correct and Remove; inferred lines lead each section. Remove means the assistant stops using it at once.
- **Ask about it.** On this view, "why do you think I like Costco?" is answered with the turns it came from.
- **Empty.** "As you talk to [name], what it learns about you shows here, for you to check."

### How You Write, In Detail

The owner's words: a way of "learning the user's write style, for different occasions, people, etc. It'll help when drafting stuff in the future." Drafting itself is Next Steps; the MVP learns and shows.

- **What it learns from.** What the person types in Helm (turns and notes they wrote), and, only if they switch it on, a sample of their sent Gmail. Spoken turns are not writing and are left out.
- **Sent mail, by choice.** On the Gmail connection, "Learn how I write from my sent mail" starts off and says what it means before it is on: "[name] reads up to 300 messages you sent in the last 6 months, keeps a few notes about how you write, and keeps none of the mail." Off again removes what came from it.
- **What it keeps.** A few plain notes, by occasion and by person, each with how many examples it rests on: "With vendors: short and polite, signs 'Thanks, Alex'", "With Mom: warm, longer, no sign-off", "At work: bullet points, no greeting". Never the messages themselves.
- **Visible and editable.** The notes show on "How [name] sees you", each editable or removable; a note the person wrote themself ("I never use exclamation marks") is kept as said.
- **Learning again.** The notes are refreshed at most once a week from new writing, and a refresh never overwrites one the person edited.

### Tasks, In Detail

A task is a one-off thing to do. A routine done again and again is a procedure (Procedures, In Detail).

- **What a task carries.** Title, project, importance and urgency (kept apart: something can matter without being due), deadline (a day, or a day and time), how long it takes, energy (low, medium, high), context (at home, out, at a computer, on the phone), a place, a who, what it waits on (another task or a person), notes, kept media, and steps. Only the title is needed.
- **Steps.** A task can have a few steps of its own ("Order flowers": pick the arrangement, confirm the count, pay the deposit), ticked as they go, shown as "2 of 3". Steps belong to that task only; when the same steps keep coming back, the assistant offers to make them a procedure.
- **Not yet.** A task can wait for a condition: "not until Apr 1", "after the venue is booked". Until then it stays out of Today and out of counts of what is open; a project shows such tasks folded under "Not yet (3)", and each appears on its own once its condition is met.
- **Waiting on someone.** "Waiting on Dana" shows on the task with "Dana got back to me", which clears it by hand. If a task it waits on is done or deleted, the wait ends by itself.
- **Repeating things.** Repeating tasks are not in the MVP. "Water the plants every Monday" makes one task for the next Monday and says "Repeating tasks aren't in Helm yet. Made one for Mon, Nov 9."
- **Done and gone.** Ticking a task done (or saying "done with the dentist") shows Undo on the line. A done task leaves the lists and stays findable in its project and in Search. "Clear done tasks" on a project's list removes done tasks from view in one action, with the count it cleared.
- **Overdue.** A task past its deadline says "Was due Thu, Nov 5" in the warning colour and leads its project's list; it is never moved or re-dated silently. Today offers it first.
- **Delete.** A task deletes from its page with a confirm and Undo; its plan slots go with it, and a past day still shows it as it was.

### Projects and Health, In Detail

- **Starting one.** By saying so ("start a project for the move") or from Projects' "New project": a name, an optional emoji, a one-sentence objective, an optional target date. Projects shows nothing until the first exists.
- **What a project holds.** An objective in a sentence, milestones with dates, its people in their roles (Key first, with photos), its tasks (overdue first, then by deadline, then undated, then "Not yet"), its facts, its procedures and their runs, and its kept media.
- **People in a project.** "Dana is key for the wedding" or "add Maya to the move" links them with a role (People, Pets and Organizations, In Detail); a who linked to a task in the project is added as Involved, with a line and Undo.
- **Health is evidence, not a score.** A project says what it can show: "2 overdue · Final guest list in 9 days · nothing done in 12 days". With nothing to say it reads "On track: nothing overdue". With every task done: "Everything is done. Finish this project?" It never shows a percentage, a progress bar or a colour grade. Only "overdue" takes the warning colour.
- **Finishing.** "Finish this project" moves it behind "Finished (3)". With open tasks, the confirm says so: "3 tasks are still open. They'll leave Today and your lists until you reopen Wedding." Reopening brings them back.
- **Deleting.** The confirm names what happens: "Delete Wedding? Its 14 tasks and 2 procedures stay, with no project; its people keep their pages." Undo follows.

### Memory and Sources, In Detail

- **What Helm remembers.** People, pets and organizations (People, Pets and Organizations, In Detail), places with their photos, facts ("Dana is the florist", "the venue holds 120", "Mom takes metoprolol 25 mg"), facts about the person themself (Preferences, Favorites and Who You Are, In Detail) and, in Knowledge, notes. Each has its own view one tap from home (People, Places, Knowledge), shown once its first item exists; "How [name] sees you" holds the facts about the person.
- **A fact or a note.** A fact is about the person's own life: someone, somewhere or something they are working on, or themself. A note is general knowledge they chose to keep, true for anyone. The assistant files "the venue's wifi password is…" as a fact about the venue and "remember that buttercream softens above 75°F" in a note; the result line says which, with Undo.
- **Every fact says where it came from.** The turn or file, the date, and whether it was said or inferred: "From what you told [name] on Nov 3 · You said this" vs "[name] inferred this from what you told it on Nov 3", or "From the letter you sent on Nov 9". An inferred fact looks different from a confirmed one everywhere it appears, including in answers and spoken ones ("I think, from what you said on Nov 3, …"), and becomes confirmed only on the person's tap or words.
- **Matching your own people and places.** A name links to an existing record only when there is exactly one sure match; otherwise the Inbox asks. A new person, place or project is written the way the person's others are.
- **A contradiction is a question.** When a new turn says something different from a fact (the follow-up moved from Mar 5 to Mar 12), both are kept with their sources and the Inbox asks which is true now. The old one stays as "Was Mar 5 until Nov 8", never deleted.
- **Correct, confirm, forget.** Correcting a fact makes it confirmed, with the correction as its source. Forgetting removes it from what the assistant uses, with Undo; an old turn never brings it back, though a new one that says it again makes it a new fact.

### Knowledge, In Detail

The owner's words: "a personal knowledge base of sorts"; then "I've been iterating on how I wash my car… I should be able to view it, ask questions regarding it, iterate, tell it feedback"; and in round 6c: "when I go to read about the topic, it should be this general document I can read that's formatted properly… see where the different parts came from… the history for the doc." Knowledge is that: what the person learns, kept as topics that are living documents, nested their way, and searched by the assistant as part of their records.

- **Two things in Knowledge.** A **topic** is a living document: one readable page the assistant writes and keeps up from everything filed under it. A **note** is one piece of knowledge (something said, a saved answer, a file, a line written by hand) that feeds one or more topics, or none. The person reads topics; notes are what they are made of. The view, the button and the empty states say Knowledge.
- **The car-care journey.** Over a few weeks the owner tells the assistant "I use two buckets now, one for rinsing", saves a general answer about ceramic coatings, sends a Markdown file of a detailer's checklist and says "the cedar air freshener lasts about a month". The first time, the assistant asks which topic ("Washing", new). Later lines go there on their own, each with Undo. When "Fragrance" appears beside "Washing", it proposes "Car care" above both. Opening Car care shows a short overview and links to Washing and Fragrance; Washing reads as a proper page with "Interior", "Exterior" and "Ceramic coat" sections. Tapping the ceramic-coat paragraph shows it came from the answer saved on Nov 5 and the file sent on Nov 7. "History" shows each change, and the latest one can be undone.
- **A topic reads as a document.** A title, an optional emoji, and a body with headings, lists, bold and links, written plainly in every tone. The assistant arranges what is filed into sections that make sense and keeps it current as more arrives. It quotes the person's own words as they said or wrote them.
- **Your words stay yours.** The assistant adds to a topic on its own when something plainly belongs there, as a new version with Undo. It never removes or rewrites the person's words (what they said, wrote or edited) unless asked, and never deletes a topic or a note on its own. It may rearrange its own wording around them (a heading, an order, a joining sentence), and says so in History.
- **Every part says where it came from, and when.** A faint mark beside each paragraph or list item; tapping it opens "Where this came from". "Show sources" at the top puts the date beside every part at once.
- **Topics nest, up to 3 levels.** Car care › Washing › Ceramic coat. A parent's document opens with a short overview the assistant writes of what its subtopics cover, then a link to each with its last change ("Washing · changed Nov 7"), then anything filed on the parent itself. A topic's page shows its path at the top ("Car care › Washing"). A fourth level is refused in words: "Topics go three levels deep. Put Coating brands under Ceramic coat?"
- **Grouping.** When two or more topics plainly belong together and no parent exists, the assistant proposes one; it never creates a parent without asking. Moving a topic under an existing parent that plainly fits happens on its own, with Undo. The person can move, rename or un-nest any topic by hand or by asking.
- **Loose notes.** Something that fits no topic and that the person chose "Leave it loose" for stays a loose note, listed under "Loose notes" in Knowledge, searchable and cited like the rest. Moving it into a topic later is one tap or one sentence.
- **One note, several topics.** A note can feed more than one topic (the round 3 answer stands); each topic's document cites it, and editing the note updates every topic that uses it, each as a new version.
- **Ways in:**
  - *Save a general answer.* "Save to my knowledge" under a "Not from your records" block.
  - *Tell the assistant.* "Remember that…" or "note: …", when it is general rather than about the person's own things.
  - *Send a Markdown file.* Filed into a topic, or as a loose note, when it is something to keep.
  - *Write by hand.* Knowledge → "New note", or "Write" inside a topic's document.
  - *Paste something long.* A paste too long for a turn offers "Save to my knowledge"; no AI reads it at save time.
  - *Make a topic from what you've said.* "Make a topic of everything I've told you about the car" drafts one from the person's turns, facts and kept files, listing what it used, with Undo.
- **Where it goes: asked once, then filed.** When nothing fits, which is always the case the first time, the assistant asks which topic, one question in the conversation (Questions, In Detail). Once a topic plainly fits, it files there itself and says so, with Undo and "Change topic". When it could fit two, it asks. This covers only knowledge the person chose to keep, in the ways above; facts the assistant notices about the person's own life follow Facts, not topics.
- **Word for word.**
  - First-time topic question: "Where should this go?" with up to 3 topics that might fit, then "New topic: Washing" (its suggested name, editable), then "Leave it loose". Spoken: "Where should this go? Car care, or a new topic called Washing?"
  - Auto-file line: "Added to Car care › Washing: two buckets, one for rinsing · Undo · Change topic". Spoken: "Added to Washing."
  - A general answer saved: "Saved to Car care › Washing · Undo · Change topic".
  - Grouping proposal: "Group Washing and Fragrance under Car care? · Group them · Not now". After it: "Grouped Washing and Fragrance under Car care · Undo". "Not now" stops it proposing that group again.
  - Moved under an existing parent: "Moved Fragrance under Car care · Undo".
  - "Where this came from" sheet: title "Where this came from"; one row per source, newest first, each one of:
    - "You said this · Nov 3, 8:14 PM", with the words quoted and "Open the conversation"
    - "You wrote this · Nov 7"
    - "Saved from a general answer · Nov 5 · Not checked", with "I checked this"
    - "From a file you sent · Nov 7 · detailer-checklist.md", with Open
    - "General knowledge, added when you asked · Nov 7", marked "Not from your records"
    - then a muted line, "Added Nov 5 · last changed Nov 7", and the sheet's two actions, "Correct this" and "Remove this part" (with Undo).
  - Bringing new notes in, at the top of a topic that has new notes: "Bringing in 2 new notes…" while the document underneath stays readable; past the day's limit "2 new notes will be added tomorrow · Read them now" (opens them as a list); on a failure "2 new notes aren't in the document yet · Try again".
  - History row: "Nov 7, 8:20 PM · Added 'Two buckets, one for rinsing' from what you said". The newest row carries "Undo"; older rows open that version with "Restore this version". Other rows read "You edited Exterior", "Revised when you asked: shortened Exterior", "Moved Fragrance under Car care", "Grouped under Car care", "Rearranged the sections".
- **Ask while you read.** With a topic open, the question is answered from that topic first (quoting the part), then the rest of the records, then general knowledge under "Not from your records", which can be added with "Add to this topic".
- **Tell it what to change.** "That step's wrong, I dry with a blower now", "make the exterior part shorter", "turn this into steps": the assistant revises the topic as asked, shows what changed (lines added and taken out), and keeps the earlier version. This is how the person's own words get changed: only when asked.
- **History.** Every change to a topic is a version: who or what made it, when, and what changed. An older version can be read and restored as a new version, never edited. The newest change can be undone from the History row or from its line in the conversation.
- **How sure.** A part that came from a general answer says "Not checked" until the person taps "I checked this" or edits it.
- **How the assistant uses Knowledge.** When answering, it looks through topics and notes with the rest of the person's records, before any general knowledge, and cites them with the book mark: "Your topic · Car care › Washing · Nov 7 version".
- **The same thing twice.** Something already in a topic word for word says "Already in Washing" with Open, and adds nothing. Two parts that disagree are both kept, each with its date, and the topic says so ("Two of your notes differ: 3 days or 5").
- **Edit and delete.** "Edit" on a topic edits its document by hand (what the person types is theirs). Deleting a topic has a confirm naming what happens: "Delete Washing? Its 6 notes stay, as loose notes or in their other topics. Its subtopic Ceramic coat moves up to Car care." with Undo. Deleting a note removes it from every topic that cites it, each as a new version.
- **Many.** Search from 8 topics or notes; copy a topic as Markdown on a tap. With hundreds of notes, the assistant reads the few that best match the question and says which it used.
- **Empty.** "What you learn and want to keep shows here, as topics you can read. Tell [name] to remember something, or write your own." with New note.

### Today, In Detail

Today is one view among the others, one tap from home, for when the person wants to see their day laid out. "What's on today?" asked anywhere answers in a sentence or two from the same plan.

- **Opens on today.** A summary line ("2 events · 1 planned · 2 suggested") and, only when there are any, "2 need you", a door to the Inbox. A day strip reaches yesterday and the next 6 days.
- **Calendar is the truth for fixed things.** Events from the calendars the person chose appear as they are and can't be moved from Helm. A gap of 45 minutes or more shows as "Free · 1h 30m".
- **Connected apps add their fixed things.** A planned showing from A-List, a flight or a timed activity from Waypoint, a vet visit from Nine Lives or a pickup from Going Once shows among the events with its app's logo and counts as busy. The same thing on Google Calendar and in an app (titles that match, starting within 15 minutes of each other) shows once, with both sources. Due dates from an app list under "Due soon" with their app, never as Helm tasks and never planned into a gap. Pinch's planned meals show as one quiet line per meal slot, not as busy time.
- **Helm's plan is a suggestion.** The first time Today opens (or is asked about) on a day with no plan, Helm's own code (not the AI) suggests a few tasks for gaps that fit their length, energy and context: overdue first, then due soon, then what matters most. It leaves 15 minutes around events, fills at most about half the free time, and never plans before the day's start or after its end (8 AM to 9 PM unless the person changes "Your day"). A task with no length is planned at 30 minutes and says it's a guess.
- **Keep, move or skip.** A suggested task is dashed until kept. Keep makes it planned; "Another time" offers slots today and tomorrow; "Not today" puts it back in "Any time" with Undo. Planning again never touches what was kept or skipped. "Keep the first one" or "move the dentist to tomorrow" works by voice on this view. Other days show their events, deadlines and anything kept, with "Plan this day".
- **Key dates this week.** Under the summary, at most 3 quiet lines for birthdays, anniversaries and other dates that come back in the next 7 days, close people first, then regular, soonest first; then "+2 more this week", opening Coming up (Key Dates, In Detail). Moments never show here. Never spoken unless asked.
- **Procedures for the day.** An event or trip today with a procedure attached shows its run ("Before Mom's appointment · 2 of 6").
- **Places without tracking.** Tasks for a place group under it ("When you get home"); Helm never reads location. "I'm home", said or tapped, brings those tasks up for 3 hours.
- **Rest days stay rest days.** No suggestions on a day when an event that started the day before ended after 2:00 AM: "Nothing planned after a late night. Tell [name] if you want something today." (the line names the day it is on: "…something tomorrow", "…something Thursday"). An event that runs past noon on the day (a conference, a week away) is not a night out. A calendar marked as shifts is more exact: nothing timed is suggested on a shift day, and nothing at all on the day a night shift ends ("Nothing planned after a night shift."). "Plan my day anyway" is always one tap away.
- **A full day.** "Your calendar is full today. Nothing planned." Due tasks still list below.
- **Late in the day.** Opened after the day's end, Today suggests nothing more and says "Nothing more planned today." Tomorrow is one tap away.
- **When the calendar changes.** A kept task that a moved or new event now overlaps says "Now overlaps Brunch with Maya's parents" with Another time; it is never moved silently.
- **Without a calendar.** Today lists "Due soon" and "Worth doing today", with no times, and one quiet row to connect a calendar; "Not now" folds it into Settings for good.
- **When the calendar can't be read.** "Couldn't load your calendar." with Try again; Helm suggests nothing timed until it loads and shows the untimed lists instead. Offline: kept tasks show and "Your calendar shows once you're back online." If Google stopped sharing: "Google stopped sharing your calendar with Helm." with Reconnect.
- **Travel.** When the device's time zone differs from Helm's: "Your phone is on Pacific time; Helm plans in Eastern." with Switch. An event set in another zone shows in the person's time, with its zone flagged.
- **Past days are for looking up.** Yesterday keeps its plan and its events as they were (titles and times only), with what got done ticked. Nothing on it is editable, and unfinished tasks are offered with "Bring to today", never moved silently.

### Google Calendar, In Detail

Google Calendar is one connection among the others (Connected Apps, In Detail), and the one Today offers on its own.

- **Optional, on a tap.** "Connect Google Calendar to plan around your events" is offered on Today, with the reason beside it, never on load. Helm works fully without it.
- **Read only.** Helm asks Google to read events only, and reads only each event's title, time and calendar: never its description, guests or location. It never creates, changes or deletes an event in the MVP.
- **While Helm is in testing.** Until Google reviews Helm, Google shows a warning that the app isn't verified, and may ask to reconnect about once a week. The Connect screen says so in one line before the person leaves for Google, so the warning isn't a surprise.
- **Coming back from Google.** Declined: back on Today, nothing changed. Signed in but the calendar permission unticked: "Helm needs permission to see your events to plan around them. Nothing was connected." with Try again.
- **The real calendar is many calendars.** After connecting, the person picks which ones count as busy; holidays and subscriptions start off. One tap marks a calendar as shifts. An event on two calendars counts once; declined events are ignored; tentative ones count as busy and say so; all-day events show at the top and block nothing unless the person says they do (a day off, a trip). A calendar added in Google later appears in Settings, off; one deleted in Google drops out quietly.
- **Disconnect.** From its row in Connected apps; Today drops back to the no-calendar version and nothing else changes (Disconnect and Delete, In Detail).

### Connected Apps, In Detail

The owner's words: a pipeline for apps to read data from one another, with Helm as the first reader. In Helm it is one idea: the assistant can read the places your life already runs in, says where everything it read came from, and changes nothing there.

- **What the person can do.** Connect Google Calendar, Gmail and Drive (on more than one Google account) and any of the site's apps, and pick people from Google Contacts (Importing From Google Contacts, In Detail); choose, for each, which of the few things it offers Helm may read; see when each last synced and anything wrong; disconnect, with or without deleting what Helm copied.
- **Two ways of reading.** A site app and Google Calendar are *kept in step*: what they share is copied into Helm, sealed like the rest of the person's things, so Today can plan around it, Search can find it and the assistant can link it to a project. Gmail, Drive and Runway's Transactions are *read when asked*: nothing is copied; they are searched only to answer a question, and only the lines an answer quotes are kept, with the answer.
- **The Connected apps workspace.** Settings → Connected apps. Connected first, then what can be connected: the three Google services, then the site's apps the person uses; apps they have never opened fold under "More apps". Each connection is one row (logo, name, account where there is one, status), and opens its own page with:
  - **Account**: "personal@gmail.com", or "Your moondreams account" for a site app.
  - **Status**, one of: "Connected · synced 7:40 AM" (or "Read when you ask" for Gmail and Drive); "Couldn't sync since Nov 6" with the cause in a sentence and Try again; "Google stopped sharing with Helm" with Reconnect; "Not available yet" (Gmail and Drive for anyone but the owner, Privacy, In Detail).
  - **What Helm may read**: one switch per category the source offers, with a line saying what it holds ("Planned showings: the movie, time and theater"), and below them, in muted text, "Never shared: what you paid, your membership" so the person knows the edges.
  - **Last successful sync** and, when there are any, the errors since, newest first, each in a sentence.
  - **Disconnect**.
- **Read only, in words.** Every connection's page says "Helm can read this. It can't change anything in Pinch." A capture that asks for a change elsewhere ("add milk to my Pinch list") is never reported as done there: "Helm can't change Pinch yet. Made a task: Add milk to the Pinch shopping list." with "Open Pinch". No result line, answer or button ever says "Added to", "Updated in" or "Sent" about another app or service.
- **Group apps share only what is yours to see.** Waypoint, Going Once and Nine Lives hold other people's things too. A source shares only what the person can already see in it, and only their own plans and to-dos, never another member's private items, contact details or messages.
- **The site lists every grant too.** A grant is the person's, between two apps, so the site's account page has its own "Connected apps" index: every reader, what it reads from each source, and a door to change it. Helm's own page shows and edits only Helm's grants. A "Stop sharing" list inside each source app is Next Steps.
- **Helm shares nothing.** In the MVP Helm is only a reader; no other app can read Helm.
- **Offered, never pushed.** Today's "Connect Google Calendar" row and People's "Add from Google Contacts" are the only places a connection is offered outside Settings. Nothing asks to connect apps at first run, and the carer never sees a list of apps.

### What Each Source Shares, In Detail

Each source shares as little as serves the people above. **On** is what a new connection reads until the person switches it off; **Off** is offered but waits for the person; **Never** is not offered at all. The kind in brackets is the shared shape Helm stores it as.

| Source | What it gives Helm | On when connected | Off until switched on | Never |
|---|---|---|---|---|
| A-List | Movie nights you planned, so Today plans around them | Planned showings (event: movie, time, theater); saved theaters (place) | Movies you've seen, with your rating (knowledge) | What you paid, savings, membership, share links |
| Going Once | Pickups you're meeting, and where each sale stands | Pickups set (event: the thing and the day); your sales (project: name and how many are available, pending, sold) | | Buyers' names, contacts and messages; floor prices; private notes; prices paid |
| Nine Lives | What's coming up for your cats | Your cats (pet: name); vet visits coming up (event: cat, clinic, time); vaccination and preventive due dates (task: cat, what, when); clinics (place: name, phone, address) | Conditions and symptoms per cat (knowledge) | Uploaded records and documents, expenses, weights, litter logs |
| Pinch | What you're eating and what you need to buy | Planned meals (event: meal, day, slot); the shopping list's unticked items (task) | Food near its date in the fridge, freezer or pantry (task) | Recipes' text, prices and costs, nutrition, cooking history |
| Runway | Whether money is fine for what you're planning, and, if you choose, what you spent | Money summary (money summary: Free to Spend now, the next income day and what is due before it, as one total) | Bills coming up (task: name, amount, due day); Horizon events (project: name, target, set aside so far); Transactions (date, where, amount, envelope), read when a question needs them and never kept | Accounts and balances, cards, income sources, receipts, bank sign-ins |
| Waypoint | Your trips, their plans, and what's yours to do | Trips you're in (trip: name, dates, places); the timeline's activities, flights, drives, stays and rentals (event and place, in the trip's time zone); Before the Road tasks assigned to you or private to you (task) | What you owe and are owed per trip (money summary) | Other members' private tasks, contact details and suggestions; expense lines; receipts; the album |
| Worth the Wait | Counts only, by design | | Box counts (each box's name and emoji, how many items it holds, how many are revealed and how many not yet), counted without reading any item | Any item's words, revealed or not, yours or theirs; who wrote what; invite codes |
| Google Calendar | Fixed events Today plans around | Events from the calendars you pick (event: title, time, calendar) | | Descriptions, guests, locations, attachments |
| Gmail | Mail found and read when a question needs it | Read when asked: search, then a message's sender, date, subject and text | Sent mail, to learn how you write (up to 300 messages from the last 6 months; only style notes kept) | Attachments; sending, labelling, archiving or deleting |
| Google Contacts | The people you pick, brought in once | Read on a pick: the picked contacts' name, photo, phones, emails, birthday and company (who) | | Contacts you didn't pick; notes, addresses, groups; editing anything |
| Drive | Documents found and read when a question needs it | Read when asked: search by name and text, then the text of a Doc or PDF | | Other file types' contents; editing, moving, sharing |

A source that adds something later adds it **Off**, and the connection's page says "New: [category]" once.

### Where a Synced Thing Shows Its Source, In Detail

- **Every copied thing names where it came from.** One line, everywhere it shows (Today, Search, an answer's source, a project): the source's logo and name, the account when the provider has several ("Google Calendar · work"), and when Helm last saw it ("synced 7:40 AM"). Its sheet adds "Open in Waypoint" (or the Google service) and "Read only: change it in Waypoint."
- **Freshness is stated, never implied.** Something older than its source's usual sync says so in the warning colour: "As of Nov 6 · couldn't reach Pinch since". Today never plans around an event it hasn't seen in the last day without saying "may be out of date".
- **A copy is never edited in Helm.** It has no Edit and no Undo; the assistant can link it to a project or make a Helm task about it ("Bring the vaccination card to Miso's visit"), and that task is Helm's own, with the copy as its source.
- **Gone at the source, gone in Helm.** Something deleted or past in its app drops out of Helm at the next sync, quietly, like a calendar event; a Helm task or procedure run linked to it stays and says "From Miso's visit, Nov 12, no longer in Nine Lives".

### When Sources Disagree, In Detail

- **One source is the authority for each thing.** The calendar is the authority for an event's time; the app that holds something (Waypoint for a trip's times, Nine Lives for a due date) is the authority for it; what the person told Helm is the authority for Helm's own facts. Mail and documents are never the authority over a calendar or an app.
- **Two outside sources: shown, not asked.** When an email says the tasting is at 2:30 and the calendar says 3:00, the event shows the calendar's time and one line under it: "An email from Sweet Layer Bakery on Nov 2 says 2:30 PM." with Open. Helm plans with the authority's time and changes neither; there is no Inbox question, since nothing in Helm can settle it.
- **Found while answering: noted once.** When a mail or Drive search for a question turns up the disagreement, the answer writes it on the event as one noted fact, with Undo: "Noted the 2:30 PM on Cake tasting." It is the only thing an answer ever writes, and it never changes the event's time.
- **An outside source and a Helm fact: asked.** When a connected app contradicts a fact in Memory (a fact says the follow-up is Mar 5, Nine Lives says Mar 12), it is the usual "Which is true now?" question in Needs you, both with their sources. Picking the app's value changes Helm's fact only, never the app.
- **The same thing twice.** One event on Google Calendar and in A-List or Waypoint (titles that match, starting within 15 minutes of each other) shows once with both sources; if their times differ, the calendar's shows and the line says what the app says.

### Several Accounts, In Detail

- **A provider can be connected more than once.** "Add another Google account" on the workspace connects a second account (work beside personal). Each account is its own connection with its own email, status and switches, and each Google service on it is connected on its own tap: connecting Gmail on the work account asks Google only for mail, not for the calendar.
- **Accounts are named by their email,** and the person can give one a short label ("work"), which is what source lines show.
- **Site apps have one account:** the person's moondreams account, the same sign-in as Helm's, so a site app connects with a switch and no trip to another site.
- **Calendars from two accounts are one day.** Today merges them; an event on both counts once; a shifts calendar can be on either.

### Disconnect and Delete, In Detail

- **Disconnect stops reading at once.** The confirm names the connection and what Helm holds from it: "Disconnect Pinch? Helm stops reading it now. Your meals and list stay in Pinch." with one choice, ticked: "Also delete what Helm copied from Pinch (12 planned meals, 9 shopping items)". The grant ends with it: Helm asks the provider to forget it and keeps nothing that could read again.
- **Ticked (the default):** every copy is deleted at once, and answers that quoted the source keep their own words but have the quoted lines replaced by "Quoted from Pinch, deleted Nov 9". For Gmail and Drive, which copy nothing, this is the only thing deleting does.
- **Unticked:** the copies stay, marked "From Pinch · no longer updated", are searchable and can be cited (with that line), but Today no longer plans around them. They are deleted 90 days after the disconnect, and the connection's row says so ("Deletes Feb 7 · Delete now").
- **What Helm made stays.** Tasks, procedure runs, facts and past days' plans the person or the assistant made are Helm's own: they stay, with their source written as text ("From Miso's visit in Nine Lives, Nov 12").
- **Reconnecting starts fresh,** with each category back at its default, and reads again from the source.
- **Stopping from the site's account page** (its Connected apps index) is the same as disconnecting with the box ticked; a Stop sharing list inside each source app comes later and will work the same way.

### What Is On at First, In Detail

- **Nothing is connected until the person connects it.** Sharing between apps starts off, as anything that shares does.
- **What starts on: names and dates to plan with.** Plannable things (what, when, where) are on; money detail, health notes and other people's names start off on every source.
- **Connecting turns on the source's "On" categories** (the table above) and nothing else. Each is one switch off; the page says so before the first sync: "Helm will read your planned meals and shopping list. Switch off either one."
- **Google Calendar** keeps its own first step: which calendars count, with holidays and subscriptions off.
- **Gmail and Drive** are read only when a question needs them, from the moment they are connected; each answer says when they were searched. Gmail's sent-mail style switch starts off (How You Write, In Detail).
- **Google Contacts** reads nothing until the person ticks people in its picker, and only those.
- **Worth the Wait** connects with nothing on; its one category, Box counts, says what it holds before it is switched on: "Helm will see your boxes and how many things are in each, and how many are revealed. It never sees what anyone wrote."
- **Runway's Transactions** starts off; its switch says what turning it on means: "Lets Helm answer questions like 'what did I spend at Costco?'. Helm reads each purchase's date, place, amount and envelope when a question needs them, and keeps none of them."

### Keeping and Deleting, In Detail

The owner's blueprint stopped at "distinguish live data"; this is how long Helm keeps each kind of thing it reads.

| What | How long | Deleting it |
|---|---|---|
| A copy from a site app or Google Calendar | While connected: what is current or coming up, and the last 30 days; older drops out at the next sync | Disconnect with the box ticked, Delete all my Helm data, or deleting it in its app |
| A copy after a disconnect, box unticked | 90 days, then deleted | "Delete now" on the connection's row |
| Mail, Drive and Runway transactions read to answer | Only while answering; never stored | Nothing to delete, beyond quotes |
| Lines an answer quoted | With the answer in Activity, sealed | Replaced when the source's copies are deleted; gone with Delete all |
| A past day's events (title and time) | With that day's plan, as today | With Delete all |
| A connection's grant | Until disconnect or Delete all; held on Helm's server only | Ends at once, and the provider is asked to forget it |
| Records Helm made from a copy | Helm's own, kept like any record | Deleted like any record |
| People picked from Google Contacts | Helm's own records, with their source | Deleted like any person |
| Sent mail read to learn how you write | Only while reading; the style notes are kept | Turning the switch off removes the notes it made |
| What you said aloud | The words, sealed, as the turn's source; the sound never | With the turn's records, or Delete all |
| A file you sent | Kept files: on their record, sealed, until removed; let-go files: only while reading | Remove on the record, or Delete all |

Copies, quotes and errors never hold more than the table above says, and nothing read from a connection is written to logs.

### One Pipeline for the Whole Site

Connected apps are a site standard, not a Helm feature. Each of the site's apps publishes what it shares through one contract (its kinds of thing, its categories, its "never"), and a reader goes through that contract, never into another app's data. Helm is the first reader; any app can become one later through the same grants, and an app that one day moves to its own domain keeps sharing through its contract unchanged. A new app joins by declaring what it shares, with its "On" set as small as the table above.

### Procedures, In Detail

The owner's words: lists "are more like procedures: reusable routines (what I pack before a trip; at work, the checklist for starting a new initiative)". A procedure replaces round 5's checklist: a routine kept once and run each time. A one-off list is a task's steps.

- **What a procedure is.** A title, steps, optional groups the person names ("Toiletries", "Electronics"), an optional intro line, its versions, and what it is usually run for (trips, a kind of event, a project). Procedures has its own view, one tap from home.
- **Where they come from.** Asked for ("make a packing procedure for trips"), drafted by the assistant from what the person has said and their notes (listing what it used), made from a task's steps that keep coming back ("You've had these steps on 3 tasks. Make them a procedure?"), written by hand, or sent as a Markdown file.
- **A run.** "Start a run" (or "let's pack for Austin") makes a fresh copy of the steps, attached to what it is for: a trip (from Waypoint or a Helm project), a calendar event, a project, or nothing. A run is ticked step by step ("4 of 12") on its own; the procedure is untouched. A run can be started by voice and ticked by voice ("done with chargers"), each tick spoken back. An event or trip with a run shows it, and so does Today on that day.
- **Offered, never pushed.** For an event or trip that matches what a procedure is usually run for ("Flight to Austin" and "Packing for a trip"), the event shows "Run Packing for a trip?" dashed until started, when the person opens it; "Not now" stops it for that event.
- **A run can differ.** Adding or skipping a step in a run changes that run only; adding one asks once, on the run: "Add 'Charger for the camera' to Packing for a trip for next time?" Yes makes a new version of the procedure.
- **Revised like a note.** By hand, or by asking ("add a step about the passport", "split this into before and on the day"), with what changed shown and Undo. Editing steps or groups makes a new version; a tick never does. Older versions can be read and restored as a new version. A run keeps the steps it started with.
- **Runs are kept.** A procedure lists its past runs (date, what it was for, "11 of 12"); a past run is for looking up and can't be ticked again. "Run it again" starts a new one.
- **When what it's attached to goes.** A run on an event no longer on the calendar stays, saying "From Cake tasting, Nov 8, no longer on your calendar".
- **Copy as Markdown.** A procedure, or a run with ticks as `[x]`; the toast says "Copied 12 steps, with ticks". Google Docs export is Next Steps.
- **Round 5's checklists.** Nothing was built, so there is nothing to move; "checklist" is not used in copy. Other documents (briefings, research, drafts) are Next Steps.

### Search and Activity, In Detail

- **Search** is one view, one tap from home, over tasks (open and done), projects, people, pets, organizations (Passing ones included), places, facts, preferences, notes (titles and text), procedures and what connected apps have shared, grouped by kind with counts. Mail and Drive are not in Search; ask the assistant instead. An inferred fact shows its hollow ring; a note shows the book mark and its topics. Nothing found says what was searched: "No tasks, people, notes or procedures match 'centrepiece'." Asking the assistant "find…" opens Search with the words in it.
- **Activity** lists every turn and every change the assistant made, and every Undo, newest first, under day headings: what was said (as words), what the assistant answered, what it did, and which files it kept or let go. A row opens a small sheet with its Undo, or says why there isn't one ("Already taken back on Nov 8").

### Settings, In Detail

One page of rows, each a door: **Your assistant** (name, tone, "Hey [name]"), **Voice** (Hear me offline, the site's natural voice, what the voice service hears), **How [name] sees you**, **Your day** (start, end, time zone), **Connected apps** (each connection, what it may read, its status, Google Calendar's calendars and shifts, Google Contacts, the sent-mail switch on Gmail, disconnect), **Trust this browser**, **Activity**, **What the AI sees**, and **Delete all my Helm data**. Nothing here is needed before the first turn.

### Trusted Browsers, In Detail

Helm follows the site's Trust this browser standard (Runway's is the reference) as it is, with the same words. It says browser, never device: the key is kept in this browser's storage, and two browsers on one phone are two trusted browsers.

- **The default: not trusted.** In every browser, Helm's key arrives when Helm opens with a connection and is held only while it is open. Opened with no connection, Helm can't show the person's things ("Your things unlock with a connection, so they can't open while you're offline. Nothing has been changed or lost.") but still takes a capture.
- **Trust this browser.** One switch in Settings, off by default, and not shown in a browser that can't keep the key safely. Its line says what it does and who else could open Helm: "Open Helm in this browser without a connection. Anyone using it could open your data, so leave it off on a shared device." Turned on: "Helm opens in this browser without a connection. Signing out turns this off." There is no sign-in step before it and no limit on how many browsers.
- **What it does.** Helm still asks its server for the key first and uses the kept copy only when the server can't be reached, so it opens offline what this browser already holds, marked with when it was last brought up to date ("As of 7:40 AM"). Captures still wait for a connection to be sorted, and questions to be answered.
- **Where it is offered.** Never on load and never at first run: the switch in Settings, and the offline screen's last line, "Once you're back online, turn on Trust this browser in Settings so it opens offline next time."
- **Other trusted browsers.** Under the switch, each other trusted browser is one row, named by its browser and system ("Chrome on Android", "Chrome on Linux ×2" when two are alike), with "Trusted Nov 8, last opened today", and its trash as its one door; "Remove all" removes every one. The list's line: "These can open Helm without a connection. One you remove stops opening it the next time it's online." Removing one says "Helm stops opening in Chrome on Android the next time it's online, or on its own after 30 days offline."
- **Offline for 30 days.** A kept key that the server hasn't confirmed for 30 days is dropped, so a lost phone that never goes online again stops opening Helm on its own. Connecting once starts the 30 days again; nothing is lost.
- **The key is removed whenever Helm could be at risk:** the switch going off, signing out or a sign-in ending on its own, Delete all my Helm data, and the server refusing the key.
- **A lost or stolen phone.** Remove its browser from any other trusted browser, or use the site's Sign out everywhere, which signs the person out of every app on the site on every device, this one included, and says so before it does. Neither has an Undo. What the phone already holds can still be read by someone who can unlock it until it goes online or for up to 30 days; Helm does not change the person's key in the MVP.
- **Captures in a browser that isn't trusted.** A capture made before the key arrives is kept encrypted in this browser, sealed so that only Helm's server can open it, until it can be sent, and is cleared on sign-out. In a trusted browser it is encrypted with the person's own key from the start.

### Change It or Look It Up, In Detail

| Record | Change or look up | What changing an old one does |
|---|---|---|
| A task, done or open | Change: reopen, edit, delete | Nothing else moves; a past day's plan still shows it as it was |
| A person, pet or organization | Change: details, level, photo, roles, forget | A new level or role shows at once; answers already given keep their words |
| A fact in Memory, or a fact about you | Change: correct, confirm, forget | The old value is kept with its dates; the assistant uses the new one from now on |
| A style note (how you write) | Change: edit, remove | The next refresh never overwrites an edited one |
| A topic's document | Change: edit, ask for a revision, move, rename, delete | A new version; older ones look-up only, restorable as new; answers keep the words they quoted |
| A topic's older version | Look up, restore as new | The current version changes; history keeps both |
| A note | Change: edit, move to a topic, mark checked, delete | Every topic that cites it gets a new version |
| A procedure | Change: edit, ask for a revision | A new version; runs already started keep the steps they began with |
| A run of a procedure | Change while open: tick, add or skip a step; a past run is look-up only | Changes that run only, unless the person adds a step for next time |
| A kept file (photo, PDF, recording, Markdown) | Change: remove; look up on its record | Facts made from it keep their source line |
| A turn (spoken, typed or a file) | Look up, in Activity | Undo its results instead; the words are never edited after the fact |
| A general answer | Look up, in Activity; save to my knowledge | Can't be changed; once saved, the note is changed, never the answer |
| A trusted browser | Change: turn off here, remove another, or sign out everywhere | Takes effect in that browser the next time it is online, or once it has been offline for 30 days |
| A past day's plan | Look up | Can't be changed, and its events stay as they were then |
| Activity | Look up | Can't be changed; Undo adds a line, never removes one |
| A calendar event | Look up (read from Google) | Changed only in Google Calendar |
| A person imported from Google Contacts | Change, like any person; "Update from Google" | Helm's copy changes; Google Contacts never does |
| A thing copied from a site app | Look up; open it in its app | Changed only in its app; Helm shows the change at the next sync |
| A message or file read to answer | Look up, in the answer that quoted it | Changed only in Gmail or Drive; the answer keeps the words it quoted |
| A connection | Change: what it may read, disconnect, delete what it copied | Switching a category off removes its copies at once; past days' plans keep their events as they were |

Helm has no totals the person checks, so no old edit can quietly move a figure; a project's health simply reflects its tasks as they are now.

### Privacy, In Detail

- **One person, one Helm.** Nothing is shared between accounts, and there is no way to invite anyone.
- **Encrypted from day one.** What the person tells Helm, and everything made from it (the words of every turn, task titles and notes, project names, people, pets and organizations with their details, places, facts, preferences and identity facts, style notes, notes, topic names, procedures and runs, answers, Activity lines, a past day's event titles, every kept file and photo, everything copied from a connected app and every line an answer quoted), is stored encrypted with a key Helm's server holds. Dates, statuses, kinds and levels stay readable so Helm can sort and filter; on their own they identify nothing.
- **What that means on the device.** Unless the person trusts the browser, Helm needs a connection once per visit to open their things; with no connection it says "Your things unlock with a connection, so they can't open while you're offline." and still takes a new turn, typed or spoken, kept encrypted in this browser (Trusted Browsers, In Detail).
- **What the voice service hears.** Only what is said after a tap or the wake phrase, while a conversation is open, goes to Helm's voice service to be turned into words, and the assistant's replies come back from it as speech. Listening for "Hey [name]" uses the offline voice model on the phone once downloaded (nothing leaves the phone), or the browser's own recognition until then (in Chrome, Google's speech service), and sends nothing to Helm's voice service. Offline voice listens entirely on the phone. The sound of the person's voice is never stored (a voice note they choose to keep is the exception). The voice provider sees the words being spoken, never a record, a grant or a key. "What the voice service hears" in Settings names the provider and what its terms promise.
- **What the AI sees.** The assistant runs on Helm's server. For each turn the server opens only what is needed (the records on screen, the people, projects and open tasks that might match, today's and tomorrow's events, the facts about the person that bear on it, the few matching notes and copied things, and any file sent), sends them with the words to Claude through Anthropic's API (a lighter model for quick turns, a Sonnet-class one for the rest), checks what comes back and saves it encrypted. The model reaches the person's things only through Helm's own tools; it never sees a grant or a password. Planning a day is Helm's own code. The first turn says it in one line ("[name] uses AI services to hear and read what you say.") and "What the AI sees" in Settings says it in full, naming each provider.
- **Faces are never recognized.** No photo is used to work out who someone is.
- **Each provider's terms are checked before it ships.** Before Helm uses an AI or voice provider or reads a service, its current terms are read for whether it trains on or keeps what Helm sends, and for how long. Settings states only what those terms promise, in their own limits, and is checked again whenever a provider changes.
- **Connections are locked down.** What each provider grants is kept sealed on Helm's server only, never sent to the device or the model, asks for the smallest permission that works (read only, one service at a time; Google Contacts only when "Add from Google Contacts" is tapped), and ends when the person disconnects or deletes their data.
- **Gmail and Drive while Helm is in testing.** Google lets an unreviewed app read mail and Drive only for people its owner lists as testers, up to 100, and asks them to reconnect about once a week. Until Google's security review of Helm (repeated every year) passes, only the owner can connect them; anyone else sees "Not available yet: Google hasn't reviewed Helm for mail and Drive." The sent-mail style switch lives on the Gmail connection, so the same limit applies.
- **Nothing leaves Helm** except what the person copies on their own tap.
- **Delete everything.** One action in Settings deletes all of a person's Helm data, every kept file and photo, everything copied from connected apps and every connection, each grant withdrawn at its provider. The confirm names what goes ("214 tasks, 31 people and pets, 41 facts, 18 photos and files, 3 procedures, and 5 connections with what they shared") and that it can't be undone.

### When Things Go Wrong, In Detail

The edge states not already covered above, each worded (and, in a spoken conversation, said) so the person knows what happened and what still works:

- **The key can't be fetched.** "Helm can't open your things right now." with Try again; talking and typing still work and keep what is said. Nothing is ever replaced or reset to get past it.
- **One record won't open.** It stays in its list as "Couldn't open this", never dropped and never shown as empty.
- **The cloud voice drops mid-reply.** The rest is said in the phone's own voice and shown in full; nothing is repeated from the start.
- **Recognition hears nothing useful.** "Sorry, I didn't catch that." once, then listening ends; nothing is filed.
- **Noise wakes it.** A wake phrase heard by mistake opens a conversation that ends on its own after 8 seconds of nothing said; nothing is filed from silence.
- **Two places at once.** The conversation is open on one screen at a time; tapping to talk in a second tab ends listening in the first.
- **Answered somewhere else.** A question already answered on another device closes with "Already answered on another device."
- **Answering an Inbox question needs a connection.** Offline, a Needs you question says "Answering needs a connection." and keeps waiting; nothing is answered on a guess.
- **A different account on this device.** Turns waiting on the device belong to the account that made them and are sent only when that account is signed in again.
- **Two tabs or two devices at once.** A turn is read once; the second tab shows the same result. An edit on one device appears on the other; an Undo there respects it.
- **A rename made offline.** The new name shows on this device at once and everywhere else once it syncs; nothing already said is rewritten.
- **Delete all my Helm data, with a trusted browser elsewhere.** Every trust ends; another trusted browser loses its key the next time it is online.
- **The AI answers with something Helm can't use.** A reply that doesn't fit what Helm allows is dropped as a whole and the turn is read again, then reported as in Capture, In Detail; nothing half-applied is ever shown or said.

## What Makes It Helm

These change what gets built, compared with a to-do app, a voice assistant or a chat assistant:

- **A whole life, not a schedule.** People with how much they matter, pets, places, preferences, routines and knowledge sit beside tasks; the calendar is one view, and orders and other sources join later as connected categories.
- **You talk, it keeps.** A voice conversation is the way in, and what is said becomes records with sources, shown with Undo, instead of a chat that scrolls away.
- **It knows what you're looking at.** The assistant is on every screen and acts on the thing in view.
- **Sources over answers.** Every fact, note and answer points to where it came from, inferred is never dressed as confirmed, and general knowledge is never dressed as the person's own records.
- **You can see how it sees you.** What it believes about the person, their tastes and their writing is on one page, and every line can be fixed or removed.
- **Knowledge you can read, and the person's words stay theirs.** What the person learns becomes topics that read as documents, nested their way, each part traceable to where it came from; the assistant adds when something plainly belongs, as a new version with Undo, and changes or removes the person's words only when asked. Nothing is lost to an old chat.
- **Reads everywhere, changes only itself.** The assistant sees the calendar, mail, documents and the site's other apps, says which one each thing came from, and changes nothing outside Helm.
- **Acts inside, asks outside.** Autonomy is set by where an action lands, not by how confident the AI sounds.
- **No made-up numbers.** No completion percentages, productivity scores or streaks.
- **Quiet.** No pushes, nothing spoken first, short answers.

## How It Feels

- **Composed.** Helm carries itself like an experienced butler for a family with lineage: discreet, unhurried, sure of itself. The look and the voice follow: cool, deep colours, generous space, a warm voice at a natural pace, nothing loud.
- **Easy to talk to.** One tap on Talk, from any screen; interrupt it like a person; it answers in a sentence and keeps listening for the reply.
- **Brief.** It says the least that answers, and shows the rest.
- **Honest.** It says what it did, what it kept, what it guessed, what failed, what it can't know, and when an answer comes from general knowledge rather than from you.
- **Roomy.** A plan with space in it; a rest day stays a rest day.
- **Forgiving.** Every change the assistant makes has an Undo, and nothing said is lost.
- **Yours.** Private to one person and encrypted; nothing leaves Helm. The assistant answers to the name and tone the person picks.
- **Phone first.** Talking is one tap from anywhere, and every screen is built for a thumb.
- **Useful before it is set up.** The first sentence works with nothing set up, nothing connected and nothing named.

## The Build Plan

Each MVP line names its person: **O** the owner, **N** the nurse, **C** the parent's carer. Stretch Goals are the "Beyond" tier in `ISSUES.md`. The voice conversation and the records come first; connected apps land as before (the shared platform with Pinch and Google Calendar first, then each other app, then Gmail and Drive).

### Core MVP

- [ ] Home is a conversation, with the voice dock (Browse · Talk · Type): brief answers in a natural voice, then listening for the reply; every view one tap away through Browse, with no tab bar and no dock off home (O, N, C)
- [ ] The voice: cloud listening and speech online, the phone's own past the day's allowance, barge-in, spoken replies only to spoken turns, "Got it" at once, "undo that" (O, N, C) (issue 12 built the phone's own voice: Talk, the "Got it" line for a spoken turn, "undo that" and Mute; the cloud voice, barge-in and the wake phrase follow; issue 13 built the voice benchmark, and the default cloud voice is the owner's pick; issue 14 built cloud listening online with the day's allowance and the site's cap, falling back to the phone's listening, and the voice mode in Settings; issue 15 built the cloud voice for answers and summaries, within the day's 30,000 characters and falling back to the phone's voice when it is slow or held, while "Got it" stays on the phone's voice; answers are first spoken with questions, issue 27)
- [ ] Hear me offline, on every phone: an opt-in download of about 40–75 MB that listens on the phone, interrupting included (N, C)
- [ ] "Hey [name]" while Helm is open on screen, off until you turn it on (O)
- [ ] The assistant on every screen, knowing what is in view: "move this to Friday", "who's this?", "add a step" (O, C)
- [ ] Send photos, screenshots, PDFs, voice notes and Markdown files; the assistant keeps each on the record it changed or lets it go, and says which (O, C)
- [ ] One turn split into several things, each filed as a task, fact, who, place, preference or note and linked to a project, with one Undo; typed shorthand read exactly (O, N, C)
- [x] Questions in the shape that fits (pick one, pick several, yes or no, a few words, a date or time, a person, place or project, a number), asked only for what the assistant can't settle, one at a time when spoken, answered by tap or voice, skippable to Needs you, with Undo (O, N, C)
- [ ] Inbox: Needs you (the questions waiting) and what's new since you looked (O, C)
- [x] Turns kept when the AI, the connection or the day's limit is away, and sorted once it is back (N, C)
- [ ] Tasks with importance, urgency, deadline, length, energy, context, place, who, steps, what they wait on and "not until" (O, N)
- [ ] Key dates for people, pets, organizations and you, in two kinds: dates that come back (birthdays with or without a year, anniversaries, custom yearly) on each page, on Today a few days ahead for close and regular people, and in a Coming up view by month; and moments (moves, jobs, graduations, adoptions, meeting, passing away) on each page and in a list by decade and year; from conversation and Contacts, used in answers (O, C)
- [ ] "Ask about this" on every content page, the same control in the same place, opening the conversation about that page and returning to it (O, C)
- [x] People, pets and organizations, each with a page, a photo and a level (close, regular, passing); passing ones out of the way until they matter (O, C)
- [ ] Projects with an objective, milestones, tasks, people in roles (key, involved, mentioned) and health from evidence (O, C)
- [x] Add people from Google Contacts, picking each one (O)
- [x] Places with photos (O)
- [x] Facts with their source, said or inferred; contradictions kept side by side until you choose (O, C)
- [x] Your preferences, favorites and who you are, kept as facts about you (O)
- [ ] How [name] sees you: who you are, what you like, how you write and how you like answers, every line editable (O)
- [ ] How you write: style notes learned from what you type in Helm and, if you switch it on, your sent mail (O)
- [ ] Knowledge: topics as living documents written from what you tell it, nested up to three levels, each part showing where it came from, with a history of versions and Undo; ask about one while reading, tell it what to change; loose notes for what fits no topic (O, C)
- [ ] Filing knowledge: asked which topic the first time, then filed there on its own with Undo; parents proposed for related topics (O)
- [ ] Save to my knowledge, and notes cited in answers before any general knowledge (O, C)
- [ ] Procedures: routines kept once and run each time, attached to a trip, event or project; a run ticked by tap or voice; versions (O, N, C)
- [ ] Today, one view among the others: a few tasks suggested for real gaps, rest days, "I'm home", a version without a calendar (O, N)
- [x] Answers from your own records with their sources, short when spoken; general knowledge only when they don't say, clearly marked, with a stronger caution on health (O, C)
- [ ] Rename the assistant and choose one of four tones (O)
- [ ] Activity: every turn and change, with Undo; Search across everything Helm keeps (O, C)
- [ ] Trust this browser so Helm opens offline for up to 30 days at a time; the site's Sign out everywhere (O)
- [ ] Everything stored encrypted, kept files and photos included; delete all of my Helm data (O, N, C)
- [ ] Connected apps: connect, choose what each may read, see status and errors, disconnect with or without deleting copies; the site's account page lists every connection; every copied thing shows its source (O, N)
- [ ] Pinch, Google Calendar (busy and shifts calendars, several accounts), A-List, Going Once, Nine Lives (cats as pets), Waypoint, Runway (summary; bills, Horizon and transactions when switched on) and Worth the Wait (box counts) connected (O, N)
- [x] Gmail and Drive: answers that search and read your mail, Docs and PDFs, citing each (O)

### Next Steps

- [ ] Drafting: messages and replies written in your style for you to copy, by person and occasion
- [ ] Video attachments
- [ ] App cards: a thing from another app shown in its own form in the conversation and on records (a Pinch recipe card, a Waypoint trip card)
- [ ] A life timeline and milestones for you and the people in it, drawn from the moments the MVP already keeps (a move, a new job, a pet's adoption)
- [ ] Writes to other apps, each asked for and approved one by one: add to Pinch's list, tick a Waypoint task, put a task on Google Calendar
- [ ] Other site apps as readers through the same grants, and a Stop sharing list inside each source app
- [ ] Google Contacts kept in step; merge two people who turned out to be one; groups and households as who records
- [ ] A choice of voices for the assistant
- [ ] More documents: briefings, research notes, interview questions and plans, each refined in conversation; research on request (`/research`); export to Google Docs
- [ ] Preparation: before an event, a procedure run or briefing left ready, without a push
- [ ] Suggestions tuned by what the person kept, declined or moved
- [ ] Repeating tasks, and procedures run on a schedule
- [ ] Knowledge found by meaning; a topic linked to a project; notes from a link or many imported at once; topics ordered by your own use
- [ ] Commitments: promises made to someone or by someone, with who and by when
- [ ] Scenarios: "what if the venue falls through", with the tasks and dates it would change
- [ ] Google Tasks, kept in step (optional)
- [ ] A weekly look back and ahead, on request

### Stretch Goals

- [ ] Other ways to reach the assistant once Helm graduates: a browser extension, and other mediums that bring it closer to daily life
- [ ] Orders from the places you buy, as a connected category
- [ ] Apple: contacts, and Sign in with Apple across the site
- [ ] Gmail: commitments and dates found in mail and offered as tasks, and replies drafted for you to approve and send
- [ ] Helm in Claude.ai: a connector so you can ask your Helm from a Claude conversation, read only, with the same grants
- [ ] Information service: newsletters, RSS, saved articles and topics summarized into a digest of what matters to your projects and decisions, never a daily chore
- [ ] Acting outside Helm without asking (levels 3 and 4), switched on per kind of action
- [ ] Change my key: reseal everything under a new key

## Under the Hood

To be settled by the technical design; the product depends on these:

- **Stack:** React with Redux Toolkit for state, Firestore for data and Storage for kept files and photos, each person's data under their own private path in the app's data.
- **The voice, apart from the thinking:** a voice service with its own layers for listening and speaking, each behind a swappable provider (a cloud one online; offline, an opt-in speech recognizer downloaded to the phone and the site's natural voice, both shared and app-agnostic under `@/lib/speech`, with the recognizer's licence and any copyleft checked and said where it is turned on), one voice identity mapped onto whichever speaks, its own budget and per-person allowance apart from the assistant's, and keys held on the server with short-lived tokens for streaming. The default providers are chosen after a benchmark of 10 to 15 replies across candidates (naturalness, delay, interruption, cost). The shared speech tools are extended, never copied.
- **AI on the server:** The assistant runs in Cloud Functions behind a provider layer: Claude through the Anthropic API, a lighter model for quick turns and a Sonnet-class one for answers and planning, under a $10 a day cap for the whole site; per person, quick turns 60 in 10 minutes and 400 a day, fuller turns 20 in 10 minutes and 150 a day. Voice has its own $5 a day cap and a per-person 60 minutes of listening and 30,000 characters of speech a day. The model reaches the person's things only through Helm's own tools and only proposes structured changes, which Helm's code checks and writes. Shorthand, dates, matching, planning, permissions and state changes are plain code. The assistant's name and tone are passed in with each turn, never stored inside a record's text.
- **Screen context:** each screen publishes which records it shows (ids, capped); the server re-reads those records under the person's own account, and any on-screen summary stays on the device.
- **Records:** one "who" record with a kind (person, pet, organization) and a level, roles on projects, key dates (kind, a date whose year may be unknown, a label, yearly or not) on a who or on the person, facts with a kind (about the world, preference, favorite, identity) and a topic, style notes, notes with versions, procedures with versions and their runs, kept files linked to the records they changed. The shapes leave room for milestones, app cards, other mediums and orders without a rewrite.
- **Encryption:** content fields and kept files are sealed with a per-person key that only the server holds unwrapped, in the pattern Runway uses, under Helm's own keyring; a trusted browser keeps the key through the site's shared trusted-key store.
- **Connections, site-wide:** each source declares one contract (kind, what it can do, how it connects, its status, kept in step or read when asked, its categories); a reader never reads another app's data directly, so an app that moves to its own domain keeps its contract. Google Contacts is read on a pick only.
- **History:** every change the assistant makes is recorded in Activity so it can be undone; facts keep earlier values; notes and procedures keep versions; turns and answers are kept, sealed, to look up.
