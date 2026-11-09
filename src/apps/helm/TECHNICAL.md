# Helm: Technical Design

Helm (`helm`) holds one person's whole life: the people, pets and organizations in it, places, projects, tasks, preferences and identity, knowledge in loose notes and in topics that read as living documents, reusable procedures, the media they share, and what their other apps, Gmail and Drive hold. Its home is a voice-first conversation with the assistant (default name Nomos, renamed by the person), reachable from home and from every content page and aware of what that page shows (round 6e). The assistant turns what the person says, types or attaches into records, answers questions from the person's own records first (and, clearly labelled, from general knowledge when the records hold nothing), plans a few tasks into the gaps Google Calendar leaves when asked to, and reads (never changes) the person's connected sources through the site's connections platform (section 19). Today and the calendar are one view among several. Nothing is shared between accounts.

Tier tags: **[MVP]**, **[Next]** (Next Steps), **[Later]** (Stretch). Only MVP fields go into `types.ts`, `firestore.rules`, `storage.rules` and a sealed payload in MVP issues, each in the issue that first uses it; the rest is written down so MVP shapes don't force a migration. In this document "the assistant" means the person's assistant whatever they named it; code names (`nomos/`, `NomosCommand`) stay as they are and never reach copy. Prices and API shapes of outside services that could not be checked from the planning sandbox are marked **(unverified)**; the issue that first calls each one checks it and corrects this document.

## 1. Decisions this design rests on

