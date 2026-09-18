# Nine Lives

## Overview

### The short

Nine Lives is a private home base for cat owners to keep track of everything that matters about their cats — who they are, what's happened to them, what's coming up, and what it's all costing. Instead of scattered vet paperwork, phone photos of vaccine cards, and half-remembered symptom timelines, everything lives in one place, organized around your household and each individual cat in it.

### The story

Built after adopting two kittens (both girls) and realizing how much there is to keep straight from day one: birth dates, breeds, current vaccinations, known illnesses, microchip numbers, which vet you're seeing, which shelter they came from, and — critically — symptoms as they show up, so you can actually tell your vet "this started on X" instead of guessing. Nine Lives exists so none of that has to live in your memory or a dozen text threads.

### For Cats

- **Core vs. non-core vaccines differ by species.** A cat's core schedule (FVRCP, rabies) doesn't map onto a dog's, so the seeded vaccine and condition reference data is feline-specific rather than a generic pet dataset with cats mixed in.
- **Cats mask illness well, often through subtle behavior rather than obvious signs** — hiding more, being less playful, a change in litter box habits. Symptom logging leans on quick-tap tags for exactly these things, not just a blank text box, so the non-obvious stuff actually gets recorded instead of forgotten.
- **Indoor/outdoor lifestyle matters more for cats** in terms of parasite exposure, injury risk, and which non-core vaccines are actually relevant — worth tracking on the profile itself.

## How it Works

