# NOMOS.md: how the app joins Nomos and everything connected to it

Binding for the technical track. Nomos is Helm's assistant (renameable, so "Nomos" here means whatever the person calls it), and it is what glues the system together: through the connections platform it reads what each app shares, answers questions about it, and (on Helm's roadmap) asks to act in it. Around it sit the other things the system connects: the outside assistants that reach Helm (Claude, Gemini, ChatGPT and whichever are supported now: list them from Helm's connected-assistant code, never from memory), the connected services (Google Calendar, Contacts, Gmail, Drive and any added since), and the other apps on the site. The page plans the app's place in all of it, looking for tighter integrations, a smoother experience and gaps no one owns (owner). Every new app is planned with Nomos in mind from round 1, and the plan for that lives in its own short file so the owner can find it in one tap: `src/apps/<id>/NOMOS.md`, published beside the other drafts each round.

It is a short page (1–3 KB), written for the owner first, in the person's words. It never repeats `TECHNICAL.md`; it states what Nomos gains and links to the schema and manifest sections that build it.

## Sections, in order

1. **In one line**: what the person can now ask Nomos about this app ("Ask Nomos what's free to spend before payday").
2. **What the person asks**: three to six real things the app's people would say to Nomos, each with the answer it gives, using the app's own example data. These come from the product track's journeys; an ask Nomos can't answer from what is shared is either a category below or a line under "Not shared".
3. **What Nomos can read**: one row per share category (the person's words for it, the shared kind, On or Off at connect, sync or on request, and its `meaning` sentence). The On set is as small as serves the asks above (`connections.md`); every Off category says why someone would turn it on.
4. **Not shared**: the Never lines, and anything sensitive the app keeps that Nomos never sees, with the reason.
5. **What Nomos could do here later**: actions the person might ask Nomos to take in this app (add to a list, tick a task, log something), each one asked for and approved by the person, as Helm's writes to other apps are. These are Next Steps or Stretch, never MVP, unless the owner says otherwise; say which issue would carry each.
6. **Outside assistants**: what a person asking Claude, Gemini or ChatGPT (through Helm) gets from this app, which of Helm's tools carries it and behind which of the assistant's permissions (helm rules "A new assistant tool says who gets it"), and what stays Nomos-only and why.
7. **Other apps and connected services**: what this app could read from another app or a connected service, and what another app could gain from this one (a Pinch meal plan feeding a Runway budget line, a calendar event filling a date), each through the platform (`connections.md`), with Now, Later or Not and why.
8. **Gaps and opportunities**: anything the asks above expose that no app, service or assistant covers yet, or a place two pieces should meet and don't; each either lands in this plan's issues or is listed as a follow-up for the app that should own it.
9. **Keeping it current**: the one-line test for later PRs: which of the app's records, if added or changed, means a category, its `meaning` or this file changes.

## Rules

- A planning round's brief carries one **Nomos** line (what changed in this file, or "unchanged", and any new opportunity or gap), so the owner sees it every round without opening it.
- The share categories here are the ones `share/manifest.ts` will declare, and `ISSUES.md` carries the issue that builds the manifest, adapter and `share/fields.ts` (usually beside the first issue that stores the data, never left to the polish PR).
- An app that truly has nothing worth sharing still has the file: it says so in one line and why, and what would change that.
- An ask that would need Nomos to read something the app holds only another member's copy of, or another person's private data, is a privacy question for the owner (plan-app "Which questions reach the owner").