- **Private per uid, no shared container.** Every document lives under `apps/helm/users/{uid}/…` with a one-line `request.auth.uid == uid` rule (data-contracts "Per-member private data"). No `members`, `inviteCode` or `pendingRequests`: one person per account (logged).
- **Sealed from day one, Runway's way (owner, round 1).** Each document keeps ids, statuses, enums, flags, dates and timestamps readable for queries and ordering, and seals everything a person would recognise into one `sealed` payload. Media bytes (photos, PDFs, voice notes, Markdown files) are sealed on the device before upload, as Runway's receipt photos are (round 6). Each person has one random data key, stored only wrapped under Helm's own keyring `HELM_MASTER_KEYS` (logged: not shared with Runway); the client gets it from a callable and by default holds it in memory only (section 3).
- **A trusted browser keeps the key (owner, round 2), on the site's shared standard.** Opt-in per browser through `createTrustedKeyStore` and `TrustBrowserRow` (PR #819). A lost phone is handled by Remove, Sign out everywhere and the 30-day limit; no re-key in the MVP (owner, round 3). Section 4.
- **Untrusted browsers still capture offline, sealed** through the per-person drop box (section 3), so nothing a person types into Helm is kept on a device in plain text.
- **Home is the conversation (owner, round 6; supersedes round 1's "capture sheet with results, no chat thread").** Every capture is a turn in a conversation *session*; the home surface shows the current session's turns with what the assistant did (with Undo) and what it kept, and every other view is one tap away through home's voice dock (Browse · Talk · Type; round 6e: on home only), whose Browse opens the Browse sheet, the one view-switcher component: Search at the top, then a bento of tiles sized by importance (a wide Today, a few big tiles, the rest small), so a new section is a small tile and the big ones never multiply (owner, round 6b review). No footer tab bar, no doors on home. A content page (a record, Today, Coming up, Needs you, a list, Knowledge, How {name} sees you) has no dock: it carries Back and Home in its header and one standard built-in "Ask about this" control, which opens the conversation about that page over it; a utility screen (Search, Settings, Connected apps, Activity, a form) has neither (section 21). The data unit stays the `Capture`: one thing the person said, typed or attached (section 21).
- **Voice is its own service, separate from reasoning (owner, round 6).** Speech-to-text, reasoning and speech output are three replaceable layers with their own budgets. Listening and speaking go through a provider-independent voice service: cloud adapters (Deepgram streaming for listening; Nomos's voice through the provider the voice benchmark picks among Gemini Flash-Lite TTS, Deepgram Aura-2 and Google Cloud TTS) and device adapters (the browser's recognition; the site's natural voice and system voices through `@/lib/speech`), chosen per turn by connectivity, the person's voice allowance and the response's priority. Keys stay on the server: streaming listening uses short-lived tokens the server mints; speaking streams through a site function. Claude's budget pays for reasoning only (section 20).
- **The assistant knows the screen (lead, round 6).** Every view publishes a small, capped screen context (a focus record, the visible record ids, the view's name); the server re-reads those records itself under the caller's uid, so "move this to Friday" on a task works and a forged context can reach nothing the person couldn't (section 21).
- **The assistant runs on the server from day one (owner, round 1)**, on Claude through the Anthropic API (owner, round 5), in a tool-use loop over Helm's own in-process MCP server (section 5). **Model routing (lead, round 6):** a quick, cheap model takes simple turns, the Sonnet-class model takes planning, answers, attachments and topic documents, and the quick model can hand a turn over; roles map to model ids only in `models.ts`. The model never writes, never sees a document id or a token, never picks a date.
- **Answers: records first, then general knowledge, labelled (owner, round 2)**, in writing and in speech: a spoken general part is always introduced by the code-built words "Not from your records" (section 6).
- **One "who" record for people, pets and organizations (lead, round 6).** `who/{whoId}` with `kind` (`person | pet | organization`; groups and households later), an importance `tier` (`close | regular | passing`), an optional photo, and a `role` per project (`key | involved | mentioned`). The person themself is a `who` with `isSelf`, so their identity, preferences and (later) life events hang off the same shape as everyone else's (section 22).
- **Preferences, favorites and identity are facts** with a `kind` and a topic, shown and edited on "How Nomos sees you" with the learned writing style (section 26).
- **Knowledge is loose notes and topics, and each topic is a living document (owner, rounds 2, 3, 6 and 6c).** A topic reads as one formatted document that the assistant writes and keeps up from the knowledge filed under it, with a source on every section and a version history with Undo; topics nest three levels deep, and a parent opens with an overview of its subtopics. The assistant adds without removing the person's words unless asked (section 24). This replaces round 6's separate living docs: the topic is the document.
- **Procedures replace checklists (owner and lead, round 6).** A task is a one-off thing to do and may have steps; a procedure is a reusable routine with versions, run each time as a ticked *run* attached to a project, a trip or an event (section 25).
- **Media in the conversation (owner, round 6):** photos and screenshots, PDFs, voice notes and Markdown files. The assistant decides to keep or discard each; kept media is sealed in Storage and shows on the record it changed and in the conversation (section 23).
- **Google Contacts import, picked people only (owner, round 6):** `contacts.readonly` through the platform's Google token store; only the people the person ticks are written, as `who` records (section 22).
- **What stays on the device:** the shorthand and date reading, the planner, latent-task activation, note ranking, the screen context, voice routing and barge-in, Undo, and the person's own edits. None of them calls the model.
- **Connected apps are a site platform, and Helm is its first reader (owner, round 5).** Section 19, unchanged in round 6 except one connector (`google:contacts`) and the room it leaves for future categories.
- **Every assistant change is an Execution record written in the same transaction as its effects.** Undo re-reads current state, reverts only its own fields, goes on past records changed since and says what it kept.
- **Name and tone live on the profile.** Tones are Composed (default), Warm, Brief and Formal (logged); the name is 1–16 characters (logged) and is also the wake word ("Hey {name}"). Tone shapes the assistant's free writing and spoken replies, never the voice itself, stored facts, titles, summaries, questions or Undo lines (section 5, "Name and tone").
- **No push notifications in MVP; scheduled jobs:** the daily key checks and the hourly connection sync (with its daily expiry sweep). The assistant never interrupts and never scans mail in the background; it speaks only in answer to the person.
- **Built so later work needs no migration (round 6):** app cards, milestones and a life timeline, a browser extension and other mediums, orders from other places, video and drafting each have a named hook in the MVP's data and contracts (section 27).

## 2. Data schema

All times are millisecond numbers. **Date-only** values (a due day, a "not until" day, a milestone date, a birthday) are UTC midnight (`fromDateInputValue`, shown with `formatDateUTC`) and cover their whole day; **instants** (`createdAt`, a slot's `startAt`, a due time) display in local time. A **key date** is a third shape because parts of it may be unknown, and it comes in two kinds (section 22, "Key dates"): a **date that comes back** (a birthday, an anniversary, a custom yearly date) is `month`, a nullable `day` and a nullable `year` ("June 3", "Aug 1984"); a **moment** (moved, a job, graduated, adopted, met, passed away, a custom one-time date) is a `precision` of `day | month | year | decade` with the parts it needs ("Moved · Aug 2024", "Graduated · 1998", "Lived in Lisbon · the 1980s"). Neither is ever a timestamp with a made-up year or day; each is shown through the shared yearly-date formatter. Every Firestore field is `T | null` with an explicit `null`; arrays default to `[]`. Closed enums are unions in `types.ts` with their option lists in `constants.ts`, and every `switch` over one has a `default` branch.

**How a type reads below.** Each entity is the readable document plus a `…Sealed` interface: the plaintext inside its `sealed: Sealed` payload (`Sealed` = `EncryptedFieldPayload` from `@lib/security`, the shape Runway uses, with `v` for the schema version inside). Readers default a sealed field that an older payload lacks (`?? null`), and a payload gains a field only in the issue that reads it.

**Maps that change one entry at a time keep two maps with the same keys:** a readable state map (a tick, an order, a slot's status, a role) that takes a dotted-path update, and a map inside the sealed payload holding the entry's words. A tick, Keep or milestone done stays a one-field write that works offline; adding, rewording or removing an entry reseals the payload. This keeps one sealed payload per document (data-contracts "A document may carry one `sealed` payload").

### Paths

| Path | What | Tier |
|---|---|---|
| `apps/helm/users/{uid}` | `HelmProfile`: settings, the assistant's name and tone, voice settings | MVP |
| `apps/helm/users/{uid}/captures/{captureId}` | One turn: what the person said, typed or attached, how it was read, the screen it came from, the reply, Inbox state | MVP |
| `apps/helm/users/{uid}/tasks/{taskId}` | Tasks (with steps), latent ones included | MVP |
| `apps/helm/users/{uid}/projects/{projectId}` | Projects with milestones and the people in them, each with a role | MVP |
| `apps/helm/users/{uid}/who/{whoId}` | People, pets and organizations, the person themself included (`isSelf`); replaces round 5's `people` | MVP |
| `apps/helm/users/{uid}/keyDates/{keyDateId}` | Key dates of every who and the self: dates that come back and moments, one document each (moved out of the who's sealed payload so a lifetime of them scales) | MVP |
| `apps/helm/users/{uid}/meta/keyDateIndex` | One sealed document listing every date that comes back in compact form, so Today, Coming up and answers read one document (split into `keyDateIndex-01` … `-12` by month only past its cap) | MVP |
| `apps/helm/users/{uid}/places/{placeId}` | Places (named, never coordinates), with photos | MVP |
| `apps/helm/users/{uid}/facts/{factId}` | Facts about a who, place, project or synced record, preferences, favorites and identity among them, with provenance | MVP |
| `apps/helm/users/{uid}/notes/{noteId}` | Knowledge: the pieces (a note typed, said, saved from an answer or brought in from a file), in topics or loose | MVP |
| `apps/helm/users/{uid}/topics/{topicId}` | Topics, nested up to 3 levels, each with its sealed document | MVP |
| `apps/helm/users/{uid}/topics/{topicId}/versions/{versionNumber}` | A topic document's versions | MVP |
| `apps/helm/users/{uid}/procedures/{procedureId}` | Reusable routines; replace round 5's checklist `artifacts` | MVP |
| `apps/helm/users/{uid}/procedures/{procedureId}/versions/{versionNumber}` | A procedure's versions | MVP |
| `apps/helm/users/{uid}/procedureRuns/{runId}` | One run of a procedure, attached to a project, a trip, an event or a task | MVP |
| `apps/helm/users/{uid}/media/{mediaId}` | A photo, PDF, voice note or Markdown file: what it is, where it is kept, what it shows on | MVP |
| `apps/helm/users/{uid}/style/{styleId}` | Learned writing style, general and per occasion or audience | MVP |
| `apps/helm/users/{uid}/executions/{executionId}` | Activity: every assistant change, decision and undo | MVP |
| `apps/helm/users/{uid}/planDays/{dayKey}` | Helm's slots and the calendar snapshot for one local day | MVP |
| `apps/helm/users/{uid}/synced/{syncedId}` | Sealed copies of what connected sources share (section 19), **written only by Functions** | MVP |
| `apps/helm/server/{uid}/keys/data`, `…/keys/dropBox` | The wrapped data key and drop-box private key, **Admin SDK only, no rule matches** | MVP |
| `apps/helm/server/{uid}/aiUsage/{dayKey}` | Per-person reasoning call counts, **Admin SDK only** | MVP |
| `apps/helm/aiBudget/{dayKey}` | Project-wide reasoning spend for the daily guard, **Admin SDK only** | MVP |
| `apps/helm/keyChecks/{masterKeyId}` | The keyring canary `verifyHelmKeys` opens daily, **Admin SDK only** | MVP |
| `apps/helm/users/{uid}/commitments/{id}`, `scenarios/{id}` | Promises, what-ifs | Next |
| `apps/helm/users/{uid}/lifeEvents/{id}` | Milestones in the person's life and others' (section 27) | Next |

Paths outside the app namespace, called out: the shared `users/{uid}` profile (read for the person's name and email, never written by Helm), the shared `apps/{appId}/usage` records from `useTrackAppUsage`, the site's connections paths (section 19: `connections/{uid}/…` owner-read, callable-written; `connectionsServer/{uid}/**` Admin only), and **the site's voice service paths** `voiceUsage/{uid}/days/{dayKey}` and `voiceBudget/{dayKey}` (section 20), Admin SDK only, no rule matches. Helm adds nothing to central `reminders`.

**Storage**: `apps/helm/media/{uid}/{mediaId}` (the sealed bytes) and `apps/helm/media/{uid}/{mediaId}.thumb` (a sealed 512-px thumbnail for photos and a PDF's first page when the device can draw it), `application/octet-stream` only, owner-only (section 14).

**On the device only**, every entry naming the uid and cleared on sign-out and by "Remove from this device" (the site's `forgetDeviceSecretsFor`):
- `helmOutbox` and `helmDropBoxKey` (device secrets): drop-box envelopes of captures made while Helm had no key, and the public key that seals them (section 3).
- `form-draft:<uid>:helm:*`: unsent capture text, a sealed form draft (`declareSealedFormDrafts('helm:')`).
- The trusted browser's kept data key (section 4).
- Voice preferences that are about this browser, not the person: whether the natural voice and the on-device recognition model are downloaded (`useNaturalVoice`'s and `useOnDeviceRecognition`'s own keys) and the microphone permission answer. Nothing heard is kept: audio lives in memory for the length of a turn (section 20).

### `HelmProfile` (`apps/helm/users/{uid}`) [MVP]

Readable throughout: nothing on it is the person's content, and the shell needs the name before the key arrives.

```ts
type AssistantTone = 'composed' | 'warm' | 'brief' | 'formal'; // options + sample answers + prompt lines in constants.ts
type VoiceMode = 'cloudWhenOnline' | 'deviceOnly';             // round 6: deviceOnly never sends audio to a voice provider

interface HelmProfile {
  assistantName: string;               // default DEFAULT_ASSISTANT_NAME ("Nomos"); 1–16 chars of ASSISTANT_NAME_PATTERN; also the wake word
  assistantTone: AssistantTone;        // default 'composed'
  selfWhoId: string | null;            // round 6: the person's own who record, made with the profile
  timeZone: string;                    // IANA; set from the device on first open, editable
  dayStartTime: string;                // "HH:mm" floating: the earliest a slot may start
  dayEndTime: string;                  // "HH:mm"
  planFillPercent: number;             // share of free time the planner may fill (default 50)
  shiftCalendarIds: string[];          // "{accountId}/{calendarId}" marked as shifts (rest-day rule)
  busyAllDayEventRefs: string[];       // synced ids of all-day events the person said block the day
  calendarOfferFoldedAt: number | null;
  hasSeenAiNotice: boolean;            // the first-capture AI line was shown
  hasSeenVoiceNotice: boolean;         // round 6: the first-voice line (who hears what) was shown
  voiceMode: VoiceMode;                // round 6: default 'cloudWhenOnline'
  isWakeWordOn: boolean;               // round 6: "Hey {name}" while Helm is open on screen; default false (PRODUCT.md: off until turned on)
  isHandsFreeOn: boolean;              // round 6: the mic reopens for a follow-up after a spoken reply; default true
  styleFromMailAccountId: string | null; // round 6: the Google account whose sent mail the person let the style learner read
  styleLearnedThroughAt: number | null;  // round 6: createdAt of the newest typed capture the style learner has read
  currentPlace: { placeId: string; saidAt: number } | null; // "I'm home", lapses after 3 h (section 10)
  autonomyOverrides: Record<string, AutonomyLevel> | null;  // [Later] per-category opt-in to levels 3–4
  createdAt: number;
  lastEditedAt: number | null;
}
```

`ASSISTANT_NAME_PATTERN` = `/^[\p{L}\p{N}](?:[\p{L}\p{N} '\-]{0,15})$/u` after trimming and collapsing spaces. The same pattern is copied to the server (it goes into a prompt). `useAssistantName()` returns `assistantName || DEFAULT_ASSISTANT_NAME`; every copy line that names the assistant is a template in `constants.ts` filled with it, and `check:helm-copy` fails on a literal "Nomos" under `src/apps/helm/components`. The wake word is `readWakePhrase` over "hey {name}" and "{name}" (section 20); a renamed assistant answers to its new name.

### `Capture` (one turn) [MVP]

One thing the person said, typed or attached: a turn in the conversation, the Inbox's source and the source every record it made points to.

```ts
type CaptureStatus = 'received' | 'interpreting' | 'sorted' | 'needsYou' | 'failed';
type HeldReason = 'offline' | 'aiUnavailable' | 'recentLimit' | 'dailyLimit' | 'budgetReached'; // recentLimit: the 10-minute window; dailyLimit: the day's
type NomosQuestionKind =
  | 'whichPerson' | 'whichPlace' | 'whichProject'
  | 'whichIsTrue' | 'whichDate'
  | 'couldNotRead' | 'moreToSort'      // built by code, fixed wording
  | 'whichTopic' | 'groupTopics'      // round 6d: built by code (section 7); whichTopic is pickOne with "New topic" when none fits, pickSeveral when two or more could
  | 'asked';                           // round 6c: written by the model through `ask` (section 5 "Questions")
type QuestionShape = 'pickOne' | 'pickSeveral' | 'yesNo' | 'freeText' | 'dateTime' | 'pickRecord' | 'number'; // round 6c
type SpokenPriority = 'ack' | 'reply' | 'summary';  // round 6: section 20 "Routing"

interface Capture {
  inputMode: 'typed' | 'voice' | 'attachment'; // round 6: 'attachment' = media with no words
  sttProvider: string | null;          // round 6: 'deepgram' | 'device' for a voice turn; null otherwise
  ttsProvider: string | null;          // round 6: which voice spoke the reply ('cloud:{provider}' | 'natural' | 'system'); null when nothing was spoken
  arrivedVia: 'direct' | 'dropBox';
  medium: 'web';                       // round 6: [Later] 'extension' and other mediums (section 27)
  sessionId: string;                   // round 6: the conversation session (section 21)
  turnIndex: number;                   // round 6: order inside the session
  screen: { view: HelmView; focus: RecordRef | null; visible: RecordRef[]; v: 1 } | null; // round 6: section 21; ≤20 visible
  attachmentIds: string[];             // round 6: media ids, ≤5 (PRODUCT.md)
  interruptedCaptureId: string | null; // round 6: the turn whose spoken reply the person talked over (barge-in)
  turnLeadId: string | null;           // round 6d: set on a message that joined an earlier one's turn (section 21 "Back-to-back messages"); null on the lead
  joinedCaptureIds: string[];          // round 6d: on the lead, the messages that joined it, in order; ≤9
  route: 'quick' | 'full' | null;      // round 6: the model route taken (section 5)
  status: CaptureStatus;
  heldReason: HeldReason | null;
  claimId: string | null; claimedAt: number | null; attempts: number;
  lastErrorCode: string | null;
  questionState: Record<string, { kind: NomosQuestionKind; shape: QuestionShape; askedAt: number; answeredAt: number | null; skippedAt: number | null }>; // round 6c: shape, askedAt, skippedAt
  answersQuestion: { captureId: string; questionId: string } | null; // round 6c: this turn is the answer to that question (section 5)
  executionIds: string[];
  hasAnswer: boolean;
  answerSavedNoteId: string | null;
  quotedSourceKeys: string[];          // round 5: "{connectorId}|{accountId}" of every quote and synced source
  planDayKey: string | null; planTaskIds: string[];
  seenAt: number | null; // a turn typed on home arrives seen (its card is in front of the person); whatever later lands a result the person hasn't seen sets it back to null
  createdAt: number;                   // when it was said: the "now" its reading and its sorting use
  sortedAt: number | null;
  sealed: Sealed;
}

interface CaptureSealed {
  text: string;                        // as typed, or the final transcript; ≤4,000 chars; never edited after Send
  reading: CaptureReading;
  answer: CaptureAnswer | null;
  spoken: { text: string; priority: SpokenPriority; builtBy: 'code' | 'model' } | null; // round 6: what is said back (≤280)
  spokenChars: number | null;          // round 6: on an interrupted turn, how much of its reply was heard before the barge-in
  questions: Record<string, NomosQuestion>;
  sortedThrough: number | null;
}

type HelmView = 'home' | 'today' | 'inbox' | 'task' | 'project' | 'who' | 'place' | 'knowledge' | 'note' | 'topic'
              | 'procedure' | 'run' | 'howNomosSeesYou' | 'activity' | 'search' | 'settings' | 'connection'
              | 'comingUp';  // round 6; 6e: Coming up
interface RecordRef { collection: HelmCollection | 'synced'; id: string; }
```

`CaptureAnswer`, `AnswerQuote`, `SearchedSource`, `CaptureReading`, `Token`, `DateSpan`, `SourceRef` and `NomosQuestion` are as in round 5:

```ts
interface CaptureAnswer {
  question: string;                    // ≤200
  scope: 'yourThings' | 'theWorld' | 'both';
  fromRecords: string | null;          // kept only with ≥1 resolved source
  sources: SourceRef[];
  general: string | null;              // kept per section 6's guards; never without its label
  isHealth: boolean;
  generalDiffersFrom: { noteId: string; says: string } | null;
  suggestedTopicId: string | null;
  quotes: AnswerQuote[];               // ≤5, copied by code from tool results
  searched: SearchedSource[];
}
interface AnswerQuote { id: string; connectorId: string; accountId: string; sourceLabel: string;
  text: string | null; deepLink: string | null; deletedAt: number | null; }
interface SearchedSource { connectorId: string; accountId: string; label: string; at: number; found: number; failed: string | null; }
interface CaptureReading { people: Token[]; places: Token[]; documents: Token[]; commands: Token[];
  isUrgent: boolean; dates: DateSpan[]; addressedAs: Token | null; }
interface Token { id: string; text: string; start: number; end: number; }
interface DateSpan extends Token { due: TaskDue; }
type SourceRef =
  | { kind: 'fact' | 'note' | 'task' | 'project' | 'who' | 'place' | 'procedure' | 'media' | 'topic'; id: string } // round 6: who, procedure, media; round 6d: topic
  | { kind: 'event'; eventRef: string; title: string; startAt: number }
  | { kind: 'synced'; id: string; connectorId: string; title: string | null; startAt: number | null };
```

`NomosQuestion` gains shapes (owner, round 6b: "multi-select or free response, like most chats today"). It was never built, so `answerOptionId` is replaced by `answer`, not deprecated:

```ts
interface NomosQuestion {
  builtBy: 'code' | 'model';
  shape: QuestionShape;                // code-built kinds are 'pickOne' (whichDate is 'dateTime')
  prompt: string;                      // ≤200, cut at a word; code-built prompts come from constants.ts
  options: { id: string; label: string; detail: string | null; ref: RecordRef | null }[];
                                       // pickOne 2–6, pickSeveral 2–8, yesNo fixed by code, pickRecord ≤6 resolved records; label ≤80, detail ≤80
  allowsSomethingElse: boolean;        // pickOne: a last "Something else" opening a free answer
  noneOption: boolean;                 // pickSeveral: always true, a code-added "None of these"
  recordKinds: ('who' | 'place' | 'project')[]; // pickRecord: what the search and the closing "new" option make; [] otherwise
  dateMode: 'date' | 'time' | 'dateTime' | null;
  number: { min: number | null; max: number | null; unit: string | null; isMoney: boolean; decimals: 0 | 1 | 2 } | null; // unit ≤20
  heldCommands: NomosCommand[];        // code-built only; [] for 'asked'
  aboutRef: RecordRef | null;          // what the question is about, for its card and Activity
  answer: QuestionAnswer | null;
}
type QuestionAnswer = { by: 'tap' | 'voice'; at: number; turnCaptureId: string | null } & (
  | { shape: 'pickOne' | 'yesNo'; optionId: string; otherText: string | null }   // otherText with "Something else", ≤500
  | { shape: 'pickSeveral'; optionIds: string[] }                                 // ['none'] for None of these, never []
  | { shape: 'freeText'; text: string }                                           // ≤500
  | { shape: 'dateTime'; date: number | null; time: string | null }               // date-only (UTC midnight) and a floating "HH:mm" in the profile's zone
  | { shape: 'pickRecord'; ref: RecordRef | null; newName: string | null }        // newName when the "new" option was chosen
  | { shape: 'number'; value: number });                                          // isMoney: integer cents
```

The reading is made on the device from `createdAt`, for a voice turn over the final transcript, so "tomorrow" said offline on Monday still means Tuesday when the capture is sorted on Wednesday. The server checks the reading's spans sit inside the text; it never re-reads dates. The `documents` token (`^`) names a procedure or a note.

### `Task` [MVP]

```ts
type TaskStatus = 'open' | 'done';
type Importance = 'must' | 'should' | 'could';
type Energy = 'low' | 'medium' | 'high';
type TaskContext = 'atHome' | 'out' | 'atComputer' | 'onPhone';
type TaskDue = { kind: 'day'; date: number } | { kind: 'moment'; at: number };

interface Task {
  status: TaskStatus;
  importance: Importance | null; isUrgent: boolean; due: TaskDue | null;
  durationMinutes: number | null; energy: Energy | null; context: TaskContext | null;
  projectId: string | null; milestoneId: string | null;
  whoIds: string[];                    // round 6: renamed from personIds (a pet's vet visit names the pet)
  placeIds: string[];
  notUntil: number | null;
  waitsOnTaskIds: string[]; waitsOnWhoId: string | null;
  stepState: Record<string, { order: number; doneAt: number | null }>; // round 6: a one-off task's own steps; {} when none
  mediaIds: string[];                  // round 6: kept media shown on the task
  createdBy: 'person' | 'nomos';
  sourceCaptureId: string | null; executionId: string | null;
  createdAt: number; lastEditedAt: number | null; completedAt: number | null;
  sealed: Sealed;                      // TaskSealed
}
interface TaskSealed { title: string; notes: string | null; steps: Record<string, { text: string }>; } // steps: same keys as stepState
```

A task's steps are its own and are not reusable; something done again and again is a procedure (section 25). "Turn these steps into a procedure" copies them into a new procedure (a `createProcedure` with the task's step texts) and leaves the task as it was. Latency is derived, never stored. Delete is the person's own action; the assistant never deletes.

### `Project` [MVP]

```ts
type ProjectRole = 'key' | 'involved' | 'mentioned';   // round 6

interface Project {
  targetDate: number | null;
  status: 'active' | 'finished';
  milestoneState: Record<string, { date: number | null; order: number; doneAt: number | null }>;
  whoRoles: Record<string, ProjectRole>; // round 6: whoId → role; replaces personIds; readable (ids and an enum only)
  mediaIds: string[];                    // round 6
  createdBy: 'person' | 'nomos'; executionId: string | null;
  createdAt: number; lastEditedAt: number | null; finishedAt: number | null;
  sealed: Sealed;                        // ProjectSealed
}
interface ProjectSealed { name: string; emoji: string | null; objective: string | null;
  milestones: Record<string, { title: string }>; roleNotes: Record<string, string>; } // roleNotes: whoId → "photographer" (≤40), same keys as whoRoles where set
```

**Roles.** `key` people show at the top of a project and in its evidence line ("Dana (florist) hasn't confirmed"); `involved` people are listed; `mentioned` are linked only because a capture named them in the project's context. The assistant sets `mentioned` on its own, `involved` when a task in the project names the person, and `key` only when the person said so ("Dana is doing the flowers") or picked it; it never lowers a role the person set. A who linked to a project with `key` or `involved` is at least `regular` (section 22). Health is derived, never stored and never a percentage.

### `Who` (people, pets, organizations) and `Place` [MVP]

Reusable entities, upsert on first mention. The server matches `@Dana` or a name the model read through `createOptionMatcher` over `name` + `aliases` of every who, any kind (section 5, "Matching on the server"). One sure match links; two candidates or a weak one become a `whichPerson` question ("Which Miso?" when a cat and a person share a name, the kind in each option's detail) with "Someone new"; no match creates one, written with `toDisplayCase`. The assistant's own name is never matched.

```ts
type WhoKind = 'person' | 'pet' | 'organization';    // [Next] 'group' (a household, a team): section 27
type WhoTier = 'close' | 'regular' | 'passing';

interface Who {
  kind: WhoKind;
  tier: WhoTier;                       // section 22 "Tiers"
  tierSetBy: 'person' | 'nomos';       // the assistant never changes a tier the person set
  isSelf: boolean;                     // exactly one, made with the profile
  placeIds: string[];
  photoMediaId: string | null;         // the who's picture (a media document with role 'photo')
  mediaIds: string[];                  // other kept media shown on the record
  importedFrom: { connectorId: 'google:contacts'; accountId: string; resourceName: string; importedAt: number } | null; // one-time copy
  importedFields: Record<string, string>; // field → HMAC of the value Google gave, so "Update from Google" replaces only fields the person hasn't edited; {} when not imported
  lastMentionedAt: number | null;      // the newest capture that linked it: lists and tier suggestions
  yearlyDateCount: number;             // round 6e: the who's dates that come back (≤20), kept in the same batch as each write
  momentCount: number;                 // round 6e: the who's moments (≤500): "See all 14" without reading them
  createdBy: 'person' | 'nomos'; executionId: string | null;
  createdAt: number; lastEditedAt: number | null;
  sealed: Sealed;                      // WhoSealed
}
interface WhoSealed {
  name: string; aliases: string[];
  relation: string | null;             // "my sister", "our vet clinic", "Mum's cat"
  phone: string | null; email: string | null; notes: string | null;
  species: string | null;              // pets only ("cat"); free text written with toDisplayCase
  organizationKind: string | null;     // organizations only ("bakery", "employer")
}

interface Place {
  isHome: boolean;
  photoMediaIds: string[];             // round 6: ordered, first is the cover; ≤12
  createdBy: 'person' | 'nomos'; executionId: string | null;
  createdAt: number; lastEditedAt: number | null;
  sealed: Sealed;                      // { name, aliases, address, notes }; never coordinates
}
```

### `KeyDate` (dates that come back, and moments) [MVP]

```ts
type KeyDateKind = 'birthday' | 'anniversary' | 'passedAway' | 'met' | 'adopted' | 'startedJob' | 'leftJob'
  | 'moved' | 'graduated' | 'custom';  // options and their words in constants.ts; switch with a default branch
type KeyDateShape = 'yearly' | 'moment'; // the kind decides: birthday and anniversary are yearly, every other named
                                       // kind is a moment, and custom carries the person's "Comes back each year"
type MomentPrecision = 'day' | 'month' | 'year' | 'decade';

interface KeyDate {                    // apps/helm/users/{uid}/keyDates/{id}
  whoId: string;                       // the self's who for the person's own
  shape: KeyDateShape;
  source: 'person' | 'nomos' | 'google:contacts';
  createdBy: 'person' | 'nomos'; executionId: string | null;
  createdAt: number; lastEditedAt: number | null;
  sealed: Sealed;                      // KeyDateSealed
}
interface KeyDateSealed {
  kind: KeyDateKind;
  label: string | null;                // required for 'custom' (≤60, "Gotcha day", "Lease renews"); otherwise an optional note
  month: number | null;                // 1–12; null only for a moment of precision 'year' or 'decade'
  day: number | null;                  // valid for the month (29 Feb allowed); yearly: null for "Aug 1984"; moments: precision 'day'
  year: number | null;                 // yearly: the first year, null when unknown; moments: always set (the decade's first year)
  precision: MomentPrecision | null;   // moments only
  captureId: string | null;            // the turn that said it
}

interface KeyDateIndex {               // apps/helm/users/{uid}/meta/keyDateIndex; one per person
  entryCount: number;                  // readable: the cap check and a repair's comparison, nothing else
  rebuiltAt: number | null;            // set by a full rebuild (repair), null otherwise
  lastEditedAt: number;
  sealed: Sealed;                      // KeyDateIndexSealed
}
interface KeyDateIndexSealed {         // grouped by who so each whoId is written once
  byWho: Record<string, KeyDateIndexEntry[]>;
}
type KeyDateIndexEntry = [keyDateId: string, kind: KeyDateKind, month: number, day: number | null,
  year: number | null, label: string | null];   // a tuple, not an object, to keep the document small; label for custom only
```

- **What stays readable**: only `whoId` and `shape` (the who page's read and Search's), as for any linked record. No day, month, year or kind is readable, and nothing is derived from them, so section 12's promise holds: nothing sealed is indexed anywhere. Tier is not copied here: Today and Coming up read each entry's who against the who records already open on the device (the eager `who` listener), so a tier change never touches key dates.
- **The yearly index.** Every date that comes back is also an entry in the one sealed `keyDateIndex`, a projection of the `keyDates` documents (which stay the record: source, note, history). Every create, edit or delete of a date that comes back, its Undo, a Contacts birthday and a who forget rewrite the index **in the same transaction** as the change: read it, open it, change the who's entries, seal it, write it with `entryCount`. The server (executor, `importHelmContacts`, `resolveHelmQuestion`) and the device (the key-date sheet) do this through one pure `applyToKeyDateIndex(index, change)` with its server copy under `check:server-copies`. A transaction needs a connection, so adding or changing a date by hand offline says "Needs a connection to save" and keeps the sheet open (a turn said offline is held as any turn is, and the server writes it). If the index and the documents ever disagree (the who's `yearlyDateCount` summed differs from `entryCount`), the device rebuilds it from `keyDates where shape == 'yearly'` in one transaction and sets `rebuiltAt`.
- **Size and cost of the index.** An entry is about 75 bytes as JSON (a 36-character key-date id, the kind, the date parts, rarely a label), plus about 40 bytes per who for its id. The design load is about 4,000 dates across 2,000 who: about 380 KB plaintext, about 510 KB once sealed and base64'd, about half of Firestore's 1 MiB document limit. Opening it on a mid-range phone means base64 decoding, one AES-GCM decrypt and one `JSON.parse` of about 380 KB: estimated at 10 to 20 ms, or 40 to 80 ms at 4× CPU slowdown. The `@noble/ciphers` fallback on plain HTTP adds about 10 ms. It is opened once per change through the sealed reader (memoized, so an unchanged snapshot is never reopened) and held in memory for the session. A listener keeps it current; each change downloads the whole document again on the person's other open devices (about 0.5 MB), which is acceptable for something edited a few times a week. The scale seed (issue 64) measures it, with a 150 ms budget at 4× CPU.
- **The cap**: one index holds at most **6,000 entries** (about 760 KB sealed, under the limit with room to spare). The write that would pass it instead splits the index into twelve month documents (`meta/keyDateIndex-01` … `-12`, by the date's month), moves every entry in one transaction and deletes the single document; readers look for the single one first, then the twelve. Twelve documents hold up to 72,000 entries, beyond the 40,000 that 2,000 who at 20 each could ever reach.
- **Caps**: 2,000 who and 20,000 key dates per person (`HELM_CAPS`), the index's 6,000 entries before it splits; per who, 20 dates that come back and 500 moments, checked against the who's `yearlyDateCount` and `momentCount` inside the write's transaction, which updates them in the same batch.

Links between who records (Dana works at Sweet Layer Bakery; Miso is Mum's cat) are **[Next]**: `linkedWho: Record<whoId, { label }>` as a two-map, added without migration. In the MVP a relation is the sealed `relation` text.

### `Fact` (facts, preferences, favorites, identity) [MVP]

A fact is always about at least one who, place, project or synced record. Round 6 adds its `kind`.

```ts
type FactStatus = 'confirmed' | 'inferred' | 'superseded';
type FactKind = 'world' | 'preference' | 'favorite' | 'identity'; // round 6 (PRODUCT.md's names)

interface Fact {
  kind: FactKind;                      // round 6: 'world' is every round-5 fact (a thing true about a who, place or project)
  status: FactStatus;
  stated: 'personSaid' | 'nomosInferred' | 'personCorrected';
  sourceCaptureId: string | null; sourceExecutionId: string | null;
  sourceEventRef: string | null;       // [Next]
  sourceConnection: { connectorId: string; accountId: string; quoteId: string } | null;
  aboutField: 'startAt' | 'endAt' | 'place' | null;
  whoIds: string[]; placeIds: string[]; projectIds: string[]; syncedIds: string[]; // whoIds: round 6, was personIds
  subjectIds: string[];                // union of the four (never empty)
  occurredOn: number | null;           // round 6: date-only, when what it says happened ("moved to Lisbon in 2019"); feeds life events later
  keptOverSource: { syncedId: string; contentHash: string } | null;
  supersedesId: string | null; supersededById: string | null; supersededAt: number | null;
  disputedWithId: string | null;
  createdAt: number; confirmedAt: number | null; lastEditedAt: number | null;
  sealed: Sealed;                      // FactSealed
}
interface FactSealed {
  statement: string;                   // ≤500 ("Prefers Shell stations")
  quote: string | null;                // verbatim from the capture, ≤280
  topic: string | null;                // round 6: every kind may carry one ("gas station", "movies", "diet"), ≤40, matched to the person's existing topics of this kind
  value: string | null;                // round 6: the preferred or favorite thing ("Shell", "Arrival"), ≤80
}
```

Provenance is set by code, not by the prompt (round 5, unchanged): a `remember` is `confirmed` / `personSaid` only when its `quote` is a verbatim substring of the capture text and the model marked it stated; otherwise `inferred`. A `remember` with no subject that resolves is a note. Contradictions keep both with `disputedWithId` and a `whichIsTrue` question. Correct writes a new fact and supersedes the old one in one transaction; Forget deletes with snapshot Undo. One noted fact from a live lookup (round 5) stays.

**Kinds** (round 6): `preference` ("I always go to Shell for gas": topic "gas station", value "Shell"), `favorite` ("my favorite movie is Arrival"), `identity` ("I'm vegan", "Dana is allergic to nuts"). A preference about the person is about their self who. Topics are free text, matched by `createOptionMatcher` against the topics already used by facts of that kind so "gas stations" files under "gas station"; they are not Knowledge topics. Two preferences on one topic and subject with different values are a contradiction like any other ("Shell or Costco for gas?"). An identity fact the assistant inferred never shows as confirmed and is never spoken back as certain ("You told me you're vegan" only when confirmed). **Sensitive facts** (health, religion, sexuality, politics, money troubles: a fixed list of categories in `nomos/sensitive.ts`, judged by the model as a `sensitive: true` flag on the `remember` command) are kept only when the person stated them about themself (`stated: 'personSaid'`, subject = the self who); one said about someone else, or inferred, is dropped by code and the turn's summary says nothing was kept about it (PRODUCT.md, round 6). No face recognition: a photo is never matched to a who by its pixels, only by what the person or the turn's words say.

### `Note` and `Topic` (Knowledge: notes, and topics as living documents) [MVP]

Code keeps the names `notes` and `topics`; copy says **Knowledge** for the place, "note" for a piece of knowledge and "topic" for a document the assistant keeps. A **note** is one piece: something typed, said ("remember that…"), saved from an answer (general knowledge included) or brought in from a file. It may feed several topics or none ("Loose notes"). A **topic** is a living document: a sealed, formatted Markdown body the assistant writes from the notes filed under it, every section citing its sources, versioned with Undo. Topics nest: an optional parent, three levels at most (Car care › Washing, Fragrance). Round 6's `format: 'doc'`, "Make this a doc" and note versions are gone (never built, so nothing is deprecated).

```ts
type NoteSource = 'typed' | 'capture' | 'savedAnswer' | 'importedFile' | 'assistantDraft'; // assistantDraft: [Next]

interface Note {
  topicIds: string[];                  // 0–10; [] = a loose note
  source: NoteSource;
  isFromGeneralAnswer: boolean; checkedAt: number | null; hasHealthCaution: boolean;
  sourceCaptureId: string | null;      // what the person said, and when (the capture's createdAt)
  sourceMediaId: string | null;        // the file it came from
  projectIds: string[];
  createdBy: 'person' | 'nomos'; executionId: string | null;
  createdAt: number; lastEditedAt: number | null;
  sealed: Sealed;                      // { title (≤80), body (≤20,000; plain text with links, or Markdown from a file) }
}

interface Topic {
  parentId: string | null;             // round 6d: null at the top
  depth: 1 | 2 | 3;                    // set by code from the parent on every move; a move that would put any descendant past 3 is refused
  projectIds: string[];                // "Wedding plan" on Wedding
  version: number;                     // equals the latest versions/{n}; 0 until the first document is written
  docState: 'empty' | 'current' | 'behind' | 'writing' | 'failed'; // behind: notes filed since the last write
  pendingNoteIds: string[];            // notes filed or changed since the last write, oldest first; ≤50
  writeClaim: { claimId: string; at: number } | null; // one write at a time (90 s lease)
  overviewOf: Record<string, number>;  // parents only: child topic id → the child version the overview was written from
  createdBy: 'person' | 'nomos'; executionId: string | null;
  createdAt: number; lastEditedAt: number | null; lastWrittenAt: number | null;
  sealed: Sealed;                      // TopicSealed
}
interface TopicSealed {
  name: string; emoji: string | null;  // name ≤40
  overview: string | null;             // parents only: ≤1,200 characters of Markdown above the document; the child links below it are drawn by code
  sections: TopicSection[];            // the document, in order; ≤60
}
interface TopicSection {
  id: string;                          // generateUuid; stable across versions, so a source tap and Undo find it
  heading: string | null;              // ≤80; the first section may have none
  level: 1 | 2 | 3;
  markdown: string;                    // ≤4,000; the whole document ≤30,000
  writtenBy: 'nomos' | 'person';       // a section the person wrote or edited by hand is theirs: the assistant never rewrites or removes it unless asked
  sources: TopicSource[];              // ≤20: the source marks a tap on the section shows
}
type TopicSource =                     // round 6d: notes ↔ topics is many-to-many; each mark points at what the words came from
  | { kind: 'note'; noteId: string }                        // a note typed or saved
  | { kind: 'message'; captureId: string; at: number }      // what the person said, and when
  | { kind: 'file'; mediaId: string; noteId: string | null } // a file brought in
  | { kind: 'general'; noteId: string }                     // general knowledge the person saved (labelled as such)
  | { kind: 'person'; at: number };                         // typed into the document by hand

interface TopicVersion {               // topics/{id}/versions/{n}
  version: number;
  restoredFromVersion: number | null;
  createdBy: 'person' | 'nomos';
  reason: 'firstWritten' | 'addedFromSource' | 'personEdit' | 'revisedOnRequest' | 'moved' | 'grouped' | 'rearranged'
        | 'imported' | 'restored';   // History's typed rows (product, round 6d)
  noteIds: string[];                   // the notes this version brought in or re-read (an edited note)
  sourceCaptureId: string | null;      // the turn that asked for it (revisedOnRequest keeps its quote in the sealed summary)
  executionId: string | null;
  createdAt: number;
  sealed: Sealed;                      // { sections, changeSummary (≤200: what changed, in words), requestQuote | null, parentName | null }
}
```

A note's hand edits make no version; each topic document change does, and the overview is not versioned (it is regenerated from the children). Caps: 1,000 notes, 100 topics, 20 subtopics per topic, 3 levels, 10 topics per note, 20,000 characters per note, a topic document of 30,000 characters in at most 60 sections of 4,000, 200 versions per topic (the oldest beyond that are deleted, never the first). Section 24 has the flows.

### `Procedure`, `ProcedureVersion`, `ProcedureRun` [MVP]

Replace round 5's checklist `Artifact`. Briefings, research and other drafted documents (round 5's other artifact types) become topic documents the assistant drafts (**[Next]**, `source: 'assistantDraft'`), so the `artifacts` collection is not built.

```ts
interface Procedure {
  stepState: Record<string, { order: number; groupId: string | null }>; // readable order
  groupOrder: string[];                // ungrouped steps first (one pure helper orders every surface)
  projectIds: string[];                // a work procedure filed under a project ("Starting a new initiative")
  version: number;
  runCount: number; lastRunAt: number | null;
  createdBy: 'person' | 'nomos'; executionId: string | null;
  createdAt: number; lastEditedAt: number | null; archivedAt: number | null;
  sealed: Sealed;                      // ProcedureSealed
}
interface ProcedureSealed {
  title: string;                       // "Packing for a trip"
  steps: Record<string, { text: string; detail: string | null }>; // same keys as stepState; text ≤200, detail ≤500
  groups: Record<string, { name: string }>;
  sources: SourceRef[];                // notes or topics it was drafted from
}
interface ProcedureVersion {           // procedures/{id}/versions/{n}; like NoteVersion
  version: number; restoredFromVersion: number | null; createdBy: 'person' | 'nomos';
  reason: 'created' | 'editedByHand' | 'revisedByAsking' | 'restored' | 'fromRun';
  sourceCaptureId: string | null; executionId: string | null; createdAt: number;
  sealed: Sealed;                      // { title, steps, groups, changeSummary }
}

type RunAttachment =
  | { kind: 'project'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'synced'; id: string }     // a Waypoint trip or a calendar or app event
  | null;

interface ProcedureRun {
  procedureId: string;
  procedureVersion: number;            // the version it started from
  attachedTo: RunAttachment;
  dueOn: number | null;                // date-only: the trip's or event's first day, else null
  stepState: Record<string, { order: number; groupId: string | null; doneAt: number | null; isExtra: boolean }>;
  groupOrder: string[];
  startedAt: number; finishedAt: number | null;
  createdBy: 'person' | 'nomos'; executionId: string | null; lastEditedAt: number | null;
  sealed: Sealed;                      // { title, steps: Record<id, { text }>, groups, attachedLabel ("Lisbon trip, May 3", kept if the trip goes) }
}
```

A run copies the procedure's steps when it starts, so editing the procedure never changes a run in progress or a past one. A tick is `stepState.<id>.doneAt` alone (no version, offline-friendly). A step added "just this time" is `isExtra` on the run; "Add it to the procedure too" makes a new procedure version (`reason: 'fromRun'`). Section 25 has the flows.

### `Media` [MVP]

```ts
type MediaKind = 'photo' | 'pdf' | 'voiceNote' | 'markdown';   // [Next] 'video'
type MediaStatus = 'uploading' | 'received' | 'kept' | 'discarded';
type MediaRole = 'attachment' | 'photo';                       // photo: a who's or place's picture, picked by hand or kept from a turn

interface Media {
  kind: MediaKind;
  role: MediaRole;
  status: MediaStatus;
  mimeType: string;                    // of the original, before sealing ("image/jpeg", "application/pdf", "audio/webm", "text/markdown")
  byteSize: number;                    // sealed size
  width: number | null; height: number | null; durationMs: number | null; pageCount: number | null;
  hasThumb: boolean;
  attachedTo: RecordRef[];             // the records it shows on; [] while only in the conversation
  sourceCaptureId: string | null;
  executionId: string | null;
  decidedBy: 'nomos' | 'person' | null;
  takenAt: number | null;              // a photo's own date when the device can read it; feeds the life timeline later
  createdAt: number; decidedAt: number | null;
  deleteAfter: number | null;          // discarded: decidedAt + 24 h; uploading: createdAt + 24 h
  sealed: Sealed;                      // MediaSealed
}
interface MediaSealed {
  fileName: string | null;             // ≤120
  caption: string | null;              // the assistant's one line of what it is (≤200): "Receipt from Sweet Layer, $1,800"
  text: string | null;                 // Markdown text (≤20,000), a PDF's text layer (≤30,000), or a voice note's transcript (kept even when the audio is let go)
  bytesNonce: string; thumbNonce: string | null; // nonces for the sealed Storage objects
  keyId: string;                       // the data key that sealed the bytes
}
```

A voice note's transcript becomes its capture's `text`, so it outlives the audio; the audio itself is `discarded` by code (never by the model) unless the person taps Keep the recording (PRODUCT.md light call, round 6).

Bytes are sealed on the device with `encryptBytes` (`@lib/security`, Runway's receipt path), so Storage only ever holds opaque bytes. Section 23 has the flows, caps and deletion.

### `StyleProfile` [MVP]

```ts
type StyleScope = 'general' | 'occasion' | 'audience';

interface StyleProfile {
  scope: StyleScope;
  audienceWhoId: string | null;        // audience: the who it is about (texts to Dana); never made from mail alone
  learnedFrom: ('helmText' | 'sentMail')[];
  sampleCount: number;                 // how many pieces of writing it rests on
  personEditedAt: number | null;
  createdAt: number; lastEditedAt: number | null;
  sealed: Sealed;                      // StyleSealed
}
interface StyleSealed {
  label: string;                       // "General", "Work email", "Texts to Dana" (≤40)
  traits: Record<string, { text: string; isPersonSet: boolean; exampleCount: number }>; // ≤12, ≤120 chars: "Short sentences", "Signs off 'Cheers,'"; exampleCount: how many pieces of writing showed it (0 when the person wrote it)
  avoid: string[];                     // ≤6, ≤80 chars: "No exclamation marks"
}
```

No sample of the person's writing is stored: only traits written as descriptions, each ≤120 characters, and a sign-off of at most 30 characters may be quoted. Section 26 has the learner.

### `Execution` (Activity) [MVP]

As round 5, with `HelmCollection` now `'captures' | 'tasks' | 'projects' | 'who' | 'keyDates' | 'places' | 'facts' | 'notes' | 'topics' | 'procedures' | 'procedureRuns' | 'media' | 'style' | 'planDays'`.

```ts
type ExecutionState = 'proposed' | 'succeeded' | 'failed' | 'rejected' | 'executing' | 'verificationRequired';
type ActionCategory = 'organize' | 'remember' | 'plan' | 'draft' | 'answer' | 'undo' | 'outbound'; // outbound: [Next]

interface Execution {
  captureId: string | null; actor: 'nomos' | 'person'; category: ActionCategory;
  autonomyLevel: AutonomyLevel; state: ExecutionState;
  effectRefs: { op: 'create' | 'update' | 'delete'; collection: HelmCollection; docId: string }[]; // capped 40; 'delete' only in an undo's own execution
  undoesExecutionId: string | null; undoneByExecutionId: string | null;
  questionRef: { captureId: string; questionId: string } | null; // round 6c: the question this answer's effect came from
  errorCode: string | null; createdAt: number; decidedAt: number | null; finishedAt: number | null;
  sealed: Sealed;                      // { summary, commands, effects: { written, previous }[], undoReport }
}
```

`written` and `previous` hold plain values keyed by field path (`sealed.<field>` for sealed ones). Every task effect (create, update, complete) carries `sealed.title` with the task's title at that moment, so a result row can name its task; Undo compares the opened current value with what was written. A topic document's or procedure's change is an `update` whose previous value is the version number; Undo restores that version as a new one (section 24). A kept medium's effect is its `status` and `attachedTo`; Undo sets it back to `discarded` with `deleteAfter`.

### `PlanDay` [MVP]

```ts
interface PlanDay {                    // id = "YYYY-MM-DD" in profile.timeZone
  date: number;                        // date-only, UTC midnight
  slots: Record<string, PlanSlot>;     // readable: Keep / Another time / Not today stay dotted-path writes
  isRestDay: boolean;
  restDayOverriddenAt: number | null;  // "Plan my day anyway"
  generatedAt: number | null;
  calendarReadAt: number | null;      // round 5: the Calendar category's lastOkAt the plan was made from
  sealed: Sealed;                      // PlanDaySealed
}
interface PlanSlot {
  taskId: string;
  startAt: number | null;              // instant; null = "Any time today" (no calendar)
  endAt: number | null;
  status: 'suggested' | 'kept' | 'notToday';
  source: 'nomos' | 'person';
  decidedAt: number | null;
}
interface PlanDaySealed {
  reasons: Record<string, string>;     // slot id → rule-built chip ("20 min · fits before the tasting")
  calendarSnapshot: { eventRef: string; title: string; startAt: number; endAt: number; isAllDay: boolean }[];
}
```

The snapshot is rewritten whenever that day's plan is generated or re-run and whenever Today shows the day with a newer calendar read, and never once the day is past. Done-ness is not stored on a slot: a past day shows a task done when its `completedAt` falls inside that day.

### `SyncedRecord` and server-only documents [MVP]

```ts
interface SyncedRecord {               // synced/{syncedId}: client reads; only the platform's Helm sink writes (section 19)
  connectorId: string;                 // 'app:pinch', 'google:calendar'
  accountId: string;                   // 'site' for a site app; a Google account's id (section 19)
  grantId: string;
  category: string;                    // the adapter's category id ('plannedMeals')
  kind: SharedKind;                    // 'event' | 'task' | 'place' | 'project' | 'person' | 'knowledge' | 'trip' | 'pet' | 'moneySummary' | 'countSummary'
  sourceRef: string;                   // the source's own id, opaque; syncedId = hash(grantId, category, sourceRef)
  startAt: number | null;              // events: instant; date-only values are UTC midnight with isAllDay
  endAt: number | null;
  isAllDay: boolean;
  dueAt: number | null;                // tasks (date-only, UTC midnight)
  calendarKey: string | null;          // calendar events: "{accountId}/{calendarId}", for shifts and busy
  isBusy: boolean | null;              // calendar events: declined dropped, tentative busy
  sourceUpdatedAt: number | null;      // the source's own change time when it has one
  contentHash: string;                 // HMAC under a subkey of the person's data key: skip unchanged writes without opening
  syncedAt: number;                    // when this copy was last confirmed by a sync
  transformVersion: number;            // the adapter's version when it wrote this shape
  connectionEndedAt: number | null;    // set when the grant ends and the copy is kept ("no longer updated")
  deleteAfter: number | null;          // set for a kept copy: connectionEndedAt + 90 days; null while connected
  sealed: Sealed;                      // { title, subtitle, detail (≤500), placeLabel, amountCents, currency, deepLink, extra }
}
```

`SharedKind` and each kind's sealed fields are the platform contract's (section 19), not Helm's; Helm's type re-exports them. A record sealed by an older `transformVersion` is rewritten at its next sync, never migrated.

```ts
interface DropBoxKeyDoc {              // server/{uid}/keys/dropBox
  publicJwk: JsonWebKey;               // P-256 ECDH public key, handed to the device
  wrappedPrivateKey: string; nonce: string; masterKeyId: string;
  createdAt: number;
}
interface AiUsageDoc {                 // server/{uid}/aiUsage/{dayKey}
  full: { day: number; recent: number[] };   // the full (Sonnet-class) route: calls today, and the start times inside the last 10 minutes (≤20)
  quick: { day: number; recent: number[] };  // round 6: the quick route, counted apart (issue 11)
}                                      // the day key is the UTC day; spend lives in aiBudget/{dayKey}.hundredthsOfCent
interface VoiceUsageDoc {              // round 6: voiceUsage/{uid}/days/{dayKey}, site level, Admin only (section 20)
  appId: string;                       // the app the last charge came from; per-app split is a later field
  listenMs: number;                    // cloud listening, as reported at stream close, capped per mint
  mints: number;                       // listening tokens minted today
  spokenChars: number;                 // cloud speech, after toSpokenText
  transcribeMs: number;                // voice notes
  costMicros: number;                  // worst-case estimate the budget is checked against
}
interface VoiceBudgetDoc {             // round 6: voiceBudget/{dayKey}, site level, Admin only
  costMicros: number; isOver: boolean;
}
```

## 3. Encryption

The pattern is Runway's (`src/apps/runway/TECHNICAL.md` "Sealed documents", "The key", "Master secret management"; code in `functions/src/apps/runway/planKey.ts` and `getRunwayKey.ts`), reused rather than rebuilt.

### Readable versus sealed

| Readable (queries, rules, ordering, the planner's arithmetic) | Sealed (anything the person would recognise) |
|---|---|
| ids and opaque id lists (`projectId`, `whoIds`, `subjectIds`, `topicIds`, `waitsOnTaskIds`, `effectRefs`) | capture text, its reading, answers, question options and held commands |
| statuses and enums (`status`, `importance`, `energy`, `context`, `stated`, `source`, `category`, `state`, `heldReason`) | task titles and notes; project names, emoji, objectives, milestone titles |
| flags (`isUrgent`, `isHome`, `isRestDay`, `isFromGeneralAnswer`, `hasAnswer`, `isSelf`) | who records' names, aliases, relations, phones, emails, notes; places' names and addresses |
| timestamps and date-only values (`createdAt`, `due`, `notUntil`, milestone dates, slot times) | fact statements and quotes; note titles and bodies; topic names |
| map state (`stepState`, `milestoneState`, `whoRoles`, `slots`, `questionState`) | step texts, procedure titles and groups, topic documents and overviews, versions' change summaries, event snapshots |
| round 6: kinds, tiers, media kind, status, size, dimensions, page count, duration, the route and voice providers | round 6: media file names, captions and extracted text; media bytes (sealed in Storage); spoken lines; style traits; fact topics and values |
| profile settings, name and tone; a synced record's connector, account, category, kind, times and freshness | execution summaries, commands, written/previous values, undo reports; slot reasons; the calendar snapshot; a synced record's words and deep link; answer quotes and what was searched |

 Key dates add no readable date: Today and Coming up read the one sealed yearly index (section 2 "KeyDate"), never a query on a day. What readable fields still say: when the person captures, how many tasks, facts and notes they have, their due dates and slot times, which records link to which, which browsers they trust. Rules protect them; sealing doesn't.

### The key

- **Data key per person.** Callable `getHelmKey()` (`request.auth` required, App Check enforced): in one transaction reads `apps/helm/server/{uid}/keys/data`; absent, creates a random 256-bit key and wraps it (AES-256-GCM, the uid as authenticated data) under the keyring's `current` id, and creates the drop-box pair (below); present, unwraps it with the id the document names and re-wraps under `current` when that differs. An unwrap failure answers `failed-precondition` ("Helm can't open your things right now") and never writes: nothing replaces a stored key. Returns `{ appId: 'helm', keyId, keyVersion, key, dropBoxKey }`, the shape `createTrustedKeyStore` expects (section 4); never stored by the server or logged. Whether this browser is still trusted is the shared `checkInTrustedBrowser`'s answer, not the key call's.
- **Client.** `queries/helmKeyQueries.ts` (`helmKeyQueryOptions(uid)`: `staleTime: Infinity`, `retry: false`, no `meta.persist`), cleared on user switch. The query is the shared `createTrustedKeyStore` over `getHelmKey`: server first, a trusted browser's kept copy only when offline (section 4). `src/apps/helm/security.ts` is the one place that seals and opens: `sealJson` / `openJson` (validates `v`, throws `UnsupportedSealedVersion` for a newer one) over `encryptValue` / `decryptValue`, with the plain-HTTP `@noble/ciphers` fallback `@lib/security` already has. `openJson` also refuses a payload whose `keyId` isn't the current key's, so a document sealed by another device's stale key reads as "Couldn't open this", never as garbage.
- **Server.** `functions/src/apps/helm/helmKey.ts` holds `unwrapHelmKey(uid)`, `sealForHelm(key, fields)` and `openForHelm(key, sealed)`, the only Helm code that handles a raw key. The callables unwrap once per request and drop the key when it ends.
- **The general parts move to `functions/src/appKeys/`** in the issue that adds `getHelmKey`: keyring parsing (fails closed), `gcmEncrypt`/`gcmDecrypt`, `wrapDataKey`/`unwrapDataKey`, `sealWithKey`/`openWithKey`, the canary (`makeKeyCheck`, `keyCheckOpens`), `loadKeyring(secret)` with the emulator keyring and `deriveSubkey(keyring, masterKeyId, label)` (HKDF-SHA256). No app words; Runway's `planKey.ts` keeps only its path and key-id prefix and imports the rest, proven unchanged by `check:runway-keys`.
- **OAuth tokens are not Helm's**: the platform seals them under its own keyring (section 19, "Tokens"), so a second reader app never needs Helm's keys and Helm's keyring never holds a Google token.
- **Seeds and emulator**: the development keyring when `isRunningInEmulator()` and the secret is empty, never in production; seeds seal fixtures with a key derived per uid and write the matching wrapped key and drop-box pair.

### The drop box (captures made with no key)

A capture made on an untrusted device opened with no connection can't be sealed with the data key, which isn't there. Round 2 kept it as plain text; the form-draft rule for encrypting apps (security-privacy "One device, several accounts") rules that out. Instead:

- Each person has a P-256 ECDH key pair. `getHelmKey` creates it with the data key, wraps the private key under the keyring (`server/{uid}/keys/dropBox`) and returns the public JWK, which the device keeps as the `helmDropBoxKey` device secret on every online open.
- **Sealing offline** (`utils/dropBox.ts`, WebCrypto only): an ephemeral ECDH pair, HKDF-SHA256 over the shared secret with the uid as info, AES-256-GCM over `{ captureId, text, reading, inputMode, createdAt }`. The envelope `{ id, epk, nonce, ciphertext, createdAt }` goes into the `helmOutbox` device secret. The device can't open it again; the capture sheet shows the words only for the session it was typed in, and the Inbox shows "1 thing saved on this device" with its time.
- **Flushing** (`useCaptureOutbox`, once online): callable `importHelmOutbox({ items })` (≤20 per call, ≤12 KB each) opens each envelope with the private key, checks the shape and caps, seals it with the data key and creates `captures/{captureId}` as `received` with `arrivedVia: 'dropBox'` only if absent (a retry is a no-op), and returns the ids it holds. The device removes those envelopes, then the sweep sorts them like any capture.
- **Where it can't work:** a device that has never opened Helm online has no public key (it couldn't have signed in offline either); plain-HTTP pages and private windows have no `crypto.subtle` or can't keep a device secret (`canKeepDeviceSecrets`) (P-256 isn't in `@noble/ciphers`), so there the sheet says Helm needs a connection to keep it, and the words stay in the field until the tab closes.

### How listeners open what they read

`useHelmSync` starts the data listeners only once the key is ready. Each `startXListener(reader, onChange)` opens every snapshot's `sealed` before it reaches the slice, through `createSealedReader(encryption)` (memoized by nonce and ciphertext, so a snapshot that changed one document opens one), and tags each snapshot with a sequence number so a slower decrypt never overwrites a newer one. A document that won't open is kept with `isUnreadable: true` and shows "Couldn't open this" in its row, never dropped. Decrypted values live in Redux memory only; Firestore's offline cache holds ciphertext. `createSealedReader` moves from Runway's `security.ts` to `@lib/security` in the same issue, with Runway's import moved.

### Media bytes

Photos, PDFs, voice notes and Markdown files are sealed on the device with `encryptBytes` under the data key before upload (Runway's receipt photos, round 6 of Runway), each with its own nonce kept in the media document's sealed payload; the thumbnail is sealed apart. Storage holds only opaque bytes under an owner-only rule. The server opens them in memory for the assistant, a transcript or a Contacts photo and never writes them back unsealed. An untrusted browser with no connection can't attach (no key): the composer says so and keeps the words.

### The keyring

One Functions secret, `HELM_MASTER_KEYS` (logged: Helm's own, not Runway's), with Runway's keyring shape (`{ "current": "m1", "keys": { "m1": "<64 hex>" } }`) and Runway's whole contract: ids only added, lazy re-wrap, fails closed, delayed version destruction, least privilege, no expiry, escrow outside Google Cloud, a recovery drill before the first other person, and the runbook in `functions/README.md`. `verifyHelmKeys` (scheduled daily) opens each id's canary at `apps/helm/keyChecks/{id}` and logs `helm.keys.ok` or `helm.keys.failed`; the same three alert policies watch it. Runway's `scripts/runway/publishKeyring.ts` and `drillKeyring.ts` become `scripts/appKeys/*` taking `--app runway|helm`. `npm run helm:keyring` creates the first keyring, sets the destruction delay, writes the canary through the emulator-safe path and prints the escrow step.

**Limits.** The server holds the key, so Helm's functions, and anyone holding both the keyring and database access, can read a person's Helm. That is what lets the assistant work on the server; it is not end-to-end. Losing the keyring loses every Helm. A trusted browser adds one more place the key can be used (section 4).

## 4. Trust this browser

The owner's choice (round 2): untrusted by default (key in memory, captures still work offline through the drop box); a person can mark this browser trusted so Helm opens and reads there with no connection. Since round 4 the site has made this a shared standard (PR #819, Runway's "Trust this browser"; `security-privacy.md` "Data sealed with a server-held key offers Trust this browser"), so Helm builds on it and builds none of its own trust machinery. Round 4's `deviceKeyStore`, `deviceLabel`, `TrustDeviceSheet`, `TrustedDevicesList`, `deviceStores`, `trustHelmDevice` and the `devices/` collection are gone from the plan.

### What Helm uses

- **The key query** is `createTrustedKeyStore` (`@lib/security/trustedKey`) over `getHelmKey`: the server first; the kept copy only when the server can't be reached, sealed under a non-extractable key by `@lib/security` device secrets; removed when the switch goes off, on sign-out or a session ending, when the server refuses the key or returns a different one, when a record no longer opens, and after 30 days without the server confirming it (`TRUSTED_KEY_MAX_UNCHECKED_MS`). `isKeptKey` gates creation: a kept key never creates a profile, a data key or a drop-box pair, and opens only what the Firestore cache holds.
- **The switch and the list** are `TrustBrowserRow` (`@/components/TrustBrowserRow`) in Settings → Devices, with `appName` "Helm": off by default, hidden where the browser can't keep a secret (`canKeepDeviceSecrets`: plain HTTP, private windows), worded as "browser", never "device", and listing the person's other trusted browsers (`trustedBrowsers/{uid}/browsers`, the site's owner-only list) with Remove and Remove all. A removed browser forgets its copy the next time it reaches the server (`checkInTrustedBrowser`); until then, or until its 30 days run out, it still opens offline, and the copy says so.
- **Delete all** calls `store.forget`; sign-out is already covered by the site (`forgetDeviceSecretsFor`, `forgetThisBrowserFor`).
- **What Helm adds on top:** the "As of 8:30 AM" line while offline (from the kept key's last check), the drop box for untrusted browsers (section 3), and **Sign out everywhere** (below).

### What a trusted browser can do offline

Read everything the cache holds (what was loaded while online: the eager sets in section 15, synced copies included, "Updated 9:30 AM"); capture (sealed with the data key and queued by Firestore, "Saved as written"); tick tasks and checklist items, Keep / Not today, edit records by hand (queued writes); search what is loaded. It can't: anything the assistant does, Undo (a transaction), connect, sync or disconnect a source, search mail, Drive or Runway's transactions, trust or remove browsers, Delete all. Each says it needs a connection.

### Sign out everywhere

Not part of the shared standard, and kept because the owner chose it for a lost phone (round 3). It is built shared: a site callable `signOutEverywhere` in `functions/src/auth/` (auth, App Check, online only) deletes every entry in `trustedBrowsers/{uid}/browsers` and calls `revokeRefreshTokens(uid)`; the calling browser then signs out. `TrustBrowserRow` gains an optional `onSignOutEverywhere` prop that adds "Lost a phone? Sign out everywhere" under the list of other browsers (Runway can switch it on later; nothing changes there now). Every other browser fails its next token refresh (within an hour) and is signed out, which removes its kept key; one that never comes online keeps what it has until its 30 days. Sessions are site-wide, so this signs the person out of every app on the site on every device, and its confirm says so. No re-key in the MVP (owner, round 3): "Change my key" is Beyond.

### Not carried over from round 4 (owner question)

Round 4 required a sign-in from the last five minutes before trusting and capped trusted devices at 5. The shared standard has neither, and its own rule is that a new safeguard joins the store, never one app. The plan follows the standard; adding either one would go into `createTrustedKeyStore` or `TrustBrowserRow` and reach Runway too.

## 5. The assistant on the server

### Flow of one capture

```
device: person types/speaks ──► reading (pure): @ # ^ ! tokens + date spans from parseNaturalDate(createdAt)
        │                         shown as chips before Send
        ▼
device: rankNotes(text, notes) → up to 8 note ids (section 7); screen context; sessionId, turnIndex (section 21)
device: attachments sealed and uploaded first (section 23); a voice turn's final transcript is the text (section 20)
device: seal { text, reading } → setDoc capture (status 'received'); offline it queues (or the drop box)
        a message sent while the session's last turn is still received or interpreting joins it instead
        (turnLeadId on the new message, arrayUnion on the lead's joinedCaptureIds, one batch; section 21)
        ▼ (online, once the write is acknowledged)
callable sortHelmCapture({ captureId, requestKey, noteIds, mode: 'full' | 'rest' })
  1. auth + App Check; rate limit and budget (transaction on aiUsage + aiBudget)
  2. claim (transaction): received/interpreting-with-expired-lease → interpreting, claimId
  3. unwrap key; read in parallel: capture and its joined messages (round 6d), profile, open tasks (≤150), projects, who (round 6),
     the session's last 6 turns, the screen's records, the turn's media (round 6),
     places, topics (names, tree, outlines; the focused topic's document whole), facts (≤40: subjectIds ∩ the reading's matches, then newest),
     the hinted notes by id (≤8), synced events for today and tomorrow and synced
     tasks due this week (≤40, from Firestore: no source is called), Helm's live grants
  4. decrypt; build the context package (short aliases, no document ids)
  5. createHelmMcpServer({ uid, key, grants, aliases, budget }) ⇄ InMemoryTransport ⇄ MCP client
     route (quick | full, round 6) → provider.runToolLoop(role 'quick' | 'interpret', system, context, tools,
                          terminal tool 'file_results')       ← ≤6 turns, ≤12 tool calls, 40 s
     an ordinary capture ends in one turn (the model calls file_results at once)
     a listener on the lead's joinedCaptureIds aborts the model stream when a message joins, and the call
     restarts once with every message (round 6d; section 21)
  6. the file_results input → normalizeNomosReply → match names → answer guards (section 6)
     → policy → plan the writes
  7. one transaction: re-read capture (claimId still ours; joinedCaptureIds unchanged since step 3, else back to 3
     once, and a message that joins after that becomes its own turn) and every doc an update touches;
     write sealed creates/updates, the Execution(s), the capture (sealed answer/questions, status)
  8. return { status, executionId, questionIds, planDayKey, hasAnswer, spoken }   (round 6: the line to say)
        ▼
device: listeners deliver the sealed records; the home surface draws the turn's result lines + Undo,
        the voice speaks `spoken` (section 20),
        an answer with its sources or its "Not from your records" part, or a question
```

### Helm's MCP server and the tool loop

- **Where.** `functions/src/apps/helm/mcp/server.ts` builds an `McpServer` (MCP TypeScript SDK) per call, with `{ uid, key, grants, aliases, budget }` held in a closure. No tool takes a uid, an id or a token: every path is built from the closure's uid, every record in or out is an alias, and a live read goes through the platform's live router (section 19), which opens the token inside `functions/src/connections/` and returns an allowlisted shape. The server never holds a token and can't reach another person's tree.
- **Tools** (read only; each result capped and aliased): `search_who` (round 6: people, pets, organizations), `search_memory` (facts beyond the 40 sent), `search_knowledge` (notes by the device's ranking plus a title match), `search_tasks` (done and latent included), `search_projects`, `get_calendar` (synced events for a day range, ≤14 days), `search_synced` (any shared category Helm holds), `search_app_records` (a site app's live category, Runway's transactions in the MVP: payee text and a date range in, at most 20 rows out), `search_mail` / `read_mail`, `search_documents` / `read_document` (only when a live grant exists; each search result is an alias with sender or name, date and a ≤300-character snippet; a read returns at most 4,000 characters of text), `get_doc` and `search_procedures` (round 6), `list_connections`, `connection_status`, and the terminal `file_results`, whose input is the command union (section "Commands and validation"). The tool list offered is filtered to the person's live grants, so a person with no Gmail sees no mail tools.
- **Why the tool loop, not the Messages API's MCP connector.** The connector calls a public MCP URL with a bearer token Anthropic holds; that would put Helm's tools on the internet and hand a long-lived credential to a third party in the MVP. The tool loop keeps the server in process: Anthropic sees the tool definitions and results, never an endpoint or a credential. The same server is exposed over HTTP with MCP's OAuth only in Beyond ("Helm in Claude.ai").
- **Ending.** `tool_choice` is `auto` (the Sonnet-class model refuses a forced tool with a 400), with `file_results` marked `strict` and the system prompt asking for it last; a turn that ends in words, or a limit reached, gets one appended ask for `file_results` with what it has, the ask counts as one of the `maxTurns` requests and runs only while time is left, each request's timeout is the smaller of 15 s and the time left before `maxMillis`, the SDK never retries (the worst case stays inside the 60 s function timeout), and usage is reported per turn so spend is recorded as it happens; a failure after that is a normal failed reading (section "Offline and failure"), as is a refusal (the request carries Anthropic's server-side fallback, so most refusals are answered by a fallback model first).
- **Whenever needed** (owner, round 5): mail, Drive and Runway's transactions tools are offered on every capture that reads as a question while the grant and category are live; every live call is recorded in the answer's `searched`, found or not, so the answer says "Looked in Gmail (you@gmail.com) just now".

### The context package

Built by `functions/src/apps/helm/nomos/buildContext.ts` (pure, tested with fixtures). Every record gets a short alias (`t12`, `p3`, `w7`, `pl2`, `f31`, `n4`, `tp2`, `e4`, `pr2`, `m1`) mapped back to its id on the server, so the model can't name a document that wasn't offered and ids never reach the provider. Contents: when it was said (`createdAt`) and the zone; the reading's tokens and date spans by id; open tasks (alias, title, due, project alias); projects (alias, name, milestones); who records and places (alias, kind, tier, name, aliases, relation; round 6); preference, favorite and identity facts about the self who (round 6); procedures (alias, title); the session's last 6 turns and the screen's records (section 21); the turn's media (below); topics (alias, name); facts (alias, statement, confirmed or inferred); notes (alias, title, body cut at 1,500 characters, topic aliases, "saved from a general answer" when so); calendar events for today and tomorrow (alias, title, start, end, all-day). Never sent: phones, emails, addresses, notes on people and places, event descriptions, attendees or locations. Caps: 150 tasks, 40 facts, 8 notes and 6,000 characters of notes, 200 who records (close and regular first, then the passing ones the reading names), 100 places, 40 procedures, 50 topics, 30 events, 4,000 characters of capture text; the caps are interpolated into the prompt.

### Commands and validation

- **Commands** (`nomos/commands.ts`, a discriminated union): `createTask`, `updateTask`, `completeTask`, `createProject`, `addMilestone`, `link`, `upsertWho` (round 6: kind, tier only as section 22 allows, project role), `setKeyDate` and `removeKeyDate` (round 6b, section 22), `upsertPlace`, `remember` (round 6: kind, topic, value, `sensitive`), `createNote` (round 6d: files to topics), `addToTopic` (add-only), `reviseTopic` (only when asked), `moveTopic` and `createParentTopic` (round 6d, the second only as a proposal), `createProcedure`, `reviseProcedure`, `startRun` (round 6; round 5's checklist commands are gone), `planIt` (names tasks; the device's planner places them), `setCurrentPlace` ("I'm home"), `ask` (round 6c: `kind: 'asked'` in any shape, see "Questions" below; `couldNotRead` / `whichDate` keep their fixed wording; match questions come from code), `answer` (section 6). The response schema is one flat object per command with a `kind` enum and every field required and nullable; `normalizeNomosReply` builds the union in the shape of `normalizeReceiptReading`: drops unknown kinds, cuts text at a word to its cap, resolves every alias to an id in the context, a `$new1` temp ref inside this reply, or a reading token or date span id. At most 20 commands, 40 effects. A reply with more sets `hasMore`; the executor files the first 20, records `sortedThrough` and adds a `moreToSort` question whose "Sort the rest" calls `sortHelmCapture` with `mode: 'rest'` (the context then lists what this capture already made, and the prompt says to skip it).
- **Dates come only from code.** The model may only attach a span by id (`dueSpanId: "date:12"`; a span's id is `<kind>:<start offset>`, such as `people:4`). A key date's span may resolve to a month and day with no year ("June 3" as a birthday is not this year's June 3), or for a moment to a month and year, a year or a decade ("in the 80s", read on the device in `captureReading.ts`), and `setKeyDate` takes its parts and a moment's precision only from that span; the executor computes `shape` and rewrites the yearly index in the same transaction (code, never the model). Date words the reading didn't resolve make the task undated plus a `whichDate` question.
- **Shorthand binds the model**: tokens arrive as fixed facts; the normalizer refuses a reply that drops or renames one. A leading `addressedAs` token is removed from the text before it reaches the prompt.
- **Notes and topics**. `createNote` carries `title` and `bodyQuote` (a verbatim span of the capture, so a note made from a capture holds the person's words) and `topicAliases`, which may name only topics in the context. The assistant files into a topic only when it is sure: one alias, or one clear `createOptionMatcher` match for a topic named in words or already used for this kind of note; when it could fit two or more topics it asks (a code-built `whichTopic` question, pick one or several); when none fits it is saved loose, and for a saved answer a `whichTopic` question with "New topic" follows (section 7). Filing marks each topic `behind` with the note in `pendingNoteIds`. Topic commands: `addToTopic` (add-only, below and section 24), `reviseTopic` (only when asked, section 24), `moveTopic { topicAlias, parentAlias }` (round 6d: under an existing parent, an automatic `organize` with Undo and a `moved` row in History) and `createParentTopic { name, childAliases }` (round 6d: never run on its own; it becomes a code-built `groupTopics` question, "Group Washing and Fragrance under Car care?", held until the person says yes, unless the turn itself asked for that grouping). Code refuses a cycle, a depth past 3 or more than 20 children. There is still no command that renames or deletes a topic, moves a note between topics, or edits or deletes a note: beyond adding, the assistant only moves a topic under an existing parent and rewords its own text. A `createNote` whose body equals a hinted note's body (`toComparable`) writes nothing and its line says "Already in your notes: {title}".
- **Two makers.** Code builds the questions that guard a write (Which Sam, Which is true now, couldNotRead, whichDate, moreToSort) with fixed wording from `constants.ts` and held commands. The model may ask a question of its own with `ask { kind: 'asked', shape, prompt, options[] (label, detail, recordAlias), allowsSomethingElse, recordKinds, dateMode, number (min, max, unit, isMoney, decimals), aboutAlias }` when it needs the person's choice to go on ("Which of these should go on Saturday's list?").
- **Validation** (`normalizeNomosReply`, code, not the model): the prompt and every label and detail are cut at a word (200 and 80 characters), deduplicated by `toComparable`; option counts are pickOne 2–6, pickSeveral 2–8 (more are cut to the cap; fewer than 2 refuses the question, logged `ask-invalid`); yesNo options, pickSeveral's "None of these" and pickRecord's closing "new" option ("Someone new", "New place", "New project") are added by code, never written by the model; a record alias resolves to an id in the context or the option is dropped (a pickRecord with none left still opens its search); a number's range must be finite and ordered, `|value| ≤ 1e9`, a unit ≤20 characters; `isMoney` answers in integer cents with `MoneyInput`. At most 5 `ask` per reply; the text is shown as plain text, never as Markdown or links.
- **On screen and aloud.** At most 3 questions show on a turn; the rest wait in Needs you with "2 more questions". In a spoken conversation they are asked one at a time: the prompt and up to 4 options read aloud through the reply's voice (more: "I've put the choices on screen"), the next asked once this one is answered or skipped. Every question has Skip, and nothing is ever answered by default: a skipped or unanswered question keeps `answeredAt: null` and waits in Needs you (skipped ones marked as skipped), and no held command runs.
- **Answering by voice.** In the follow-up window after a spoken question, the transcript goes first to `readSpokenAnswer(question, transcript)` in `@/lib/speech` (pure, no app words, English): yes and no, "skip", ordinals and counts ("the first two", "both", "all of them", "none"), option labels through `createOptionMatcher`, numbers in words, a date or time through `parseNaturalDate`, "something else: …" as the free answer, and a free answer taken as said. What it can't place goes to the quick model as an answer turn with the question beside it and is validated against the same shape. A misheard answer (no match, or a value out of range) is asked again once ("Sorry, which ones?"), then the question waits in Needs you.
- **An answer is a turn.** `resolveHelmQuestion({ captureId, questionId, answer })` checks the answer against the shape and the question in one transaction (refusing an answered one with `already-exists`; the sheet closes itself). A code-built question binds its held commands to the answer and runs them through the executor with no model call, as before. A model-written question writes a new turn in the same session (`answersQuestion` set; sealed text the answer in words, "Picked Dana and Sam"; `inputMode` how it was given) and sorts it on the quick route with the question in its context, so the effect is an ordinary execution with Undo whose `questionRef` names the question; Activity shows the question, the answer and what changed as one entry. Offline, a model-written question's answer is saved as a turn and sorted on return like any capture; a code-built one says answering needs a connection, and nothing is queued.
- **Limits.** At most 20 open model-written questions per person (code-built ones are not capped: each holds a write the person must settle); at the cap `ask` is refused and the reply says it in words instead. An answer turn counts on the quick route's limits like any turn. An option whose record was deleted before the answer is dropped; a question left with no options closes as "No longer needed".

### Provider abstraction

`functions/src/ai/` is general (no app words): `ModelProvider { generateStructured({ role, system, parts, schema, maxOutputTokens, timeoutMs }) → { json, usage }; runToolLoop({ role, system, messages, mcpClient, terminalTool, limits }) → { terminalInput, usage, toolCalls } }`; `providers/anthropic.ts` over `@anthropic-ai/sdk` (tool use, `tool_choice` auto with a strict terminal tool, prompt caching on the system block and the last tool, effort in `output_config`, adaptive thinking left at the model's default), reading the `ANTHROPIC_API_KEY` secret at run time; and `models.ts`, the one file that maps a role (`'interpret'`) to a model id and its price per million tokens. Domain code asks for a role, never a model. Another provider (Gemini again, Beyond) is a new file implementing both methods. Each request's timeout is the smaller of 15 s and the time left, a turn never starts with under 5 s left, and the SDK doesn't retry; each turn's cost goes to `aiBudget`, and `aiUsage` counts calls. Checked at issue 5 against the `claude-api` skill's model table (dated 2026-10-06): `interpret` is `claude-sonnet-5-5` at effort `low` ($2 per million input, $10 output, $0.20 cache reads, $2.50 cache writes), and the in-process loop stays (the connector reasoning above holds). Issue 5 builds only `runToolLoop` and the `interpret` role; `generateStructured` and the other roles arrive with their callers.

### Model routing

Two routes, picked on the server before any model call by `nomos/route.ts` (pure, fixture-tested):

- **Quick** (`quick` role, a Haiku-class model): a turn of at most 280 characters with no attachments, no focused topic or procedure, not reading as a question (no question mark, no question opener in the reading) and `mode: 'full'`. It is offered the write commands and the record searches but not mail, Drive, Runway's transactions or `reviseTopic`/`reviseProcedure`, plus one extra tool, `hand_over`, which ends the quick loop and restarts the same turn on the full route (once; a second hand-over is impossible). Most "add", "move", "done", "remember" turns end here in one short turn.
- **Full** (`interpret` role, the Sonnet-class model the owner chose in round 5): everything else, every hand-over, "Sort the rest" and a question resolved with held commands.
- Roles in `models.ts` (the only file with model ids): `interpret` and `topicWrite` (Sonnet-class), `quick`, `topicOverview` and `style` (Haiku-class). The capture records the route it took (`route`); the price table there prices each role (Haiku-class about $1 per million input and $5 per million output tokens, **unverified**, checked at build time).
- Routing never changes what code enforces: the same normalizer, policy, guards and transaction run on either route's `file_results`.

### The spoken reply

Only a spoken turn gets a spoken line (owner, round 6 second set); a typed turn gets the written reply only. "Mute" on home's dock or in the conversation over a page (round 6e) silences spoken lines for the sitting (the current session, device state only, never stored). The line is stored sealed as `spoken`:

- **Action-only turns**: code builds the line from the execution summary ("Got it. Call the florist, Friday." / "Done. Moved to Friday."), priority `ack`, spoken by the device voice (section 20).
- **Answers**: the model writes `answer.spoken` (≤280 characters, plain sentences, no lists, no Markdown; toned), priority `reply`, spoken by the cloud voice. A long answer's spoken part is a summary and the screen holds the rest; reading the whole thing aloud is "Read it all", priority `summary`.
- **Labels and cautions are code's**: a spoken general part is always introduced by "Not from your records" built by code (section 6), and a health answer's caution is a fixed short spoken line, never toned.
- **Questions** are spoken as code builds them ("Which Dana: your sister or Dana at work?") and answered by voice through the same option matcher as a tap.

### Media into the model

Each attachment (section 23) is opened on the server and goes in as: a photo, an image block at 1600 px; a PDF, its text layer up to 12,000 characters, or a document block when it has none; Markdown, plain text up to 12,000 characters inside the data delimiters (it is untrusted content like mail); a voice note, its transcript as the turn's text. `file_results` gains `media: { alias, decision: 'keep' | 'discard', caption, attachTo, asNote, asTopic }[]`; code keeps only what is attached or made a note or a topic, and a voice note's audio is never the model's decision. A turn with media always takes the full route.

### Sessions and the screen

Step 3 of the flow reads the session's last 6 turns (text and summaries) and every record the screen context names (focus whole, visible as titles, section 21); each gets an alias like any record, and the prompt says "this" is the focus.

### Name and tone

The profile's `assistantName` (validated on the device and again on the server against the same pattern, since it goes into a prompt) and `assistantTone` fill one fixed block of the system prompt: "You are {name}." and the tone's line from `TONE_PROMPT_LINES` (`composed`, `warm`, `brief`, `formal`). The block applies only to `answer.fromRecords` and `answer.general`, the text the person reads as the assistant speaking. The schema descriptions of fact statements, note titles, task titles and checklist items ask for neutral wording in the person's own terms (product: "a checklist item is written plainly in every tone"). Every stored sentence the app writes itself (summaries, question prompts, change summaries, undo reports, slot reasons) is a code template with no name and no tone; copy adds the current name at render. Any per-tone fixed line product keeps (a summary line above a result card, an empty Inbox) is a device template chosen at render from `TONE_LINES`, never stored. The tone sheet's samples are fixed strings in `constants.ts`, no AI call. Round 6: tone also shapes `answer.spoken`, never the voice that says it (section 20); the name is also the wake phrase "Hey {name}", read on the device by `readWakePhrase`, so renaming the assistant renames the wake word at once.

### Cost, latency and limits

- **Cost.** One model turn for most captures, two to four when a question reaches for tools; none per resolved code-built question; a model-written question's answer is one quick turn. A turn sends about 6,000–10,000 input tokens (the system prompt and tool definitions are cached with prompt caching) and 300–900 output. At `claude-sonnet-5-5`'s list prices ($2 per million input and $10 output, checked at issue 5; cached reads $0.20) a one-turn capture costs about 1 to 2 cents and a question that reads mail about 4 to 7 cents; the model tier is Sonnet-class (owner, round 5). Round 6: a quick-route turn sends about 4,000–6,000 tokens to the Haiku-class model, well under a cent (unverified price). Voice is not in this budget (section 20). Firestore adds about 400 reads ($0.0003).
- **Latency.** Warm: reads and decrypt 0.3–0.8 s, a model turn 2–5 s, a mail or Drive call 0.5–1.5 s, the transaction 0.2 s: 3–6 s for a capture, 6–15 s for a question that reads mail, 40 s at most; a cold start adds 2–4 s. The callable's timeout is 60 s. `minInstances: 0`; the capture is saved before the call, so the sheet shows "Reading…" and closing it loses nothing.
- **Per person** (round 6, accepted by the owner): the full route 20 calls per 10 minutes and 150 per day; the quick route 60 per 10 minutes and 400 per day (`AI_LIMITS` by route), counted apart in one transaction on `aiUsage/{dayKey}`; a hand-over counts once on each. Over either, the call answers `resource-exhausted` and the capture stays `received` with `heldReason: 'dailyLimit'`; the sweep tries again after the window. `maxInstances: 10`.
- **Project-wide**: `aiBudget/{dayKey}` adds each call's cost in hundredths of a cent from its token counts and the price table in `models.ts`, and stops all Helm AI calls past `AI_DAILY_BUDGET_CENTS` (1,000, $10 a day) (`heldReason: 'budgetReached'`, logged `helm.ai.budgetReached`). A monthly spend limit and alert in the Anthropic console is a step in that PR, spelled out click by click.

### Prompt injection

Capture text, record names, fact statements, note bodies, synced titles and every tool result (mail and documents above all: anyone can send the person an email) go into the prompt inside delimited data blocks, after a system prompt fixed in code that says they are data, never instructions. Containment does not rely on that: the reply is JSON against a schema; the normalizer drops anything that doesn't resolve to the context; no command can leave Helm, delete, or touch another person's tree (every path is built from the caller's uid); caps bound how much one reply can change; everything is undoable; answers render as plain text. No tool sends, writes outside Helm or fetches a URL, so a hostile email can't exfiltrate through a tool; tool results can't add tools or change the policy; a quote is copied by code from the tool result, never written by the model; and a result line that rests on mail says so ("from an email"). A note pasted from a hostile page or a hostile email can at worst steer an answer or an undoable change inside the person's own Helm.

### App Check and auth

`getHelmKey`, `sortHelmCapture`, `resolveHelmQuestion`, `writeHelmTopic`, `importHelmOutbox`, the site's `signOutEverywhere` (section 4), the connections callables (section 19) and `deleteHelmData` set `enforceAppCheck: true` (the first callables in the repo to do so; the web build already initialises App Check with reCAPTCHA Enterprise, and the emulator uses the debug token) and check `request.auth` themselves. Every path is built from `request.auth.uid`; no callable takes a uid.

### Offline and failure

- **Warm offline** (opened online, then the signal drops) or **trusted offline**: the key is in memory, so a capture is sealed and written as usual; Firestore queues it, the sheet says "Saved as written. {name} will sort it when you're back online.", and the Inbox shows it waiting.
- **Cold offline, untrusted**: the capture goes through the drop box (section 3) and is imported, then sorted, once online.
- **Sorting later**: on app open, the `online` event and `useOnTabReturn`, the device calls `sortHelmCapture` for its `received` captures (and `interpreting` ones whose lease is older than 90 s) one at a time, oldest first, skipping `recentLimit`/`dailyLimit`/`budgetReached` ones until the window ends (logged: retried when the app next opens).
- **Failure**: a model or validation failure puts the capture back to `received` with `attempts + 1` and `lastErrorCode`; at 3 it is `failed` with Try again (which resets attempts), "Make it a task as written" and Delete. A transient code (`timeout`, `network`, `http429`, `http5xx`, `noKey`, `noModelKey`) gives the attempt back, so it never reaches `failed`. The sentence comes from `getFailedCause` (a rejected key or retired model, `http4xx`, reads as the service being down; an unusable reading as unusable). A retried call with the same `requestKey` returns the stored result.
- **Held reasons**: `recentLimit` (20 calls in 10 minutes; read again after the window, "A lot at once · sorted in a few minutes"), `dailyLimit` (150 a day; read again the next day) and `budgetReached` (the project's day; read again the next day). The day's limit wins when both are spent. The call answers `resource-exhausted` with `{ heldReason }` in its details and the capture goes back to `received` (a held "sort the rest" pass back to `needsYou`) with `heldReason`, attempts untouched.
- **Words it can't make sense of**: a sound reply with no commands is not a failure. The final transaction settles the capture as `needsYou` (`seenAt: null`, `sortedAt`, no Execution) with a code-built `couldNotRead` question (`pickOne`: "Make it a task as written" `makeTask`, "Delete it" `delete`, fixed wording in `nomos/summaries.ts`). The sealed `questions[id]` is the `NomosQuestion` with `builtBy: 'code'`, empty `heldCommands` and `answer: null`, plus `kind`; the readable `questionState[id]` is `{ kind, shape: 'pickOne', askedAt, answeredAt: null, skippedAt: null }`. The sealed payload is re-sealed by spreading what was opened, so `text` and `reading` stay.
- **More than 20 changes**: the first 20 are filed as one Execution, sealed `sortedThrough` records the number of commands filed so far (cumulative; commands, not tasks: an update or a completion counts too), and a `moreToSort` question (`sortRest` "Sort the rest", `leave` "Leave it for now") is added the same way, so the capture is `needsYou` beside its Execution. "Sort the rest" calls `sortHelmCapture({ captureId, requestKey, mode: 'rest' })`: allowed only while the capture holds an open `moreToSort` (otherwise `failed-precondition`), it claims the capture from `needsYou` without counting an attempt, tells the model the titles this capture's Executions already made (and drops a repeat of one), files the remainder as a new Execution appended to `executionIds`, marks the question answered and settles `sorted` (or `needsYou` again with a new `moreToSort` when still more). A failed rest call puts the capture back to `needsYou` with `lastErrorCode`. The call answers `{ status: 'sorted' | 'needsYou' | 'received' | 'failed', executionId }`.
- **Try again**: the device resets the capture (`status: 'received'`, `attempts: 0`, `lastErrorCode: null`, `heldReason: null`; the owner's rules already allow it) and calls the sort directly, without waiting for the next sweep.
- **Two devices**: the claim lets one call read a capture; the final transaction re-checks `claimId`, so a call whose lease was taken over writes nothing.

### What goes to the model

The capture text, the context package above (synced titles and times included) and, for a question that needs them, what the tools return: mail senders, subjects, snippets and up to 4,000 characters of a message or document. They go to Anthropic's API. Nothing from the model or a tool is logged; logs carry codes, tool names, counts and token counts only.

**To do before ship (owner)**: "Anthropic doesn't use what Helm sends to train its models." is not in "What the AI sees" (issue 7 left it out: the commercial API terms and the account's data-retention setting could not be checked from the build). It ships only after the owner confirms both; the sheet's four blocks are in `HELM_COPY`.

## 6. Answers: records first, then general knowledge

**One call, two labelled parts** (taken over two passes). The `answer` command carries `scope` (`yourThings` | `theWorld` | `both`), `question`, `isHealth`, `fromRecords: { text, sourceAliases } | null`, `general: { text, differsFromNoteAlias, differsSays } | null` and `suggestedTopicAlias`. The prompt says: answer from the records block first; use `general` only for what the records don't say and only about the world, never about the person's own plans, people or things; never draw on both in one sentence (product "Never in one sentence").

Two passes were weighed: a records-only call, then a second call with only the question when the first finds nothing. It is cleaner for privacy (the general pass would see no records) but costs a second call and 1–4 s more on exactly the questions that fall through, and the one call already sends the records to the same provider. The guards below give the same outcome in code:

- `fromRecords` is kept only when at least one source alias resolves to a record in the context; otherwise it is dropped (logged `answer-unsourced`).
- `general` is kept only when `scope` is not `yourThings`, and, for a `theWorld` question, only when `fromRecords` was dropped or null (records that answer a world question in full, such as a note, leave no general part: UX A6, A13). A `both` question keeps both parts as two blocks (UX A9). A `yourThings` question with nothing in the records becomes the code-built "Nothing in Helm says {question}." (product's copy), never a general answer; a `theWorld` one with nothing in the records shows that line and then the general part (UX A11).
- `isHealth` picks the fixed stronger caution, chosen by code and never toned; it never names a person from Memory. `generalDiffersFrom` is kept only when its alias resolves to a note in the context; code builds "Your note '{title}' says {says}." `suggestedTopicId` is kept only when it resolves to one of the person's topics.
- A reply that keeps `general` may write no inferred fact: every `remember` in it must carry a verbatim quote from the capture, or it is dropped. No command can take its text from the answer, so **the general part is never written as a fact or a note**; it is stored only as the capture's sealed `answer.general`, which nothing reads as a record and the context package never sends back to the model.
- **Spoken** (round 6): `answer.spoken` (≤280) says the records part first; when a general part is kept, code appends "Not from your records:" and then the model's spoken general sentence (`general.spoken`, ≤200), so the label is never the model's to drop; a health answer adds the fixed spoken caution. A spoken general part with no records part still starts with the label.
- Caps: `fromRecords` 1,200 characters, `general` 1,200, `question` 200, `differsSays` 80.
- **Connected sources count as records**. A synced record the context or `search_synced`/`get_calendar` offered is a source like any record (`kind: 'synced'`, with its title and start copied so the line survives the copy's deletion until the source's copies are deleted). Mail and documents are sources only through `quoteAliases`: the model names `q3`, and the server copies that tool result's snippet (≤300 characters, ≤5 per answer) into `quotes` with the connector's checked deep link; a quote alias that no tool returned drops the part it supports. Every live call made during the answer is written to `searched`, found or not, failed or not; a failed one becomes "Couldn't look in you@company.com: Google stopped sharing it".
- **One noted fact**. An answer that reads mail or a document finding a different value for something Helm holds (the tasting at 2:00 in an email, 3:00 on the calendar) may carry one `remember` (inferred, `sourceConnection` = the quote) in the same Execution, so the answer is no longer write-free in that one case (design round 5, accepted by the lead as "organize freely"). Code refuses a second one, one without a resolved quote, or one in a reply that keeps `general`. Nothing else in an answer writes; nothing is ever written to a source.
- **Authority** (section 19, "Field authority") is applied by code when it builds the answer's sources: the calendar's or the owning app's value is the one stated, and mail's differing value is the one noted.

**How the client renders it** (`AnswerCard`; words are product's and design's):
- The records part as plain text with its source rings and doors (filled for what the person said, hollow for inferred, the book mark for a note, with "saved from a general answer, not checked" or "checked by you" on a note that was; a cited note with `hasHealthCaution` brings its caution).
- The general part in `GeneralKnowledgeCard` under `SectionDivider` "Not from your records" (globe, "General knowledge", the caution, or the health caution block first), with no source rings and no doors, then **Save to my knowledge**. It is never shown without the label, including in Activity and in a capture's result sheet opened later.
- Activity: "Answered: {question}", or "Answered from general knowledge: {question}" from the execution summary.

**Save to my knowledge** (on the device, one tap, no form, no execution; UX K4): writes the note as given (title = the question, cleaned and capitalised; body = the general text; `topicIds` = `[suggestedTopicId]` or `[]`; `source: 'savedAnswer'`, `isFromGeneralAnswer: true`, `checkedAt: null`, `hasHealthCaution` from `isHealth`, `sourceCaptureId`) and sets the capture's `answerSavedNoteId`, in one batch. A body already kept word for word (`toComparable`) saves nothing and says "Already in your notes: {title}" with Open. The button becomes `SavedNoteLine` ("Saved a note: … · 🍰 Kitchen") with Change topic (the topic picker) and Undo (deletes the note and clears `answerSavedNoteId` while the note's `lastEditedAt` is null). From then on the note is one of the person's records and answers cite it, marked "saved from a general answer, not checked" until "I checked this" or an edit sets `checkedAt`, so it is never dressed as something they observed.

## 7. Knowledge (the personal knowledge base)

### What it is in data

`notes` and `topics` (section 2): a note is a title and a body in several of the person's topics or none (many-to-many through `topicIds`, owner round 3; a loose note has none), with where it came from and whether it was checked. Facts stay where they are: a fact is about a person, place or project and has confirmed/inferred; a note is knowledge the person keeps and is theirs by definition (they typed it, said "remember that…", or saved an answer).

Round 6d: each **topic is a living document** written from its notes (section 24), and topics nest up to three levels. The Knowledge view is the topic tree (A to Z at each level, a parent's subtopics under it) with "Loose notes" below.

### How notes get in

- **By hand**: Memory → Knowledge → New note (`NoteForm` in a `FormSheet`: title, note with a quiet count from 18,000, topics as `TopicPicker`, a `MultiPillGroup` with "+ New topic"), sealed and written on the device. Edit, Copy (`CopyTextButton`), "I checked this" and delete from the note's sheet (K3); any edit sets `checkedAt`; delete has Undo from the snapshot while the id is absent.
- **By capture**: "Remember that cakes keep 3 days in the fridge" or "note: …" → `createNote` (body = the person's words), automatic with Undo, one result line ("Saved a note: Cakes keep 3 days in the fridge · Kitchen"). "Remember that Dana's birthday is June 3" is a key date on Dana (section 22), never a note, because it has a subject. The rule is code's: subject → fact, no subject → note.
- **A long paste**: a capture over 4,000 characters (counted trimmed, as Send reads it) makes Send wait with "Too long by N characters. Split it into two."; once notes ship, the composer also offers "Save as a note" there: a `typed` note of the whole text (≤20,000), titled from its first line, read by no AI.
- **By saving an answer** (section 6).
- **Topics** are made by the person (in `TopicPicker`, a topic's ⋯ More, or "New topic" in a `whichTopic` question), or as a parent only when the person says yes to the assistant's `groupTopics` proposal. The assistant may move a topic under an existing parent on its own, with Undo. The person renames, changes the emoji, moves a topic under another or to the top (`TopicPicker` filtered to legal parents: not itself, not a descendant, nothing that would pass 3 levels) and deletes one (its notes stay, loose or in their other topics, the topic removed from each in per-chunk transactions; its subtopics move up a level; its versions go with it; the confirm names the counts). A search appears at 30 topics.
- **Editing or deleting a note**: every topic that cites it is marked `behind` with the note in `pendingNoteIds`, so its next write re-reads the note and records a new version (`addedFromSource`, naming the note); a deleted note's marks are dropped and a `nomos` sentence only it supported goes with that write, while a `person` section keeps its words and loses only the mark.
- **Saving general knowledge**: Save to my knowledge always saves the note at once, loose. When no topic fits, which is always the first time, a code-built `whichTopic` pick-one question follows on the same turn, "Which topic should this go in?", with up to 5 topics ranked by `rankNotes` over topic names and outlines and a "New topic" answer (a name, ≤40, and an optional parent); Skip leaves it loose and waiting in Needs you. Once a topic fits (one clear match on the note's words, or the topic the person picked for this kind of answer before), the assistant files it there itself and says so, "Saved to Car care · Undo".

### How notes reach the assistant: retrieval without a plaintext index

Options weighed for searching sealed notes:

| Option | How | Cost and limit | Taken? |
|---|---|---|---|
| **Rank on the device, send ids** | Notes are already opened on the device (eager listener, they feed Memory and Search). `utils/noteSearch.ts` `rankNotes(text, notes, topics)` scores each note, and each topic section (round 6d), by term overlap (`toComparable` words, stopwords dropped, title ×2, topic names ×1.5, BM25-style length damping) and sends the top 8 with a score above zero as `noteIds` and `topicSectionRefs` (`{ topicId, sectionId }`). The server reads those documents by id under the caller's own path and opens them. | No extra model call, no index, ≤8 reads per capture; ranking 1,000 notes takes a few ms. Limit: lexical, so "how long does sponge last" finds "cakes keep 3 days" only through a shared word; about 1,000 notes before the eager listener's size hurts first open. | **MVP** |
| Decrypt-and-scan on the server | Read every note, open, rank in the function. | Up to 1,000 reads and 1–2 MB opened per capture; +0.3–1 s; no help over the device ranking. | No |
| Sealed embeddings | On save, a callable embeds title + body (an embeddings model through `functions/src/ai/`, chosen in that issue; about $0.00002 per note) and stores the vector sealed; at question time the server embeds the question and the device or server compares. | Finds by meaning; every note write goes through a callable (offline note edits wait); about 3 KB per note. | **[Next]** "Notes found by meaning" |
| Plain vectors or keyword tokens in Firestore (vector search, blind index) | Queryable on the server. | Leaks what notes say (vectors can be partly inverted; tokens leak word frequencies). | Never |

The server never trusts the hints for access: it builds every path from the caller's uid, drops an id that doesn't exist, caps at 8 and at 6,000 characters. The sweep and "Sort the rest" re-rank on the device before calling.

### Placement and cost

In the MVP (owner, round 3), as three issues after "Ask a question": notes and topics by hand, nested (46), notes from captures and long pastes plus topic edits (47), and answers from Knowledge with Save to my knowledge and the topic question (48); round 6d makes each topic a living document (49) that grows (50). Round 6d adds one callable, `writeHelmTopic` (section 24); per question, ≤8 extra reads and about 1,500 more input tokens (about $0.0002).

## 8. Google Calendar (synced for planning)

Calendar is one connector on the platform (section 19, connector `google:calendar`); this section keeps only what is particular to it.

- **Consent.** "Connect Google Calendar" on Today or "Add a Google account" in Connected apps starts the platform's Google flow (section 19, "Google accounts"): `calendar.readonly` with `openid email`, nothing else, `include_granted_scopes=true` so Gmail or Drive added later on the same account asks only for its own scope. Popup with redirect fallback (`requestGoogleAuthCode`, returning to `/helm?connection=done`); the installed-iPhone part is checked on the device and named so.
- **Which calendars.** After consent the calendar picker reads the account's calendar list live through `readConnectorOptions` (`{ id, name, colour, isPrimary, accessRole, isSubscribed }`; holidays, read-only others and subscriptions start off). The choice is the grant's `options.calendarIds` (what Helm may read); shifts and all-day busy picks stay on Helm's profile (Helm's planning).
- **Sync** (the connector's `syncPage`): `events.list` per chosen calendar with `singleEvents=true`, from 30 days ago with no end, paged, then incremental with the returned `nextSyncToken`; a `410 Gone` drops the token and does a full re-read. Each event becomes one `synced` record: kind `event`, readable `startAt`/`endAt`/`isAllDay`/`calendarKey`/`isBusy`, sealed title and the deep link (`htmlLink` kept only when it parses as `https://www.google.com/calendar/…` or `https://calendar.google.com/…`). Declined events are dropped (and deleted if held); cancelled ones are deleted; an event on two calendars of one account (same `iCalUID` and start) is kept once. Never read: descriptions, guests, conference links, locations, attachments. Upcoming events are capped at 2,500 per account, nearest first, and the page says so if reached. Unverified until built: whether a full read started with `timeMin` yields a usable `nextSyncToken`; if not, the incremental read is `updatedMin` = the last sync with the same window.
- **Several accounts** are one day: Today and the planner take synced events from every live Calendar grant; an event on two accounts (same `iCalUID`, or same title and start) counts once (section 19, "Same thing twice").
- **Today and offline.** Today reads synced events from the eager listener, so a trusted browser plans offline from the last sync ("Updated 9:30 AM"); past a day without a sync it says "may be out of date". No calendar callable remains on the client.
- **Failure.** `invalid_grant` marks the account `needsReconnect` (Testing mode's 7-day expiry lands here); Today drops to the no-calendar version with Reconnect and keeps its plan. Anything else keeps the copies, records the error on the grant's category and shows "Couldn't update since …"; never an empty day.
- **Plan-day snapshot** is unchanged: title and time only, written when the day is planned, kept for past days.
- **Google's rules.** `calendar.readonly` is sensitive, not restricted, but it shares the site's OAuth client with Gmail and Drive, whose consent screen stays in Testing for the MVP; so Calendar too needs Reconnect about weekly until issue 19's check allows "In production, unverified" (section 19, "Restricted scopes").

## 9. Executions and undo

- **Automatic commands** are written as `succeeded` in the same server transaction as their effects. A capture's automatic commands make one execution, so the result card's single Undo undoes the whole capture; an answer adds an `answer` execution with no effects.
- **Suggestions** (plan slots, written by the device planner): slots with `status: 'suggested'` plus one `proposed` execution in one batch. Keep, Another time and Not today are dotted-path slot updates (offline-friendly, a quick action that locks nothing); the execution becomes `succeeded` when every slot is decided, or stays `proposed` and lapses with its day.
- **Undo** (`nomos/undoExecution.ts`, on the device, one transaction): re-reads the execution and each affected document and opens their sealed payloads. An `update` effect restores `previous` only for paths whose current value still equals `written` (sealed fields compared after opening, then the payload resealed). A `create` effect deletes the document only while its `lastEditedAt` is null or equals the original execution's `createdAt` (its own later effect stamps it); an update path with no recorded `previous` value keeps the record rather than writing `undefined`. Per record it refuses what changed; across records it goes on past the changed ones and writes a new `undo` execution (`actor: 'person'`, `undoesExecutionId`) whose sealed payload holds the summary ("Took back 1 task, kept 1" when anything was kept or found gone), the `undoReport` ("Took back 1 task. Kept 1 you changed since.", with no titles, since the rows mark which) and `goneIds`, the records found deleted (null on every other execution), so a row says "Deleted since" rather than "Kept". It sets `undoneByExecutionId` on the original, so Activity gains a line and loses none. An undone execution can't be undone again, and an execution with more than 40 effects is refused as unreadable. Undo needs a connection (a transaction); offline the button says so. The toast, the result card and the Activity sheet call the same function.
- **How Undo decides** (`nomos/planUndo.ts` is pure and checked by `check:helm-undo`; `undoExecution.ts` is the transaction around it):
  - **D1, per record all-or-nothing.** A record whose every changed path still matches is taken back whole; if any one doesn't, the record is kept as it is.
  - **D2, a label is not compared.** A path whose `written` equals its `previous` (a task's `sealed.title` on a completion) only names the task, so it is neither compared nor restored: a completion is taken back even after a rename.
  - **D3, nothing to take back writes nothing.** The person is told "Nothing was taken back: you changed X since." and the original stays undoable.
  - **D4, a reverted update sets `lastEditedAt` to now** (a create's delete needs it null or equal to the original execution's `createdAt`, an update's restore moves it).
  - **D5, `op: 'delete'` appears only in an undo's own execution**, never in what the server writes.
  - **D6, one Undo per execution card**; **D7,** only a readable `succeeded` execution that is not itself an Undo, not yet undone and with effects can be undone, so an Undo can't be undone.
  - **D8, a kept line is generic** ("Kept: you changed it since"), as the changed value is never repeated. Its known limit: a record a later run changed, or a later undo stamped, is kept the same way and the line still says "you".
  - **Sealed paths** are compared and restored on the opened payload, which is resealed whole (`{...opened, [field]: previous}`); a dotted `sealed.title` field path is never written.
- **The person's own edits** (`store/actions/taskActions.ts`) make no execution in MVP. A plain field (day, importance, length, a condition) is a field-scoped `updateDoc` that works offline; a change to words (title, notes, a step's text) is a transaction that re-reads the document, opens its sealed payload, applies the one change to that copy (`applyWordsChange`, pure, `check:helm-task-edits`) and reseals it, so it needs a connection. Every one of them sets `lastEditedAt`, so an Undo of the assistant's work keeps the task; a hand-made task is `createdBy: 'person'` with no execution and a null `lastEditedAt`, like one made from a held turn.
- **Steps** live in two places: the text in the sealed `steps` map and each step's `order` and `doneAt` in the readable `stepState`, both keyed by a 12-character id. Adding or removing a step changes both in the one transaction; ticking and reordering are dotted-path updates of `stepState` only, with no reseal. The limit of 30 steps is the sheet's alone, not the rules'.
- **Done and delete** are single writes: a tick sets `status`, `completedAt` and `lastEditedAt` together, and its Undo reopens only while the task is still done from that tick. Delete keeps the document as read (the cache is enough) and Undo writes it back only while its id is free; it works offline.
- **Edits that race**: a form save never `setDoc`s the cached document; ticks, slot changes and milestone dates are dotted-path updates on readable map keys; a form that changes sealed words reseals in a transaction that re-reads the document, so a second device's edit to another field of the same payload is kept; Correct and the `whichIsTrue` answer are transactions over both facts.

## 10. Latent and conditional tasks

- **MVP conditions**: `notUntil` (date-only, active from the start of that day in the profile's zone), `waitsOnTaskIds` (active once each is done or gone) and `waitsOnWhoId` (round 6 rename; active once the person clears it). All hold together.
- `selectTaskActivity` (pure, `createSelector` over tasks and a minute-granular clock) labels each open task `active | notYet | waiting`. It runs at render; nothing is written when a task wakes. `notYet` wins over `waiting`; a waited task that is not in the open list counts as ended, except once the list is at the 150-task cap, where it may simply not have loaded and reads as still open; a task waiting on itself is ignored, and the picker blocks direct cycles. Deleting a task leaves its id in other tasks' `waitsOnTaskIds`, which read as ended. Checked by `check:helm-activation`. A latent task stays out of Today and out of open counts, and appears by itself when its condition holds.
- **Places without location tracking**: a place groups (a home place puts tasks under "When you get home") and never gates. "I'm home" on the group's divider, or said in a capture (`setCurrentPlace`, an `organize` change with Undo), sets `HelmProfile.currentPlace` with `saidAt`, lapsing after 3 hours (lead, round 2: MVP). While it holds, Today lifts that place's tasks to the top of "Any time" and the planner prefers them for the next gap. Helm never calls the Geolocation API.
- **[Next]** `beforeEvent`; an event Helm can no longer see reads as "waiting on an event Helm can't see", never active and never lost.
- A push when a task wakes is [Later], behind the central reminders infrastructure.

## 11. Procedures and the Today planner

- **Procedures and runs** replace round 5's checklists (owner and lead, round 6): section 25. A task's own steps are on the task (section 2).
- **Planner** (`engine/planner.ts`, pure, on the device, fixed-clock tests): input = the day's busy blocks (selected calendars, tentative included, all-day only when marked busy), kept slots, active tasks, `currentPlace`, the day window and `planFillPercent`; output = suggested slots with a rule-built reason. It ranks overdue, due today, due soon, then importance and urgency; fits length, energy (high-energy earlier) and context; leaves 15-minute buffers around events; skips gaps shorter than the task; stops at the fill percent; suggests nothing on a day the calendar shows full or after the day's end. Tasks with no length are planned at 30 minutes and the chip says so. Without a calendar it returns untimed "Worth doing today" picks. It runs when Today first opens on a day with no plan, when the person asks ("Plan it", "Plan my day"), and when a sorted capture carries `planDayKey`; a re-run never touches kept or Not today slots, and it writes the slots, the reasons and the calendar snapshot in one batch.
- **Rest day** (`engine/restDay.ts`, logged): day D is a rest day when a busy event started on D−1 and ended after 02:00 on D, in the profile's zone. Once the person has marked one or more shift calendars, only events on those count, so a late concert doesn't empty the next day. A rest day gets no suggestions; "Plan my day anyway" sets `restDayOverriddenAt` and plans normally. A shift day itself needs no rule: the shift is a busy block, so the planner finds no timed gap inside it (product's "nothing timed on a shift day" falls out of this; untimed picks still list unless product says otherwise).

## 12. Search, clearing and deleting

- **Search** runs on the device over what is loaded and already decrypted (open tasks, projects, who records, key dates (a kind, label or month name finds them: "birthday", "June"; the dates that come back from the yearly index already open, and moments read in pages of 500 (`shape == 'moment'`) after the first results show, kept for the session only), places, facts, notes, topic documents, topics, procedures, media captions, and synced records, each with its source's logo). Mail and Drive are never searched from Search. Done tasks older than the eager window load once when Search opens (a one-shot read of `tasks where status == 'done'`, opened through the sealed reader and kept for the session only). Matching uses `toComparable` substrings. Nothing sealed is indexed anywhere, and no third party sees a query.
- **Clear done**, **archive a finished project**, **delete a topic** and **forget a person** are bulk changes from cached flags, so each re-reads per chunk in a transaction and reports the real count (state-data "A delete across records"). Forgetting a who first removes its entries from the yearly index in a transaction, then deletes its key dates 400 per batch (`whoId ==` query), and the who document last, so an interrupted forget is finished by running it again.
- **Delete all my Helm data**: callable `deleteHelmData` requires a sign-in from the last five minutes (`isSignInRecent`; the client signs in again and retries). It first calls the platform's `endReaderGrants({ uid, readerAppId: 'helm' })` (section 19: every Helm grant ends; a Google account no other grant uses is revoked at Google and its sealed token deleted), then `recursiveDelete`s `apps/helm/users/{uid}` (notes, synced copies and key dates included), then the Storage prefix `apps/helm/media/{uid}/` and the person's `voiceUsage/{uid}` days (round 6), then `apps/helm/server/{uid}` (the wrapped data key last, so a rerun still finishes). With the wrapped key gone, any copy of the ciphertext left in a backup can't be opened without the keyring. The client's timeout matches the function's; `not-found` counts as deleted; the browser calls the key store's `store.forget` (kept copy and its `trustedBrowsers` entry), forgets the `helmOutbox` and `helmDropBoxKey` device secrets, clears the slice, then reopens to first run. Another open device sees its profile vanish, drops its key and reopens to first run, so it can't seal new writes with the deleted key.

## 13. Edge states

| Situation | What happens | Where |
|---|---|---|
| `getHelmKey` fails (keyring problem) | "Helm can't open your things right now" with Try again; capture still works through the drop box; nothing is ever replaced on the server | `CannotOpenState` |
| One document won't open (corrupt, other key) | Row kept as "Couldn't open this"; others open; logged with a code | sealed reader |
| A payload from a newer schema (`v` too high) | Row "Update Helm to open this"; the stale-chunk prompt usually arrives first | `openJson` |
| Opened offline, untrusted | "Your things open once you're back online"; capture via drop box; the home surface shows "N saved on this device" | `NeedsConnectionState` |
| Opened offline, trusted | Cached records open; writes queue; assistant, Undo, calendar, trusting or removing browsers, Delete all say they need a connection | section 4 |
| Sign out everywhere | Every `trustedBrowsers` entry deleted, every session revoked; other browsers signed out within an hour (which forgets their kept key); an offline phone keeps what it has until its 30 days run out (stated in the confirm) | section 4 |
| Trusted browser offline for 30+ days | The shared store has dropped its copy; Helm says "Connect once to keep opening Helm offline" | section 4 |
| Device revoked while open / while offline | Open: wiped at once, keeps working untrusted. Offline: wiped on its next online open | section 4 |
| Browser evicted its stored secrets | The shared store finds no kept copy and the switch reads off; the list still shows the entry until the person removes it (shared behaviour) | Settings |
| Delete all on another device | This device's profile listener sees the profile vanish: key dropped, reopens to first run | section 12 |
| AI unreachable, model timeout, invalid reply | Capture `received` with `heldReason`/`lastErrorCode`, retried on open and return; `failed` after 3 with Try again, "Make it a task as written", Delete | section 5 |
| Per-person limit or project budget reached | `heldReason: 'dailyLimit' \| 'budgetReached'`; "Saved as written" line names when it will be read | section 5 |
| More than 20 changes in one capture | First 20 filed; `moreToSort` question with "Sort the rest" | section 5 |
| Question answered on two devices at once | Second gets `already-exists`; its sheet closes itself | section 5 |
| Undo after the record was edited or deleted | Kept and reported ("Kept 1 task you changed since"); a deleted record counts as kept | section 9 |
| Answer cites nothing resolvable | Records part dropped; general kept only for a world question; else "Nothing in Helm says …" | section 6 |
| A hinted note was deleted before the call | Dropped silently; the answer uses the rest | section 7 |
| Topic deleted | Notes keep their words, lose the topic; count in the confirm | section 12 |
| Note over 20,000 characters (a paste) | Field counts from 18,000 and Save waits, nothing cut silently | `NoteForm` |
| A capture over 4,000 characters | Send waits with "Too long by N characters"; once notes ship, "Save as a note" keeps the whole text as a note read by no AI | composer |
| A note or saved answer already kept word for word | Nothing saved; "Already in your notes: {title}" with Open | device, executor |
| A capture names a topic that doesn't exist, or two that could fit | The note goes to "Not in a topic"; nothing is asked and no topic is made | executor |
| 1,000 notes or 50 topics | New note / topic shows the cap in its own row; capture's `createNote` answers with a line saying the cap | device, executor |
| Calendar grant revoked or expired (Testing mode) | Account `needsReconnect`; Today drops to no-calendar with Reconnect; copies kept, marked stale | section 8 |
| A site app or Google can't be reached for a sync | Copies kept with their `syncedAt`; row "Couldn't update since Thu · Try now"; past a day Today adds one muted line naming it | section 19 |
| The person lost access to a group source (left a trip, a household) | The adapter returns nothing for it; the next sync deletes those copies; a source app the person can no longer open marks the grant `noAccess` ("You can't open Nine Lives any more") with Disconnect | section 19 |
| A copy's `transformVersion` is older than the adapter's | Rewritten at its next sync; read meanwhile with defaults | section 19 |
| Mail, Drive or Runway's transactions fail mid-answer | The answer goes on without it and its `searched` line says it couldn't look | section 6 |
| Gmail or Drive for someone not on the tester allowlist | The ticks aren't shown; the callable refuses the scope too | section 19 |
| Disconnect with copies kept | Copies get `connectionEndedAt` ("no longer updated") and `deleteAfter`; Today stops planning around them; the expiry sweep deletes them | section 19 |
| A category switched off | Its copies are deleted at once; Undo turns it back on and the next sync copies again | section 19 |
| Same event in Google Calendar and an app | One card, both marks; the calendar's time shown, the app's in one line if it differs | section 19 |
| Device's time zone differs from the profile | Today's travel line with Switch; the planner always uses the profile's zone | Today |
| A spoken answer it can't place | The quick model tries it against the question; still unclear or out of range, asked again once, then the question waits in Needs you; never answered by default | section 5 "Questions" |
| A question answered on two devices, or after its records went | The second gets `already-exists` and its card closes; a deleted record's option is dropped, and a question with none left closes as "No longer needed" | section 5 "Questions" |
| The model asks with too few options, or past 20 open questions | The question is not written (`ask-invalid` or the cap); the reply says it in words | section 5 "Questions" |
| A key date on 29 February, or with no year or no day | `nextYearlyOccurrence` puts 29 February on the 28th in a year without one, for Today and Coming up alike; no age or count without a year; a yearly date with no day stays in the index but never reaches Today or Coming up; never stored with a made-up year or day | section 22 |
| A who with hundreds of moments, or 2,000 who | The who page reads that who's moments only (≤500, opened and sorted on the device, typically a handful); Today, Coming up and answers open the one yearly index; nothing reads every key date except Search, in pages | section 22 |
| The yearly index disagrees with the documents, or would pass 6,000 entries | Rebuilt from the yearly documents in one transaction (`rebuiltAt` set); past the cap, split into twelve month documents in one transaction | section 2 |
| A date that comes back changed by hand offline | "Needs a connection to save"; the sheet stays open with the typed date; a spoken one is held like any turn | section 2 |
| A who's tier changes, or a who is forgotten mid-way | Tier lives on the who only, so Today and Coming up re-sort at once; an interrupted forget has already removed the who's index entries, and leaves key dates whose who is gone, which every surface skips and the next forget removes | sections 12, 22 |
| A different birthday said for a who that has one | Not written: a "Which is true now?" question with both dates and their sources; the same date with a year added just fills it in | section 22 |
| Clock skew on the device | `createdAt` is the device's; dates resolve from it; the server only checks the span offsets, so a wrong clock gives a wrong "tomorrow" the person sees as a chip before Send | capture |
| Sign-out with outbox envelopes | Asks first; Stay is the safe choice | section 4 |
| Plain-HTTP page (LAN link) | Sealing works (`@noble/ciphers`); drop box and Trust this browser aren't offered (`canKeepDeviceSecrets`), each saying it needs a secure connection | sections 3, 4 |
| No microphone permission, or the browser has no recognition | The Nomos button opens the composer for typing; one line says how to allow the microphone; nothing else changes | `VoiceControl` |
| Offline while talking | The on-device model listens when downloaded; without it, the browser's recognition where it works offline, else "Type it, or turn on Hear me offline"; replies spoken by the device voice; the capture waits as "Saved as written" |
| On-device model can't run here, or there isn't room | The capability check fails before any download and the row says why ("This phone can't run offline listening" / "Needs about 60 MB free"); a failed or cancelled download leaves nothing behind | section 20 | section 20 |
| Cloud listening token slow or refused | Device listening for that turn, no message; refused for a limit: device for the rest of the day with one quiet line | section 20 |
| Cloud voice slow (no audio in 2.5 s) or failing | The device voice says the same line; the turn records which voice spoke | section 20 |
| Person talks over a reply | Playback stops, the stream is cut, the new turn starts with the last 300 ms of audio and knows the earlier one was interrupted; works with cloud listening and the on-device model, online or off; only on the browser's recognition fallback, or over a system-voice ack, is a tap needed | section 20 |
| Voice or site voice budget reached | Device listening and voice until midnight UTC; nothing blocked | section 20 |
| Attachment over its cap, or a sixth one | Refused on the device before upload, naming the cap ("PDFs up to 20 pages") | composer |
| Upload fails or the phone goes offline mid-upload | The medium stays `uploading` on the device with Retry; the turn waits for it; after 24 h the server deletes the stub | section 23 |
| A scanned PDF with no text, or a password-protected one | Scanned: read as a document; protected: "Couldn't open this PDF" on its line, the rest of the turn goes on | section 23 |
| A Markdown file over 20,000 characters | Refused before upload with the cap | composer |
| Discarded media | Shown 24 h with "Keep it", then deleted with its Storage objects | section 23 |
| A topic written from two devices at once | `writeClaim` lets one write run; the other shows "Bringing in 2 new notes…" and reads the result; a revision re-reads a newer version and asks the model once more; never overwrites | section 24 |
| A topic move that makes a cycle or a fourth level | Refused on the device and in the server's command check; `TopicPicker` never offers it | section 7 |
| A topic write fails or the AI is away | The document stays as it was with "2 new notes aren't in the document yet · Try again"; the notes are already saved and searchable | section 24 |
| Back-to-back messages | Each shows as its own bubble; those sent before the reply starts get one reply covering them all; one sent after starts a new turn | section 21 |
| A procedure changed while a run is open | The run keeps the steps it started with | section 25 |
| Contacts list over 2,000 | The picker shows the first 2,000 with search on those, and says so | section 22 |
| A picked contact already in Helm | Matched by email, phone or name; fills only empty fields | section 22 |
| Contacts grant expired (Testing mode) | "Update from Google" and the picker say Reconnect; imported who records are untouched | section 22 |
| Sensitive fact about someone else | Not kept; the turn's summary says nothing was kept about it | section 2 |

## 14. Security and privacy requirements

- Everything under `apps/helm/users/{uid}` is readable only by `uid`. No other signed-in person and no signed-out visitor can read or list any of it.
- Sealed payloads: the rules never look inside. Shape and caps are checked by the client's types and again by the server before it seals; no sealed value is logged, put in a URL, an error message or analytics. Logs carry a short code and at most four characters of a uid or id.
- Every callable checks `request.auth` and App Check, builds every path from the caller's uid, and touches only the caller's own tree and grant. `deleteHelmData` also requires a sign-in from the last five minutes; `signOutEverywhere` does not (the person reaching for it has lost a phone and may be on any other). Trusting a browser follows the shared standard, which asks for no recent sign-in (owner question, section 4).
- What reaches the model is section 5's context package and the read-only tools' allowlisted results, nothing else; what a source gives a reader is its adapter's declared categories and nothing else (section 19).
- Connections: tokens sealed on the server and never sent to a client, the model or reader code; a reader never reads another app's Firestore; an adapter returns only what that uid can already see in the source; grants are per reader, source, account and category, readable by their owner from any app and changed only through the platform's callables; Gmail and Drive are read live and never stored beyond an answer's quotes; nothing read from a connection is logged (section 19). Nothing in Helm is shareable, public or pushed in MVP: no share link, no preview beyond the registry's root entry, no Storage.
- The app is behind sign-in (`ProtectedRoute appId='helm'`), which covers "every AI-backed feature requires sign-in".
- A browser keeps Helm's key only when the person turned on Trust this browser, through the shared store (non-extractable wrapping key, server first, 30 days unchecked at most); every trusted browser is in the site's list and removable; sign-out, a session ending and Delete all forget it (section 4).
- Caps that live outside the rules (beta tier), stated per "a cap that lives only in the UI": capture 4,000 chars (device and server), 20 commands per reply and 40 effects per execution (server), the context caps (server), note 20,000 chars and title 80, 1,000 notes, 100 topics, 3 levels and 20 subtopics, 10 topics per note (device; server for `createNote`), 20 calls per 10 minutes and 150 per day per person, $10 a day for the project (server), 6 turns and 12 tool calls per capture, 5 quotes of 300 characters, 4,000 characters per mail or document read, 20 transaction rows over at most 13 months (server), 2,500 upcoming calendar events per account and 1,000 records per category (server), one sync per grant per 15 minutes (server), 20 drop-box envelopes per import and 12 KB each (server), assistant name 16 characters of a fixed pattern (device and server). Round 6: 5 attachments per turn, 10 MB and 20 pages per PDF, 5 minutes per voice note, 20,000 characters per Markdown file, 2,000 kept media (device; server re-checks size and kind when it opens them); topic documents 30,000 characters in 60 sections of 4,000, 200 versions, ≤8 section changes and ≤20 notes per write, 30 topic writes a day per person (round 6d), procedures 60 steps (device and server); screen context 1 focus and 20 visible (server); quick route 60 per 10 minutes and 400 a day; voice allowances and the site voice budget (section 20, server); 50 contacts per import call and 2,000 in the picker (server).
- **Voice and media** (round 6): conversation audio is never stored; the wake phrase is heard only by device recognition; voice provider keys never reach a client; media is sealed before it leaves the device; a sensitive fact is kept only when the person stated it about themself.
- **Not protected**: readable fields (counts, dates, links between records, trusted-browser labels) are protected by rules only; the server can open everything it seals; a trusted browser can be opened by anyone who can open that browser while the person is signed in.

### Rules, path by path (beta tier: ownership only, no field checks)

One `isHelmOwner(uid)` helper (`request.auth != null && request.auth.uid == uid`). A wildcard match for the owner's ordinary collections carries a condition that keeps the special ones out (firestore-rules "Rule-language traps": a condition on the wildcard, not a second match).

| Path | Owner read | Owner create | Owner update | Owner delete | Why |
|---|---|---|---|---|---|
| `apps/helm/users/{uid}` (profile) | yes | yes | yes | **no** | Only `deleteHelmData` removes it, so a stray client can't half-delete a Helm |
| `…/{uid}/{collection}/{docId}` for `captures`, `tasks`, `projects`, `who`, `keyDates`, `meta`, `places`, `facts`, `notes`, `topics`, `procedures`, `procedureRuns`, `media`, `style`, `planDays` | yes | yes | yes | yes | The person's own content; the wildcard's condition is `collection in [those fifteen]` (round 6: `people` and `artifacts` are gone, never built) |
| `…/{uid}/topics/{topicId}/versions/{n}`, `…/{uid}/procedures/{procedureId}/versions/{n}` | yes | yes | **no** | yes | History isn't rewritten; deleting a topic or procedure removes its versions |
| `…/{uid}/executions/{executionId}` | yes | yes | yes | **no** | The device writes plan proposals and undo lines and marks `undoneByExecutionId`; Activity never loses a line |
| `…/{uid}/synced/{syncedId}` | yes | no | no | no | Written only by the platform's Helm sink; the person deletes copies through Disconnect or Delete now |
| `apps/helm/server/**`, `apps/helm/aiBudget/**`, `apps/helm/keyChecks/**` | no rule | | | | Admin SDK only; clients denied by default |
| `voiceUsage/**`, `voiceBudget/**` (site) | no rule | | | | The voice service's counters; Admin SDK only |
| `connections/{uid}/{document=**}` (site: `accounts`, `grants`) | yes | no | no | no | The site's grants, read by any app the person opens (Helm's Connected apps, the account page's index); changed only through the platform's callables (section 19) |
| `connectionsServer/**` | no rule | | | | Sealed tokens, sync cursors and the expiry queue; Admin SDK only |
| Storage `apps/helm/media/{uid}/{file}` | yes | yes, `application/octet-stream`, ≤ 10 MiB + 1 KiB | yes, same | yes | Sealed bytes only (Runway's receipt rule's shape); the size covers a 10 MB PDF or voice note after sealing |

Every row is proven in `check:helm-rules` (the site rows in `check:connections-rules`) (a Python emulator matrix in the shape of `check:runway-rules`) as the owner, another signed-in user and signed out, plus a create on each special collection and a delete on the profile and on an execution. The size estimate goes in each rules PR's Regression check (about 1,400 characters, ~2,500 bytes).

## 15. Client state (Redux Toolkit) and listeners

- `src/apps/helm/store/`: a `helm` slice (`HelmState`, `selectHelm`) in `src/store/index.ts`, reset on `resetAllState`, built on `createFirestoreCollectionListener`, plus a small `screen` slice for the screen context (section 21). The key is never in Redux (query cache, the device store and `security.ts` closures only).
- `useHelmSync`, started once from `Helm.tsx` beside `useTrackAppUsage('helm', uid)`, keyed on uid. The profile and Helm's grants and accounts (`useConnections('helm')`) start at once; every sealed listener starts when the key is ready, and each opens its payloads through the sealed reader before they reach the slice.
  - **Eager**: profile; `tasks where status == 'open'`; `tasks where completedAt >= start of yesterday`; `projects`; `who`; `meta/keyDateIndex` (round 6e, or its twelve month documents once split); `places`; `facts where status in ['confirmed','inferred']`; `notes`; `topics`; `procedures`; `procedureRuns where finishedAt == null`; `media where status in ['kept','received','uploading']` (documents only; bytes are lazy); `style`; `captures where status in ['received','interpreting','needsYou','failed']`; `captures where createdAt >= the current session's start` (the home surface); `captures where seenAt == null` (the newest 200, `orderBy createdAt desc`, index `captures (seenAt, createdAt desc)`); `planDays` from yesterday to 7 days ahead; `synced where kind == 'event' and startAt` in that window and `synced` tasks due this week.
  - **Lazy**: earlier sessions on the home surface (20 sessions at a time under `LazyMount`); a topic's or procedure's `versions` while `VersionsSheet` is open; finished runs on their procedure's page; a who's moments while its page is open (round 6e); `executions orderBy createdAt desc`, 30 at a time, while Activity is open; discarded media while its session is on screen; sealed media bytes through `useSealedObjectUrl` when a thumbnail or image is drawn; a capture by id for a result sheet not in the eager sets; done tasks for Search.
- A listener keeps its last value on error and logs it; a count fed by a failed listener shows a failed state, never "none".
- Request/response calls are TanStack Query or mutations: the key, the connections callables, `sortHelmCapture`, `resolveHelmQuestion`, `importHelmOutbox`, `importHelmContacts`, `learnHelmStyle`, `transcribeVoiceNote`, `mintVoiceToken`, `signOutEverywhere`, `deleteHelmData`; `streamSpeech` is a `fetch` read as a stream inside `cloudTts.ts`.
- No section-scoped Context. The open view and record live in the URL through `useHelmUrlState` (`nuqs`); sheet state is local; voice state (listening phase, playing, route) lives in `useVoiceConversation`, never in Redux. An unsent turn survives the phone closing the app as a sealed form draft once the key is there; a turn sent with no key is in the drop-box outbox (text only: attachments need the key and a connection, and say so).

## 16. Backend surface

| Kind | Name / path | What it does, and why plain client code can't | Trigger / consumer | Lands in |
|---|---|---|---|---|
| Callable | `getHelmKey` | Creates or unwraps the person's data key and drop-box pair with the master keyring, a secret no client may hold; answers whether a device is still trusted | `useHelmSync` | Issue 2 (drop box: 60; device answer: 61) |
| Callable | `sortHelmCapture` | Opens the key, builds the context (session turns, screen records, media), routes the turn, runs the Claude tool loop over Helm's in-process MCP server with the server's API key, enforces policy, rate limit and budget, writes sealed records and the Execution atomically, sweeps the caller's expired media | composer, sweep | Issue 5 (failure and questions: 6; sessions and screen: 9; back-to-back messages: 10; routing: 11; tools over synced records: 19 onward; media: 52, 53) |
| Callable | `resolveHelmQuestion` | Validates an answer against its question's shape; runs a code-built question's held commands through the server executor, or writes a model-written question's answer as a turn and sorts it (round 6c) | question cards, Needs you, spoken answers | Issue 35 (shapes: 36) |
| Callable | `writeHelmTopic` | Claims a `behind` topic, opens its document and up to 20 pending notes, asks `topicWrite` for at most 8 section changes, applies those code allows (never a `person` section's words), writes the version and execution; writes a parent's overview with `topicOverview` | `TopicScreen` on open, "Bring in new notes" | Issue 50 |
| Callable | `importHelmOutbox` | Opens drop-box envelopes with the server-held private key and writes them as sealed captures | `useCaptureOutbox` | Issue 60 |
| Callable | `signOutEverywhere` (site, `functions/src/auth/`) | Deletes every `trustedBrowsers/{uid}/browsers` entry and revokes every session site-wide; no app's words | `TrustBrowserRow`'s optional `onSignOutEverywhere` | Issue 62 |
| Callable | `mintVoiceToken` (site, `functions/src/voice/`) | Checks the person's listening allowance and the site voice budget in one transaction, then mints a short-lived streaming token with the provider key no client may hold | `deepgramStream.ts` | Issue 14 |
| HTTPS function | `streamSpeech` (site, `functions/src/voice/`) | Streams the cloud voice's audio for at most 600 characters; ID token and App Check from headers, site-origin CORS; callables can't stream bytes | `cloudTts.ts` | Issue 15 (provider choice: 13) |
| Callable | `transcribeVoiceNote` (site) | Opens a sealed voice note with the person's key and sends it to the provider's pre-recorded endpoint; charged to listening minutes | composer | Issue 53 |
| Callable | `importHelmContacts` | Re-fetches the picked contacts with the platform's Google token (never sent to a client), dedupes, seals and writes who records, their photos and (round 6b) a birthday key date in one execution; also "Update from Google" for one person | `ContactsPicker`, who page | Issue 38 (birthdays: 43) |
| Callable | `learnHelmStyle` | Opens the last 50 typed captures (or reads sent mail live through the platform) and asks the `style` role for traits with counts; stores only the traits | device after 25 typed captures; "Learn from my sent mail" | Issue 56 (sent mail: 57) |
| Callable | `grantConnection` / `updateConnection` / `endConnection` / `deleteKeptCopies` | The site's grant writes (section 19) | Connected apps, the account page's index | Issue 18 (keep and delete: 19) |
| Callable | `syncConnections` | Runs the sync for the caller's grants older than 15 minutes (or one grant on Sync now / Try now) | `useHelmSync` on open and return, Sync now | Issue 19 |
| Callable | `startGoogleConnection` / `finishGoogleConnection` | OAuth code exchange with the client secret, incremental scopes, the tester gate for restricted scopes; seals the refresh token under the site keyring | Connect flows | Issue 20 (Gmail: 28, Drive: 29, Contacts: 38) |
| Callable | `readConnectorOptions` | A connector's live option list (Google calendars; round 6: a Contacts page for the picker) as an allowlisted shape | calendar picker, `ContactsPicker` | Issue 20 (Contacts: 38) |
| Callable | `deleteHelmData` | Ends Helm's grants, revokes unused Google accounts, `recursiveDelete`s the person's tree and server-only keys, deletes the `apps/helm/media/{uid}/` Storage prefix and the person's `voiceUsage` days | Settings | Issue 63 |
| Scheduled | `verifyHelmKeys` (daily), `verifyConnectionKeys` (daily) | Open each keyring id's canary; log ok/failed for the alerts | Cloud Monitoring | Issues 2, 20 |
| Scheduled | `syncConnectionsHourly` | Every hour, syncs each live synced grant whose last sync is over 50 minutes old, at most 200 a run | Cloud Scheduler | Issue 19 |
| Scheduled | `expireKeptCopies` (daily) | Deletes kept copies past `deleteAfter` through each reader's sink | Cloud Scheduler | Issue 19 |
| Function file | `functions/src/apps/helm/findFirstActivityAt.ts` + `FIRST_ACTIVITY_FINDERS` entry | New-app checklist: oldest capture or task `createdAt`; `null` until either exists | `registerAppUsage` | Issue 1 |
| Function files | `functions/src/apps/<app>/share/adapter.ts` per source app, `functions/src/apps/helm/connections/sink.ts`, `functions/src/connections/google/contacts.ts` | Each app's read contract, Helm's sink, the Contacts connector (section 19) | the platform | Issues 18, 19, 21–26 (Runway's transactions: 30; Contacts: 38) |
| External API | Anthropic Messages API (`@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`) | Sonnet-class for full turns (about 3 to 10 cents), Haiku-class for quick turns (well under a cent, unverified); per-person per-route limits and a dollar cap; when down, captures wait as "saved as written" | `sortHelmCapture`, `learnHelmStyle` | Issue 5 (quick route: 11) |
| External API | Deepgram streaming (`wss://`, token grant) and pre-recorded endpoints; Aura-2 if the benchmark picks it | About $0.0077 a minute listening, about $0.03 per 1,000 characters speaking (unverified); per-person allowance and the site's $5 a day cap; when down, the device voice | `mintVoiceToken`, `transcribeVoiceNote`, `streamSpeech` | Issues 13, 14, 53 |
| External API | Google Cloud Text-to-Speech (Chirp 3 HD); Gemini Flash-Lite TTS (paid API or Vertex) | Priced per character or audio token (unverified); the benchmark's default only | `streamSpeech` | Issues 13, 15 |
| External API | Google Calendar API v3, Gmail API, Drive API v3, OAuth token and revoke endpoints; round 6: People API (`people.connections.list`, `people.getBatchGet`) | Free; per-project quotas far above one person's use | platform connectors | Issues 20, 28, 29, 38 |
| Secrets | `HELM_MASTER_KEYS` | Helm's keyring; created by `npm run helm:keyring` before issue 2 merges | key, assistant, outbox, trust, sink, delete, verify, media | Issue 2 |
| Secrets | `ANTHROPIC_API_KEY` | The model; created by `npm run ai:anthropic-secret`, which checks the key with a one-token call before saving | `sortHelmCapture`, `learnHelmStyle` | Issue 5 |
| Secrets | `DEEPGRAM_API_KEY` (optional: absent means cloud listening is skipped and the device listens) | Created by `npm run voice:deepgram-secret`, which checks the key against Deepgram's projects endpoint before saving (unverified endpoint) | voice functions | Issue 13 (listening: 14; voice notes: 53) |
| Secrets | `GEMINI_API_KEY` (optional; only if the benchmark picks Gemini and Vertex isn't used) | `npm run voice:gemini-secret`, checked with a one-line call | `streamSpeech` | Issue 13 |
| Secrets | `CONNECTIONS_MASTER_KEYS`, `GOOGLE_OAUTH_CLIENT` | The platform's token keyring and the site OAuth client; `npm run connections:keyring`, `npm run connections:google-secrets` | Google connectors, verify | Issue 20 |
| Console | An Anthropic console monthly spend limit and alert; round 6: a Deepgram project spend limit | Clicks no command can do, spelled out | first assistant issue, cloud listening | Issues 5, 14 |
| Console | Calendar, Gmail, Drive, round 6: People and Text-to-Speech APIs on (`npm run connections:google-setup` and `npm run voice:google-setup` run the `gcloud` parts); scopes on the consent screen | Clicks no command can do | Google issues | Issues 15, 20, 28, 29, 38 |
| Console | Three Cloud Monitoring alert policies on `helm.keys.*`, three on `connections.keys.*`; round 6: one on `voice.budgetReached` | Same as Runway's runbook | first sealed issue, Google issue, voice | Issues 2, 14, 20 |
| Gate | `google-mail-and-drive` in `FEATURE_GATES` (appId `helm`, default `testing`) | The tester allowlist for restricted scopes; sent-mail style needs it too; Contacts does not | Connected apps | Issue 28 |
| Index | `tasks`: `status` ASC, `createdAt` DESC | `sortHelmCapture`'s newest 150 open tasks | server context | Issue 5 |
| Index | `facts`: `status` ASC, `createdAt` DESC | The newest 40 confirmed or inferred facts beside the subject matches | server context | Issue 40 |
| Index | `media`: `status` ASC, `deleteAfter` ASC (collection scope) | The end-of-call sweep of the caller's expired media | `sortHelmCapture` | Issue 52 |
| Index | `captures`: `sessionId` ASC, `turnIndex` DESC | The session's last 6 turns for the context | server context | Issue 9 |
| Index | `synced`: `grantId` ASC, `category` ASC, `syncedAt` ASC | The sink finds copies a full sync didn't confirm | sink | Issue 19 |
| Index | `synced`: `kind` ASC, `startAt` ASC | The context's events for today and tomorrow, `get_calendar` | server context | Issue 27 |
| Index | `synced`: `deleteAfter` ASC (collection group) | The expiry sweep | `expireKeptCopies` | Issue 19 |
| Index | `grants`: `status` ASC, `lastSyncAt` ASC (collection group) | The hourly sweep's oldest live grants | `syncConnectionsHourly` | Issue 19 |
| Index | none other | `facts.subjectIds array-contains-any`, notes by id, `keyDates` by `whoId` and `shape` (equality only, round 6e), `captures.quotedSourceKeys array-contains`, and every client listener are single-field or document-id ranges | n/a | n/a |
| Storage | `apps/helm/media/{uid}/{mediaId}` and `{mediaId}.thumb` | Sealed media bytes; owner-only rule (section 14) | media flow | Issue 37 |
| Callable | `embedHelmNote` | Seals an embedding of a note for retrieval by meaning | note save | Next |

No Realtime Database paths, pushes or worker changes beyond the registry's own `cloudflare-worker.js` entry. Round 6 adds Helm's first Storage path.

**Claude Max and the API key**: the owner asked whether Claude Max's included credits can pay for the server's API key. Not confirmed from here (**unverified**); as far as this planning knows, a Claude subscription and the Anthropic API Console are billed separately, so the plan budgets the API on its own and the first assistant issue checks the owner's account before the spend limit is set.

## 17. Component and file architecture

```
src/apps/helm/
  Helm.tsx                       # orchestrator: auth gate, key gate, useHelmSync, useTrackAppUsage, the shell
  README.md PRODUCT.md UX.md TECHNICAL.md ISSUES.md
  types.ts  constants.ts         # unions/interfaces; views, tone lines, voice phrases ("undo that"), copy templates, caps
  security.ts                    # sealJson/openJson; the only place Helm seals and opens
  hooks/
    useHelmSync.ts  useHelmUrlState.ts  useAssistantName.ts  useScreenContext.ts  useLastInputMode.ts
    useKeyDates.ts               # round 6e: the yearly index (opened once per change), a who's moments
    useCaptureSweep.ts  useCaptureOutbox.ts  useHelmKey.ts
    useSession.ts                # current sessionId and turnIndex from the last capture's time
    useMediaUpload.ts            # cap, shrink, thumbnail, seal, upload, media doc
  queries/
    helmKeyQueries.ts  nomosMutations.ts  contactsQueries.ts  styleMutations.ts
  store/
    helmSlice.ts  screenSlice.ts  selectors.ts   # (taskSelectors.ts: selectTaskActivity, selectActiveTasks) selectTaskActivity, selectProjectEvidence, selectToday, selectSession,
                                 # selectWhoByTier, selectUpcomingKeyDates (joins tiers, orders close first then soonest), selectSyncedForDay, selectDiscrepancies, selectSelfFacts
    listeners/  actions/         # captureActions, taskActions, projectActions, whoActions, noteActions, procedureActions,
                                 # runActions, mediaActions, planActions, undoActions, settingsActions
  engine/
    planner.ts  restDay.ts  activation.ts  projectEvidence.ts  whoTier.ts   # pure, fixed-clock tests
  nomos/
    undoExecution.ts             # device-side undo over sealed effects (also "undo that" by voice)
  screen/
    views.ts                     # HelmView list, VIEW_KINDS (home | content | utility, round 6e), BROWSE_TILES (importance;
                                 # ≤1 lead, ≤3 major), BROWSE_FOOT and the contract
  utils/
    keyDateIndex.ts              # round 6e: applyToKeyDateIndex, rebuild, split (pure; server copy, check:server-copies)
    taskEdits.ts                 # applyWordsChange, step order helpers (pure, check:helm-task-edits)
    captureReading.ts  procedureMarkdown.ts  stepGroups.ts  noteSearch.ts  dropBox.ts  sameThing.ts  mediaCaps.ts
  components/
    shell/        HelmShell, VoiceDock (Browse · Talk · Type, home only), BrowseSheet (Search on top, bento tiles by importance, foot row), BrowseTile,
                  HelmHeader (Back and Home on content pages), AskAboutThisControl (round 6e: one per shell, content pages only),
                  AskConversation (the conversation over the page: "Back to Grandpa", the removable "About Grandpa" chip)
    home/         HomeSurface (the conversation), Composer (text, mic, attach), TurnCard, ResultLines, MediaLine ("Keep it"),
                  AnswerCard, GeneralKnowledgeCard, SavedNoteLine, HeldCaptureCard, QuestionSheet (WhichWho, WhichPlace,
                  WhichIsTrue, WhichDate, CouldNotRead, MoreToSort), QuestionCard with PickOneAnswer, PickSeveralAnswer,
                  YesNoAnswer, FreeTextAnswer, DateTimeAnswer, PickRecordAnswer, NumberAnswer (round 6c), SessionDivider, OutboxRow
    inbox/        InboxView (Needs you · New since you looked), CaptureResultSheet
    voice/        VoiceControl, VoiceStateRing, VoiceSettings (voice mode, hands-free, wake word, natural voice row)
    today/        TodayView, DayStrip, EventCard, PlannedCard, SuggestedCard, SuggestionSheet, RestDayLine,
                  HomeGroup ("I'm home"), KeyDatesLine (3 lines, then Coming up), ConnectCalendarRow, SyncedCard, DiscrepancyLine, StaleSourceLine
    tasks/        TasksView, TaskSheet (with steps)
    projects/     ProjectsView, ProjectDetail (Next · Who · Milestones · Runs · Topics), ProjectQuestionFlow, EvidenceLine
    who/          WhoView (Close · Regular · Others), WhoDetail, WhoPhoto, KeyDatesList, MomentsPreview (newest 3, See all N), MomentsScreen (by decade, then year, under LazyMount), KeyDateSheet, PlaceDetail, FactSheet, SourceRing
    contacts/     ContactsPicker
    comingUp/     ComingUpView (round 6e: 12 months from the yearly index, ≤20 then "Show N more in March", Show everyone)
    media/        MediaThumb, MediaViewer (ImageViewer, PDF and Markdown readers)
    knowledge/    KnowledgeView (topic tree, Loose notes), TopicScreen (the document, overview and subtopic links),
                  SectionSourcesSheet, SectionEditSheet, NoteRow, NoteSheet, NoteForm, TopicPicker, VersionsSheet
    procedures/   ProceduresView, ProcedureScreen, RunScreen
    howNomosSeesYou/ HowNomosSeesYou, FactKindGroup, StyleNotes
    connections/  ConnectedAppsScreen, ConnectSheet, ConnectionPage, DisconnectSheet, CalendarPicker,
                  SyncedSourceBlock, QuoteLine, SearchedLine
    activity/     ActivityScreen, ExecutionSheet, AssistantLine, AssistantMark
    settings/     SettingsScreen, AssistantNameToneSheet, ShiftCalendars, DevicesSettings, WhatTheAiSees, DeleteHelmData
    states/       NeedsConnectionState, CannotOpenState

Central (general, no Helm words):
  src/lib/speech/voice/                    # types, voiceRouter, browserStt, deepgramStream, pcmWorklet, deviceTts, cloudTts,
                                           # playbackQueue, bargeIn (section 20); check:pinch-voice covers it
  src/hooks/useVoiceConversation.ts        # listeningMode + router + queue + barge-in + follow-up window
  src/lib/speech/readSpokenAnswer.ts       # round 6c: a spoken answer to a shaped question (ordinals, both, none, skip, numbers)
  src/lib/speech/onDevice/                 # opt-in on-device recognition: capability check, model store, worker (section 20)
  src/hooks/useOnDeviceRecognition.ts      # the opt-in row's state, like useNaturalVoice
  public/speech/asr/                       # the model and WASM runtime, with NOTICE
  src/hooks/useSealedObjectUrl.ts          # sealed Storage bytes → object URL; Runway's receipt hook moves onto it
  src/components/MarkdownText.tsx          # react-markdown, skipHtml, links as ExternalLinkText
  src/components/ChecklistGroup.tsx        # moved from Runway in the runs issue
  src/components/LinkedText.tsx            # plain text with its links as ExternalLinkText
  src/components/TrustBrowserRow.tsx       # exists (PR #819); gains an optional onSignOutEverywhere prop
  src/utils/naturalDateUtils.ts            # parseNaturalDate(text, { now, timeZone })
  src/utils/yearlyDateUtils.ts             # nextYearlyOccurrence, formatYearlyDate, round 6e: formatMoment (29 Feb on the 28th);
                                           # Nine Lives moves onto it
  src/lib/google/requestGoogleAuthCode.ts
  src/lib/connections/                     # contract, sources, readers, useConnections, connectionCalls (section 19)
  src/components/ConnectedSourcesList.tsx
  src/apps/<app>/share/manifest.ts
  src/lib/security (createSealedReader)    # moved from Runway's security.ts

functions/src/
  ai/            modelProvider.ts  models.ts  providers/anthropic.ts               # general
  voice/         voiceConfig.ts (VOICE_APPS, prices, VOICE_PROVIDER_DEFAULT)  mintVoiceToken.ts  streamSpeech.ts
                 transcribe.ts  usage.ts  providers/ deepgram.ts  deepgramAura.ts  googleTts.ts  geminiTts.ts   # general
  connections/   registry.ts  grants.ts  callables.ts  syncRunner.ts  liveRouter.ts  sourceClient.ts  tokens.ts  expire.ts
                 verifyConnectionKeys.ts  google/ oauth.ts calendar.ts gmail.ts drive.ts contacts.ts deepLinks.ts
  appKeys/       keyring.ts  gcm.ts  wrap.ts  seal.ts  canary.ts  loadKeyring.ts
  auth/          recentSignIn.ts  signOutEverywhere.ts
  vendor/        optionMatchUtils.ts  stringSimilarity.ts  zonedTime.ts  connectionsContract.ts
  apps/helm/
    getHelmKey.ts  helmKey.ts  dropBox.ts  importHelmOutbox.ts  verifyHelmKeys.ts  voiceIdentity.ts
    sortHelmCapture.ts  writeHelmTopic.ts  resolveHelmQuestion.ts  importHelmContacts.ts  learnHelmStyle.ts  aiLimits.ts  assistantName.ts
    media/       openMedia.ts  pdfText.ts  sweepMedia.ts
    mcp/         server.ts  buildTools.ts  tools/*.ts
    connections/ sink.ts
    share/       manifest.ts (shares: [] in the MVP)
    nomos/       buildContext.ts  route.ts  prompt.ts  responseSchema.ts  commands.ts  normalizeNomosReply.ts
                 answerGuards.ts  matchEntities.ts  policy.ts  executeCommands.ts  summaries.ts  spoken.ts  sensitive.ts
    deleteHelmData.ts  findFirstActivityAt.ts
  apps/<app>/share/adapter.ts
scripts/seeds/helm.ts  scripts/seeds/helmScale.ts   # scale: 600 tasks, 400 who, 2,000 facts, 300 notes and 40 topics three levels deep with documents, 30 procedures
                                                    # with 120 runs, 400 captures in 60 sessions, 200 media, all sealed
scripts/voice/deepgramSecret.sh  geminiSecret.sh  googleSetup.sh  benchmark.ts   # voice:* and voice:benchmark
scripts/appKeys/  scripts/helm/  scripts/ai/  scripts/connections/  scripts/checks/   # as round 5
```

Reused, not rebuilt: everything round 5 listed, plus `@/lib/speech` (`listeningMode`, `readWakePhrase`, `readAloud`, `toSpokenText`, the natural voice), `useSpeechCommands`'s `createSpeechListener`, `encryptBytes`/`decryptBytes` and Runway's receipt Storage rule shape, `PhotoPicker` and `useImageUpload`, `ImageViewer`, `createOptionMatcher`. Round 5's `BottomTabBar` move and `DictationField` are dropped (the voice dock with its Browse sheet, and the composer, replace them).

## 18. Convention changes, written in the docs PR

The docs PR that adds Helm's planning docs writes these (lead, round 4), so every issue builds against them; the issue that first implements each re-reads its text and corrects it in the same PR if the code taught otherwise. Pattern-index lines for the new shared components land with the issue that builds each (ISSUES.md).

- **security-privacy.md**: "Data sealed with a server-held key offers Trust this browser" is already written (PR #819) and Helm follows it as written. The docs PR adds one sentence to it: "Sign out everywhere is the site callable `signOutEverywhere`, offered through `TrustBrowserRow`'s `onSignOutEverywhere`; it deletes every trusted-browser entry and revokes every session, and its confirm says it signs the person out of every app." And to "One device, several accounts": an app's per-account device-side leftovers (an outbox, a cached public key) are device secrets, so the site's sign-out clears them.

- **data-contracts.md "A document may carry one `sealed` payload"**: "The data key is held by a callable and kept in memory only, never persisted" gains "…except as a kept copy on a browser the person trusted (security-privacy 'Data sealed with a server-held key offers Trust this browser')"; PR #819 wrote the rule there but left this sentence saying "never persisted". And: a capture made with no key is sealed to a per-person public key the server opens (Helm's drop box), never kept in plain text.
- **data-contracts.md** "Know which of the two kinds of time value a field is": a yearly date whose year may be unknown (a birthday) is `month`, `day` and a nullable `year`, never a timestamp with a placeholder year, and its next occurrence and words come from `@/utils/yearlyDateUtils` (a day or a year may be missing but not both; 29 February falls on the 28th in other years; "today" is the person's zone). Round 6e: a one-time life event is a moment with a `precision` (day, month, year, decade), never a yearly date. And in `state-data.md`: a sealed app that must find records by a sealed value keeps one sealed index document maintained in the same transaction as each change (Helm's `keyDateIndex`), with a stated size cap and a split plan, rather than a readable or derived field.
- **data-contracts.md**, same bullet: the two-map shape (a readable state map beside a sealed content map with the same keys) for entries that change one at a time.
- **cloud-functions.md**: "A file `functions/` copies from `src` sits in `functions/src/vendor/`, headed as a copy, and `check:server-copies` keeps it identical"; "The keyring helpers are `functions/src/appKeys/`; an app's key file holds only its path and key-id prefix"; "A callable that needs a recent sign-in uses `functions/src/auth/recentSignIn.ts`".
- **cloud-functions.md**: "A model call from a Function goes through `functions/src/ai/` by role; a model id appears only in `models.ts`, and no file there names an app."
- **cloud-functions.md**: "The model provider is Anthropic's API through `functions/src/ai/providers/anthropic.ts`, with `ANTHROPIC_API_KEY` set by `npm run ai:anthropic-secret` (which checks the key); a tool loop runs over an in-process MCP server built per call with the caller's uid in its closure, and no tool takes a uid, an id or a token."
- **docs/conventions/connections.md, new**: the cross-app read contract, so every app follows one process:

  > **An app reads another app only through that app's published read contract.** Never a Firestore path, a slice or a type from another app's folder (`check:connection-boundaries`). Each source app owns `src/apps/<app>/share/manifest.ts` (its categories: id, the person's words, kind, On or Off, and its Never lines) and `functions/src/apps/<app>/share/adapter.ts` (maps its records to the shared kinds, returns only what that uid can already see in the app, never another member's private items, contacts or messages), registered in `SOURCE_ADAPTERS`; an app that shares nothing declares `shares: []`. A category added later is Off. A reader owns a sink (`READER_SINKS`) that seals copies into its own tree with their source, account, freshness and `transformVersion`. Grants live at `connections/{uid}/grants`, are read by their owner from any app and are written only by the platform's callables. Tokens are sealed under `CONNECTIONS_MASTER_KEYS` in `connectionsServer/`, used only inside `functions/src/connections/`. Everything is read only until an app ships its own write permission. An app that moves to its own domain or project keeps its contract: the platform's `SourceClient` switches from in process to `/connections/v1` over HTTP with a grant-scoped service token, and nothing in the reader changes. `check:adapters` proves each adapter against owner, member and non-member fixtures.

- **CLAUDE.md "Read before you touch"**: a row "Another app's data, sharing between apps, a connected Google service → `connections.md`".
- **new-app.md**: a checklist item: "Declare what the app shares (`share/manifest.ts` and an adapter, or `shares: []`), with its On set as small as serves a reader."
- **security-privacy.md**: "Content from outside the person's own typing (mail, documents, another app's words) is untrusted data in a prompt: read-only tools, no outbound tool, quotes copied by code, plain-text rendering"; and "A copy one app keeps of another's data says where it came from and when, is deleted with its grant or marked as no longer updated with a date it goes, and is never logged."
- **firestore-rules.md**: the site's `connections/{uid}` (owner read, no client write) and `connectionsServer/**` (no rule) in the list of paths outside an app's namespace.
- **cloud-functions.md**: "A callable that opens sealed data sets `enforceAppCheck: true`" (Helm's are the first).
- **cloud-functions.md**: "Speech to text and text to speech go through `functions/src/voice/` and `src/lib/speech/voice/`: provider-independent adapters, a site-level allowance and budget separate from the AI budget, keys only on the server (streaming listening by a short-lived token, speaking through `streamSpeech`); an app supplies its id, limits and voice identity in `VOICE_APPS`, never its own provider call."
- **security-privacy.md**: "Conversation audio is never stored; a wake phrase is heard only by the device's own recognition, and cloud listening starts after it or a tap"; and "Media a person attaches to sealed data is sealed on the device before upload, and what the app decides not to keep is deleted within a day."
- **code.md** CLAUDE.md "Voice for any app" bullet: gains `src/lib/speech/voice/`, `useVoiceConversation`, `src/lib/speech/onDevice/`, `readSpokenAnswer` (round 6c) and `useOnDeviceRecognition` (the opt-in offline recognition model, named with its licences where it is turned on, like the natural voice) in its list, with `check:pinch-voice` covering them.
- **CLAUDE.md Pattern index**: lines for `MarkdownText`, `useSealedObjectUrl`, `useVoiceConversation`, `yearlyDateUtils` and `readSpokenAnswer`, and a line for a bento view switcher (tiles sized by a declared importance with a typed cap on big tiles, Search on top: Helm's `BrowseSheet`) once a second app wants one, each with the issue that builds it (ISSUES.md).
- **product.md** (product's call to word): "An answer from outside the person's records is labelled where it shows and is never stored as one of their records unless they save it."

## 19. Connections: the site's read platform

The owner's words: a pipeline for apps to read data from one another, with Helm as the first reader, ready for an app that later moves to its own domain or Firebase project. It is built once for the site, in a standard way, and every current app joins through it.

### Where it lives

- **Shared, no app's words:** `src/lib/connections/` (the contract, source manifests re-exported from each app, the reader registry, `useConnections`, call wrappers), `src/components/ConnectedSourcesList.tsx`, `src/lib/google/requestGoogleAuthCode.ts`, and on the server `functions/src/connections/` (registry, grants, callables, sync runner, live router, token store, the Google connectors, expiry). `contract.ts` is canonical in `src/` and vendored to `functions/src/vendor/connectionsContract.ts` under `check:server-copies`. Nothing in these names a recipe, trip, cat or movie; `check:connection-boundaries` greps them for every app's entity words.
- **Owned by each app:** `src/apps/<app>/share/manifest.ts` (what it shares, in the person's words) and `functions/src/apps/<app>/share/adapter.ts` (how), registered in `SOURCE_ADAPTERS`. A reader owns its sink, `functions/src/apps/<reader>/connections/sink.ts`, registered in `READER_SINKS`, and its grant page, registered in `READER_APPS`.
- **The rule that makes graduation possible:** a reader never reads another app's Firestore, slice or types. `check:connection-boundaries` fails when a file under `src/apps/A` or `functions/src/apps/A` imports from app B's folder or names a path under `apps/B/`; only B's adapter reads B.

### The connector contract

```ts
type ConnectorId = `app:${AppId}` | 'google:calendar' | 'google:gmail' | 'google:drive' | 'google:contacts'; // round 6: contacts
type SharedKind = 'person' | 'place' | 'event' | 'task' | 'project' | 'knowledge' | 'artifact' | 'scenario'
                | 'trip' | 'pet' | 'moneySummary' | 'transaction' | 'countSummary'; // round 5: the last two for Runway's transactions and Worth the Wait's box counts

interface ConnectorManifest {          // src/lib/connections/contract.ts; one per source
  id: ConnectorId;
  kind: 'firstPartyApp' | 'oauth' | 'apiKey';
  contractVersion: 1;
  transformVersion: number;            // bumped when the adapter's output shape changes
  categories: CategoryManifest[];      // what may be offered; Never data has no category and no field
  never: string[];                     // the person's words for what is never shared ("What you paid, savings")
  capabilities: { read: true; write: false; backgroundSync: boolean }; // write is false for every source in the MVP
  connect: { kind: 'siteGrant' } | { kind: 'oauth'; provider: 'google'; scopesByCategory: Record<string, string[]>; isRestricted: boolean };
}
interface CategoryManifest {
  id: string;                          // 'plannedMeals'
  kind: SharedKind;
  label: string; detail: string;       // "Planned meals" · "The meal, day and slot"
  mode: 'sync' | 'live';
  isOnAtConnect: boolean;              // product's On / Off
  addedInVersion: number;              // a category added later starts off and shows "New" once
}

interface SourceAdapter {              // server; functions/src/apps/<app>/share/adapter.ts or connections/google/*.ts
  manifest: ConnectorManifest;
  status(ctx: SourceCtx): Promise<'ok' | 'noAccess' | 'needsReconnect'>;
  syncPage?(ctx: SourceCtx, req: { category: string; cursor: string | null; windowStart: number })
    : Promise<{ records: SharedRecord[]; deletedRefs: string[]; cursor: string | null; isFull: boolean; isDone: boolean }>;
  query?(ctx: SourceCtx, req: { op: 'search' | 'read'; category: string; args: LiveArgs })
    : Promise<LiveResult[]>;           // live connectors only
  deepLink(ref: string, ctx: SourceCtx): string | null; // checked: a site path under the app's registry route, or an allowlisted Google host
}
interface SourceCtx { uid: string; accountId: string; grant: ConnectionGrant; openToken?: () => Promise<string> } // openToken only inside connections/
interface SharedRecord {               // a kind's allowlisted shape; typed per kind, no free-form field
  sourceRef: string; kind: SharedKind; title: string; subtitle: string | null; detail: string | null;
  startAt: number | null; endAt: number | null; isAllDay: boolean; dueAt: number | null; timeZone: string | null;
  placeLabel: string | null; amountCents: number | null; currency: string | null; sourceUpdatedAt: number | null;
  extra: Record<string, string | number | boolean | null>; // per-kind allowlisted keys from the contract (a pet's name, a sale's counts)
}
```

`SourceClient` (`functions/src/connections/sourceClient.ts`) is how the runner and the router reach an adapter: `InProcessSourceClient` calls it directly today; `HttpSourceClient` (Beyond, "An app on its own domain") posts the same requests to `https://<app>/connections/v1/{sync|query}` with a short-lived token the site signs (`{ uid, grantId, readerAppId, categories, aud }`), and the graduated app verifies it and runs its own adapter. Readers and grants don't change.

### What each source shares (mirrors PRODUCT.md "What Each Source Shares")

Categories in the manifest are product's table; a Never line has no category and no field in the kind's shape, so an adapter can't return it. Every site adapter returns only what the uid can already see in that app, and in a group app only the person's own plans and to-dos (never another member's private items, contacts or messages).

| Source (adapter reads) | Categories: On | Categories: Off | Notes |
|---|---|---|---|
| A-List (`memberships/{uid}`) | `plannedShowings` (event), `savedTheaters` (place) | `seenMovies` (knowledge: title, rating) | |
| Going Once (sales the uid is in) | `pickups` (event), `mySales` (project: name, available/pending/sold counts) | | No buyer, contact, floor price, note or price fields exist |
| Nine Lives (households the uid is a member of) | `cats` (pet: name), `vetVisits` (event), `dueCare` (task), `clinics` (place: name, phone, address) | `conditions` (knowledge) | |
| Pinch (`kitchens/{uid}`) | `plannedMeals` (event), `shoppingList` (task: unticked only) | `useSoon` (task) | |
| Runway (`plans/{uid}`, sealed) | `moneySummary` (Free to Spend now, next income day, due before it as one total) | `upcomingBills` (task: name, amount, due), `horizon` (project: name, target, set aside), `transactions` (live; transaction: date, payee, amount, category) | Server-side under Runway's key; no account, balance, card, note, receipt or link field exists (owner round 5: Transactions offered, off) |
| Waypoint (trips whose `members` holds the uid) | `trips` (trip), `itinerary` (event and place, trip zone), `myTasks` (task: assigned to or private to the uid) | `tripBalances` (moneySummary per trip) | |
| Worth the Wait (spaces the uid is a member of) | none | `boxCounts` (countSummary: box name and emoji, items, revealed, not yet revealed) | Counts from the readable `isRevealed` flag by aggregation; no item is read or opened (owner round 5: counts only) |
| Google Calendar | `events` (event: title, time, calendar) | | Calendars chosen in `options.calendarIds` (section 8) |
| Gmail (live) | `mail` (search, then sender, date, subject, text) | | No attachments, no send, label, archive or delete |
| Drive (live) | `documents` (search by name and text, then a Doc's or PDF's text) | | Other file types' contents never read |
| Google Contacts (live, round 6) | `contacts` (person: name, email, phone, organization, birthday, photo; read when the person opens the picker or imports) | | Only the people the person ticks are written, as who records (section 22); nothing synced; no contact groups, notes or other fields |

Helm declares `shares: []`: in the MVP no app can read Helm.

### Grants and accounts

```ts
interface ConnectionAccount {          // connections/{uid}/accounts/{accountId}: owner reads, only callables write
  provider: 'google';
  email: string; label: string | null; // label: "work", set by the person through updateConnection
  grantedScopes: string[];             // what Google says this account granted
  status: 'live' | 'needsReconnect' | 'revoked';
  connectedAt: number; lastError: { code: string; at: number } | null;
}                                      // accountId = 'g_' + 16 hex of sha256(Google sub); site apps use accountId 'site' and have no document

interface ConnectionGrant {            // connections/{uid}/grants/{readerAppId}__{connector}__{accountId}: owner reads, only callables write
  readerAppId: AppId; connectorId: ConnectorId; accountId: string;
  categories: Record<string, { isOn: boolean; changedAt: number }>;
  options: { calendarIds: string[] } | null;
  status: 'live' | 'needsReconnect' | 'noAccess' | 'ended';
  categoryState: Record<string, { lastOkAt: number | null; lastError: { code: string; at: number } | null; count: number }>;
  errors: { category: string; code: string; at: number }[]; // newest 10, shown as sentences
  newCategoryIds: string[];            // shown as "New: …" once, cleared when the page is seen
  lastSyncAt: number | null; syncLeaseUntil: number | null;
  keptCopies: { count: number; deleteAfter: number | null } | null; // after a disconnect that kept copies
  createdAt: number; updatedAt: number; endedAt: number | null;
}
```

- **Rules:** `match /connections/{uid}/{document=**} { allow read: if request.auth.uid == uid; }`, no client write. So any app the person opens can read every grant for an honest picture (Helm's Connected apps reads its own with `where readerAppId == 'helm'`; the site account page's "Connected apps" index reads them all), and nothing a client sends can widen one.
- **Callables** (App Check, `request.auth`, paths from the caller's uid): `grantConnection({ readerAppId, connectorId, accountId, categoryIds, options })` checks the reader is in `READER_APPS`, the connector in `SOURCE_ADAPTERS`, every category declared, the person can open both apps (the site's app-access check) and, for an OAuth connector, that the account granted the category's scopes; it writes the grant with each category from the staged ticks and runs a first sync. `updateConnection` changes switches, options or an account's label; a switch turned off deletes that category's copies at once through the sink, and its Undo turns it back on and syncs again. `endConnection({ grantId, deleteCopies })` and `deleteKeptCopies({ grantId })` (below). Every write is a transaction that re-reads the grant.
- **The account page's index** (design round 5): `/account` gains "Connected apps" once any grant exists, built on `ConnectedSourcesList` over all grants; a row opens the reader's grant page at the route `READER_APPS` names (`/helm?view=connection&grant=…`). It is never a second editor.

### Kept in step: sync

- **When.** Hourly: `syncConnectionsHourly` takes live grants with a synced category whose `lastSyncAt` is over 50 minutes old, oldest first, at most 200 a run (design: "updated every hour"; the cadence is one constant). On open and on return, when the newest is over 15 minutes old, the client calls `syncConnections` (throttled per grant on the server). Sync now / Try now syncs one grant at once.
- **How** (`syncRunner.ts`): lease the grant (transaction on `syncLeaseUntil`, 2 minutes); per category that is on, page through `syncPage` with the window start (30 days ago), then hand each page to the reader's sink. Site adapters read in full each time (their sets are tens to hundreds of records; `isFull: true`); Calendar reads incrementally with Google's sync token (section 8). Cursors are kept server-side in `connectionsServer/{uid}/cursors/{grantId}__{category}`. A page failure records `categoryState.lastError`, keeps the copies and moves on; one source's failure never stops another.
- **Helm's sink** (`functions/src/apps/helm/connections/sink.ts`): unwraps Helm's key once per run; for each record computes `syncedId = hash(grantId, category, sourceRef)` and `contentHash` (HMAC under a subkey of the person's data key, so equal content is detectable without opening and leaks nothing), and writes only new or changed records, sealed (section 2, `SyncedRecord`). After a full read it deletes copies of that category not seen in this run; after any run it deletes copies whose end (or due day) is more than 30 days past. Up to 1,000 records per category; past that the newest-upcoming are kept and the page says so.
- **Freshness** shown from `categoryState.lastOkAt` ("Updated today 9:30 AM"); older than a day reads "may be out of date" on Today; a category with no successful sync since connecting reads "Waiting for the first update".
- **Lost access.** A site adapter whose uid can no longer open a group record simply stops returning it, so the copy goes at the next full read; an app the person can no longer open makes `status()` return `noAccess`, and the grant shows "You can't open Nine Lives any more" with Disconnect.

### Read when asked: live

- `liveRouter.query({ uid, readerAppId, connectorId, accountId, op, args })` checks a live grant with the category on, then either calls a site adapter's `query` in process (Runway's transactions; no token) or opens the token inside `functions/src/connections/` and calls Google, and returns an allowlisted shape. Google's are: search results `{ ref, title, from, at, snippet (≤300) }` (≤10), a read `{ ref, title, from, at, text (≤4,000) }`. Helm's MCP tools call only this.
- **Nothing is stored** in Firestore, logs or analytics: results live in the call's memory and an instance-memory cache keyed by a hash of (uid, account, op, args) for at most 15 minutes, so a follow-up question doesn't call Google twice. Only the quotes an answer keeps (≤5 of ≤300 characters, sealed in the capture) and the noted fact (section 6) outlive the call.
- **Gmail** (`gmail.readonly`): `users.messages.list` with the model's query (≤200 characters) and `users.messages.get` (`format=metadata` for search, `full` for a read: the text part, or the HTML part turned to text); attachments never. **Drive** (`drive.readonly`): `files.list` with `fullText contains` or `name contains`, `trashed = false`; a read exports a Google Doc as `text/plain` or extracts a PDF's text (≤10 MB); any other type answers "Helm can't read this kind of file". Deep links: `https://mail.google.com/mail/?authuser={email}#all/{id}`, Drive's `webViewLink` when its host is `docs.google.com` or `drive.google.com`.

### Field authority and the same thing twice

- **Who wins** (`authority.ts`, pure, used by the planner, answers and Today): an event's time → the calendar; a thing an app holds → that app; Helm's own facts → the person; mail and documents never win. Two outside sources that disagree are shown, not asked: the winner's value, and one line naming the other ("Two times: an email says 2:00 PM"). An email's differing value appears only after a question noted it as a fact (section 6); Gmail is never scanned in the background.
- **An app against a Helm fact.** A fact about a synced record (`aboutField`) whose value differs from the copy is a derived "Which is true now?" in Needs you (`selectDiscrepancies`, on the device). Picking the app's value supersedes Helm's fact; keeping Helm's sets `keptOverSource` on the fact with the copy's `contentHash`, so it isn't asked again until the source changes. The source is never changed.
- **The same thing twice** (`utils/sameThing.ts`, on the device): a calendar event and an app's event are one thing when their titles match (`createOptionMatcher` over both titles, the shared threshold) and their starts are within 15 minutes (design round 5; product's draft said 30, design's tighter rule taken). One card, both marks, the calendar's time; if the app's time differs, one line says so. Two Google accounts' copies of one event (same `iCalUID`, or same title and start) count once.

### Disconnect and delete

- **`endConnection({ grantId, deleteCopies })`** stops reading at once (status `ended`), then:
  - `deleteCopies: true`: the sink deletes every copy of the grant, then blanks what answers quoted from it: captures with `quotedSourceKeys array-contains "{connectorId}|{accountId}"` get each matching quote's `text` and `deepLink` set to null with `deletedAt`, and each synced source's `title` set to null, so the answer reads "Quoted from Pinch, deleted Nov 9"; a noted fact from it keeps its statement and loses its quote. For Gmail and Drive this blanking is all deleting does.
  - `deleteCopies: false`: copies get `connectionEndedAt` ("From Pinch · no longer updated"), stay searchable and citable with their links, and Today stops planning around them; `deleteAfter` is `endedAt + KEPT_COPY_DAYS` (90, owner round 5). The grant keeps `keptCopies` for the row ("Deletes Feb 7 · Delete now"); `deleteKeptCopies` deletes them early and blanks quotes as above; `expireKeptCopies` (daily) deletes them on time.
  - **"Also delete" starts ticked** (owner, round 5): `DISCONNECT_DELETES_BY_DEFAULT = true`; the person can untick it on each disconnect.
- **What Helm made stays**: tasks, procedure runs, facts and past plans keep their source as sealed text ("From Miso's visit in Nine Lives, Nov 12").
- **Google**: ending the last grant that uses an account revokes the token at Google (best effort) and deletes the token and the account document; ending one service while another still uses the account leaves the scope granted at Google but unused (Google can't drop one scope from a refresh token), and the page says Helm no longer reads it.
- **Reconnecting** writes a fresh grant with each category at its default.

### Several Google accounts, incremental authorization

- One site OAuth client (`GOOGLE_OAUTH_CLIENT`). Each account is keyed by its Google `sub`, so a personal and a work account are two accounts, each with its own grants and switches. "Add another Google account" passes `prompt=select_account`.
- Each service is its own consent on its own tap, with `include_granted_scopes=true`: Calendar asks `calendar.readonly`, Gmail later asks only `gmail.readonly`, Drive only `drive.readonly` (plus `openid email` to know the account). `finishGoogleConnection` refuses when the requested scope wasn't granted ("Helm needs permission to … Nothing was connected.").

### Tokens

- Refresh tokens are sealed in `connectionsServer/{uid}/tokens/{accountId}` (`{ masterKeyId, nonce, ciphertext, grantedScopes, createdAt, lastRefreshedAt }`) with `deriveSubkey(CONNECTIONS_MASTER_KEYS, id, 'oauth-refresh')` and the uid as authenticated data, using `functions/src/appKeys/`. The keyring has Runway's whole contract (escrow, canary at `connectionsServer/keyChecks/{id}`, `verifyConnectionKeys` daily, alerts). Access tokens live in instance memory until they expire.
- Only `functions/src/connections/` calls `openToken`; adapters, sinks, Helm's MCP server and the model never see a token. Errors carry a short code, never a token, URL or Google message.
- **Smallest scopes:** `calendar.readonly` (sensitive), `gmail.readonly` (restricted), `drive.readonly` (restricted: searching file text needs it; `drive.file` sees only files Helm made and `drive.metadata.readonly` reads no text).

### Restricted scopes: the tester limit

`gmail.readonly` and `drive.readonly` are restricted: before anyone but test users may grant them, Google requires verification and a yearly independent security assessment. So in the MVP:
- The Gmail and Drive ticks show only to people the `google-mail-and-drive` switch lets in (`FEATURE_GATES`, appId `helm`, default `testing`, set in the admin's Features tab), and `startGoogleConnection` refuses those scopes for anyone else (`assertGateOpen`). Everyone else sees Calendar alone. The owner also lists each tester as a test user on the consent screen (clicks spelled out in issue 27), since the switch can't do Google's part.
- The consent screen stays in Testing with the owner as a test user, so every Google connection, Calendar included, needs Reconnect about once a week (refresh tokens expire after 7 days), which design draws. Issue 19 checks Google's current rules for "In production, unverified" with restricted scopes and moves the screen there if it keeps owner-only use working without the weekly expiry.

### Keeping and deleting (mirrors PRODUCT.md "Keeping and Deleting")

| What | Kept | Deleted by |
|---|---|---|
| A synced copy | While connected: current, upcoming and the last 30 days | the next sync once older or gone at the source; a switch turned off; Disconnect with delete; Delete all |
| A kept copy after Disconnect | Until `deleteAfter`, 90 days after the disconnect | `expireKeptCopies`; Delete now; Delete all |
| Mail, Drive and Runway transaction results | Only during the answer, plus 15 minutes in instance memory | nothing stored |
| Quotes and a noted fact | With the answer, sealed | blanked when the source's copies are deleted; Delete all |
| A past day's event snapshot | With that day's plan | Delete all |
| A grant, an account, a token | Until disconnect or Delete all | `endConnection`; `endReaderGrants` |
| Records Helm made | Helm's own | like any record |

Nothing read from a connection is written to logs: the runner and router log connector, category, counts, durations and error codes only.

### Runway and Worth the Wait

Both seal their data, so their adapters run only on the server and open data with their own app's key code (`functions/src/apps/runway/planKey.ts`; Worth the Wait's space key), never Helm's. The reader seals what it receives under its own key.

- **Runway's summary** is computed from Runway's sealed records with Runway's own pure money functions vendored into `functions/src/vendor/` under `check:server-copies`, so it is current even when Runway hasn't been opened; it returns totals only.
- **Runway's transactions** (owner round 5: offered, off) are **live, not synced**. The question they serve is "what did I spend at X", which an answer asks now and then; nothing on Today or in the planner needs them, so copying every purchase into Helm hourly would put the person's most sensitive data in a second place for no use. The adapter's `query` opens `plans/{uid}/purchases` within the asked range (≤13 months) on the server, keeps spending and refunds only (no deposits, no pairs between the person's own accounts), matches the payee text with `createOptionMatcher` against the person's label or the merchant, and returns at most 20 rows newest first plus the matched count and total. A row is the smallest shape that answers the question: `{ date (date-only), payee (label, else merchant), amountCents (negative on a refund), currency, category (the envelope it came out of, "Free to Spend", or "Split") }`; no note, receipt text, link, card, account, bank description or logo field exists. Results follow the live rule (instance memory for 15 minutes, never stored); an answer quotes at most 5 rows as quotes, blanked like any quote when Runway is disconnected with delete.
- **Worth the Wait shares counts only** (owner round 5). Box names, emoji and descriptions are sealed under the space's key; each item's `content` is sealed, but `isRevealed` and `revealedAt` are readable fields on the item document. So the adapter, for each space whose `members` holds the uid, opens each box's name and emoji (box fields, not items), and gets `items` and `revealed` with two Firestore aggregation `count()` queries on the box's `items` (all, and `where isRevealed == true`), which return numbers and read no item document; `notYetRevealed` is the difference. It returns one `countSummary` per box: `{ title: name, subtitle: emoji, extra: { items, revealed, notYetRevealed } }`. Boxes have no members of their own (every box in a space belongs to both members), so "the person is in it" is the space membership the adapter already filters on. No item's content, author, dates or method is read; there is no field for one. The category starts off.

### How the MCP server authenticates

Per request: the callable checks `request.auth` and App Check, builds the server with the uid, the unwrapped Helm key and the person's live grants in its closure, and drops it when the call ends. Tools take aliases and search text, never a uid, id or token; a live tool goes through `liveRouter`, which re-checks the grant on each call. The server can reach only the caller's tree and grants. In Beyond, the same server served over HTTP authenticates each request with MCP's OAuth against the site's Firebase identity and builds the same closure from the token's uid.

### What proves it

`check:connections-rules` (the site paths, owner, other user, signed out, every client write refused), `check:adapters` (each adapter against owner, group member, non-member and another member's private item fixtures; the output's keys against the kind's allowlist), `check:connection-boundaries`, `check:server-copies` (the contract and Runway's vendored functions), and fixture tests of `authority.ts`, `sameThing.ts` and the sink's blanking.

## 20. The voice service

Voice is three layers that never know about each other: **listening** (speech to text), **reasoning** (the assistant, section 5) and **speaking** (text to speech). Reasoning only ever sees text in and text out; it never knows which voice listened or spoke. Listening and speaking are a provider-independent service with cloud and device adapters, built general so any app can use it, with Helm supplying only its words, phrases and voice identity.

### Adapters

```ts
// src/lib/speech/voice/types.ts (general: no app's words; covered by check:pinch-voice)
type VoiceRoute = 'cloud' | 'device';
type SpeechPriority = 'ack' | 'reply' | 'summary';           // ack: "Got it, Friday" · reply: an answer · summary: a long read
interface SttAdapter {
  id: string;                                                // 'deepgram-stream' | 'browser'
  route: VoiceRoute;
  canStream: boolean;
  start(opts: { onPartial(text: string): void; onFinal(text: string): void; onSpeechStart(): void;
                onError(code: SttErrorCode): void; preRoll: Float32Array | null }): Promise<void>;
  stop(): void;                                              // ends the utterance; onFinal fires once
}
interface TtsAdapter {
  id: string;                                                // 'cloud' | 'natural' | 'system'
  route: VoiceRoute;
  speak(text: string, opts: { priority: SpeechPriority; signal: AbortSignal; onStart(): void; onEnd(): void }): Promise<void>;
  isPlayingThroughWebAudio: boolean;                         // true: the browser's echo cancellation hears it (barge-in works)
}
interface VoiceIdentity { id: string; label: string; device: { naturalVoice: boolean; systemVoiceHints: string[]; rate: number; pitch: number } }
```

| Layer | Cloud adapter | Device adapter |
|---|---|---|
| Listening | `deepgramStream.ts`: the browser opens a WebSocket straight to Deepgram's streaming endpoint with a short-lived token the server minted (`mintVoiceToken`), audio from `getUserMedia({ echoCancellation: true, noiseSuppression: true })` through an `AudioWorklet` at 16 kHz linear PCM; partial and final transcripts come back on the socket. Model: Nova-3 or Flux, picked in the cloud-listening issue (unverified which is better for turn-taking) | `browserStt.ts`: wraps `createSpeechListener` from `useSpeechCommands` as it is. Chrome sends this audio to Google's servers, so it is offline only where the browser has an on-device model (unverified per platform) |
| Listening, offline | | `onDeviceStt.ts`: an opt-in on-device recognition model (section 20, "On-device recognition") run in a Web Worker on the same PCM worklet frames, so it hears offline on every phone, and streams partials |
| Speaking | `cloudTts.ts`: posts the text to the site function `streamSpeech` and plays the streamed audio through `AudioContext` as chunks arrive | `deviceTts.ts`: wraps `readAloud` (the natural voice through WebAudio when downloaded, the system voice otherwise); every text through `toSpokenText` first |

Cloud speaking's provider is a server choice, never a client one: `functions/src/voice/providers/` holds `geminiTts.ts` (Gemini Flash-Lite TTS), `deepgramAura.ts` (Aura-2) and `googleTts.ts` (Cloud Text-to-Speech, Chirp 3 HD), each `speak({ text, voiceId, format }) → ReadableStream<Uint8Array>`. `VOICE_PROVIDER_DEFAULT` in `functions/src/voice/voiceConfig.ts` names the one the voice benchmark (issue 12) picks; until then it is `googleTts` (ADC, no new secret). An optional provider credential is read at run time and its absence means that provider is skipped (cloud-functions rule), so a missing `DEEPGRAM_API_KEY` sends every turn to the device adapters and nothing fails.

### Routing, per turn

`voiceRouter.ts` (pure, fixed-input tests) picks one adapter for each listen and each speak:

- **Listening** goes to the cloud when the browser is online, the person's voice mode is `cloudWhenOnline`, the minted token arrived within 1.5 s and the person is under their listening allowance; otherwise to the device: the on-device model when it is downloaded and loads, else the browser's recognition. Wake listening is always device-only (below).
- **Speaking**: an `ack` (a code-built confirmation of what was done, "Got it, moved to Friday") goes to the device voice, so it starts at once and costs nothing; a `reply` or `summary` goes to the cloud voice when online and under the allowance, else the device voice. A failed or slow cloud stream (no first byte in 2.5 s) falls back to the device voice for that reply, and the turn's `ttsProvider` records which one spoke.
- **Over a limit** the person is never blocked: the router answers `device` and Helm shows one quiet line on the conversation ("Using this phone's voice for the rest of today").
- **One playback queue**: an ack and a reply never overlap. A reply that arrives while an ack plays waits for it (an ack is at most one short sentence); a newer turn's audio cancels the older one's.

**"Got it" with streaming and barge-in** (product asked): the natural voice plays through `AudioContext`, so the browser's echo cancellation removes it from the microphone and the person can talk over it like a cloud reply. The system voice (`speechSynthesis`) plays outside the page's audio graph on most platforms, so echo cancellation may not hear it (unverified per browser): while a system-voice ack plays, interrupting by voice may not work and a tap always does; an ack is one short line, so this costs little. The router therefore prefers the natural voice for acks when it is downloaded.

### Streaming, tokens and keys

- **Keys never reach the browser.** Listening streams straight from the browser to Deepgram with a token from `mintVoiceToken` (callable; auth and App Check; checks the person's allowance and the site budget; calls Deepgram's token grant endpoint with the server key and returns `{ token, expiresAt, provider, model }`). Token lifetime about 60 s and whether an open stream outlives its token are **unverified**; the cloud-listening issue checks both and, if a stream dies with its token, mints per utterance (the plan already does).
- **Speaking streams through the site**: `streamSpeech` is an HTTPS `onRequest` function (callables can't stream bytes) that checks the Firebase ID token and the App Check token from headers, allows only the site's origins (CORS), takes `{ appId, text, priority }` with `text` at most 600 characters after `toSpokenText`, charges the person's allowance, then pipes the provider's audio stream back (`audio/ogg; codecs=opus`, or MP3 where the provider can't do Opus; unverified per provider).
- **Voice notes** (section 23) use `transcribeVoiceNote` (callable): the device sends the sealed note's media id, the server opens it with the person's key, sends the audio to Deepgram's pre-recorded endpoint and returns the transcript; the audio is never written anywhere unsealed.
- **Why straight to the provider for listening but through the site for speaking:** a proxy for live microphone audio would add a hop to every word and a long-lived socket per person on Functions; a token is the provider's own answer to this. Speech output is one short request per reply and carries the text the server already has, so the proxy costs nothing and keeps the provider swappable without a client release.

### On-device recognition

The owner chose to bundle an opt-in on-device model in the MVP so voice works offline on every phone.

- **Candidate: sherpa-onnx** (k2-fsa) with a streaming English Zipformer transducer, int8, built for WebAssembly. It streams partial results, which turn-taking and barge-in need; whisper.cpp's WASM build (MIT) was weighed and set aside, because Whisper decodes in windows rather than streaming and its smallest useful English model (tiny.en, about 75 MB, about 30 MB quantised) is slower per word on a phone. Vosk (`vosk-browser`, Apache-2.0) is the fallback if sherpa-onnx's WASM build fails the issue's checks.
- **Licence:** sherpa-onnx is Apache-2.0 and ONNX Runtime is MIT (both to be confirmed against the release used). **Copyleft to check:** sherpa-onnx's text-to-speech side links eSpeak NG (GPL-3.0), the same library inside the natural voice's phonemizer, so only a speech-recognition-only build that leaves eSpeak NG out is acceptable, and the issue proves it from the build's file list. Each model's weights carry their own licence and training-data terms (unverified per model). Licences sit beside the files in a `NOTICE`, and the row that turns the model on names them, as the natural voice does.
- **Size and download:** about 40–75 MB (model and runtime; **unverified** until the build is measured), downloaded only when the person turns on "Hear me offline" in voice settings, after a capability check (WebAssembly SIMD, `AudioWorklet`, enough free storage via `navigator.storage.estimate()`, a device-memory hint). The row states the download size before the download starts, and the download can be cancelled. It is served from the site's own origin (hashed files, cached by the service worker and the Cache API), never from a third-party CDN at run time, and is checked by hash before use.
- **Runs in a Web Worker**, fed by the PCM worklet's 16 kHz frames, so recognition never blocks the page. When it is downloaded, the router prefers it over the browser's recognition whenever cloud listening isn't used, offline or online, and for wake listening.
- **Where it lives:** `src/lib/speech/onDevice/` (`capability.ts`, `modelStore.ts` (download, hash, cache, remove), `recognizerWorker.ts`, `onDeviceStt.ts`) and `src/hooks/useOnDeviceRecognition.ts` (the opt-in, like `useNaturalVoice`), with no app words, covered by `check:pinch-voice`. The model files live under `public/speech/asr/` with their `NOTICE`. Helm adds only its settings row (`VoiceSettings`). Whether the model is downloaded is browser state, kept by the hook and never on the profile.

### Wake word, barge-in and hands-free

- **The wake phrase is heard only by the device's own recognition** (PRODUCT.md promise): "Hey {name}" (the assistant's current name, read by `readWakePhrase`) runs in the existing `listeningMode` WAKE mode on `browserStt`, and cloud listening starts only after the phrase or a tap. No audio goes to Deepgram before either. Chrome's recognition itself sends audio to Google while it listens, which is why wake listening is off until the person turns it on and its switch says so; with the on-device model downloaded, wake listening runs on it instead and nothing leaves the phone.
- **Barge-in** (`bargeIn.ts`, general): while a reply plays through WebAudio and the microphone is open with echo cancellation, a small voice-activity detector on the worklet's frames (energy and zero-crossing over 30 ms frames, 200 ms of speech to trigger, tuned in that issue) stops playback, aborts the reply's stream and starts a new utterance with the last 300 ms of audio as pre-roll so the first word isn't lost. The interrupted turn records `interruptedCaptureId` on the new capture so the assistant knows it was cut off. The on-device model listens on the same echo-cancelled frames, so talking over a reply works offline too; only the browser's recognition (the fallback when the model isn't downloaded) pauses while the page speaks (the shared listener's "never hears itself" rule), and there interrupting is by tap. iOS Safari's behaviour with an open microphone during playback is unverified.
- **Hands-free**: after a spoken reply, `useVoiceConversation` opens an 8-second follow-up window (a `listeningMode` WINDOW) so the person can answer without a tap or the wake phrase; silence closes it. The profile's `isHandsFreeOn` (default on) turns it off.
- **"Undo that" by voice** (PRODUCT.md light call): the device matches a fixed phrase list ("undo that", "undo", "take that back", in `constants.ts`) on the final transcript before anything is sent; a match runs the same device-side Undo as the button on the session's latest execution and speaks its code-built Undo line. It never calls the model and costs no allowance.

`useVoiceConversation` (`src/hooks/`, general) extends `listeningMode` with the router, the queue, barge-in and the follow-up window; Helm's `VoiceControl` passes its phrases, wake name, identity and the callbacks that make a capture.

### Voice identity

`VoiceIdentity` is general; the identities themselves live with their app. Helm's one identity, "Nomos", maps on the server to a voice id per cloud provider (`functions/src/apps/helm/voiceIdentity.ts`, registered in `VOICE_APPS`) and on the device to the natural voice or a system voice by hints. The voice never changes with the assistant's tone or name; tone changes only the words (section 5). One voice and no picker in the MVP; a picker later is a list of identities, not a code change.

### Budget and limits (separate from reasoning)

Claude's budget pays only for reasoning; voice has its own counters and cap, at site level because voice is a site service:

| Limit | Accepted (owner, round 6) | Where it is counted | Over it |
|---|---|---|---|
| Cloud listening per person | 60 minutes a day | `voiceUsage/{uid}/days/{dayKey}.listenMs`: the device reports each stream's length when it closes, capped at the 60-second utterance limit per mint, so a lying client gains at most a minute per token | device listening for the rest of the day |
| Listening tokens per person | 300 a day (a hard bound behind the minutes) | `.mints`, in the mint's transaction | device listening |
| Cloud speech per person | 30,000 characters a day (after `toSpokenText`) | `.spokenChars`, charged before the stream starts | device voice |
| Voice notes per person | inside the listening minutes; 5 minutes each | `.transcribeMs` | the note is kept with "Couldn't write this out today" and transcribed on the next day's open |
| Site-wide | $5 a day (`VOICE_DAILY_BUDGET_CENTS = 500`) across every app and person | `voiceBudget/{dayKey}.costMicros`: each mint counted at its worst case (60 s), each speech request at its characters, each note at its length, against the price table in `voiceConfig.ts` | every app's voice goes to the device until midnight UTC; logged `voice.budgetReached` |

The person's allowance and the site budget are checked in one transaction per mint or speech request. Prices to start the table (all **unverified**, checked in the issue that first calls each): Deepgram streaming about $0.0077 a minute; Aura-2 about $0.030 per 1,000 characters; Cloud TTS Chirp 3 HD about $30 per million characters with a monthly free allowance; Gemini Flash-Lite TTS priced per audio token. At those prices a person at both limits costs about $0.46 of listening and $0.90 of speech a day, so the $5 cap covers about three people at their limits, or many more at normal use.

### Data use

- Conversation audio is never stored by Helm: streamed audio goes to the provider and is gone; a voice note's audio is sealed media and let go after 24 hours unless the person keeps it (section 23).
- Deepgram: the requests opt out of model improvement (`mip_opt_out=true`; unverified that the parameter still exists under that name and applies to streaming). Gemini: never the free tier, whose data may be used to improve Google's products; through the paid API or Vertex AI (unverified that Flash-Lite TTS is offered on Vertex). Cloud TTS: Google Cloud terms. The "What the AI sees" page gains a voice section, and the same "check before ship" rule as Anthropic's applies to each provider's terms.

### Where it lives

General: `src/lib/speech/onDevice/` and `src/hooks/useOnDeviceRecognition.ts` (on-device recognition, above), `src/lib/speech/voice/` (`types.ts`, `voiceRouter.ts`, `browserStt.ts`, `deepgramStream.ts`, `pcmWorklet.ts`, `deviceTts.ts`, `cloudTts.ts`, `playbackQueue.ts`, `bargeIn.ts`), `src/hooks/useVoiceConversation.ts`, `functions/src/voice/` (`voiceConfig.ts` with `VOICE_APPS` and prices, `mintVoiceToken.ts`, `streamSpeech.ts`, `transcribe.ts`, `usage.ts`, `providers/*`). `check:pinch-voice` (`speechShared.ts`) widens its file list to `src/lib/speech/voice/**`, `useVoiceConversation.ts` and `functions/src/voice/**` (except `VOICE_APPS` entries, which name app ids only). Helm's: `components/voice/VoiceControl.tsx`, `VoiceStateRing.tsx`, `constants.ts` phrases, `functions/src/apps/helm/voiceIdentity.ts`.

## 21. Conversation and screen context

### Sessions and turns

A **session** is a run of turns with no gap over 10 minutes (`SESSION_IDLE_MS`); the device stamps each new capture with the current `sessionId` and `turnIndex`, so no session document exists and no write is needed to start one. The home surface lists the current session's captures (newest at the bottom), each with what was understood, what the assistant did with its Undo, any answer, any kept media and any question; earlier sessions are one scroll up, grouped by day under `SectionDivider`, lazily loaded 20 sessions at a time. `sortHelmCapture` reads the session's last 6 turns (their text and summaries, sealed, opened on the server) as context, so "and move it to Friday" after "add call the florist" works.

**Back-to-back messages**. Every message is its own sealed capture and its own bubble. A message sent while the session's last turn is still `received` or `interpreting` (the reply hasn't started) **joins** that turn: the device writes it with `turnLeadId` and adds its id to the lead's `joinedCaptureIds` in one batch (≤9 joined; a tenth starts a new turn), so it works offline too, and a turn held offline gathers everything said before it is read. The call reads the lead and its joined messages in order and gives one reply covering them all ("Got all three"). Mechanics, chosen for cost: no debounce (it would delay every reply); while the model is streaming, a listener on the lead aborts the stream as soon as a message joins (only the tokens already generated are paid; the cached system prompt and tools make the restart cheap) and the call restarts once with every message; the commit transaction checks `joinedCaptureIds` against what the call read, and a message that joined after the restart, or after the commit, is released as its own turn (its `turnLeadId` cleared) and gets its own reply. A spoken pause followed by more speech before the reply starts is the same: the second final transcript is a joined message. A message sent after the reply starts is always a new turn. Each model call counts on the limits; a restart costs at most one aborted call per turn.

### The screen context contract (v1)

```ts
interface ScreenContext {              // stored on the capture as `screen`; built by each view's useScreenContext
  view: HelmView;                      // section 2's union
  focus: RecordRef | null;             // the one record the screen is about (a task sheet, a topic, a who's page)
  visible: RecordRef[];                // ≤20, in screen order: what a "this one", "the second", "all of these" could mean
  v: 1;
}
```

- **Who publishes**: only a **content** view. `views.ts` declares `VIEW_KINDS` with `satisfies Record<HelmView, 'home' | 'content' | 'utility'>`, so a view added later can't build until it picks one. Content: `today`, `comingUp`, `inbox` (Needs you), `who` (the People list and a person, pet or organization), `project` (the Projects list and a project), `task`, `place`, `knowledge`, `topic`, `note`, `procedure`, `run`, `howNomosSeesYou`, and an answer's source (it opens its record's own view, or a synced record's sheet, which publishes the synced ref as focus). Utility: `search`, `settings`, `connection` (Connected apps), `activity`, and every form, which opens over its page and covers the control. Home publishes nothing (its turns carry `screen: null`). A content view calls `useScreenContext(view, focus, visible, label)`, typed to accept only content views, which writes to a small Redux slice (`screen`) and clears it on unmount; `label` is the short name the control and the chip show ("Grandpa", "Car care", "Today"), decrypted, held in memory only and never sent. **Shown and removable**: the conversation opened from a page shows what the turn will carry as an "About Grandpa" chip above the composer before the person speaks; removing it holds for that opening only (it comes back the next time the page's control is tapped), and the turn then sends `view` with `focus: null` and `visible: []`. The contract is unchanged: ids only, re-read on the server. Lists publish their first 20 rows in view; a sheet publishes its record as focus over the list beneath.
- **What the server does with it:** ignores anything but ids and the view name, re-reads each referenced record under the caller's uid (a missing or foreign id is dropped), opens it and adds it to the context package with an alias and a `focus: true` marker. No summary or text from the client is ever trusted. The prompt says "this" means the focus, and "these" the visible list.
- **Caps:** focus 1, visible 20; a focused topic's document goes in whole (≤30,000 characters, section 24); visible records go in as their one-line titles.
- **Why kept in Helm, not shared:** the shape names Helm's views and collections; another app wanting the same thing would share the hook's idea, not its types (light call). The `v` field lets a browser extension or another medium publish a different shape later (section 27).

### The home surface and the voice dock

`HomeSurface` (the conversation) is `/helm`; every other view is a route below it. The **voice dock** sits on home only: `VoiceDock` with **Browse** (opens `BrowseSheet`, the one view-switcher component, fed by `views.ts`; see "The Browse sheet" below), **Talk** (starts a spoken turn through `VoiceControl`) and **Type** (focuses the composer). Doors on home are retired. The capture sheet of earlier rounds is the composer at the bottom of the home surface.

### Asking from a content page

- **One control, one place.** `HelmShell` renders one `AskAboutThisControl` (in `components/shell/`) as a full-width ask bar fixed at the foot of the page, part of the layout and never floating (design's pick, round 6e; the page scrolls above it, with mic and keyboard buttons), reading the `screen` slice: it shows "Ask about Grandpa" from the page's `label` when a content view has published, and renders nothing on home and on utility screens (the slice is empty there). Pages never place their own; they only pass their label and ids through `useScreenContext`. Content pages' headers carry Back, Home (left out when Back already says Home) and ⋯ (`HelmHeader`); Browse lives on home only. Kept in Helm, not shared: no other app has an assistant to ask, and the slot is part of Helm's shell (light call).
- **The tap.** `useLastInputMode` keeps `'voice' | 'typed'` per uid in local storage (written whenever a turn is sent; `'typed'` until the first turn, so a first tap never surprises with a microphone prompt). Voice starts listening **inside the tap handler** (`useVoiceConversation.start` before the route changes, since a phone only grants the microphone and unlocks audio playback within the gesture), then opens the conversation; typed opens it with the composer focused.
- **The conversation over the page.** `AskConversation` is the home surface's thread and composer (`ConversationThread` and `Composer`, the same components `HomeSurface` uses) inside a `Subview` with `overlay`, opened by `?ask=page` in `useHelmUrlState` with its own history entry (`usePageHistory`), so the page underneath stays mounted and keeps its scroll and open state. Its header's way out reads "Back to Grandpa" from the label; Back, the header control and the phone's back gesture all close it and return to the page at the same position. Turns made there join the current session like any (section 21 "Sessions"), so home shows them too.
- **Opened from a sheet** (a task sheet over a project): the overlay keeps the sheet's entry (`keepEntryFor`), and closing returns to the sheet over its page.
- **Leaving for another record from a reply** (a link in an answer, a result line): `afterBackLayersClose` closes the overlay first, then pushes the record's route, so Back from there returns to the page the person asked from, not to the conversation (light call).
- **"Hey {name}" on a content page** opens the same overlay in voice mode with that page's context; on a utility screen it opens the overlay with no chip (the person keeps their place); on home it is the home conversation.
- **Reload** with `?ask=page` reopens the overlay once the page has mounted and republished its context.
- **Proven by `check:back-history`** (new flows in its harness, each driven to its destination as `validation.md` asks): page → ask → Back lands on the page at its scroll; sheet → ask → Back lands on the sheet; ask → a reply's link → the record → Back lands on the first page; reload with the overlay open; "Hey {name}" → Back.

**The Browse sheet**. Tiles, as a bento of mixed sizes by importance (owner, round 6b: "not all tiles need to have the same size"). `views.ts` declares `BROWSE_TILES: BrowseTile[]`, each `{ view: HelmView; importance: 'lead' | 'major' | 'minor'; grows: 'openQuestions' | null }`, plus `BROWSE_FOOT: HelmView[]`. `lead` is the one wide tile (Today), `major` a big tile (Needs you, People, Projects), `minor` a small tile (Places, Knowledge, Procedures, How {name} sees you, and round 6e's Coming up; below `sm` the small tiles may fold into one compact row, design's call). A type-level count over the declaration (a `satisfies` with a tuple check, so `npm run typecheck` is the check) fails the build above one `lead` or three `major` tiles; `importance` is required, and a section added later is `minor` unless a decision log line says otherwise. Needs you carries `grows: 'openQuestions'`: with open questions it is a big tile showing the count and the first prompt; with none it shrinks to a small tile ("Nothing waiting"). Search sits at the top (`SearchInput`, opening the Search view with the typed text); Connected apps, Settings and Activity stay in the quiet foot row. A tile appears only once its view's issue lands; the bento re-flows without holes (CSS grid, `grid-auto-flow: dense`, checked at 320–390px). Importance is fixed in code in the MVP; ordering tiles by the person's own use is Next Steps (section 27). The open view lives in the URL (`useHelmUrlState`), so Back closes the sheet.

## 22. Who: people, pets and organizations, photos and Google Contacts

### Kinds, tiers and roles

- `kind` is `person | pet | organization` (groups and households later, as new kinds). The assistant picks it from the words ("my cat Miso", "Acme Bakery"), and the person can change it on the who's page.
- **Tiers** (`close | regular | passing`): a name that just comes up in a capture is made `passing` (hidden from the Who list under "Others", still searchable and linkable). It becomes `regular` when it is given a key or involved role on a project, linked to a task, or mentioned in three captures over two different days (`engine/whoTier.ts`, pure, run by the executor on write). Only the person makes someone `close` ("Dana is my sister" with a relation the person states counts as their saying so; product owns the exact list). A tier the person set (`tierSetBy: 'person'`) is never changed by the assistant.
- **Roles** on a project live on the project (`whoRoles`, section 2): `key` when the person says the who is central or the project is about them, `involved` when a task on the project names them, `mentioned` otherwise. The project page shows key and involved; mentioned folds under "Also mentioned".

### Photos

A who or place photo is a `media` record with `role: 'photo'`, sealed like any media (section 23). It comes from the person picking one on the page (`PhotoPicker`, shrunk to `avatar` size 512 px), from a photo in a turn the assistant attaches ("this is Miso"), or from a Contacts import. A who shows one photo (`photoMediaId`) and keeps up to 12 in `mediaIds`; a place up to 12. **No face recognition:** a photo is never matched to a who by what is in it, only by what the person or the turn's words say.

### Key dates

Sized for 2,000 who and 20,000 key dates per person; each date is its own `keyDates` document (section 2 "KeyDate"), dates that come back are also entries in the one sealed yearly index, and nothing readable says when any date is.

- **Two kinds.** **Dates that come back** (`shape: 'yearly'`): birthday, anniversary and a custom date with "Comes back each year" on; few per who (≤20); they feed Today and Coming up. **Moments** (`shape: 'moment'`): passed away, met, adopted, started or left a job, moved, graduated and a custom one-time date; unbounded in practice (≤500 per who); precision `day`, `month`, `year` or `decade`; they belong to the who's history and the life timeline and never reach Today or Coming up. Organizations keep both (custom yearly, "Lease renews"; and moments, "Opened · 2019"). The kind decides the shape; only custom asks.
- **How they get in.** Said in a turn ("Mum's birthday is June 3", "we met in March 2015", "Grandpa lived in Lisbon in the 80s"): `setKeyDate { whoRef, keyDateId | null, kind, label | null, dateSpanId, comesBack | null }` (`comesBack` is read only for custom), automatic with Undo (category `remember`), one result line ("Added Mum's birthday: June 3"). Added or changed by hand on the who's page (`source: 'person'`). From Google Contacts' birthday on import. `removeKeyDate { keyDateId }` only when the person asks.
- **Validation (code, not the model).** Parts come only from a resolved date span; a yearly date needs a day or a year (never a month alone, lead's round 6b call); a moment needs its precision's parts; the day exists in the month (29 Feb allowed without a year, and with one only in a leap year); a year is 1900 to this year for past kinds, up to next year for anniversary and custom; custom needs a label (≤60); one `birthday` and one `passedAway` per who: a different date for a kept one is not written but becomes a `whichIsTrue` question (section 2 "Fact"), the new date held in the question's sealed words, and the same date said with more detail (a year, a day) fills it in; per-who and per-person caps from the who's counters and the profile (section 2); a date the person set is never changed by the assistant without the person's words naming it. A refused command is a skipped line, never a guess.
- **Undo** reverses the execution's effects on `keyDates` (create, update with the previous sealed payload, delete with the document kept in the execution), the counter it moved and the yearly index's entry, in one transaction, like any effect (section 9).
- **Today** (quiet lines, never spoken, never a push): from the open yearly index, `selectUpcomingKeyDates` takes the entries with a day whose `nextYearlyOccurrence` (29 February on the 28th in a year without one) falls in the next 7 days (today as day 0, today in the profile's zone, the planner's "today"), drops those whose who is passing, an organization or gone, then orders **close first** (pets and the self count as close), then regular, soonest first within each, and shows at most **3 lines**; when more fall in the week, the last row is a door to Coming up ("+3 more this week"). A year adds an age or count only for birthdays and anniversaries ("turns 32"). Computing it over 4,000 entries is a few milliseconds; it reruns when the index, the tiers or the day change.
- **Coming up** (`comingUp`, a content view and a Browse tile): the next 12 months from today, from the same index with no further read, grouped by month under `SectionDivider`, each month under `LazyMount`. Sorted by day, then close, regular, then the rest; passing people are hidden behind "Show everyone" (a toggle, `AppToggle`); a month shows at most 20 and then "Show N more in March". Only dates that come back appear. Answers ("what's coming up in March?") read the same index on the server, opened once per call.
- **The who's page** takes its dates that come back from the open index (≤20, by next occurrence) and, while open, reads its moments: `keyDates where whoId == X and shape == 'moment'` (≤500, equality only, no composite index), opened and sorted on the device by decade, year, month and day; it shows the newest 3 and "See all 14" from the who's `momentCount`, which can draw before the moments open. A typical who has a handful; a who at the 500 cap is about 150 KB of small documents and 500 decrypts, estimated at 100 to 200 ms at 4× CPU, measured in issue 64. The self's appear the same way in How {name} sees you.
- **See all moments** (`MomentsScreen`, a `Subview`): the moments the page already opened, grouped by decade, then year, on the device (within a year by month and day, a year-only moment after the dated ones, a decade-only moment under its decade as "Sometime in the 1980s"), drawn under `LazyMount` by decade; no further read.
- **29 February** in a year without one falls on 28 February, everywhere. The shared helper `src/utils/yearlyDateUtils.ts` (no app words) holds `nextYearlyOccurrence({ month, day }, todayKey)`, `formatYearlyDate({ month, day, year })` ("June 3", "Aug 1984", "June 3, 1984") and round 6e's `formatMoment({ precision, month, day, year })` ("Aug 2024", "1998", "the 1980s"), with fixed-clock tests across leap and non-leap years and the year's turn. Nine Lives' own `nextOccurrenceOnOrAfter` (which rolls 29 Feb to 1 March and reads today in UTC) moves onto it in the same PR.

### Google Contacts import (picked people only)

- **Consent:** "Bring in people from Google Contacts" on the Who view starts the platform's Google flow (section 19) for `https://www.googleapis.com/auth/contacts.readonly` with `include_granted_scopes=true`. It is a platform connector, `google:contacts`, with one category, `contacts` (kind `person`, mode `live`), read only when the person opens the picker or imports: never synced and never written to `synced`.
- **Under the same unverified-app limits as Calendar** (product asked): `contacts.readonly` is a sensitive scope, not a restricted one (unverified; checked in the import issue against Google's scope list), so it shares Calendar's position: the consent screen's unverified-app warning and the 100-user cap while the site's OAuth client is unverified, and the weekly Reconnect while the consent screen stays in Testing for Gmail and Drive (section 8). It does not need the `google-mail-and-drive` tester gate.
- **The picker** (`ContactsPicker`, a `Subview` with `SearchInput`) reads through `readConnectorOptions({ connectorId: 'google:contacts' })`: the platform pages `people.connections.list` with `personFields=names,emailAddresses,phoneNumbers,photos,birthdays,organizations` and returns up to 2,000 contacts as `{ resourceName, name, email, phone, hasPhoto, organization, hasBirthday }`, held in memory only, never stored. Already-imported contacts (matched by `importedFrom`) show as such.
- **Import:** `importHelmContacts({ resourceNames })` (≤50 per call; the picker batches) re-fetches the picked people with `people.getBatchGet` on the server (the client's list is never trusted for content), matches each to an existing who by email, then phone, then name through `createOptionMatcher` (a match fills only empty fields and asks nothing), creates the rest as `kind: 'person'`, `tier: 'regular'`, `importedFrom: { connectorId: 'google:contacts', accountId, resourceName, importedAt }`, sealed, in one execution with Undo. A contact's birthday (Google's `{ year?, month, day }`, year often missing) becomes a `birthday` key date with `year: null` when Google gives none and `source.by: 'google:contacts'`; it fills an empty birthday only and is tracked in the who's `importedFields` as `birthday` (round 6e: the date itself is a `keyDates` document). A contact photo is fetched on the server (only from Google's photo hosts, allowlisted), shrunk to 512 px, sealed and stored as the who's photo media. The birthday is written as its own `keyDates` document, and its entry is added to the yearly index in the same transaction (`applyToKeyDateIndex`'s server copy).
- **A one-time copy** (PRODUCT.md light call): nothing updates on its own. A who imported from Contacts has "Update from Google" on its page, which calls `importHelmContacts` for that one resource name and fills or replaces only the fields that came from Google and the person hasn't edited since (`importedFields` map of field → hash at import). Disconnecting Contacts leaves imported who records as they are.

## 23. Media in the conversation

### Kinds and caps

| Kind | Accepted | Cap | How the assistant reads it |
|---|---|---|---|
| Photo or screenshot | JPEG, PNG, WebP, HEIC (converted on the device) | shrunk on the device to `cover` (1600 px) for the model and `photo` (1280 px) to keep; 10 MB before shrinking | an image block |
| PDF | `application/pdf` | 10 MB and 20 pages (PRODUCT.md) | its text layer, extracted on the server, up to 12,000 characters to the model; a scanned PDF with no text layer goes as a document block (Claude reads PDFs natively up to its own page limit; unverified current limits) |
| Voice note | recorded in the composer (`audio/webm` or `audio/mp4`) | 5 minutes, 10 MB | transcribed by `transcribeVoiceNote`, charged to voice listening minutes; the transcript is the capture's text |
| Markdown | `.md`, `text/markdown`, `text/plain` with a `.md` name | 20,000 characters (PRODUCT.md), 100 KB | read as text, no vision path; up to 12,000 characters to the model (the whole file when it starts a topic, below) |

Up to 5 attachments per turn (PRODUCT.md); 2,000 kept media per person (a quiet cap row in Settings). Video is Next.

### Flow

1. The device checks the cap, shrinks a photo, makes a 512 px thumbnail, seals bytes and thumbnail with `encryptBytes` under the data key, uploads to `apps/helm/media/{uid}/{mediaId}` and `{mediaId}.thumb` (`application/octet-stream`), and writes `media/{mediaId}` as `uploading`, then `received`.
2. The capture carries `attachmentIds`; `sortHelmCapture` opens each medium (bytes from Storage through the Admin SDK, opened with the person's key in memory) and hands it to the model as above. A PDF's text layer is extracted with a small server dependency chosen in the PDF issue (`pdfjs-dist` legacy build or `unpdf`; licence checked there).
3. `file_results` carries one decision per medium: `keep` or `discard`, a caption (≤200), `attachTo` aliases (records in the context or `$new` refs from this reply) and, for Markdown, `asNote: true` (with `topicAliases`), `asTopic: true` or a record to attach it to. Code keeps a medium only when it is attached to at least one record or becomes a note or a topic; anything else is `discarded`.
4. One transaction writes the medium's decision with the turn's other effects in the same execution, so Undo reverts a keep.

A voice note's audio is always `discarded` by code unless the person taps Keep the recording (its transcript is already the capture's text). Product's light call; the model is never asked about it.

### Markdown as knowledge

When the assistant keeps a Markdown file as knowledge, code (never the model) writes a note with `source: 'importedFile'`, `sourceMediaId`, title from the first `#` heading or the file name, and body = the file text verbatim, filed like any note (its topics then bring it in). With `asTopic: true` ("make this a topic"), code also creates a topic whose version 1 (reason `imported`) is the file split at its headings into sections, each `writtenBy: 'person'` with the note as its source, so the person's words stay theirs; from then on it grows like any topic (section 24). Kept attached to a record instead, it shows as a file row that opens in `MarkdownText`.

### Discarded media and deletion

A discarded medium stays 24 hours with "Didn't keep it · Keep it" on its line in the conversation (design draws it), then is deleted. That line, PRODUCT.md's Keeping and Deleting and "What the AI sees" all name the same promise: a file the assistant didn't keep is deleted within 24 hours, never "as soon as it's read" (the bytes must outlive the turn so Keep it can work). Deletion: Storage objects first, then the document. Three sweeps do this, so no scheduled job is needed: `sortHelmCapture` deletes up to 20 of the caller's expired media at the end of each call, the device deletes expired ones it holds on open, and `deleteHelmData` removes the whole Storage prefix. An `uploading` medium older than 24 hours is deleted the same way.

### Showing sealed media

`useSealedObjectUrl(path, nonce, key)` (`src/hooks/`, general): downloads the sealed bytes, opens them, returns an object URL and revokes it on unmount; cached by path for the session. Runway's receipt image hook moves onto it in the same PR (CLAUDE.md "When a UI primitive is promoted"). Thumbnails load in lists, full images in `ImageViewer`.

## 24. Topics as living documents

- **Reading:** a topic opens on its own route (`/helm/knowledge/topic/{topicId}`) as one formatted document rendered by `MarkdownText` (`src/components/MarkdownText.tsx`, general: `react-markdown` with `skipHtml`, links through `ExternalLinkText`, no raw HTML, no images from outside the app; MIT licence). A parent opens with its overview and a link to each subtopic (drawn by code from the tree), then its own sections. Tapping a section opens `SectionSourcesSheet`: each source as "You said, Nov 3", "Saved answer, Oct 12", "From car-care.md", "General knowledge, checked Oct 14" or "You wrote this", each opening the note, the turn or the file. "History" opens `VersionsSheet`: what changed, when and by whom, newest first; any version can be restored (a new version).
- **How it grows, and what it costs.** Filing a note costs nothing extra: the sorting call that files it may also return `addToTopic { topicAlias, afterSectionId | null, heading | null, markdown (≤2,000), noteIds }` when the note plainly fits a part of the document. Code, not the model, inserts it as a new `nomos` section citing those notes, so the command can't remove or reword anything; it is an automatic `draft` with Undo, a new version (reason `addedFromSource`) and a line in the turn ("Added to Car care: winter tyre size"). A note filed without a block marks the topic `behind`. The **document is rewritten in batches, not on each filing**: when the person opens a `behind` topic (or taps "Bring in 2 new notes"), the device calls `writeHelmTopic({ topicId })`. It claims the topic (`writeClaim`), opens the document and up to 20 pending notes (oldest first; more wait for the next write), and asks the `topicWrite` role (Sonnet-class) for at most 8 section changes (`insert`, `replace` or `merge` of `nomos` sections, and `reorder` or `retitle` of any section, which never touches a `person` section's words; each with its sources and ≤6,000 new characters in all) and a change summary. Code applies them: a change that touches a `person` section, drops a source a kept sentence still needs, or passes the size caps is refused; `version + 1`, `versions/{n}` with reason `addedFromSource` (`rearranged` when it only reordered or retitled; `firstWritten` the first time), `pendingNoteIds` cleared, `docState: 'current'`, one execution with Undo. The screen shows the current document with "Bringing in 2 new notes…" and swaps in the result. Cost: about 8,000–14,000 input tokens (a 30,000-character document plus the notes) and 500–2,000 output, about $0.03–0.07 a write at Sonnet-class list prices (**unverified**, checked at build time); counted on the full route's limits, plus at most 30 topic writes a day per person, past which the topic stays `behind` with "2 new notes will be added tomorrow · Read them now".
- **A parent's overview:** when a parent is opened and any child's `version` differs from `overviewOf`, the `topicOverview` role (Haiku-class) writes ≤1,200 characters from the children's outlines and first sections (about $0.002), saved with the new `overviewOf`; not a version, never touching sections.
- **Revising by asking:** "make it shorter", "rewrite the intro", "move the fragrance part to its own topic". The model returns `reviseTopic { topicAlias, changes (as above, `person` sections allowed), changeSummary, requestQuote }`. **Only when asked:** `requestQuote` must be a verbatim span of this turn's text and the topic the turn's screen focus or named in it, else code refuses it (logged `topic-revise-unasked`) and writes nothing. Code checks the `version` hasn't moved since the turn began (else re-reads and asks the model once more), writes the version with reason `revisedOnRequest` and the quote, in one execution. Without a request, the assistant can only add (`addToTopic`), write and reword its own `nomos` sections from their sources (headings, order, joining sentences, logged in History), and move a topic under an existing parent; the person's words are never removed or reworded.
- **By hand:** `SectionEditSheet` edits one section (heading and Markdown) or adds one; the result is `writtenBy: 'person'` with a `person` source, saved as a version with reason `personEdit`.
- **Nesting:** the person's move, the assistant's `moveTopic` under an existing parent (a `moved` version on the topic), or a yes to `groupTopics` (a `grouped` version on the new parent, `moved` on each child). Depth ≤3 and no cycles are checked on the device and in the server's command check; moving a topic recomputes `depth` for it and its subtopics in one transaction, refused if any would pass 3.
- **Asking while viewing:** the topic is the screen focus, so a question goes to the full model with its whole document (≤30,000 characters) in the context; the answer cites the sections it used.
- **History and Undo:** History lists typed rows (added from a source, your edit, changed on request with the quote, moved, grouped, rearranged, restored). The newest row has Undo, which reverses that change (a move or a group puts the tree back); any older row offers Restore, which writes that version's sections as a new version (reason `restored`).

## 25. Procedures and runs

- A **procedure** is a reusable routine ("Packing for a work trip", "Closing the cabin"): a title and steps in optional groups, versioned like a topic document. Commands: `createProcedure` (an automatic `draft` with Undo), `reviseProcedure` (a new version, same rules as `reviseDoc`), `startRun`.
- A **run** is one use of it, attached to a project, a task or a synced trip or event (`RunAttachment`). Starting a run copies the procedure's current steps into the run's own `stepState` and sealed `steps`, with `procedureVersion`, so a run keeps the steps it started with whatever the procedure becomes later (PRODUCT.md). Ticks are dotted-path updates on the run's readable `stepState` map (offline-friendly, no execution). A step added during a run is `isExtra` ("this time only"); "Add to the procedure" on it writes a procedure version with reason `fromRun`.
- A **task with steps** stays a task: its steps live on the task (`steps`, `stepState`) and never become a procedure unless the person says "make this a routine", which copies them into a new procedure.
- Group boxes with partial state are `ChecklistGroup`, moved from Runway to `src/components` in the runs issue with Runway's import (logged in round 3, still holds). `utils/procedureMarkdown.ts` builds the Markdown for Copy.
- A run attached to a synced event that has left the calendar keeps its sealed snapshot of the event's title and date ("From Cake tasting, Nov 8, no longer on your calendar").
- The planner (section 11) is unchanged: it plans tasks, not runs; a run's attachment shows on Today when its event is today.

## 26. How Nomos sees you, and writing style

### Preferences, favorites and identity

These are facts (section 2) with `kind` and `topic`; "How Nomos sees you" (`HowNomosSeesYou`, one route) lists the self who's facts grouped by kind, then topic, each editable (Correct writes a new fact and supersedes the old; Forget deletes with Undo), and the style notes below. Facts about other people stay on their who page.

### Learning the writing style

- **From what the person types to Helm:** `learnHelmStyle` (callable, the `style` role on the quick model) runs on the device's request after every 25 new typed captures (never voice transcripts: speech isn't writing), over the last 50 typed captures' text, opened on the server. It returns at most 12 traits and 6 "avoid" lines, each with how many of the samples showed it (`exampleCount`), and code merges them into the `general` profile: a trait the person set or edited is never replaced; a learned one is replaced when its count drops below 3.
- **From sent mail** (needs the Gmail grant and so the `google-mail-and-drive` gate): "Learn from my sent mail" reads up to 300 sent messages from the last 6 months (PRODUCT.md) live through the platform's Gmail connector (`q: in:sent newer_than:6m`, bodies stripped of quoted replies and signatures by code, each cut to 1,500 characters), sends them to the `style` role in batches of 50, and merges the batches' traits with their counts into `occasion` profiles (work email, personal email) and `audience` profiles only for who records the person already has. **Nothing read is stored**: only the traits, with counts. About 300 × 1,500 characters is roughly 110,000 input tokens on the quick model, a few cents a run (unverified price); counted as 6 calls against the quick route's limits.
- **Where it shows:** under "How Nomos sees you", each note with "Based on 34 examples" and Edit / Remove. Used now only to shape the assistant's own free writing (summaries stay code-built); drafting in the person's style is Next.

## 27. What keeps the future open

Nothing here is built in the MVP; each line names the MVP field or contract that keeps it a feature rather than a migration.

- **Milestones and a life timeline**: moments are the timeline's first source. One who's timeline is the who page's own read (`whoId ==`, ≤500, sorted on the device). The person's whole life gets its own sealed **moment index**, built in the Next issue, in the yearly index's shape: compact entries grouped by who, one document per decade (`meta/momentIndex-1980`), because 20,000 moments at about 75 bytes each (about 1.5 MB) can't fit in one. That issue builds it once from every moment, read in pages, and from then on every moment write updates it in the same transaction. It does not read moments who by who: 2,000 queries to draw one screen. Dates that come back join it only as their first year when known (a wedding). Facts' `occurredOn` and media's `takenAt` merge in on the device; a `lifeEvents` collection stays reserved (Next) only for events no who owns. No existing record changes shape.
- **App cards in the conversation:** a turn renders a list of conversation items, a union with a `default` fallback that draws any unknown kind as its title line; a later `card: { appId, kind, ref }` on an answer source or a synced record lets Pinch draw a recipe card or Waypoint a trip card from its own manifest, inside Helm's conversation, without Helm knowing the app's words. The connector contract's sealed `extra` already carries what such a card needs.
- **Other mediums (a browser extension, a watch, a share sheet):** every capture records `medium` (`'web'` now); every callable takes text, attachments and a screen context with a version, so an extension can call `sortHelmCapture` with `medium: 'extension'` and its own `ScreenContext` shape (`v: 2`: the page's URL and selected text) and a share target can post media through the same flow. The MCP server is already a server; exposing it over HTTP with MCP's OAuth (Beyond, "Helm in Claude.ai") reuses its tools unchanged.
- **Orders from other places:** `SharedKind` can gain `order` (a delivery, a purchase) for a mail-reading or store connector, landing in `synced` like any shared kind.
- **Video:** `MediaKind` gains `video`; the media flow, sealing and deletion are the same, with a frame sampler before the model.
- **Briefings and drafts as topics:** an assistant-drafted briefing or plan (Next) is a topic whose sections cite their sources, so it needs no new collection.
- **Drafting in the person's style:** the style profiles exist and are scoped by occasion and audience; an outbound category (Next) uses them.
- **Browse ordered by use:** tiles carry a declared `importance`; a later ordering by the person's own use counts each view's opens on the device (never on the server) and changes only the order inside each size, never the cap (Next).
- **Groups and households:** new `who.kind` values with member links; tiers and roles already apply.
- **Apple contacts and sign-in:** site-wide work (an auth provider, a connector), not Helm's.