1. **Set up your household**: create one from a closable create/join modal, or request access with an invite code from someone already in the household. Household members can always share the current invite code and approve incoming requests.
2. **Add a cat**: name, photo, date of birth, breed (pick from a default list or enter your own), indoor/outdoor lifestyle, microchip number, shelter/origin (name and address), adoption date and other key dates, current vet clinic, insurance (pick a common provider or enter your own), diet, and notes.
3. **Build their health record**: upload documents (PDF or image — no video) like lab results or vet paperwork, attached directly to that cat. Records can be opened, edited, and deleted from the cat's Records tab, and custom record labels are saved for reuse across the household.
4. **Track visits**: schedule and log vet visits — for one cat, or several at once (say, both kittens seeing the vet the same day) — tagged with a reason (checkup, illness, accident, vaccination, follow-up, or custom) and the doctor seen, so future visits can just pick them from a list instead of retyping. Visits get a sensible default name based on time of day and date ("Morning Visit — Mar 4"), but you can always rename one. Logging a completed visit is also where you update the key things that actually change at the vet — vaccinations given, conditions diagnosed, current weight, and symptoms discussed — instead of hunting down separate screens afterward.
5. **Track conditions and incidents**: browse the shared condition library, log accidents/injuries, or add a fully custom entry specific to your cat.
6. **Track symptoms**: quick-tag cat behavior changes like litter box changes, appetite shifts, hiding, playfulness, and grooming, or write your own note; log either quick tags, free text, or both, and link them to a visit or condition so the timeline connects.
7. **Track preventives**: log each flea, tick, mite, heartworm, or dewormer dose, including when it was administered and when the next dose is due. Records can be edited or deleted from the cat's Preventives tab.
8. **Budget**: log expenses with sensible presets (adoption fee, insurance, food, vet, litter, grooming...) and see both monthly and lifetime totals.
9. **Track litter usage**: log household litter weigh-ins by box and type, see usage between weigh-ins, and track how long each box has been since its last change.
10. **Stay emergency-ready**: the app nudges you to record an emergency/after-hours vet and confirm insurance is on file until both are done.
11. **Browse resources and the glossary**: look up unfamiliar terms (what's FVRCP?) with definitions linked to relevant resource articles.
12. **See what's coming up, at a glance**: a household-wide timeline of visits, vaccination due dates, and preventive due dates — past and upcoming, out to about a year — without opening a specific cat first, similar to the printed summary you get at the end of a vet visit.
13. **Get reminders**: push notifications for upcoming visits, vaccination due dates, and preventive due dates, once that infrastructure is built (see Stretch Goals — the visibility in #11 doesn't depend on it).
14. **Upload and review a document**: the dashboard, Expenses, and Records sections can send a PDF or photo to Firebase AI Logic. The resulting `IngestionDraft` is household-scoped and contains optional cat, clinic, visit, vaccination, preventive, weight, symptom, condition, and expense proposals. Reviewers can edit or exclude each proposal, choose an existing cat or clinic, keep the file as a health record, then confirm the linked writes or discard the draft.

## How it Feels

- **Reassuring**: nothing about your cat's health quietly falls through the cracks.
- **Built for cats, not "pets"**: every field and piece of reference content exists because a cat owner actually needs it — see "For Cats" above.
- **Connected, not siloed**: symptoms, conditions, vaccinations, and visits all reference each other instead of living in separate lists.
- **Ready for the unexpected**: emergency contacts and insurance aren't buried — the app actively nudges you to have them on hand.
- **Practical over precious**: this is a tool you actually use before and after a vet appointment, not a scrapbook.

## The Build Plan

### Core MVP

- [x] Household setup: create a household or join one with an invite code, with a closable modal instead of auto-creating on first entry
- [ ] Cat profiles: name, profile photo, date of birth, breed, indoor/outdoor lifestyle, microchip number, shelter/origin (name and address), adoption date and other key dates, current vet clinic, insurance, notes
- [ ] Default preset lists for breed, personality traits, and insurance provider, each with a "custom" option
- [ ] Vet clinics and doctors: add a clinic, log doctors seen there, reusable as a select on future visits instead of retyping
- [x] Health record file uploads (PDF, image) attached to a cat, with persisted custom record types (typed once, reused as a select — not retyped every time)
- [ ] Vaccination tracking: vaccine name, date administered, next due date
- [x] Preventive tracking: flea/tick/heartworm/mite/dewormer product, administered date, and next due date, with edit/delete
- [ ] Weight entries: log a cat's current weight, optionally as part of a visit
- [x] Visit tracking: schedule/log visits with a reason (checkup, illness, accident, vaccination, follow-up, custom), supporting one or several cats in a single entry, with a sensible default name based on time of day, and vaccinations/conditions/weight/symptoms updatable in the same completion flow
- [x] Condition/incident library seeded from a public data source, browsable and searchable — covering illnesses as well as injuries, with full visit history per condition
- [x] Attach known conditions or incidents to a cat — from the library or as a fully custom entry
- [ ] Symptom log with quick-tap cat-specific tags plus free text, optionally linked to one or more visits and/or a condition
- [ ] Budgeting with default category presets (adoption fee, insurance, food, litter, vet, grooming, supplies, medication, microchipping/spay-neuter, other), monthly totals, and a running lifetime total
- [ ] Emergency readiness: a dedicated place for an emergency/after-hours vet contact, with a dashboard nudge until it's filled in
- [ ] Household dashboard: a full timeline of visits, vaccination due dates, and preventive due dates, past and upcoming (roughly a year out), plus CTAs to add a visit or reminder spanning multiple cats without opening a specific cat's profile first

### Next Steps

- [x] Preventive treatment tracking with recurring dose history and next-due dates
- [ ] Structured glossary (e.g., "what's FVRCP?") with entries linked to relevant resource articles
- [x] Cat personality traits/notes per cat
- [ ] Cat diet: food type (dry/wet/mixed), brand, feedings per day, automatic feeder, snacks/treats
- [x] Litter usage: household weigh-ins by litter box and type, usage deltas, and time since box changes

### Stretch Goals

- [ ] Push notification reminders (Firebase Cloud Messaging) for upcoming visits and vaccination due dates, built as shared infrastructure other mini-apps can reuse — the dashboard timeline above doesn't wait on this; it reads visit/vaccination data directly
- [ ] Email notification channel, once push notifications are working
- [ ] In-app camera scanner that captures a photo and produces a cleaned-up document, instead of requiring an existing file
- [ ] Monthly growth photo timeline and weight chart over time per cat
- [ ] Shareable vet-visit summary export (PDF)
- [ ] Auto-parsing of uploaded vet documents to suggest structured health record data
- [x] Additional caretakers per household (invite/join flow with shared invite codes and pending requests)
- [ ] Shareable "cat card": a downloadable image summary of a cat's profile
- [ ] Care-taking instructions, both household-wide (joint) and per-cat — useful for pet-sitters or additional caretakers
- [ ] Support for additional species beyond cats, built on the same schema
- [ ] Community resource articles beyond the condition library and glossary entries

## Under the Hood

- **Frontend**: React + TailwindCSS + Dreamer UI, following existing mini-app conventions in this repo
- **State**: Redux Toolkit (typed per-mini-app slice trees, optimistic thunks, cross-slice selectors) — see the Technical Design Document for the full architecture
- **Data**: Firestore, namespaced under `apps/nine-lives/...`, household-scoped for owned data and globally shared for reference content (condition library, glossary, resources, vaccine reference list)
- **Files**: Firebase Storage for health-record uploads and photos
- **Document ingestion**: Firebase AI Logic uses App Check. Production builds require `VITE_FIREBASE_APPCHECK_SITE_KEY`; local emulator builds enable the App Check debug token so the generated token can be registered in the Firebase Console.
- **Notifications**: Firebase Cloud Messaging, via shared cross-app infrastructure rather than a Nine Lives–specific implementation