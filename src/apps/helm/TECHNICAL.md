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
  assistantName: string | null;        // null = DEFAULT_ASSISTANT_NAME ("Nomos"); 1–16 chars passing readAssistantName; also the wake word
  assistantTone: AssistantTone | null; // null = 'composed'
  theme: HelmTheme | null; // 'chestnut' | 'plum' | 'teal' | 'indigo'; null = 'chestnut'
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

`readAssistantName` (`utils/assistantName.ts`, vendored to the server by `check:server-copies`) trims, collapses spaces and accepts 1–16 characters of Unicode letters, numbers, inner spaces, hyphens and apostrophes, else null; it goes into a prompt, so the server reads the stored name through it too. `useAssistantName()` returns `readAssistantName(assistantName) ?? DEFAULT_ASSISTANT_NAME`; every copy line that names the assistant is a template in `constants.ts` filled with it, and `check:helm-copy` fails on a literal "Nomos" under `src/apps/helm/components`. The wake word is `readWakePhrase` over "hey {name}" (`toWakeSpellings`, section 20); a renamed assistant answers to its new name.

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
  attachmentIds: string[];             // round 6: media ids, ≤5 (PRODUCT.md); built in issue 52, [] on a turn with none or made before it
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
interface AnswerQuote { id: string; connectorId: string; accountId: string; sourceLabel: string; at: number | null;
  text: string | null; record: { name: string; detail: string | null; amount: string } | null;  // record: an app's row, null on mail/documents and on quotes kept before it existed (read from sourceLabel and text)
  deepLink: string | null; deletedAt: number | null; }
interface SearchedSource { connectorId: string; accountId: string; label: string; at: number; found: number; failed: string | null; }
interface CaptureReading { people: Token[]; places: Token[]; documents: Token[]; commands: Token[];
  isUrgent: boolean; dates: DateSpan[]; addressedAs: Token | null; }
interface Token { id: string; text: string; start: number; end: number; }
interface DateSpan extends Token { due: TaskDue; }
type SourceRef =
  | { kind: 'fact' | 'note' | 'task' | 'project' | 'who' | 'place' | 'procedure' | 'media' | 'topic'; id: string } // round 6: who, procedure, media; round 6d: topic
  | { kind: 'event'; eventRef: string; title: string; startAt: number }
  | { kind: 'synced'; id: string; connectorId: string; title: string | null; startAt: number | null };
  | { kind: 'connection'; connectorId: string; accountId: string; name: string; label: string | null };   // a list_connections or connection_status result (c1, c2, …): an answer about the connection itself
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
  clearedAt: number | null;            // issue 46: set by "Clear done tasks"; hides a done task from its project's Done fold, never from Search
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
**As built (issue 45).** Projects live at `apps/helm/users/{uid}/projects/{id}` under the owner rule, listened whole (cap 500, legacy-safe), with a second listener for tasks that have a `projectId` (all statuses, cap 1000) because the open-task cache is capped at 150 and the evidence line needs done tasks. `selectProjectEvidence` (pure, `engine/projectEvidence.ts`, checked by `check:helm-evidence`) builds at most two parts, in the order overdue, next due (the next dated open task and its day count), quiet days (10 or more with open tasks) and a key person's open tasks; with no part it reads "No tasks yet", "N open, no dates yet" or "On track: nothing overdue"; all done offers Finish. The server reads `createProject` (at most one per turn; an active name the matcher surely means links instead, "The wedding" beside "Wedding" included), `createTask.projectRef` (matched with `createOptionMatcher`; unsure links nothing and asks nothing) and `setProjectRole` (raises only; a role asked of a project with no active one by that name is kept out and reported as "Couldn't find a project called Move"; a named who is added as `mentioned` only to a project started in the same turn that files no unrelated tasks) from a separate `projects` output of the normalizer, plans them in `planProjects.ts`, and records each as a `create` or an `update` effect carrying the earlier `whoRoles` and `roleNotes`, so Undo deletes or steps back. A key or involved role raises a passing who to regular through `readWhoTier`; a person-set tier is never changed. Roles changed on the device may lower a role; the assistant only raises. Roles already on a project are not fed into the server's tier read, only roles given this turn. Delete runs chunked transactions that set the tasks' `projectId` to null, and its Undo restores the project and re-links the same tasks that are still unlinked. A forgotten who leaves its id in `whoRoles`; the device ignores ids it cannot name. Tasks of a finished project stay where they are, in Today and everywhere else; hiding them waits. The screen-context sanitizer accepts `projects` and `project`. Covered by `check:helm-projects` and two `check:helm-undo` cases.
**As built (issue 46).** Milestones are the two-map shape: `milestoneState[id] = { date, order, doneAt }` (readable; `date` date-only UTC midnight) and sealed `milestones[id] = { title }` (at most 80 characters, 30 a project). Readers on the device and in `projectStore.ts` skip an entry with a missing field or a non-finite number, and a state with no title (or a title with no state) is not a milestone. `addMilestone`, `editMilestone` and `removeMilestone` (`projectActions.ts`) run in a transaction that re-reads the project before the first write, so another device's edit to the same sealed payload survives; a date change is the dotted path `milestoneState.<id>.date`, a removal is `deleteField()` on the state path plus a reseal without the title, and each returns an Undo that puts back the earlier title and date, removes the milestone while it is still there, or puts back the same id, state and title while the id is free. A tick is the one-field dotted write `milestoneState.<id>.doneAt`, not awaited, so it works offline; ticking a milestone another device has just removed leaves a partial `{ doneAt }` entry that readers skip. Tasks gain `clearedAt` (null on every create, legacy reads as null; a device tick or reopen sets it back to null). `clearDoneTasks` takes the ids of the project's uncleared done tasks from the `projectTasks` cache (no query, no index), then in chunks of 400 a transaction re-reads each and sets `clearedAt: now` only on a task still `done`, in the project and not cleared, so the count it reports is what it really cleared while a second device ticks or reopens; a failed chunk puts back the chunks already cleared. Its Undo clears `clearedAt` only where it still holds that stamp. A cleared task stays in the cache and in Search. The evidence line's next part is the next deadline: the soonest of the next open dated milestone and the next dated open task (a milestone wins a tie), and an open milestone whose day has passed counts in neither overdue nor next. On the server `addMilestone` (at most 3 a turn, title 80, its date read from the date span like a project's) is planned in `planProjects.ts` with the roles, so a project gets one write holding both; a project the matcher does not find is reported like a role's, a title already on the project (`toComparable`) is not added again, and a thirty-first is reported. Each added milestone has its own `update` effect on the project whose written and previous values are the entries under dotted paths (`milestoneState.<id>`, `sealed.milestones.<id>`, previous `null`), so the turn's Undo (`planUndo.ts`) compares and removes each entry alone: one ticked, moved or retitled since stays and the others still go. `<open_projects>` lists each project's open milestones (titles and dates, at most 10). Covered by `check:helm-projects`, `check:helm-evidence` and `check:helm-undo`.


### `Who` (people, pets, organizations) and `Place` [MVP]

Reusable entities, upsert on first mention. The server matches `@Dana` or a name the model read through `createOptionMatcher` over `name` + `aliases` of every who, any kind (section 5, "Matching on the server"). One sure match links; two candidates or a weak one become a `whichPerson` question ("Which Miso?" when a cat and a person share a name, the kind in each option's detail) with "Someone new"; no match creates one, written with `toDisplayCase`. The assistant's own name is never matched.

**As built (issue 34).** Who and places are `apps/helm/users/{uid}/who/{whoId}` and `places/{placeId}` (owner rule), their words sealed like a task's (`WhoSealed`, `PlaceSealed`), each listened to whole. The model's reply names `mentions` (name, kind, relation, species, organization kind; at most 10) and `places` (at most 5), and `createTask`/`updateTask` point at them with `whoRefs`/`placeRefs`. `matchEntities.ts` (pure) gives each a sure match, a new one, or unsure; an unsure result lists its candidate ids, best first. A name equal to the assistant's is dropped. An unsure name a filed task points at links nothing and asks instead (issue 35): the task is made at once, and the capture gets one code-built `whichPerson`/`whichPlace` question per distinct name (at most 3, 2-4 candidates plus new and none, each candidate's `detail` is what tells it apart) that holds the link in `heldCommands`, so the capture stays `needsYou`; a spoken turn's line ends with it ("Which Sam, Sam Rivera or Sam Patel?"). `resolveHelmQuestion` answers it in one transaction (links the held tasks that still exist, or makes the who/place the way a turn does on `new`, or links nothing on `none`; a person-set tier is never raised) and writes one Execution with `questionRef`. A name no task points at still asks nothing. The turn's transaction reads the person's who and places, writes new ones (effects on `who`/`places`, so Undo deletes them), sets the task's and the capture's `whoIds`/`placeIds` and `lastMentionedAt`, and raises a passing tier through `readWhoTier` (a copy of `engine/whoTier.ts`, kept by `check:server-copies`). Who and places are made only when the turn files a task. The self who (`self`, `isSelf`, Close, set by the person) is made on the device on first open, in one transaction with `profile.selfWhoId`. Not built yet: editing, forgetting, photos, key dates, facts on a who, a who as an ask-bar focus, and a tier that falls back after an Undo.

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
- **The cap**: one index holds at most **2,000 entries** (about 240 KB sealed with ordinary entries, about 755 KB in the worst case of 2,000 custom dates with 60-character non-ASCII labels, under Firestore's 1 MiB document limit; 4,000 such entries measured 1.5 MB). The write that would pass it instead splits the index into twelve month documents (`meta/keyDateIndex-01` … `-12`, by the date's month), moves every entry in one transaction and deletes the single document; readers look for the single one first, then the twelve. Twelve documents hold up to 24,000 entries, above the 20,000 cap; one month holding far more than its share is the case a later split by size would cover.
- **Caps**: 2,000 who and 20,000 key dates per person (`HELM_CAPS`), the index's 2,000 entries before it splits; per who, 20 dates that come back and 500 moments, checked against the who's `yearlyDateCount` and `momentCount` inside the write's transaction, which updates them in the same batch.

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

**As built (issue 40).** A turn's `noteFact` command (statement, verbatim `quote`, `isStated`, `whoRefs`/`placeRefs`; at most 5) is written by `executeCommands.ts` as a `facts` document with an effect `create` (category `remember` when the turn made no task), so the turn's Undo deletes it while untouched. Provenance is code: `confirmed` / `personSaid` / `confirmedAt` = capture time only when `isStated` and the quote is a substring of the capture (case and whitespace ignored); otherwise `inferred` / `nomosInferred`, the quote kept only if it is a substring. A fact needs a sure subject (the task matching); no subject or an unsure one drops it without a question, and an exact repeat is not written again. `buildContext.ts` gives the model the confirmed and inferred facts about the people and places the capture names (at most 20, "said" or "inferred"). `kind` is written `world` and `occurredOn` null (issue 41). On the device `memoryActions.ts` confirms, corrects (a new `personCorrected` fact, the old one `superseded`), forgets and adds a fact, each with a toast Undo that applies only while the fact is as it was left; forgetting a who or place deletes the facts it alone is about and removes its id from the others. The `facts` index (`status`, `createdAt DESC`) serves the facts listener, which also reads superseded facts for "Was ... until ...".

**As built (issue 41).** `noteFact` also carries `factKind`, `topic`, `value`, `isSensitive` and `isAboutMe` (all required, null where they do not apply). `isAboutMe` files the fact under the profile's `selfWhoId` (read in the write's transaction; with no self who the fact is dropped). The topic is lowercase and matched with `createOptionMatcher` (`foldPlurals`) against the topics of the person's facts of the same kind, read with the repeat check, so "gas stations" files under "gas station"; the repeat key now includes kind and topic. `nomos/sensitive.ts` holds the category list the prompt names and `shouldKeepSensitive` (kept only when `personSaid` and the only subject is the self who); a dropped one writes nothing and adds one "Not kept · …" line, to the execution's summary when the turn filed something and otherwise as the turn's quiet line. `buildContext.ts` sends up to 30 of the self who's preference, favorite and identity facts in `<about_you>` (alias, kind, topic, value, statement, said or inferred), read from the same newest-300 query as the subject facts, and gives every fact an alias (`f1`…) that an answer cites in `sourceAliases` as a `fact` source. On the device `selectSelfFacts` feeds `HowNomosSeesYou` (Settings row and Browse tile); `correctFact` keeps kind and topic, and the add sheet saves `confirmed` / `personSaid` on the self who. No rules or indexes change.

**As built (issue 42).** `noteFact` also carries `contradicts`, the alias (`f…`) of a fact in context the new one disagrees with; normalize keeps it only when it is a known alias, as the fact's id. `planWrites` treats a new fact (after the sure-subject, sensitive and repeat steps) as contradicting an existing confirmed or inferred fact X when X is not already disputed, shares a subject and says something different, and either the model named X or both are a preference or favorite on the same topic and subjects with a different value; an exact repeat stays a repeat. It writes the new fact as usual with `disputedWithId: X.id`, marks X `disputedWithId: newId` (an effect `update` on X holding the previous `null`, so the turn's Undo clears it; X's words and status never change) and asks one code-built `whichIsTrue` question (`summaries.ts`: "Which is true now?", options old then new as `{ id: factId, label: statement, detail: "You said · Nov 3" (by the fact's `stated`: "You confirmed" for an inference the person kept, "{assistant} inferred" for one they did not), ref: { collection: 'facts', id } }`, then `none` "Neither"; held command `{ kind: 'settleFact', factIds: [older, newer] }`; spoken "Which is true now: … or …?"). It counts toward `MAX_PICK_QUESTIONS`, a contradiction taking its place before a "which person" question does. `resolveHelmQuestion` answers it in one transaction through `planResolve`: both facts must still be in dispute with each other, else the question is closed as stale (`answeredAt` now, its sealed answer `optionId: 'none'` with `isStale: true`, status recomputed, no Execution and no fact written) and the callable returns `{ executionId: null, isStale: true }`, which the device and the voice turn into "That changed since." with no toast or Undo (a held question never stays stuck; a turn card lists only asked questions, so the stale answer is never drawn); the pick becomes `confirmed` (`stated` kept, `confirmedAt` kept or now) with `disputedWithId: null`, and the other `superseded` by it (`supersededById`, `supersededAt`); a newer pick with no `supersedesId` gets the older one, so "Was … until …" follows. "Neither" sends `text` (at most 500, only with `none`) and makes a `confirmed` / `personCorrected` fact on both facts' subjects with `supersedesId` the newer one, no quote or capture, and supersedes both. One `remember` Execution holds every update with its previous values (and the create), so Undo reverses it through the usual planner. Undoing that Execution reopens the question (`planReopen` in `planUndo.ts`: `answeredAt: null`, `sorted` back to `needsYou`; for `whichIsTrue` and, since issue 51, `groupTopics`; never an asked question), so a dispute that comes back always has its question; answering it from a sheet (Needs you, a fact's Settle it) shows "Kept “…”" or "Saved what’s true now" with Undo. A contradiction is filed only while the turn has room for its two effects under Undo's cap. A fact that exists but cannot be opened refuses (`failed-precondition`) instead of closing the question, and a stale close also frees a surviving fact whose partner is gone or no longer points back. "Neither" by voice says "Tell me what's true now on the card." and sends nothing. On the device a fact counts as disputed only when its partner is loaded and points back (`getDisputePartner`), and Correct or Forget on one closes its question. `FactSheet` finds the open question that lists the fact and shows it in place ("Settle it"; "Neither" swaps the card's options in place for one field "What's true now?" with Save and a quiet Back; the sheet holds the typed words, so its Back, close and swipe all ask Keep editing / Discard); a disputed fact hides Confirm, and `correctFact` and `forgetFact` clear the partner's `disputedWithId` in their transaction (their Undo puts it back). "Was … until …" follows both `supersedesId` and every fact whose `supersededById` names the fact shown. No rules or indexes change. An app copy against a Helm fact is still the derived `discrepancy.ts` question, which compares clock times and places on an event only, so a date-only copy (a vet visit) is not covered yet.

**As built (issue 44).** A moment is a `keyDates` document with `shape: 'moment'` and `precision` (`day | month | year | decade`) sealed with the rest; a moment's year is always set (a decade's first year) and its month only for month and day precision. It never enters `meta/keyDateIndex`, so Today and Coming up cannot see it. The who's `momentCount` moves by `increment(±1)` in the same transaction as each moment write (cap 500 per who, checked by `planKeyDates` from the count). The reading carries `DateSpan.precision` (a bare year after "in", "in the 80s" and "March 2015"); the server sets a moment's precision and parts from the span alone and never from the model's numbers. A different birthday or passed-away date from the kept one writes nothing and becomes a `whichIsTrue` question holding `{ kind: 'settleKeyDate', keyDateId, parts, keptParts }` (the kept date as asked: an answer after it changed is refused as `changed`, "That date changed since."; a held question without `keptParts` is not compared); `planResolve` rewrites the parts (and the index entry when yearly) for the new date with an update effect, and answers the question with no write for the kept date or Neither (which the device follows by opening the kept date's edit sheet and answering when it is saved). The moments a turn reads in its transaction are only those of the people its moment commands name (`namedMomentWhoIds`, up to 500 each): they find the kept passed-away date and skip a moment already stored with the same person, kind, label and parts (no write, no counter change). The same clash twice in a turn asks once, and a date with an open `settleKeyDate` question (read from the open Needs you turns, only when the turn says a birthday or passed-away date) asks nothing new. A decade moment's year must be a decade's first (`checkMomentParts`, both copies); the reading's coarse spans reach the model with `precision` and no `due`. Anniversary is never a moment kind: the add sheet lists the moment kinds and custom for a moment, birthday, anniversary and custom for a date. The who page opens one listener on `keyDates where whoId == X and shape == 'moment'` (≤500), sorted and grouped on the device. No rules or index change: the owner rule covers `keyDates` and both queries are equality-only. Opening and sorting 500 moments takes about 25 ms and 1 ms in Node (`check:helm-key-dates`). Search's moment pages come with Search (issue 59).

**As built (issue 43).** Dates that come back are `apps/helm/users/{uid}/keyDates/{id}` (owner rule via the collection list) with readable `whoId` and `shape` (`yearly` or, from issue 44, `moment`) and the rest sealed (`KeyDateSealed`: kind, label, month, day, year, captureId; a day-less "Birthday · June 2020" is allowed, a month alone is refused by code on both sides). A sealed index at `meta/keyDateIndex` (`{byWho}` of `[id, kind, month, day, year, label]` tuples, readable `entryCount`, `rebuiltAt`, `lastEditedAt`) lets Today and Coming up read every date with one listener; past 2,000 entries it splits into `keyDateIndex-01` to `-12` by month. Every date write updates the document, the who's `yearlyDateCount` and the index in one transaction (server: `keyDateStore.ts` and `planKeyDates.ts` in the sort transaction; device: `keyDateActions.ts` with Undo, `keyDateIndexStore.ts`). There is no composite index: the queries are `keyDates where shape == 'yearly'` and `keyDates where whoId == id`. The model's `setKeyDate` and `removeKeyDate` commands go through schema, `normalizeNomosReply`, `planKeyDates` (cap of 20 per who, 20,000 in all with a margin, a clashing different birthday or passed-away date becomes a "Which is true now?" question (issue 44) and writes nothing, the same date with a year filling the year in) and Contacts' import writes a birthday into an empty one only (`importedFields.birthday` digest keeps an edited one on Update from Google, and an edited or removed one stays). Undo is device-only: a made date is deleted, a filled year goes back, a removed date is recreated under its id from `previous` (recorded as an `update` so it counts as taken back), counters move by `increment(±1)` on the server and clamp at 0 on the device and the index is rewritten in the same transaction. Forgetting a who deletes its dates and index entries and Undo restores them. `useKeyDateRepair` rebuilds the index and counters after a mismatch of `entryCount` against the sum of counters persists 4 seconds, once per mismatch, never offline. Next occurrence, 29 February on the 28th and "today in the person's zone" come from `@/utils/yearlyDateUtils` (Nine Lives' cat anniversaries follow the same 29 February rule in their own helper); `check:yearly-dates`, `check:helm-key-dates` and the key-date cases in `check:helm-undo` and `check:helm-contact-import` guard it. Sealing a 4,000-entry index takes about 12 to 14 ms and opening about 10 to 17 ms in Node (about 475 KB sealed).

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

**As built (issue 47).** Notes and topics are `apps/helm/users/{uid}/notes/{id}` and `topics/{id}` (owner rule via the collection list), sealed with `NoteSealed` and `TopicSealed` as above; the hand-made ones are `source: 'typed'`, `createdBy: 'person'`, `projectIds: []`, and a topic is `docState: 'empty'`, `version: 0` with no sections (the document, versions and the assistant's filing come with later issues). Two whole-collection listeners (notes 1,000 ordered by `createdAt` descending, topics 100) open the sealed parts, skip a document that will not open and default every field a legacy document lacks; the store keeps `notes` and `topics` and `knowledgeSelectors.ts` derives the tree (A to Z at each level), each topic's notes and the loose ones on the device. `utils/topicTree.ts` is the one place depth, cycles and caps are decided (`moveRefusal`, `legalParents`, `createRefusal`, `depthAfterMove`, `liftChildren`, from the tree's shape and the parent's stored depth; `check:helm-topic-tree`). `moveTopic` is one transaction that re-reads the topic, its subtopics and the new parent, refuses with "changed" when any differs from what the caller saw, and writes the parent and every depth; its Undo is the same call back. `deleteTopic` removes the topic id from its notes (transaction chunks of 400, notes first), then in one transaction lifts each subtopic to the deleted topic's parent with depth minus one and deletes the topic, so a failure never deletes a topic notes still name (the cut notes are re-filed); its Undo sets the topic back under its id, moves the subtopics back only where each is still as the delete left it and re-files the notes that still exist and hold fewer than ten topics (a topic whose parent is gone comes back at the top level, and a step that fails after it is back says so). `editNote` writes only the fields the person changed into a re-read of the note (title and body in the live sealed payload, topics as a diff against the live list) and sets `checkedAt`; its Undo restores a field only while it is still as the edit left it. A move or a subtopic create re-checks depth only against the subtree this device has loaded, and the 20-subtopic cap is not re-checked inside the transaction. A topic or note made offline is a plain `setDoc` handed back unawaited; a subtopic, a rename, a move, a delete and an edit need a connection. The new `notes` and `topics` collections join the owner rule's list (`check:helm-rules`); both queries are single-field, so no index. `LinkedText` (shared) draws a note's web links as `ExternalLinkText`. The server's `sanitizeScreen` knows the `knowledge` and `topic` views, so a turn asked from them names its page (no note or topic ids travel yet).

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

**As built (issue 54).** Procedures only; runs come later. `Procedure` is `{ stepState, groupOrder, version, createdBy, sourceCaptureId, sourceTaskId, executionId, createdAt, lastEditedAt, sealed }`: `projectIds`, `runCount`, `lastRunAt` and `archivedAt` wait for runs and filing, and `sources` is not kept. `sourceTaskId` names the task whose steps it was made from (null otherwise); a task with one offers "Open {title}" instead of making another, and the server refuses a second create from the same task. `ProcedureVersion` carries its own `stepState` and `groupOrder`, `reason` is `'created' | 'personEdit' | 'revisedOnRequest' | 'restored'` (`fromRun` comes with runs), and its sealed part adds `requestQuote` (the turn's words when it was revised by asking). Caps in the rules: 60 steps, 12 groups, `version` an integer ≥1, `createdBy` `person` or `nomos`. Steps are ordered by `groupSteps` (`utils/stepGroups.ts`, a server copy guarded by `check:server-copies`).

**As built (issue 55).** `ProcedureRun` at `users/{uid}/procedureRuns/{runId}` is `{ procedureId, procedureVersion, attachedTo, dueOn, stepState, groupOrder, startedAt, finishedAt, createdBy, executionId, lastEditedAt, sealed }`. `attachedTo` is `{ kind: 'project' | 'synced', id }` or null (a task is not offered); `dueOn` is date-only (a trip's or event's first day). `stepState` copies the procedure's step and group ids with `doneAt` and `isExtra`; the sealed part carries the steps' text and detail, the group names and the label of what it was for, so a run reads the same after its procedure or trip changes. Caps in the rules: 80 steps, 12 groups, `attachedTo` only those two kinds; the device and the server also hold extras to 20. The procedure keeps no run count; runs are listed by query (indexes on `procedureId` and `attachedTo.id`, each with `startedAt` desc), and open runs (`finishedAt == null`, up to 50) are listened to eagerly. Deleting a procedure deletes its runs that were on their own (`attachedTo` null) with it, and Undo brings them back; runs on a project or trip stay there. Open runs whose procedure is gone are kept out of the model's context. `ProcedureVersion.reason` adds `'fromRun'`.

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
  text: string | null;                 // a Markdown file's text (≤20,000) or a voice note's transcript (≤5,000, kept even when the audio is let go); a PDF's text is never stored
  bytesNonce: string | null; thumbNonce: string | null; // nonces for the sealed Storage objects
  keyId: string;                       // the data key that sealed the bytes
}
```

A voice note's transcript becomes its capture's `text`, so it outlives the audio; the audio itself is `discarded` by code (never by the model) unless the person taps Keep the recording (PRODUCT.md light call, round 6).

Bytes are sealed on the device with `encryptBytes` (`@lib/security`, Runway's receipt path), so Storage only ever holds opaque bytes. Section 23 has the flows, caps and deletion.

**As built (issue 37).** Photos only, so `Media` carries just the fields photos use: `kind` (`'photo'`), `role`, `status`, `mimeType`, `hasThumb`, `attachedTo` (`{ kind: 'who' | 'place'; id }[]`, not the screen context's `RecordRef`), `decidedBy`, `createdAt`, `decidedAt`, `deleteAfter`, and `sealed` holding `bytesNonce`, `thumbNonce` and `keyId` (a photo sealed under another key is refused, not shown). `byteSize`, `width`, `height`, `durationMs`, `pageCount`, `takenAt`, `sourceCaptureId`, `executionId` and the sealed `fileName`, `caption` and `text` arrive with the issue that reads them. A who's `mediaIds` holds every photo it keeps (at most 12) and `photoMediaId` names the main one among them; a place's `photoMediaIds` is the ordered list and its first is the cover. The rule for `…/media/{mediaId}` is its own match (owner-only, with the readable shape checked), not the wildcard's list.

**As built (issue 53).** PDFs, voice notes and Markdown files. `Media.durationMs` (a recording's length as the device measured it) and `Media.pageCount` (a PDF's pages as the device counted them; the server counts again) are new, null on a photo. `MediaSealed.bytesNonce` is now nullable: a Markdown file has no Storage object, its text is sealed in the document as `text` (≤20,000) with its `fileName`; a voice note's `text` is its transcript, sealed by the server (≤5,000); a PDF's text is never stored and is read again on each turn that opens it. `MediaAttachment.kind` adds `'note'`: an imported Markdown file is kept on the note made from it, so deleting the note releases it for 24 hours like a task's photo. The listener reads a missing `kind` as `'photo'` and missing new fields as null. The media rule now accepts the four kinds, each with its own content type (`image/*`, `application/pdf`, `audio/*`, `text/markdown` or `text/plain`).

**As built (issue 52).** Photos sent in a turn. New fields: `Capture.attachmentIds` (the turn's photos in pick order, at most 5, `[]` on a turn made before), `Media.sourceCaptureId` (the turn that sent it; null on a who's or place's photo), `Media.executionId` (the execution that kept it, so Undo finds it; null until one did) and `MediaSealed.caption` (the assistant's one line about a kept photo, at most 200; null on any other). `MediaAttachment.kind` widens to `'who' | 'place' | 'task' | 'fact'`; `PhotoOwner` (`who | place`) stays the type of a who's or place's picture. Keep targets are tasks and facts only: projects, a who's own photo ("this is Dana") and facts noted in the same turn come later, as do MCP and file uploads into notes or topics (`asNote`/`asTopic` are not built).

| Moment | `status` | `deleteAfter` |
|---|---|---|
| Upload started on the device | `uploading` (then `received`) | now + 24 h, so an upload that never finished is swept |
| Sent with a turn | `received` | `null`; `sourceCaptureId` set |
| Kept (by the assistant, or "Keep it") | `kept` | `null` |
| Read and let go | `discarded` | now + 24 h, never sooner |
| Removed from its record, or its keep taken back by Undo | `discarded` | now + 24 h |
| A held or failed turn's photos, when it is made a task as written | `discarded` | now + 24 h |

The server reads a photo only for the capture it was sent with (`sourceCaptureId`) and only while `received`. Let-go photos are not Undo effects; a keep is (its effect names the medium, and Undo makes it `discarded`). The index `media status ASC, deleteAfter ASC` (collection scope, in `firestore.indexes.json`) serves the sweep.

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

**As built (issue 56).** Only `style/general` is written (`learnedFrom: ['helmText']`); the rules let the owner alone read and write it, with the eight keys above and `scope` one of the three. A trait's key is the learner's short id, or `you-<uuid>` for one the person adds. `HelmProfile.styleLearnedThroughAt` marks the newest capture the last learning read, so the device counts only typed captures after it. The learner reads typed captures through the index `inputMode ASC, createdAt DESC`.

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

`written` and `previous` hold plain values keyed by field path (`sealed.<field>` for sealed ones). Every task effect (create, update, complete) carries `sealed.title` with the task's title at that moment, so a result row can name its task; Undo compares the opened current value with what was written. A topic change a turn makes (added, revised, moved, grouped) is an `update` whose `written`/`previous` hold the version numbers (or a placement's `parentId` and `depth`); Undo restores that version as a new one (section 24). A `writeHelmTopic` batch write carries no effects; its Undo is a restore in History. A procedure's change is an `update` whose previous value is the version number. A kept medium's effect is its `status` and `attachedTo`; Undo sets it back to `discarded` with `deleteAfter`.

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
- **Seeds and emulator**: the development keyring when `isRunningInEmulator()` and the secret is empty, never in production; seeds seal fixtures with a key derived per uid and write the matching wrapped key; the drop-box pair is created on the person's first open, like any account's.

### The drop box (captures made with no key)

A capture made on an untrusted device opened with no connection can't be sealed with the data key, which isn't there. Round 2 kept it as plain text; the form-draft rule for encrypting apps (security-privacy "One device, several accounts") rules that out. Instead:

- Each person has a P-256 ECDH key pair. `getHelmKey` creates it with the data key, wraps the private key under the keyring (`server/{uid}/keys/dropBox`) and returns the public JWK, which the device keeps as the `helmDropBoxKey` device secret on every online open.
- **Sealing offline** (`utils/dropBox.ts`, WebCrypto only): an ephemeral ECDH pair, HKDF-SHA256 over the shared secret with the uid as info, AES-256-GCM over `{ captureId, text, reading, inputMode, createdAt }`. The envelope `{ id, epk, nonce, ciphertext, createdAt }` goes into the `helmOutbox` device secret. The device can't open it again; the capture sheet shows the words only for the session it was typed in, and the Inbox shows "1 thing saved on this device" with its time.
- **Flushing** (`useCaptureOutbox`, once online): callable `importHelmOutbox({ items })` (≤20 per call, ≤12 KB each) opens each envelope with the private key, checks the shape and caps, seals it with the data key and creates `captures/{captureId}` as `received` with `arrivedVia: 'dropBox'` only if absent (a retry is a no-op), and returns the ids it holds. The device removes those envelopes, then the sweep sorts them like any capture (it runs again whenever a received turn lands after open).
- **As built (issue 60).** The envelope is `{ id, epk, nonce, ciphertext, createdAt }`, all base64 except `id` (the capture's `generateUuid` id, which becomes the document id) and `createdAt` (ms): `epk` is the ephemeral public key as a raw 65-byte uncompressed P-256 point, the AES-256-GCM key is `HKDF-SHA256(ECDH secret, salt: empty, info: uid bytes)`, the nonce is 12 random bytes and the envelope's `id` is the GCM additional data, so an envelope moved to another id doesn't open. The sealed JSON holds `{ captureId, text, reading, inputMode: 'typed' | 'voice', createdAt }`; the server drops an envelope whose `captureId` or `createdAt` disagrees with the envelope's, whose words are empty or over 4,000 characters; a time ahead of the server's clock is stored as now. The pair is created by `getHelmKey` (public JWK `{ kty, crv, x, y }` returned as `dropBoxKey` and read by the helper in `helmKeyQueries.ts`, which keeps it as the `helmDropBoxKey` device secret; the private key is stored as `server/{uid}/keys/dropBox` and re-wrapped lazily like the data key; a person who had a data key and no pair gets one on their next open, and a pair is generated only when the key document lacks one; a drop-box key that won't unwrap never fails the data key). `importHelmOutbox({ items })` answers `{ held, rejected }`: `held` is every id the person's Helm now has (created now or already there, so a retry creates nothing twice), `rejected` is every one that can never import and is never also in `held` (wrong person, changed, malformed), and the device removes both lists from `helmOutbox` and says how many were rejected. The capture is written as `received`, `arrivedVia: 'dropBox'`, `seenAt: null`, `sessionId` its own id and `turnIndex` 0, so the sweep sorts it and it lands in "New since you looked"; a turn without `arrivedVia` reads as `'direct'`. `useCaptureOutbox` (mounted by `useHelmSync`) loads the list, flushes on open, when the key arrives or fails and on the `online` event, retries a failed send with a pause that doubles from 15 seconds to 5 minutes while the browser is online, and keeps a sign-out marker (`setPendingDeviceWork`, `@/lib/auth/signOutChecks`: the composed question and a count in localStorage, never the words, so `AuthProvider.logOut` asks even where Helm never loaded; it stops on a "Stay"). The kept list's read-modify-write and the flush take a Web Lock per person (`navigator.locks`), falling back to the in-tab queue; a kept list that can't be read throws, so a save fails with the words still in the field and a send leaves the list alone. The words of a saved thing live in memory for the session that typed them and never in storage. `check:helm-drop-box` seals with the device code and opens with the server code.
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
- **What Helm adds on top:** the "Offline copy · 8:30 AM" (the day instead, "Nov 3", when it isn't today) notice in the site's top strip (from the kept key's last check), the drop box for untrusted browsers (section 3), and **Sign out everywhere** (below).

**As built (issue 61).** `helmKeyStore` (`queries/helmKeyQueries.ts`) is the one `createTrustedKeyStore` (secret name `helm-data-key`); `getHelmEncryption` is its `getKey`, so every caller already gets the server's key first and the kept copy only when the server can't be reached. `useHelmSync` starts a profile (the first-open transaction) only once the server's key has arrived, checks `isKeptKey` before `ensureSelfWho`, and on a kept key raises the site's top-strip notice (`setSiteNotice`: "Offline copy · 8:30 AM", with Try again; with the browser itself offline the strip's own "You're offline" takes its place), listens for `online` and asks the server again, which swaps in the server's key and clears the notice. The drop-box key (section 3) is still kept on every online open, and `clearHelmKey` still clears the in-memory query. Opened offline on the kept key, `keyStatus` is `ready` (not `offline`), so Home is the ordinary Home and a capture typed there is sealed and written to Firestore's persistent cache, which sends it when the connection returns (the outbox is only for `offline`/`failed`). The store doesn't expose its last check, so the "As of" time is a number (`helmKeyReachedAt:{uid}` in `localStorage`, never the key) written when the server answers in a browser that keeps a copy and cleared when it answers in one that no longer does (a lapse or a removal elsewhere), set when the switch goes on and cleared when it goes off; the lapse line ("Trust this browser is off now. Turn it on again in Settings to keep opening Helm offline.") is added under the offline card's own line when that number is past `TRUSTED_KEY_MAX_UNCHECKED_MS` and the store has already dropped the copy. The switch goes through `helmTrustStore`, the store with `setTrusted` also setting or clearing that number. No rules or callables changed; the site's top strip (`OfflineBanner`) now keeps a notice on one line, truncating its words and never wrapping its button; `trustedBrowsers` is the site's.

### What a trusted browser can do offline

Read everything the cache holds (what was loaded while online: the eager sets in section 15, synced copies included, "Updated 9:30 AM"); capture (sealed with the data key and queued by Firestore, "Saved as written"); tick tasks and checklist items, Keep / Not today, edit records by hand (queued writes); search what is loaded. It can't: anything the assistant does, Undo (a transaction), connect, sync or disconnect a source, search mail, Drive or Runway's transactions, trust or remove browsers, Delete all. Each says it needs a connection.

### Sign out everywhere

Not part of the shared standard, and kept because the owner chose it for a lost phone (round 3). It is built shared: a site callable `signOutEverywhere` in `functions/src/auth/` (auth, App Check, online only) deletes every entry in `trustedBrowsers/{uid}/browsers` and calls `revokeRefreshTokens(uid)`; the calling browser then signs out. `TrustBrowserRow` gains an optional `onSignOutEverywhere` prop that adds "Lost a phone? Sign out everywhere" under the list of other browsers (Runway can switch it on later; nothing changes there now). Every other browser fails its next token refresh (within an hour) and is signed out, which removes its kept key; one that never comes online keeps what it has until its 30 days. Sessions are site-wide, so this signs the person out of every app on the site on every device, and its confirm says so. As built (issue 62): the row asks about unsent device work before calling the server (so "Stay" never leaves a revoked session behind), then signs this browser out with `logOut({ hasAskedFirst: true, landingNote })`, falling back to a plain `signOut` if cleanup throws; the signed-out home shows the landing note once (`@/lib/auth/signOutNote`, session storage). A kept account on the device switcher that isn't the active one is not refreshed, so its kept key goes at its next online open (its trusted entry is gone) or at 30 days. No re-key in the MVP (owner, round 3): "Change my key" is Beyond.

**As built (issue 62):** the callable uses `recursiveDelete` on the entries (any count), then `revokeRefreshTokens`; a failure of either answers `internal` and the browser keeps its session. The row is the last line of the trust frame (always there when the prop is passed, whether or not other browsers exist); offline it is a `LockedButton` titled "Needs a connection". Helm's handler awaits the callable, then calls the site's `logOut`.

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
  7. one transaction: re-read capture (claimId still ours), its joined messages and every doc an update touches;
     the joined messages that were read are marked sorted, any that joined after the read are released as
     their own turns (turnLeadId cleared); write sealed creates/updates, the Execution(s), the capture
  8. return { status, executionId, questionIds, planDayKey, hasAnswer, spoken, releasedIds }
     (round 6: the line to say; round 6d: the released messages, which the device sorts next)
        ▼
device: listeners deliver the sealed records; the home surface draws the turn's result lines + Undo,
        the voice speaks `spoken` (section 20),
        an answer with its sources or its "Not from your records" part, or a question
```

### Helm's MCP server and the tool loop

- **Where.** `functions/src/apps/helm/mcp/server.ts` builds an `McpServer` (MCP TypeScript SDK) per call, with `{ uid, key, grants, aliases, budget }` held in a closure. No tool takes a uid, an id or a token: every path is built from the closure's uid, every record in or out is an alias, and a live read goes through the platform's live router (section 19), which opens the token inside `functions/src/connections/` and returns an allowlisted shape. The server never holds a token and can't reach another person's tree.
- **Tools** (read only; each result capped and aliased): `search_who` (round 6: people, pets, organizations), `search_memory` (facts beyond the 40 sent), `search_knowledge` (notes by the device's ranking plus a title match), `search_tasks` (done and latent included), `search_projects`, `get_calendar` (synced events for a day range, ≤14 days), `search_synced` (any shared category Helm holds), `search_app_records` (a site app's live category, Runway's transactions in the MVP: payee text and a date range in, at most 20 rows out), `search_mail` / `read_mail`, `search_documents` / `read_document` (only when a live grant exists; each search result is an alias with sender or name, date and a ≤300-character snippet; a mail read returns at most 4,000 characters of text, a document read at most five passages of 300), `get_doc` and `search_procedures` (round 6), `list_connections`, `connection_status`, and the terminal `file_results`, whose input is the command union (section "Commands and validation"). The tool list offered is filtered to the person's live grants, so a person with no Gmail sees no mail tools.
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

`functions/src/ai/` is general (no app words): `ModelProvider { generateStructured({ role, system, parts, schema, maxOutputTokens, timeoutMs }) → { json, usage }; runToolLoop({ role, system, messages, mcpClient, terminalTool, limits }) → { terminalInput, usage, toolCalls } }`; `providers/anthropic.ts` over `@anthropic-ai/sdk` (tool use, `tool_choice` auto with a strict terminal tool, prompt caching on the system block and the last tool, effort in `output_config`, adaptive thinking left at the model's default), reading the `ANTHROPIC_API_KEY` secret at run time; and `models.ts`, the one file that maps a role (`'interpret'`, `'quick'`) to a model id and its price per million tokens. Domain code asks for a role, never a model. Another provider (Gemini again, Beyond) is a new file implementing both methods. Each request's timeout is the smaller of 15 s and the time left, a turn never starts with under 5 s left, and the SDK doesn't retry; each turn's cost goes to `aiBudget`, and `aiUsage` counts calls. Checked at issue 5 against the `claude-api` skill's model table (dated 2026-10-06): `interpret` is `claude-sonnet-5-5` at effort `low` ($2 per million input, $10 output, $0.20 cache reads, $2.50 cache writes), and the in-process loop stays (the connector reasoning above holds). Issue 5 builds only `runToolLoop` and the `interpret` role; `generateStructured` and the other roles arrive with their callers. `runToolLoop` also takes `extraTerminalTools` (other tools that end the loop) and reports `terminalName`, the one that did.

### Model routing

Two routes, picked on the server before any model call by `nomos/route.ts` (pure, fixture-tested):

- **Quick** (`quick` role, `claude-haiku-5-5`): a turn whose combined text is at most 280 characters, not a question (no question mark and no question opener as its first word) and `mode: 'full'`. Today it is offered `search_tasks` and one extra terminal tool, `hand_over { reason }` (the reason is logged as a length only), which ends the quick loop and runs the same turn on the full route (once: the full run is never offered it, so a second hand-over is impossible). The quick loop gets 15 s of the call, leaving the rest for a hand-over. The mail, Drive, topic and Runway tools join the quick route's tools as they are built; attachments and a focused topic will send a turn to the full route when they exist. Most "add milk" or "done with the dentist" turns end here in one short turn.
- **Full** (`interpret` role, the Sonnet-class model the owner chose in round 5): everything else, every hand-over, "Sort the rest" and a question resolved with held commands.
- Roles in `models.ts` (the only file with model ids), as built: `interpret` (`claude-sonnet-5-5`), `quick` (`claude-haiku-5-5`, effort `low`); `style` arrives with the style learner and `topicWrite` and `topicOverview` with topics. The capture records the route that produced its result (`route`: `full` after a hand-over). Haiku's price, from Anthropic's model table in the `claude-api` reference on 2026-11-09: $0.10 per million input, $0.50 output, $0.01 cache reads, $0.125 cache writes (cache prices follow the usual 0.1x read and 1.25x write ratio of the input price). `runRouted` reserves on the starting route and, on a hand-over, once more on full; a quick loop that runs out of turns or time hands over too. A restart after a late message reserves again, and runs on full when too little of the call is left for a quick run and a hand-over, and a hand-over cut short by a late message reserves nothing more and restarts the turn like any other abort.
- Routing never changes what code enforces: the same normalizer, policy, guards and transaction run on either route's `file_results`.

### The spoken reply

Only a spoken turn gets a spoken line (owner, round 6 second set); a typed turn gets the written reply only. "Mute" on home's dock or in the conversation over a page (round 6e) silences spoken lines for the sitting (the current session, device state only, never stored). The line is stored sealed as `spoken`:

- **Action-only turns** (as built, issue 12: `buildSpokenAck` in `nomos/spoken.ts`, sealed in the execution as `spoken`, null for a typed turn): code builds the line from the execution summary ("Got it. Call the florist, Friday." / "Done. Moved to Friday."), priority `ack`, spoken by the device voice (section 20).
- **Answers**: the model writes `answer.spoken` (≤280 characters, plain sentences, no lists, no Markdown; toned), priority `reply`, spoken by the cloud voice. A long answer's spoken part is a summary and the screen holds the rest; reading the whole thing aloud is "Read it all", priority `summary`.
- **Labels and cautions are code's**: a spoken general part is always introduced by "Not from your records" built by code (section 6), and a health answer's caution is a fixed short spoken line, never toned.
- **Questions** are spoken as code builds them ("Which Dana: your sister or Dana at work?") and answered by voice through the same option matcher as a tap.

### Media into the model

**As built (issue 52): photos only.** The photos of the turn (`Capture.attachmentIds`, at most 5) are opened on the server (`media/openMedia.ts`: only a `photo` that is `received` and was sent with this capture, bytes from Storage through the Admin SDK, opened under the person's key in memory; one sealed under another key or that won't open is let go and the reply says how many weren't read) and go in as `image` blocks of the one 1600 px copy, with a short `<attachments>` list of aliases. `file_results` gains a `media` key, `{ alias, decision: 'keep' | 'discard', caption, attachTo }[]`; `attachTo` is a task or fact alias in the context. Code accepts a decision only for a photo of this capture, and a keep only when its target exists and opens, else the photo is let go; captions are cut at 200 characters. A turn with a photo takes the full route and never joins a running turn. 

**As built (issue 53).** A PDF is read on the server with unpdf (`files/pdfText.ts`): its text layer, up to 12,000 characters, goes in the `<files>` block; one with no text layer goes as a `document` block; a locked, unreadable or over-20-page one is let go and the reply says "Couldn't read {file}. It may be protected or scanned too faintly." A Markdown file's sealed text goes in `<files>` with every `</files>` and raw HTML escaped, so a file's words never close the block; its decision may say `asNote` (kept as a note, the body verbatim) and `asTopic` (a topic made from its `#`, `##` and `###` sections, written by the person, version 1 with reason `imported`; past the topic's section cap it stays a note and the reply says so). A voice note never reaches the model: its transcript is already the turn's words, and code lets the recording go unless the person keeps it. Undo of an imported topic deletes it and its `versions/1` only while it is still at the version the import wrote.

Each attachment (section 23) is opened on the server and goes in as: a photo, an image block at 1600 px; a PDF, its text layer up to 12,000 characters, or a document block when it has none; Markdown, plain text up to 12,000 characters inside the data delimiters (it is untrusted content like mail); a voice note, its transcript as the turn's text. `file_results` gains `media: { alias, decision: 'keep' | 'discard', caption, attachTo, asNote, asTopic }[]`; code keeps only what is attached or made a note or a topic, and a voice note's audio is never the model's decision. A turn with media always takes the full route.

### Sessions and the screen

Step 3 of the flow reads the session's last 6 turns (what was said, the sealed summary of each turn's executions (up to 3) and the task ids in their `effectRefs`) and every task the screen context names (focus and visible as titles; tasks are the only collection a page shows so far, section 21); each gets an alias in the same book as `<open_tasks>` (a task already listed keeps its alias), so a command can target it. They reach the model as `<screen>` and `<earlier_turns>` blocks, left out when empty. The prompt says "this" is the focus, "these" the visible list in order, and earlier turns are context to follow, never to file again. The turn is found by `sessionId == ` and `turnIndex <` this turn's, newest first, limit 6 (the `captures` index in section 14), then handed over oldest first; a turn without a `sessionId` or `turnIndex` reads none.

### Colour theme

`HelmProfile.theme` (a required key, null reads as chestnut; the profile listener reads a legacy profile without it as null) is written alone by `setHelmTheme` (field-scoped `updateDoc`), from Settings' "Colours" section (`ColoursSection`, which uses the shared `ThemePicker` with `HELM_THEMES`; a pick writes in the background and a failure toasts). It is not sealed, like `assistantTone`. `firestore.rules` accepts the key only as null or one of the four ids on create and update. `useHelmTheme` sets `data-helm-theme` on `<html>` while Helm is mounted (none for chestnut) and removes it on unmount; the last theme is cached in localStorage (`helm-theme`) so the first paint before the profile loads is not the default. `helm.css` keeps chestnut and every token that does not vary on `html.helm-theme`; the others override on `html.helm-theme[data-helm-theme='plum']` and its `.dark` form, which carry the same keys so a dark override always wins. Every text pair in each theme is at least 4.5:1.

### Name and tone

The profile's `assistantName` (validated on the device and again on the server against the same pattern, since it goes into a prompt) and `assistantTone` fill one fixed block of the system prompt: "You are {name}." and the tone's line from `TONE_PROMPT_LINES` (`composed`, `warm`, `brief`, `formal`). The block applies only to `answer.fromRecords` and `answer.general`, the text the person reads as the assistant speaking. The schema descriptions of fact statements, note titles, task titles and checklist items ask for neutral wording in the person's own terms (product: "a checklist item is written plainly in every tone"). Every stored sentence the app writes itself (summaries, question prompts, change summaries, undo reports, slot reasons) is a code template with no name and no tone; copy adds the current name at render. Any per-tone fixed line product keeps (a summary line above a result card, an empty Inbox) is a device template chosen at render from `TONE_LINES`, never stored. The tone sheet's samples are fixed strings in `constants.ts`, no AI call. Round 6: tone also shapes `answer.spoken`, never the voice that says it (section 20); the name is also the wake phrase "Hey {name}", read on the device by `readWakePhrase`, so renaming the assistant renames the wake word at once.

**As built (issue 58).** Settings' first group, "Your assistant", has one row, "Name and tone" ("{Name} · Composed"), opening `AssistantNameToneSheet`: a name field with an inline error and "Use the default name", and the four tones as a radio list, each with its fixed sample (`ASSISTANT_TONES` in `constants.ts`). Save is one field-scoped `updateDoc` of `assistantName` (null for the default), `assistantTone` and `lastEditedAt`. The profile listener reads a legacy profile's missing keys as null; `useAssistantName` and `useAssistantTone` read the store, so the wake phrase, the voice identity and every line update at once. On the server `sortHelmCapture` reads both fields from the profile it already reads, never from the device, and the name for stored lines ("{name} inferred") is the validated one, and the not-a-person match drops that name, the word the person addressed it by and the default (`assistantNames`), so an old name said after a rename is never filed as a person. `toPersonaPrompt` (`nomos/prompt.ts`) builds the fixed block ("You are {name}.", the tone's `TONE_PROMPT_LINES` entry, and the scope: only `fromRecordsText`, `generalText` and `generalSpoken`) and is the last part of the system prompt; the system prompt is one cached block, so a person's block caches per person and the tool definitions' cache is untouched. A rename never rewrites a stored line. `check:helm-assistant` covers the pattern, the tone lines and the fallback.

### Cost, latency and limits

- **Cost.** One model turn for most captures, two to four when a question reaches for tools; none per resolved code-built question; a model-written question's answer is one quick turn. A turn sends about 6,000–10,000 input tokens (the system prompt and tool definitions are cached with prompt caching) and 300–900 output. At `claude-sonnet-5-5`'s list prices ($2 per million input and $10 output, checked at issue 5; cached reads $0.20) a one-turn capture costs about 1 to 2 cents and a question that reads mail about 4 to 7 cents; the model tier is Sonnet-class (owner, round 5). Round 6: a quick-route turn sends about 4,000–6,000 tokens to the Haiku-class model, well under a cent. Voice is not in this budget (section 20). Firestore adds about 400 reads ($0.0003).
- **Latency.** Warm: reads and decrypt 0.3–0.8 s, a model turn 2–5 s, a mail or Drive call 0.5–1.5 s, the transaction 0.2 s: 3–6 s for a capture, 6–15 s for a question that reads mail, 40 s at most; a cold start adds 2–4 s. The callable's timeout is 60 s. `minInstances: 0`; the capture is saved before the call, so the sheet shows "Reading…" and closing it loses nothing.
- **Per person** (round 6, accepted by the owner): the full route 20 calls per 10 minutes and 150 per day; the quick route 60 per 10 minutes and 400 per day (`AI_LIMITS` by route), counted apart in one transaction on `aiUsage/{dayKey}`; a hand-over counts once on each. Over either, the call answers `resource-exhausted` and the capture stays `received` with `heldReason: 'dailyLimit'`; the sweep tries again after the window. `maxInstances: 10`.
- **Project-wide**: `aiBudget/{dayKey}` adds each call's cost in hundredths of a cent from its token counts and the price table in `models.ts`, and stops all Helm AI calls past `AI_DAILY_BUDGET_CENTS` (1,000, $10 a day) (`heldReason: 'budgetReached'`, logged `helm.ai.budgetReached`). A monthly spend limit and alert in the Anthropic console is a step in that PR, spelled out click by click.

### Prompt injection

Capture text, record names, fact statements, note bodies, synced titles and every tool result (mail and documents above all: anyone can send the person an email) go into the prompt inside delimited data blocks, after a system prompt fixed in code that says they are data, never instructions. Containment does not rely on that: the reply is JSON against a schema; the normalizer drops anything that doesn't resolve to the context; no command can leave Helm, delete, or touch another person's tree (every path is built from the caller's uid); caps bound how much one reply can change; everything is undoable; answers render as plain text. No tool sends, writes outside Helm or fetches a URL, so a hostile email can't exfiltrate through a tool; tool results can't add tools or change the policy; a quote is copied by code from the tool result, never written by the model; and a result line that rests on mail says so ("from an email"). A turn that called a live tool (mail or documents) writes only its answer and at most one noted fact: every other command is refused (`live-turn-command`), and a noted fact's time or place must appear in the quote it cites (`remember-not-in-quote`). A note pasted from a hostile page or a hostile email can at worst steer an answer or an undoable change inside the person's own Helm.

### App Check and auth

`getHelmKey`, `sortHelmCapture`, `resolveHelmQuestion`, `writeHelmTopic`, `importHelmOutbox`, the site's `signOutEverywhere` (section 4), the connections callables (section 19) and `deleteHelmData` set `enforceAppCheck: true` (the first callables in the repo to do so; the web build already initialises App Check with reCAPTCHA Enterprise, and the emulator uses the debug token) and check `request.auth` themselves. Every path is built from `request.auth.uid`; no callable takes a uid.

### Offline and failure

- **Warm offline** (opened online, then the signal drops) or **trusted offline**: the key is in memory, so a capture is sealed and written as usual; Firestore queues it, the sheet says "Saved as written. {name} will sort it when you're back online.", and the Inbox shows it waiting.
- **Cold offline, untrusted**: the capture goes through the drop box (section 3) and is imported, then sorted, once online.
- **Sorting later**: on app open, the `online` event and `useOnTabReturn`, the device calls `sortHelmCapture` for its `received` captures (and `interpreting` ones whose lease is older than 90 s) one at a time, oldest first, skipping `recentLimit`/`dailyLimit`/`budgetReached` ones until the window ends (logged: retried when the app next opens).
- **Failure**: a model or validation failure puts the capture back to `received` with `attempts + 1` and `lastErrorCode`; at 3 it is `failed` with Try again (which resets attempts), "Make it a task as written" and Delete. A transient code (`timeout`, `network`, `http429`, `http5xx`, `noKey`, `noModelKey`) gives the attempt back, so it never reaches `failed`. The sentence comes from `getFailedCause` (a rejected key or retired model, `http4xx`, reads as the service being down; an unusable reading as unusable). A retried call with the same `requestKey` returns the stored result.
- **Held reasons**: `recentLimit` (20 calls in 10 minutes; read again after the window, "A lot at once · sorted in a few minutes"), `dailyLimit` (150 a day; read again the next day) and `budgetReached` (the project's day; read again the next day). The day's limit wins when both are spent. The call answers `resource-exhausted` with `{ heldReason }` in its details and the capture goes back to `received` (a held "sort the rest" pass back to `needsYou`) with `heldReason`, attempts untouched.
- **Words it can't make sense of**: a sound reply with no commands is not a failure. The final transaction settles the capture as `needsYou` (`seenAt: null`, `sortedAt`, no Execution) with a code-built `couldNotRead` question (`pickOne`: "Make it a task as written" `makeTask`, "Delete it" `delete`, fixed wording in `nomos/summaries.ts`). The sealed `questions[id]` is the `NomosQuestion` with `builtBy: 'code'`, empty `heldCommands` and `answer: null`, plus `kind`; the readable `questionState[id]` is `{ kind, shape: 'pickOne', askedAt, answeredAt: null, skippedAt: null }`. The sealed payload is re-sealed by spreading what was opened, so `text` and `reading` stay.
- **More than 20 changes**: the first 20 are filed as one Execution, sealed `sortedThrough` records the number of commands filed so far (cumulative; commands, not tasks: an update or a completion counts too), and a `moreToSort` question (`sortRest` "Sort the rest", `leave` "Leave it for now") is added the same way, so the capture is `needsYou` beside its Execution. "Sort the rest" calls `sortHelmCapture({ captureId, requestKey, mode: 'rest' })`: allowed only while the capture holds an open `moreToSort` (otherwise `failed-precondition`), it claims the capture from `needsYou` without counting an attempt, tells the model the titles this capture's Executions already made (and drops a repeat of one), files the remainder as a new Execution appended to `executionIds`, marks the question answered and settles `sorted` (or `needsYou` again with a new `moreToSort` when still more). A failed rest call puts the capture back to `needsYou` with `lastErrorCode`. The call answers `{ status: 'sorted' | 'needsYou' | 'received' | 'failed', executionId, releasedIds }`, where `releasedIds` are messages that joined the turn too late to be read with it (they stand as their own turns and the device asks for each).
- **Try again**: the device resets the capture (`status: 'received'`, `attempts: 0`, `lastErrorCode: null`, `heldReason: null`; the owner's rules already allow it) and calls the sort directly, without waiting for the next sweep.
- **Two devices**: the claim lets one call read a capture; the final transaction re-checks `claimId`, so a call whose lease was taken over writes nothing.

### What goes to the model

The capture text, the context package above (synced titles and times included) and, for a question that needs them, what the tools return: mail senders, subjects, snippets and up to 4,000 characters of a message or document. They go to Anthropic's API. Nothing from the model or a tool is logged; logs carry codes, tool names, counts and token counts only.

**Training line**: "What the AI sees" says "Anthropic doesn't use what it's sent to train its models." in its Where it runs block, checked against Anthropic's commercial API data pages (inputs and outputs are not used for training without express permission, and are deleted within 30 days unless flagged by trust and safety or legally required). Deepgram calls carry `mip_opt_out=true`, so Deepgram neither keeps the audio nor trains on it; the browser's own listening goes to Google in Chrome and to Apple in Safari, and the voice copy says so.

## 6. Answers: records first, then general knowledge

**One call, two labelled parts** (taken over two passes). The `answer` command carries `scope` (`yourThings` | `theWorld` | `both`), `question`, `isHealth`, `fromRecords: { text, sourceAliases } | null`, `general: { text, differsFromNoteAlias, differsSays } | null` and `suggestedTopicAlias`. The prompt says: answer from the records block first; use `general` only for what the records don't say and only about the world, never about the person's own plans, people or things; never draw on both in one sentence (product "Never in one sentence").

Two passes were weighed: a records-only call, then a second call with only the question when the first finds nothing. It is cleaner for privacy (the general pass would see no records) but costs a second call and 1–4 s more on exactly the questions that fall through, and the one call already sends the records to the same provider. The guards below give the same outcome in code:

- `fromRecords` is kept only when at least one source alias resolves to a record in the context; otherwise it is dropped (logged `answer-unsourced`).
- `general` is kept only when `scope` is not `yourThings`, and, for a `theWorld` question, only when `fromRecords` was dropped or null (records that answer a world question in full, such as a note, leave no general part: UX A6, A13). A `both` question keeps both parts as two blocks (UX A9). A `yourThings` question with nothing in the records becomes the code-built "Nothing in Helm says {question}." (product's copy), never a general answer; a `theWorld` one with nothing in the records shows that line and then the general part (UX A11).
- `isHealth` picks the fixed stronger caution, chosen by code and never toned; it never names a person from Memory. `generalDiffersFrom` is kept only when its alias resolves to a note in the context; code builds "Your note '{title}' says {says}." `suggestedTopicId` is kept only when it resolves to one of the person's topics.
- A reply that keeps `general` may write no inferred fact: every `remember` in it must carry a verbatim quote from the capture, or it is dropped. No command can take its text from the answer, so **the general part is never written as a fact or a note**; it is stored only as the capture's sealed `answer.general`, which nothing reads as a record and the context package never sends back to the model.
- **Spoken** (round 6): `answer.spoken` (≤280) says the records part first; when a general part is kept, code appends "Not from your records:" and then the model's spoken general sentence (`general.spoken`, ≤200), so the label is never the model's to drop; a health answer adds the fixed spoken caution. A spoken general part with no records part still starts with the label.
- Caps: `fromRecords` 1,200 characters, `general` 1,200, `question` 200, `differsSays` 80.
- **Connected sources count as records**. A synced record the context or `search_synced`/`get_calendar` offered is a source like any record (`kind: 'synced'`, with its title and start copied so the line survives the copy's deletion until the source's copies are deleted). An event that began up to two weeks before the days asked about and runs into them counts as on them. A connection the model read with `list_connections` or `connection_status` is a source too (`kind: 'connection'`, its name and account label, never the account's address), so "when did my calendar last update?" is answered from records; every tool whose results carry an alias has that alias resolvable as a source, or the answer it supports is dropped. The records part is spoken from the stored `fromRecords` itself, never from a separate model line. Mail and documents are sources only through `quoteAliases`: the model names `q3`, and the server copies that tool result's snippet (≤300 characters, ≤5 per answer) into `quotes` with the connector's checked deep link; a quote alias that no tool returned drops the part it supports. Every live call made during the answer is written to `searched`, found or not, failed or not; a failed one becomes "Couldn't look in Gmail (you@company.com): Google stopped sharing it", naming the connector since one account serves several; a records-and-general answer whose records part was dropped still shows "Nothing in your records answers this" with where it looked.
- **One noted fact**. An answer that reads mail or a document finding a different value for something Helm holds (the tasting at 2:00 in an email, 3:00 on the calendar) may carry one `remember` (inferred, `sourceConnection` = the quote) in the same Execution, so the answer is no longer write-free in that one case (design round 5, accepted by the lead as "organize freely"). Code refuses a second one, one without a resolved quote, or one in a reply that keeps `general`. Nothing else in an answer writes; nothing is ever written to a source.
- **Authority** (section 19, "Field authority") is applied by code when it builds the answer's sources: the calendar's or the owning app's value is the one stated, and mail's differing value is the one noted.

**How the client renders it** (`AnswerCard`; words are product's and design's):
- The records part as plain text with its source rings and doors (filled for what the person said, hollow for inferred, the book mark for a note, with "saved from a general answer, not checked" or "checked by you" on a note that was; a cited note with `hasHealthCaution` brings its caution).
- The general part in `GeneralKnowledgeCard` under `SectionDivider` "Not from your records" (globe, "General knowledge", the caution, or the health caution block first), with no source rings and no doors, then **Save to my knowledge**. It is never shown without the label, including in Activity and in a capture's result sheet opened later.
- Activity: "Answered: {question}", or "Answered from general knowledge: {question}" from the execution summary.

**Save to my knowledge** (on the device, one tap, no form, no execution; UX K4): writes the note as given (title = the question, cleaned and capitalised; body = the general text; `topicIds` = `[suggestedTopicId]` or `[]`; `source: 'savedAnswer'`, `isFromGeneralAnswer: true`, `checkedAt: null`, `hasHealthCaution` from `isHealth`, `sourceCaptureId`) and sets the capture's `answerSavedNoteId`, in one batch. A body already kept word for word (`toComparable`) saves nothing and says "Already in your notes: {title}" with Open. The button becomes `SavedNoteLine` ("Saved a note: … · 🍰 Kitchen") with Change topic (the topic picker) and Undo (deletes the note and clears `answerSavedNoteId` while the note's `lastEditedAt` is null). From then on the note is one of the person's records and answers cite it, marked "saved from a general answer, not checked" until "I checked this" or an edit sets `checkedAt`, so it is never dressed as something they observed.

**As built (issue 49).** *Answers cite notes.* On a question the server sends the hinted notes' bodies in `<related_notes>` (alias, title, body, and `savedFromGeneralAnswer` when `isFromGeneralAnswer` and unchecked), 6,000 characters in all (`NOTES_CONTEXT_CHARS`): the shortest bodies keep every word and the longer ones share what is left. A turn that is not a question sends titles only. `readHintedNotes` also returns each note's `topicIds` and whether it is unchecked; an id that is not an id, a repeat, a note missing under the caller's own path or one that will not open is dropped. A note alias in `sourceAliases` becomes a source `{ kind: 'note', id, title, topicPath, topicEmoji }` copied when the answer is built (the first of the note's topics that is in the context; topic `emoji` is now read with the name); an alias the context did not offer is dropped, and an answer whose only source was one is dropped as unsourced. The row (`AnswerSources`) reads the live note: "Your note · 🍰 Kitchen", "Saved from a general answer · Not checked" or "· Checked by you", the health caution when `hasHealthCaution`, a door to `NoteSheet` (a row inside a sheet names only), and "A note that has since been deleted" when it is gone. *Differs and suggested topic.* The model's three new answer fields `differsFromNoteAlias`, `differsSays` (≤80) and `suggestedTopicAlias` are resolved against the context's note and topic aliases; `generalDiffersFrom` (now `{ noteId, title, says }`) and `suggestedTopicId` are kept only with a general part, and the first only when its note is in the context; the device builds "Your note '{title}' says: {says}" from the live title (a cut says ends in …). *Save to my knowledge* is `SaveToKnowledge` in `GeneralKnowledgeCard`, on a turn's card only (not in Activity's result sheet, which cannot open a sheet): `planSavedAnswer` (pure) decides, `saveAnswerAsNote` writes the note, the capture's `answerSavedNoteId` and, when filed, the topic's `behind` mark and pending id in one batch, and `undoSavedAnswer` is one transaction (note deleted only while `lastEditedAt` is null, capture field cleared, pending id removed and the topic returned to `current` or `empty` when nothing else is pending). The topic is `suggestedTopicId` when it is one of the person's, else `pickFittingTopic`: the stored note the new title and words most resemble must score at least 0.8 and 1.5 times the next note and sit in exactly one topic. Otherwise the note is saved loose and the same line asks "Which topic should this go in?". **Departure:** the question is inline on the device (`SavedNoteTopicQuestion`: up to five topics ranked by `rankNotes` over names and outlines, "New topic" through `createTopic`, Skip), not a code-built `whichTopic` question in Needs you, because a question is written by the server and answered through `resolveHelmQuestion`, which would need a new held kind and a callable change; Skip therefore leaves the note loose with nothing waiting in Needs you. A pick or Change topic (`NoteTopicsSheet`) is `fileNoteInTopics`, a transaction that writes only `topicIds` (the note's `lastEditedAt` and `checkedAt` stay, so Undo remains) and marks topics it joins `behind` and clears the pending id of those it leaves. "I checked this" (`markNoteChecked`) writes only `checkedAt`; an edit still sets it. `rankTopicChoices` also scores each topic through the notes filed in it and, when nothing scores, orders top-level topics by how many notes they hold; its "More topics" pill opens `NoteTopicsSheet`, and a loose note's own sheet swaps in place to `NoteTopicsFields` (a sheet never opens a sheet). `SaveToKnowledge` passes `isSaving` down so Undo waits for the save's batch. The `Composer` defers the field's blur while a pointer press is in progress (document-level `pointerdown`/`pointerup`/`pointercancel`) so a tap elsewhere lands before the dock and shorthand row move. `toContextNotes` (bodies only on a question) is covered by `check:helm-note-search`. `rankNotes` keeps each note's word counts per note object, so ranking again costs about 2 ms for 1,000 notes and the first ranking about 60 ms. `check:helm-note-search` covers ranking, the 1,000-note timing, the topic-fit margin, title cleaning, the save plan, the hint reader and the 6,000 cap; the answer guards are in `check:helm-answers`. The batch, the transactions and the components are not run by a check.

## 7. Knowledge (the personal knowledge base)

### What it is in data

`notes` and `topics` (section 2): a note is a title and a body in several of the person's topics or none (many-to-many through `topicIds`, owner round 3; a loose note has none), with where it came from and whether it was checked. Facts stay where they are: a fact is about a person, place or project and has confirmed/inferred; a note is knowledge the person keeps and is theirs by definition (they typed it, said "remember that…", or saved an answer).

Round 6d: each **topic is a living document** written from its notes (section 24), and topics nest up to three levels. The Knowledge view is the topic tree (A to Z at each level, a parent's subtopics under it) with "Loose notes" below.

### How notes get in

- **By hand**: Memory → Knowledge → New note (`NoteForm` in a `FormSheet`: title, note with a quiet count from 18,000, topics as `TopicPicker`, a `MultiPillGroup` with "+ New topic"), sealed and written on the device. Edit, Copy (`CopyTextButton`), "I checked this" and delete from the note's sheet (K3); any edit sets `checkedAt`; delete has Undo from the snapshot while the id is absent.
- **By capture**: "Remember that cakes keep 3 days in the fridge" or "note: …" → `createNote` (body = the person's words), automatic with Undo, one result line ("Saved a note: Cakes keep 3 days in the fridge · Kitchen"). "Remember that Dana's birthday is June 3" is a key date on Dana (section 22), never a note, because it has a subject. The rule is code's: subject → fact, no subject → note.
- **A long paste**: a capture over 4,000 characters (counted trimmed, as Send reads it) makes Send wait with "Too long by N characters. Split it into two."; the composer also offers "Save as a note" there (the line itself stays "Split it into two."; over 20,000 characters it says "Too long to save as a note (20,000 at most)." instead): a `typed` note of the whole text (≤20,000), titled from its first line, read by no AI.
- **By saving an answer** (section 6).
- **Topics** are made by the person (in `TopicPicker`, a topic's ⋯ More, or "New topic" in a `whichTopic` question), or as a parent only when the person says yes to the assistant's `groupTopics` proposal. The assistant may move a topic under an existing parent on its own, with Undo. The person renames, changes the emoji, moves a topic under another or to the top (`TopicPicker` filtered to legal parents: not itself, not a descendant, nothing that would pass 3 levels) and deletes one (its notes stay, loose or in their other topics, the topic removed from each in per-chunk transactions; its subtopics move up a level; its versions go with it; the confirm names the counts). A search appears at 30 topics.
- **Creating or filing a note**: every topic it is filed under is marked `behind` with the note in `pendingNoteIds`, so its next write brings it in and records a new version (`addedFromSource`, naming the note). Editing a note's words or deleting it marks every topic that cites it (or that it is filed under) behind in the same write; the next write re-reads an edited note, and drops a deleted note's marks and a `nomos` section only it supported (a `person` section keeps its words and loses only the mark), with no model call when nothing else is waiting (reason `sourceRemoved`).
- **Saving general knowledge**: Save to my knowledge always saves the note at once, loose. When no topic fits, which is always the first time, a code-built `whichTopic` pick-one question follows on the same turn, "Which topic should this go in?", with up to 5 topics ranked by `rankNotes` over topic names and outlines and a "New topic" answer (a name, ≤40, and an optional parent); Skip leaves it loose and waiting in Needs you. Once a topic fits (one clear match on the note's words, or the topic the person picked for this kind of answer before), the assistant files it there itself and says so, "Saved to Car care · Undo".

**As built (issue 48).** `createNote` is a command of its own (`title` ≤80, `bodyQuote` ≤20,000, `topicAliases`); normalize keeps it only when the quote is a span of the capture's words, keeps only topic aliases (`tp1`, …) the context offered (≤10), and drops it when its words equal a same-turn fact's or key date's, so a subject always wins over a note. The context carries the person's topics (≤100, one capped query, `{ alias, name, path }`) and the device's hinted notes as `{ alias, title }` only. `sortHelmCapture` takes an optional `noteIds` (≤8, doc-id shaped); the server opens them under the caller's own path for the repeat check and the context titles, and a retry or the rest-of-turn call that carries none simply skips that check. `rankNotes` (`utils/noteSearch.ts`) is lexical (`toComparable` words, stopwords out, title ×2, topic names ×1.5, saturation damped by length, top 8 above zero) and feeds the typed send, the sweep and Sort again. The executor writes at most 3 notes a turn and refuses past 1,000 (a transaction `count()`, line "Your notes are full (1,000)."); a note whose words equal a hinted note's writes nothing and the card says "Already in your notes: {title}" (a sealed `lines` entry on the Execution, since it has no effect). One topic files the note and marks the topic `behind` with the note in `pendingNoteIds` (a topic being written or failed keeps its state and still gains the pending id); no topic leaves it loose; two or more leave it loose and add a code-built `whichTopic` `pickSeveral` question (nothing preselected, held `{ kind: 'fileNote', noteId }`, counted in the three-questions cap). `resolveHelmQuestion` takes `optionIds` for it: one transaction re-reads the note and the topics, refuses when the note or all of those topics are gone (the card says "That note or one of those topics was removed." from `HELM_COPY.questionGone`, not the server's strings), sets `topicIds` to the union (≤10), leaves `lastEditedAt` and `checkedAt` alone and marks each added topic `behind`; Skip leaves it loose. The question's prompt names the note (`Where should "Cakes keep 3 days" go?`, title cut at 40 characters) and its spoken form reads "Which topics should this note go in: Kitchen, Baking, or both?"; voice answers it with several picks (`optionIds`), and a spoken turn sends note hints (`noteIds`) like a typed one. A capture-made note has `lastEditedAt: null`, so Undo deletes it only while the person has not edited it, and takes the note out of each topic's pending list, and restores the topic's state only when nothing else is pending; a topic changed since is left marked, which only costs one re-read. A note the cap or the effect limit refused adds a "not kept" line to the card instead of a could-not-read question. A result row for a note opens the note's sheet over the screen it is on. The long-paste note is the device's own `createNote` (no callable), with the same repeat check on `toComparable(body)`. `check:helm-notes` covers normalize (span check on word boundaries, drop reasons), the executor (filing, loose, two topics, the cap, repeat), `planResolve`, `planUndo` (including a topic with several pending notes), `rankNotes` and the emulator's note reading; the transaction `count()`, the callable, the device hooks and the composer's Save as a note are not run by it.

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
- **Sync** (the connector's `syncPage`): `events.list` per chosen calendar with `singleEvents=true`, from 30 days ago with no end, paged, then incremental with the returned `nextSyncToken`; a `410 Gone` drops the token and does a full re-read. Each event becomes one `synced` record: kind `event`, readable `startAt`/`endAt`/`isAllDay`/`calendarKey`/`isBusy`, sealed title and the deep link (built from the ids, never `htmlLink`: `https://www.google.com/calendar/event?eid=` + base64url of `eventId calendarId`; `isGoogleCalendarLink` checks any stored link's host). Declined events are dropped (and deleted if held); cancelled ones are deleted; an event on two calendars of one account (same `iCalUID` and start) is kept once. Never read: descriptions, guests, conference links, locations, attachments. Events are capped at 1,000 per account (`MAX_RECORDS_PER_CATEGORY`, the cap every category shares), nearest first, and a capped read saves no sync token so the next run reads in full. As built, both paths exist: a read that returns `nextSyncToken` (on its last page only) continues from it; one that returns none continues with `updatedMin` = the last sync minus a clock-skew margin, the same `timeMin` window and `showDeleted`. Which one Google takes after a `timeMin` read is still unverified live.
- **Several accounts** are one day: Today and the planner take synced events from every live Calendar grant; an event on two accounts (same `iCalUID`, or same title and start) counts once (section 19, "Same thing twice").
- **Today and offline.** Today reads synced events from the eager listener, so a trusted browser plans offline from the last sync ("Updated 9:30 AM"); past a day without a sync it says "may be out of date". No calendar callable remains on the client.
- **Failure.** `invalid_grant` marks the account `needsReconnect` (Testing mode's 7-day expiry lands here); Today drops to the no-calendar version with Reconnect and keeps its plan. Anything else keeps the copies, records the error on the grant's category and shows "Couldn't update since …"; never an empty day.
- **Plan-day snapshot** is unchanged: title and time only, written when the day is planned, kept for past days.
- **Google's rules.** `calendar.readonly` is sensitive, not restricted, but it shares the site's OAuth client with Gmail and Drive, whose consent screen stays in Testing for the MVP; so Calendar too needs Reconnect about weekly until the owner publishes the consent screen (issue 20's check found an unverified production screen has no weekly expiry while only Calendar is asked for; section 19, "Restricted scopes").

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
  - **As built (issue 39).** `readCurrentPlace(profile, places, now)` (`engine/currentPlace.ts`) is the one reader: the place holds while `now - saidAt` is under 3 hours and it still exists; only the home place is set this way, and `HelmProfile.currentPlace` reads null on a profile from before. Tapping "I'm home" (`setCurrentPlace` in `planActions.ts`) is one batch: the profile's `currentPlace` and an `organize` execution by the person with one `update` effect on the profile (`collection: 'profile'`, `docId` the uid, previous value kept), which `planUndo` and `undoExecution` restore like any record ("You're no longer marked home.", or "You're marked home again." when the value put back still holds; a mixed turn's count leaves the profile out). "No longer home" is the same write with `currentPlace: null`. A capture's `setCurrentPlace` command is passed on beside `planDay`, never in `commands`; the turn's transaction writes the same field with `saidAt` the capture's `createdAt` (a turn sorted 3 hours or more after it was said writes nothing: "That was over 3 hours ago, so you're not marked home.") and the same effect, and says "You're home until 6:40 PM" in the person's zone, or "No place is set as home yet." and writes nothing (also when the profile document is missing); a turn that files other things carries the same refusal in its card. The planner takes `currentPlaceId` (set for today only) and ranks tasks linked to it after overdue and due today, before importance, with the reason "You're home". Today's "When you get home" section lists open tasks linked to home with no slot today. Helm never calls the Geolocation API.
- **[Next]** `beforeEvent`; an event Helm can no longer see reads as "waiting on an event Helm can't see", never active and never lost.
- A push when a task wakes is [Later], behind the central reminders infrastructure.

## 11. Procedures and the Today planner

- **Procedures and runs** replace round 5's checklists (owner and lead, round 6): section 25. A task's own steps are on the task (section 2).
- **Planner** (`engine/planner.ts`, pure, on the device, fixed-clock tests): input = the day's busy blocks (selected calendars, tentative included, all-day only when marked busy), kept slots, active tasks, `currentPlace`, the day window and `planFillPercent`; output = suggested slots with a rule-built reason. It ranks overdue, due today, due soon, then importance and urgency; fits length, energy (high-energy earlier) and context; leaves 15-minute buffers around events; skips gaps shorter than the task; stops at the fill percent; suggests nothing on a day the calendar shows full or after the day's end. Tasks with no length are planned at 30 minutes and the chip says so. Without a calendar it returns untimed "Worth doing today" picks. It runs when Today first opens on a day with no plan, when the person asks ("Plan it", "Plan my day"), and when a sorted capture carries `planDayKey`; a re-run never touches kept or Not today slots, and it writes the slots, the reasons and the calendar snapshot in one batch.
  - **As built (issue 31).** Plan days are `apps/helm/users/{uid}/planDays/{dayKey}` (owner rule), listened to over today UTC −2 to +8 days. Generating is one batch: the plan day merged with the full slot map, plus an execution `plan-{dayKey}` (`proposed`, category `plan`, no effects) only when something was suggested; it never shows as a turn in Activity and becomes `succeeded` once every slot is decided. Keep, Not today (with Undo) and Another time are dotted-path updates; moving to another day is one batch that deletes the slot here and merges it into that day. Busy time is calendar events not marked free, plus another app's events of 12 hours or less (a stay or rental says where the person is, not time it takes); an all-day event counts only when marked busy. The `planDay` command takes a day today to six days ahead and is dropped, not refused, outside that; the server writes it as the capture's `planDayKey`, and the device plans that day when its plan is older than the capture. Not built yet: rest days, "Now overlaps", places, rewriting the snapshot on a newer calendar read.
- **Rest day** (`engine/restDay.ts`, logged): day D is a rest day when a busy event started on D−1 and ended after 02:00 on D, in the profile's zone. Once the person has marked one or more shift calendars, only events on those count, so a late concert doesn't empty the next day. A rest day gets no suggestions; "Plan my day anyway" sets `restDayOverriddenAt` and plans normally. A shift day itself needs no rule: the shift is a busy block, so the planner finds no timed gap inside it (product's "nothing timed on a shift day" falls out of this; untimed picks still list unless product says otherwise).
  - **As built (issue 32).** `readRestDay` uses the zone's own midnights and 02:00 via `zonedDateTimeToEpoch`; `buildPlanInput` feeds it the live calendar copies while a calendar is connected and sets `restDay` null once `restDayOverriddenAt` is set. `planDay` returns `outcome: 'rest'` with only kept and Not today slots; `generatePlan` still writes the day (`isRestDay`, so auto-plan doesn't loop) with no execution, and "Plan my day anyway" is the same batch with `restDayOverriddenAt: now`. A live calendar whose newest error is later than its last good read (`isFailingCalendar`) stops planning and hides suggested slots; "Now overlaps" (`findOverlaps`) never moves a slot. A rest day also hides suggested slots, and the rest line leads the day. A calendar Google stopped sharing is left out of Today until it is reconnected, and it holds planning like a failing one (`isCalendarHeld`): no suggestions until it is back. Only an event that ended by 12:00 on the day counts toward a rest day, so a multi-day event is not a night out. A Google all-day copy now stores its last day as `endAt` (Google's end is the day after), the same as every app's all-day copy, so a one-day event no longer shows on the next day too.

## 12. Search, clearing and deleting

- **Search** runs on the device over what is loaded and already decrypted (open tasks, projects, who records, key dates (a kind, label or month name finds them: "birthday", "June"; the dates that come back from the yearly index already open, and moments read in pages of 500 (`shape == 'moment'`) after the first results show, kept for the session only), places, facts, notes, topic documents, topics, procedures, media captions, and synced records, each with its source's logo). Mail and Drive are never searched from Search. Done tasks older than the eager window load once when Search opens (a one-shot read of `tasks where status == 'done'`, opened through the sealed reader and kept for the session only). Matching uses `toComparable` substrings. Nothing sealed is indexed anywhere, and no third party sees a query.
  - **As built (issue 59).** Search is the utility view `search` (`components/search/SearchScreen.tsx`, a back link, the title and one `SearchInput`, no ask bar or dock); the typed words live in the URL as `q` (history `replace`), and every `showView`, `goHome`, `goBack` and `goUpTo` clears it, so Back from a record lands on the same list. It is opened from a Search button beside Settings on home and from a "Search everything" row at the top of Browse. `utils/searchRecords.ts` is pure: `buildSearchIndex` makes one comparable entry per record (each record's words folded once per object, kept in a `WeakMap`, so a rebuild after one change folds only what changed), already in each group's order; `searchEntries` keeps the entries holding every typed word (any order, `toComparable` substrings, title hits first). It reads the store's open tasks and project tasks, who, places, facts, the yearly index already open, notes, topics (name and document text), projects, procedures, kept media captions and synced copies; unreadable records are skipped and a superseded fact is not shown. Yearly dates match on the kind word, a custom label and the month's name; a note matches on its topic's name and shows it (or "Loose note"). Done tasks are one read of `tasks where status == 'done'` (`queries/doneTaskQueries.ts`) and moments are `keyDates where shape == 'moment'` in pages of 500 by cursor (`queries/momentQueries.ts`, equality only, listed by document id, so no index), both opened through the sealed reader and held in TanStack Query under the key's prefix with `staleTime` and `gcTime` of `Infinity`, so they stay for the session and go when the key is forgotten; neither is persisted. The done-task read starts when Search opens, the moments read on the first typed word; the live store's copy of a task wins over a read one. The index is built in the render after the field draws (`useDeferredValue`). Each group shows three rows and "Show all N"; an opened group draws at most 200 rows under `LazyMount`. A result opens as the answer sources do: who, place, project, topic and procedure by `showView` (a date or moment opens its who, a fact its first who, place or project, else How {Name} sees you, a photo the record it is kept on, else its viewer); a task, note and synced copy open their sheet over Search. The done tasks are read again each time Search opens (the earlier list shows meanwhile), so a task finished since is found; the moments are read once and marked stale whenever the person adds, edits or removes one on the device, so the next Search reads them again; a moment the assistant writes in a turn shows in Search after a reload. Deleting a done task from its sheet drops it from the done list at once, and its Undo reads the list again. Forgetting the key cancels a read still in flight before dropping the cache. A failed read, or a store listener that failed, says what could not be looked through, and "Nothing matches" shows only once both reads have succeeded and nothing failed. Measured by `npm run check:helm-search` on a synthetic lifetime (2,000 who, 20,000 key dates, 3,600 tasks, 2,000 facts, 300 notes, 40 topics, 30 procedures, 1,000 captions, 2,000 synced copies): a query is under 5 ms; a rebuild with unchanged records is about 40 ms; folding every record for the first time is about 90 ms (100 ms and more cold), because `toComparable` costs about 28 ns a character.
- **Clear done** (built, issue 46: `clearedAt`, per-project, chunks of 400, Undo only where the stamp is unchanged), **archive a finished project**, **delete a topic** and **forget a person** are bulk changes from cached flags, so each re-reads per chunk in a transaction and reports the real count (state-data "A delete across records"). Forgetting a who first removes its entries from the yearly index in a transaction, then deletes its key dates 400 per batch (`whoId ==` query), and the who document last, so an interrupted forget is finished by running it again.
- **Delete all my Helm data**: callable `deleteHelmData` requires a sign-in from the last five minutes (`isSignInRecent`; the client asks for a fresh sign-in inside the tap; when the server still refuses, the next tap asks for one, since a sign-in window opened after a long wait is blocked). It first calls the platform's `endReaderGrants({ uid, readerAppId: 'helm' })` (section 19: every Helm grant ends; a Google account no other grant uses is revoked at Google and its sealed token deleted), then `recursiveDelete`s `apps/helm/users/{uid}` (notes, synced copies and key dates included), then the Storage prefix `apps/helm/media/{uid}/` and the person's `voiceUsage/{uid}` days (round 6), then `apps/helm/server/{uid}` (the wrapped data key last, so a rerun still finishes). With the wrapped key gone, any copy of the ciphertext left in a backup can't be opened without the keyring. The client's timeout matches the function's; a `not-found` is a failure (the callable isn't there), never a delete; the browser calls the key store's `store.forget` (kept copy and its `trustedBrowsers` entry), forgets the `helmOutbox` and `helmDropBoxKey` device secrets, clears the slice, then reopens to first run. Another open device sees its profile vanish, drops its key and reopens to first run, so it can't seal new writes with the deleted key. **As built (issue 63):** the callable is App Check enforced with a 300 s timeout and answers `{ grants, documents, files }`; the profile document `apps/helm/users/{uid}` goes after the key, not with the rest of the user tree, so a device that reopens when the profile vanishes never fetches a new key that the run then deletes. `voiceUsage/{uid}` is deleted whole because only Helm records voice usage today (`VOICE_APPS`); another app joining it makes the day documents per app and this delete only Helm's. The ended grant documents stay as `ended` records. A connection that fails to end stops the run before the server tree and the profile, so the Settings row stays and a rerun finishes it. The client signs in again early inside the tap (`settingsActions.ts`), on a recent-sign-in refusal leaves the sign-in to the next tap, and on success calls `forgetHelmOnDevice` and reloads to Helm's start; `useHelmSync` does the same when a server snapshot of the profile is missing after one that had it (`hadProfile`; a cached snapshot or a first open never counts). Offline the row keeps its shape with a lock and "Needs a connection". Covered by `check:helm-delete`.

## 13. Edge states

| Situation | What happens | Where |
|---|---|---|
| `getHelmKey` fails (keyring problem) | "Helm can't open your things right now" with Try again; capture still works through the drop box; nothing is ever replaced on the server | `CannotOpenState` |
| One document won't open (corrupt, other key) | Row kept as "Couldn't open this"; others open; logged with a code | sealed reader |
| A payload from a newer schema (`v` too high) | Row "Update Helm to open this"; the stale-chunk prompt usually arrives first | `openJson` |
| Opened offline, untrusted | "Your things open once you're back online"; capture via drop box; a row above the field, "N things saved on this device", opens the list (words, time, Remove) | `NeedsConnectionState` |
| Opened offline, trusted | Cached records open; writes queue; assistant, Undo, calendar, trusting or removing browsers, Delete all say they need a connection | section 4 |
| Sign out everywhere | Every `trustedBrowsers` entry deleted, every session revoked; other browsers signed out within an hour (which forgets their kept key); an offline phone keeps what it has until its 30 days run out (stated in the confirm) | section 4 |
| Trusted browser offline for 30+ days | The shared store has dropped its copy; Helm's offline card adds "Trust this browser is off now. Turn it on again in Settings to keep opening Helm offline." | section 4 |
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
| The yearly index disagrees with the documents, or would pass 4,000 entries | Rebuilt from the yearly documents in one transaction (`rebuiltAt` set); past the cap, split into twelve month documents in one transaction | section 2 |
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
| Attachment over its cap, or a sixth one | Refused on the device before upload, naming the cap ("PDFs up to 20 pages"); built for photos (issue 52): a sixth photo or a file that is not a photo is refused with a line, and a photo of any size is shrunk, never refused | composer |
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
- Caps that live outside the rules (beta tier), stated per "a cap that lives only in the UI": capture 4,000 chars (device and server), 20 commands per reply and 40 effects per execution (server), the context caps (server), note 20,000 chars and title 80, 1,000 notes, 100 topics, 3 levels and 20 subtopics, 10 topics per note (device; server for `createNote`), 20 calls per 10 minutes and 150 per day per person, $10 a day for the project (server), 6 turns and 12 tool calls per capture, 5 quotes of 300 characters, 4,000 characters per mail or document read, 20 transaction rows over at most 13 months (server), 1,000 records per category, calendar events included (server), one sync per grant per 15 minutes (server), 20 drop-box envelopes per import and 12 KB each (server), assistant name 16 characters of a fixed pattern (device and server). Round 6: 5 attachments per turn, 10 MB and 20 pages per PDF, 5 minutes per voice note, 20,000 characters per Markdown file, 2,000 kept media (device; server re-checks size and kind when it opens them); topic documents 30,000 characters in 60 sections of 4,000, 200 versions, ≤8 section changes and ≤20 notes per write, 30 topic writes a day per person (round 6d), procedures 60 steps (device and server); screen context 1 focus and 20 visible (server); quick route 60 per 10 minutes and 400 a day; voice allowances and the site voice budget (section 20, server); 50 contacts per import call and 2,000 in the picker (server).
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
| `…/{uid}/media/{mediaId}` (issue 37) | yes | yes, the readable shape (a photo, an `image/*` type, `attachedTo` a list, `sealed` a map) | yes, same | yes | A medium's document; its own match, apart from the wildcard |
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

**As built (issue 64): performance at a lifetime's volume.** `helm-scale` gives Morgan 2,000 who, 20,000 key dates, 600 tasks, 2,000 facts, 300 notes, 400 turns, 200 photos (twelve on Avery Brooks) and 1,500 synced copies (`SEEDING.md`). Fixes, from a CPU profile on the dev build:
- The People list renders in chunks of 40 rows under `LazyMount` (the first chunk at once, each later one holding a 65.5 px-per-row estimate (measured) until it nears the screen), so opening People no longer draws 1,300 rows.
- The date and time formats a list draws per row (a task's due day and time, Today's plan clocks and day labels, a person's moments) go through `getDateTimeFormat` (`@/utils/timezoneUtils`), which builds one `Intl.DateTimeFormat` per locale and options and reuses it: building one per task was most of a Tasks or Today switch.

### Performance

Production build, a 390×844 viewport, CPU throttled 4× (CDP), the emulators, Morgan's scale data with the 1,500 copies (4,828 decrypts); three first opens and each Browse view twice:

| Measure | Before | After |
|---|---|---|
| Home shown after a first open | 1.9–2.0 s | 2.0–2.1 s |
| Everything loaded | 8.6–8.7 s | 8.7–9.4 s |
| Key-date index opened | 42–46 ms | 42–50 ms (budget 150 ms) |
| Today | 538–631 ms | 220–303 ms over three runs |
| Tasks | 561, 576 ms | 250, 276 ms |
| People | 1,320, 1,240 ms | 205, 191 ms |
| Projects | 504, 406 ms | 181, 171 ms |
| Search | 303, 137 ms | 99, 90 ms |
| Every other view | 46–190 ms | 41–202 ms |
| A typed capture ("Remind me to call Avery Brooks tomorrow at 9") | | shown at once (174 ms); "Made a task" with Undo at 3.2 s, the emulator's function included |
| Avery's 12 photos, the on-screen 7 | | 357 ms cold, 287 ms warm |
| The hourly sync, Morgan's stale grants plus Alex's | | 43 s, about 1,850 writes in 48 batches |
| The hourly sync with nothing changed | | 4.3 s, 17 writes |

People is built in chunks of 40 rows, so it is rebuilt when the person comes Back from someone's page; `useKeptScroll` puts it back on the row they left (measured: 12,000 px before the tap, 12,000 px after Back).

A first open is bound by the listeners and the sealed reads, not by rendering, so the fixes leave it as it was. Today is the one switch near 300 ms: it draws the agenda, the plan and the day's dates together, and its slowest run of six was 303 ms. The open tasks arrive about 3.5 s after the home, behind the heavier who and synced listeners (a follow-up: start the listeners Today needs first).

## 16. Backend surface

| Kind | Name / path | What it does, and why plain client code can't | Trigger / consumer | Lands in |
|---|---|---|---|---|
| Callable | `getHelmKey` | Creates or unwraps the person's data key and drop-box pair with the master keyring, a secret no client may hold; answers whether a device is still trusted | `useHelmSync` | Issue 2 (drop box: 60; device answer: 61) |
| Callable | `sortHelmCapture` | Opens the key, builds the context (session turns, screen records, media), routes the turn, runs the Claude tool loop over Helm's in-process MCP server with the server's API key, enforces policy, rate limit and budget, writes sealed records and the Execution atomically, sweeps the caller's expired media | composer, sweep | Issue 5 (failure and questions: 6; sessions and screen: 9; back-to-back messages: 10; routing: 11; tools over synced records: 19 onward; media: 52, 53) |
| Callable | `resolveHelmQuestion` | Validates an answer against its question's shape; runs a code-built question's held commands through the server executor, or writes a model-written question's answer as a turn and sorts it (round 6c) | question cards, Needs you, spoken answers | Issue 35 (shapes: 36) |
| Callable | `transcribeHelmVoiceNote` | Takes `{ mediaId, timeZone }` for a `voiceNote` medium that is `received`, not yet sent with a turn, with a `mimeType`, a `durationMs` and sealed bytes; reserves the claimed length against the person's daily listening minutes and the site's voice budget, sends the opened bytes to the voice provider's prerecorded endpoint, settles at the measured length, seals the transcript into the medium and returns `{ status: 'ready', text }` or `{ status: 'held', reason }` (`listenLimit`, `budgetReached`, `unavailable`, `tooLong`). The emulator with no key answers a fixture sentence. | Issue 53 |
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
| External API | Deepgram streaming (`wss://`, token grant) and pre-recorded endpoints; Aura-2 if the benchmark picks it | About $0.0077 a minute listening (unverified), $0.030 per 1,000 characters speaking (read from the providers' docs (search results, 2026-11-09), unverified until the first real run); per-person allowance and the site's $5 a day cap; when down, the device voice | `mintVoiceToken`, `transcribeVoiceNote`, `streamSpeech` | Issues 13, 14, 53 |
| External API | Google Cloud Text-to-Speech (Chirp 3 HD); Gemini Flash-Lite TTS (paid API or Vertex) | Chirp 3 HD $30 per million characters with the first million a month free; Gemini $6 per million audio output tokens (read from the providers' docs (search results, 2026-11-09), unverified until the first real run); the benchmark's default only | `streamSpeech` | Issues 13, 15 |
| External API | Google Calendar API v3, Gmail API, Drive API v3, OAuth token and revoke endpoints; round 6: People API (`people.connections.list`, `people.getBatchGet`) | Free; per-project quotas far above one person's use | platform connectors | Issues 20, 28, 29, 38 |
| Secrets | `HELM_MASTER_KEYS` | Helm's keyring; created by `npm run helm:keyring` before issue 2 merges | key, assistant, outbox, trust, sink, delete, verify, media | Issue 2 |
| Secrets | `ANTHROPIC_API_KEY` | The model; created by `npm run ai:anthropic-secret`, which checks the key with a one-token call before saving | `sortHelmCapture`, `learnHelmStyle` | Issue 5 |
| Secrets | `DEEPGRAM_API_KEY` (optional: absent means cloud listening is skipped and the device listens) | Created by `npm run voice:deepgram-secret`, which checks the key against Deepgram's projects endpoint (`GET /v1/projects`; that it answers 200 is from the providers' docs (search results, 2026-11-09), unverified until the first real run) before saving | voice functions | Issue 13 (listening: 14; voice notes: 53) |
| Secrets | `GEMINI_API_KEY` (optional; only if the benchmark picks Gemini and Vertex isn't used) | `npm run voice:gemini-secret`, checked with `GET /v1beta/models` and `x-goog-api-key` (that it answers 200 is from the providers' docs (search results, 2026-11-09), unverified until the first real run) before saving | `streamSpeech` | Issue 13 |
| Secrets | `CONNECTIONS_MASTER_KEYS`, `GOOGLE_OAUTH_CLIENT` | The platform's token keyring and the site OAuth client; `npm run connections:keyring`, `npm run connections:google-secrets` | Google connectors, verify | Issue 20 |
| Console | An Anthropic console monthly spend limit and alert; round 6: a Deepgram project spend limit | Clicks no command can do, spelled out | first assistant issue, cloud listening | Issues 5, 14 |
| Console | Calendar, Gmail, Drive, round 6: People and Text-to-Speech APIs on (`npm run connections:google-setup` and `npm run voice:google-setup` run the `gcloud` parts); scopes on the consent screen | Clicks no command can do | Google issues | Issues 15, 20, 28, 29, 38 |
| Console | Three Cloud Monitoring alert policies on `helm.keys.*`, three on `connections.keys.*`; round 6: one on `voice.budgetReached`; issue 14: one on `voice.keyMissing` or `voice.grantFailed` (cloud listening that can't start) | Same as Runway's runbook | first sealed issue, Google issue, voice | Issues 2, 14, 20 |
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
| Storage | `apps/helm/media/{uid}/{mediaId}` and `{mediaId}.thumb` | Sealed media bytes; owner-only rule (section 14); a photo sent in a turn is one 1600 px copy plus its thumbnail | media flow | Issues 37, 52 |
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
    useHelmSync.ts  useHelmUrlState.ts  useAssistantName.ts  useScreenContext.ts  useLastInputMode.ts (issue 12)
    useKeyDates.ts               # round 6e: the yearly index (opened once per change), a who's moments
    useCaptureSweep.ts  useCaptureOutbox.ts  useHelmKey.ts
    useSession.ts                # current sessionId and turnIndex from the last capture's time
    useMediaUpload.ts            # cap, shrink, thumbnail, seal, upload, media doc
    useMediaUrl.ts               # a photo's opened thumbnail or picture, through useSealedObjectUrl
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
    media/        MediaThumb, PhotosSection (a who's or place's photos and Add a photo), MediaViewer (the photo's sheet, ImageViewer; PDF and Markdown readers follow)
    knowledge/    KnowledgeView (topic tree, Loose notes), TopicScreen (the document, overview and subtopic links),
                  SectionSourcesSheet, SectionEditSheet, NoteRow, NoteSheet, NoteForm, TopicPicker, VersionsSheet
    procedures/   ProceduresView, ProcedureScreen, ProcedureForm, ProcedureVersionsSheet (RunScreen comes with runs)
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
  src/lib/connections/                     # contract, sources, useConnections, connectionCalls (section 19)
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

- **Shared, no app's words:** `src/lib/connections/` (the contract, source manifests re-exported from each app, `useConnections`, call wrappers), `src/components/ConnectedSourcesList.tsx`, `src/lib/google/requestGoogleAuthCode.ts`, and on the server `functions/src/connections/` (registry, grants, callables, sync runner, live router, token store, the Google connectors, expiry). `contract.ts` is canonical in `src/` and vendored to `functions/src/vendor/connectionsContract.ts` under `check:server-copies`. Nothing in these names a recipe, trip, cat or movie; `check:connection-boundaries` greps them for every app's entity words.
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
| A-List (`memberships/{uid}/viewings` and `theatres`) | `plannedShowings` (event: movie, start, end, theater as place label and zone; planned only, from the sync window on), `savedTheaters` (place: name, address) | `seenMovies` (knowledge: title, rating; only seen showings the person rated) | Opens at `/a-list?viewing=<id>`; no price, ticket, savings, membership or share-link field is read |
| Going Once (open sales the uid is in, and their things) | `pickups` (event: pending things with a pickup day, all-day, sale name as subtitle), `sales` (project: name, available/pending/sold counts) | | Things are read with only title, status, draft flag, pickup day, asking price and photos selected (the last two only to count an available thing once it could be listed, as Going Once does); drafts and withdrawn things are skipped; opens `/going-once`; no buyer, contact, floor price, note or price field is read |
| Nine Lives (households the uid is a member of, `members array-contains`) | `cats` (pet: name), `vetVisits` (event: the cats and the reason as the title, clinic name as place, upcoming only from the window start), `dueCare` (task: vaccination and preventive next-due date, all-day, from one day before the window start), `clinics` (place: name, phone, address) | `conditions` (knowledge: condition name, cat as subtitle, status as detail) | Every read selects only the fields it uses, so no expense, weight, litter log, uploaded record, note or microchip field is fetched; a household the person left lists nothing; opens `/nine-lives` |
| Pinch (`kitchens/{uid}`) | `plannedMeals` (event), `shoppingList` (task: unticked only) | `useSoon` (task) | |
| Runway (`plans/{uid}`, sealed) | `moneySummary` (Free to Spend now, next income day, due before it as one total) | `upcomingBills` (task: name, amount, due), `horizon` (project: name, target, set aside), `transactions` (live; transaction: date, payee, amount, category) | Runway's device writes a sealed summary when it computes; the adapter opens it under Runway's key and returns totals (Helm says "as of <time>"); no account, balance, card, note, receipt or link field exists (owner round 5: Transactions offered, off) |
| Waypoint (trips whose `members` holds the uid, `members.<uid>.uid ==` the uid) | `trips` (trip: name, dates as all-day, city as place, trip zone), `itinerary` (event: activities, dining, flights, drives and other travel the person attends (everyone, or assigned to them) from the window start, stays and rentals; a trip-relative day and floating time becomes an instant only through `zonedDateTimeToEpoch` in the item's zone, else the trip's, with the zone on the record; a day with no time is all-day; the place is the location, address or pickup), `myTasks` (task: open Before the Road items assigned to the uid, and the uid's own private ones on trips they are in; due day is all-day) | `tripBalances` (moneySummary: one line per trip with something owed, `amountCents` what they are owed less what they owe, netted per person as the Dues summary does; the trip's currency) | Every read selects only the fields it uses, so no note, confirmation code, contact, suggestion, receipt, album or expense title is fetched; archived trips, trips that ended before the window and trips the person left list nothing; opens `/waypoint?trip=<id>`; `check:waypoint-balances` keeps the owed arithmetic equal to the app's |
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

- A live read checks a live grant with the category on, then either calls a site adapter's `query` in process (`querySiteLive`: Runway's transactions; no token, no account document) or opens the token inside `functions/src/connections/` and calls Google (`searchLive`, `readLive`), and returns an allowlisted shape. Google's are: search results `{ ref, title, from, at, snippet (≤300) }` (≤10), a read `{ ref, title, from, at, text (≤4,000) }`. Helm's MCP tools call only this.
- **Nothing is stored** in Firestore, logs or analytics: results live in the call's memory and an instance-memory cache keyed by a hash of (uid, account, op, args) for at most 15 minutes, so a follow-up question doesn't call Google twice. Only the quotes an answer keeps (≤5 of ≤300 characters, sealed in the capture) and the noted fact (section 6) outlive the call.
- **Gmail** (`gmail.readonly`): `users.messages.list` with the model's query (≤200 characters) and `users.messages.get` (`format=metadata` for search, `full` for a read: the text part, or the HTML part turned to text); attachments never. **Drive** (`drive.readonly`): `files.list` with `fullText contains` or `name contains`, `trashed = false`; a read exports a Google Doc as `text/plain` or extracts a PDF's text (≤10 MB); any other type answers "Helm can't read this kind of file". Deep links: `https://mail.google.com/mail/?authuser={email}#all/{id}`, Drive's `webViewLink` when its host is `docs.google.com` or `drive.google.com`.
- **As built (issue 29): Drive.** `functions/src/connections/google/drive.ts`: `files.list` with `(name contains 'q' or fullText contains 'q') and trashed = false` (quote and backslash escaped, ten results, Drive's own order), `files.get` for the kind and size, then a Google Doc exported as `text/plain` or a PDF of at most 10 MB downloaded and read with `unpdf` (MIT; its bundled PDF.js is Apache-2.0); any other file, an oversized PDF or an unreadable one is `kind: 'other'` and never downloaded, and the router answers it `notReadable`. File ids must match `^[A-Za-z0-9_-]{10,128}$` before any URL is built. A read keeps the first 50,000 characters, finds up to five non-overlapping passages of at most 300 around the words of the model's `find` (rarest words first, stopwords dropped, returned in reading order; the first three paragraphs when none match), and the model is sent only those passages. A trashed file is not read. The live cache key includes the connector, since one Google account serves Gmail and Drive. A remember is refused in code unless its quote is an email (`remember-quote-not-email`). Search items carry `kind` (`mail`, `doc`, `pdf`, `other`) and an empty snippet; the Helm tools `search_documents` (aliases `d1`…) and `read_document` give each passage its own quote alias (the quote book keys on the passage), and the quote reads "Document · {file name}" with "Open in Drive". Deep links are built from the file id and email, never stored: a Doc opens at `docs.google.com/document/d/{id}/edit?authuser={email}`, a PDF or other file at `drive.google.com/file/d/{id}/view?authuser={email}`; Drive's `webViewLink` is not used. Drive shares the `google-mail-and-drive` switch and the live-turn rule with Gmail.

### Field authority and the same thing twice

- **Who wins** (`authority.ts`, pure, used by the planner, answers and Today): an event's time → the calendar; a thing an app holds → that app; Helm's own facts → the person; mail and documents never win. Two outside sources that disagree are shown, not asked: the winner's value, and one line naming the other ("Two times: an email says 2:00 PM"). An email's differing value appears only after a question noted it as a fact (section 6); Gmail is never scanned in the background.
- **An app against a Helm fact.** A fact about a synced record (`aboutField`) whose value differs from the copy is a derived "Which is true now?" in Needs you (`selectDiscrepancies`, on the device). Picking the app's value supersedes Helm's fact; keeping Helm's sets `keptOverSource` on the fact with the copy's `contentHash`, so it isn't asked again until the source changes. The source is never changed.
- **The same thing twice** (`utils/sameThing.ts`, on the device): a calendar event and an app's event are one thing when their titles match (`createOptionMatcher` over both titles, the shared threshold) and their starts are within 15 minutes (design round 5; product's draft said 30, design's tighter rule taken). One card, both marks, the calendar's time; if the app's time differs, one line says so. Two Google accounts' copies of one event (same `iCalUID`, or same title and start) count once. **As built (issue 33):** `isSameThing` (copies from different grants, both timed or both all-day, starts within `SAME_THING_MINUTES`, `createOptionMatcher` with its defaults over the titles; a shared `sameEventKey` always matches) and `mergeSameThings` run inside `getDayEvents`, so Today, its count and the planner's busy blocks see each event once; `engine/authority.ts` picks the shown copy (`pickTimeAuthority`: the calendar's), the other source's differing start (`findOtherTime`) and the app's place when the calendar has none (`findPlace`). The assistant's server-side context still lists both copies. `check:helm-same-thing` covers it.

### Disconnect and delete

- **`endConnection({ grantId, deleteCopies })`** stops reading at once (status `ended`), then:
  - `deleteCopies: true`: the sink deletes every copy of the grant, then blanks what answers quoted from it: captures with `quotedSourceKeys array-contains "{connectorId}|{accountId}"` get each matching quote's `text` and `deepLink` set to null with `deletedAt`, and each synced source's `title` set to null, so the answer reads "Quoted from Pinch, deleted Nov 9"; a noted fact from it keeps its statement and loses its quote. For Gmail and Drive this blanking is all deleting does, and it runs whichever choice ends the grant. As built (issue 28): quotes are blanked and only captures whose quotes matched are rewritten; nulling a synced source's `title` is not built yet. A blanking failure is logged and never fails the disconnect.
  - `deleteCopies: false`: copies get `connectionEndedAt` ("From Pinch · no longer updated"), stay searchable and citable with their links, and Today stops planning around them; `deleteAfter` is `endedAt + KEPT_COPY_DAYS` (90, owner round 5). The grant keeps `keptCopies` for the row ("Deletes Feb 7 · Delete now"); `deleteKeptCopies` deletes them early and blanks quotes as above; `expireKeptCopies` (daily) deletes them on time.
  - **"Also delete" starts ticked** (owner, round 5): `DISCONNECT_DELETES_BY_DEFAULT = true`; the person can untick it on each disconnect.
- **What Helm made stays**: tasks, procedure runs, facts and past plans keep their source as sealed text ("From Miso's visit in Nine Lives, Nov 12").
- **Google**: ending the last grant that uses an account revokes the token at Google (best effort) and deletes the token and the account document; ending one service while another still uses the account leaves the scope granted at Google but unused (Google can't drop one scope from a refresh token), and the page says Helm no longer reads it.
- **Reconnecting** writes a fresh grant with each category at its default.

### Several Google accounts, incremental authorization

- One site OAuth client (`GOOGLE_OAUTH_CLIENT`). Each account is keyed by its Google `sub`, so a personal and a work account are two accounts, each with its own grants and switches. "Add another Google account" passes `prompt=select_account`.
- Each service is its own consent on its own tap, with `include_granted_scopes=true`: Calendar asks `calendar.readonly`, Gmail later asks only `gmail.readonly`, Drive only `drive.readonly` (plus `openid email` to know the account). `finishGoogleConnection` refuses when the requested scope wasn't granted ("Helm needs permission to … Nothing was connected.").

### Tokens

- Refresh tokens are sealed in `connectionsServer/{uid}/tokens/{accountId}` (`{ masterKeyId, nonce, ciphertext, grantedScopes, createdAt, lastRefreshedAt }`) with `deriveSubkey(CONNECTIONS_MASTER_KEYS, id, 'oauth-refresh')` and `uid|accountId` as authenticated data, using `functions/src/appKeys/`. The keyring has Runway's whole contract (escrow, canary at `connectionsServer/keyChecks/ids/{id}`, `verifyConnectionKeys` daily, alerts). Access tokens live in instance memory until they expire.
- Only `functions/src/connections/` calls `openToken`; adapters, sinks, Helm's MCP server and the model never see a token. Errors carry a short code, never a token, URL or Google message.
- **Smallest scopes:** `calendar.readonly` (sensitive), `gmail.readonly` (restricted), `drive.readonly` (restricted: searching file text needs it; `drive.file` sees only files Helm made and `drive.metadata.readonly` reads no text).

### Restricted scopes: the tester limit

`gmail.readonly` and `drive.readonly` are restricted: before anyone but test users may grant them, Google requires verification and a yearly independent security assessment. So in the MVP:
- The Gmail and Drive ticks show only to people the `google-mail-and-drive` switch lets in (`FEATURE_GATES`, appId `helm`, default `testing`, set in the admin's Features tab), and `startGoogleConnection` refuses those scopes for anyone else (`assertGateOpen`). Everyone else sees Calendar alone. The owner also lists each tester as a test user on the consent screen (clicks spelled out in issue 27), since the switch can't do Google's part.
- The consent screen stays in Testing with the owner as a test user, so every Google connection, Calendar included, needs Reconnect about once a week (refresh tokens expire after 7 days), which design draws. **Checked in issue 20** (from search results; Google's help pages can't be read from the build sandbox): refresh tokens of a screen in Testing expire after 7 days; a screen published "In production" but unverified has no weekly expiry, shows Google's unverified-app screen and is capped at 100 users; restricted scopes need verification before production use. So while Calendar is the only scope asked for, the owner can publish the screen and the weekly Reconnect goes away; the Gmail issue revisits it, since a restricted scope on an unverified production screen is refused to everyone but listed test users (unverified).

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

- **Runway's summary** is a sealed field Runway's own device writes when it computes (owner option A, issue 25): Runway's engine is too large to vendor, and a server copy of it could drift from what the person sees. The adapter only opens that field and returns totals. It is as fresh as Runway's last open, so Helm says "as of <time>" from the record's `sourceUpdatedAt`.
- **Runway's transactions** (owner round 5: offered, off) are **live, not synced**. The question they serve is "what did I spend at X", which an answer asks now and then; nothing on Today or in the planner needs them, so copying every purchase into Helm hourly would put the person's most sensitive data in a second place for no use. The adapter's `query` opens `plans/{uid}/purchases` within the asked range (≤13 months) on the server, keeps spending and refunds only (no deposits, no pairs between the person's own accounts), matches the payee text with `createOptionMatcher` against the person's label or the merchant, and returns at most 20 rows newest first plus the matched count and total. A row is the smallest shape that answers the question: `{ date (date-only), payee (label, else merchant), amountCents (negative on a refund), currency, category (the envelope it came out of, "Free to Spend", or "Split") }`; no note, receipt text, link, card, account, bank description or logo field exists. A site adapter's results are not cached at all (Google's follow the 15-minute instance-memory rule); an answer quotes at most 5 rows as quotes, blanked like any quote when Runway is disconnected with delete.
- **Worth the Wait shares counts only** (owner round 5). Box names, emoji and descriptions are sealed under the space's key; each item's `content` is sealed, but `isRevealed` and `revealedAt` are readable fields on the item document. So the adapter, for each space whose `members` holds the uid, opens each box's name and emoji (box fields, not items), and gets `items` and `revealed` with two Firestore aggregation `count()` queries on the box's `items` (all, and `where isRevealed == true`), which return numbers and read no item document; `notYetRevealed` is the difference. It returns one `countSummary` per box: `{ title: name, subtitle: emoji, extra: { items, revealed, notYetRevealed } }`. Boxes have no members of their own (every box in a space belongs to both members), so "the person is in it" is the space membership the adapter already filters on. No item's content, author, dates or method is read; there is no field for one. The category starts off.

**As built (issue 25).** Runway's device (`useShareSummary`, mounted in `RunwayPage` beside `useAutoPay`) seals `{ computedAt, currency, freeToSpendCents, nextIncomeOn, dueBeforeIncomeCents, bills (≤20, next 30 days), horizon (≤20) }` with `sealJson` and writes it to `apps/runway/plans/{uid}.shareSummary` with a field-scoped `updateDoc`, only when the figures differ from the last write (compared without `computedAt`) and from the stored summary opened once with the key (unchanged and under six hours old is skipped), never on a kept (offline) key, with a stale or overlapping write dropped before it lands, about two seconds after the plan settles, never offline, before the plan has loaded or while amounts are made up. The plan rule already lets the owner update the plan document, so no rule changes. `functions/src/apps/runway/share/adapter.ts` reads the plan with `select('shareSummary')`, unwraps the key only through `planKey.ts`'s `unwrapPlanKey`, opens it with `openWithKey`, checks every field by type (a malformed entry is dropped) and returns `moneySummary` (one record, `plan/summary`, `extra.nextIncomeAt` and `dueBeforeIncomeCents`), `upcomingBills` (`task`, a stable hashed ref per name and day) and `horizon` (`project`). An explicit `shareSummary: null` (Free to Spend unknown) returns no records with `isFull: true`, so older copies are deleted; a missing field, a key that will not open (logged as `runway.share.summaryUnreadable`, reason `key` or `malformed`) or malformed totals return `isFull: false`, so older copies stay. Bills already past are dropped at read time, and twin rows get distinct refs through an occurrence index. Amounts are written by `functions/src/utils/formatMoney.ts` in the currency's own fraction digits. `check:adapters` seeds a summary that also carries an account, a transaction, a card, an income source and a receipt and fails if any appears in the output, and fails if a file under `share/` unwraps a key itself. Helm's server reads a connected `moneySummary` copy into the answer's context and into `search_synced` with its amount, detail and `asOf` time in the person's zone (`syncedCopies.ts`).

### How the MCP server authenticates

Per request: the callable checks `request.auth` and App Check, builds the server with the uid, the unwrapped Helm key and the person's live grants in its closure, and drops it when the call ends. Tools take aliases and search text, never a uid, id or token; a live tool goes through `liveRouter`, which re-checks the grant on each call. The server can reach only the caller's tree and grants. In Beyond, the same server served over HTTP authenticates each request with MCP's OAuth against the site's Firebase identity and builds the same closure from the token's uid.

**As built (issue 18):** the contract (`src/lib/connections/contract.ts`, with `SHARED_RECORD_KEYS` and `EXTRA_KEYS` as the allowlists), `SOURCE_SHARES`/`getSourceManifest`, `READER_APPS`, `useConnections` and `connectionCalls` on the client; on the server `functions/src/connections/{registry,grants,callables,sourceClient}.ts`, `functions/src/appAccess.ts` (`canOpenApp`, the site's one app-access check, also used by `registerAppUsage`) and Pinch's adapter. `grantConnection` writes the grant at the staged ticks and refuses `already-exists` over a live one (an ended grant is replaced); `updateConnection` writes `categories` and `updatedAt`, and a category switched off has its copies deleted and its `categoryState` reset; `endConnection` ends the grant (idempotent) after deleting every copy (`deleteCopies: true`) or marking each with `connectionEndedAt` and `deleteAfter` = end + 90 days and setting `keptCopies` (the quoted-name blanking of the delete branch waits for captures that carry `quotedSourceKeys`, which none do yet). Pinch's adapter reads only `apps/pinch/kitchens/{uid}`: planned meals on or after the window start (title = the meal's name, else its items' names; slot as subtitle; all-day), unticked shopping items (ingredient name from the kitchen's record, else `CATALOG_NAMES`, a generated name-only server copy of Pinch's catalog), and in-stock boxes and packages inside the morning note's own window (`getDigestBounds`, `DEFAULT_LEAD_DAYS`), counted from the UTC day since the person's zone lives outside the kitchen. `check:server-copies` (new) keeps the contract, Pinch's server manifest and the catalog names generated from `src/`.

**As built (issue 19), server:** `functions/src/connections/{sink,syncRunner,expire,scheduled}.ts` and `functions/src/apps/helm/connections/sink.ts`. A reader app registers a `ReaderSink` in `READER_SINKS` (`openSession` per run, `expire`, the secrets it needs); a session has `writePage`, `finishCategory`, `deleteCategory`, `deleteGrant`, `deleteKept`, `countKept` and `keepGrant` (which never moves an earlier `deleteAfter` later). `syncGrant` takes a 2-minute lease in a transaction on `syncLeaseUntil`, checks the source's status (`noAccess` or `needsReconnect` is written to the grant; a successful run puts a grant back to `live`), then for each switched-on category pages through the source client's `syncPage` from now minus 30 days, one category after another so one failure never stops the next. The Helm sink unwraps the person's key once per run, writes `apps/helm/users/{uid}/synced/{syncedId}` (id = first 40 hex of sha-256 of `grantId|category|sourceRef`) in batches of 400, seals `{ title, subtitle, detail (500), placeLabel, amountCents, currency, deepLink, extra }`, and skips a copy whose `contentHash` (HMAC-SHA256 under an HKDF subkey of the data key over the record's canonical JSON and deep link) and `transformVersion` match and that is not a kept copy, so `syncedAt` is the last time a copy was written, not the last time it was seen; `categoryState.lastOkAt` is the freshness. At most 1,000 copies per category (newest first by start, due or update time). A full read (every page `isFull`) deletes the copies the run did not see; a partial read never does, and Pinch's adapter now reports `isFull: false` when a query hits its limit. After any run a copy whose end (`endAt`, else `dueAt`, else the start plus a day when all-day) is over 30 days past is deleted. A failed category keeps its copies, writes `categoryState[category].lastError` (`readFailed`) and a capped `errors` entry; the grant is written once at the end with dotted `categoryState.*` keys, and if the grant ended during the run, the late copies are deleted (or kept with the grant's `deleteAfter` when it ended keeping them), and after every run on a live grant the copies of every category that is off are deleted, so a switch-off whose delete failed heals. `endConnection` ends the grant first, then deletes or marks the copies and writes the final `keptCopies` count in a transaction that only applies to the same ended grant; calling it again on an ended grant re-runs that cleanup. Kept copies show on Today (UX L6) only while their grant is ended; a live grant's copy shows only for a category that is on. `syncConnections` (callable, 15-minute throttle per grant without `grantId`; with one, a 60-second throttle that a never-read switched-on category or a grant changed since its last sync gets through), `deleteKeptCopies`, `syncConnectionsHourly` (grants 50 minutes stale, never-synced first, up to 200) and `expireKeptCopies` (daily; deletes by a collection-group query on `deleteAfter` and recounts `keptCopies`) are the entry points; a reconnect over an ended grant carries `keptCopies` over, and the next sync rewrites the matching copies as live. `firestore.rules` gives `synced` an owner read and no client write (the collection stays out of the wildcard list); `check:helm-rules` proves it, `check:connection-sync` (fixed clock, emulator) covers the sync, window, hash skip, failure, disconnect, expiry and rejection cases.

**As built (issue 20), Google:** `functions/src/connections/{tokens,connectionKey,options,verifyConnectionKeys}.ts` and `functions/src/connections/google/{oauth,client,calendar,fixtures,deepLinks}.ts`; the client is `src/lib/google/requestGoogleAuthCode.ts` (a popup, or the same tab in an installed app, that hands the code back to the opener), `useConnectionAccounts` and Helm's `GoogleConnectProvider`, `CalendarPicker`, `AccountLabelSheet`, `ShiftCalendars` and Today's `ConnectCalendarRow`. `startGoogleConnection` stores a single-use state (`connectionsServer/{uid}/oauthStates/{state}`, 10 minutes, PKCE verifier, the reader, connector and redirect, which must be the site's origin plus the reader's route) and returns the auth URL (`access_type=offline`, `include_granted_scopes`, `prompt=consent`, plus `select_account` for another account and `login_hint` on a reconnect). `finishGoogleConnection` consumes the state in a transaction, exchanges the code, verifies the id token, refuses a missing scope with `permission-denied`, writes the account (id `g_` + the first 16 hex of sha-256 of the Google `sub`) and the sealed token, revives that account's `needsReconnect` grants and says whether a live grant already exists, so the client opens the calendar picker only for a new connection. `readConnectorOptions` lists the account's calendars (`calendarList`, holidays and subscriptions off by default); the chosen ids live on the grant as `options.calendarIds`, and shift calendars on Helm's profile as `shiftCalendarIds` (`accountId/calendarId`). `updateConnection` also takes `options` and `accountLabel` (24 characters) and clears the sync cursors of whatever it turned off. `endConnection` revokes at Google and deletes the account and token when no live grant uses the account any more. Cursors are `connectionsServer/{uid}/cursors/{grantId}__{category}`; `invalid_grant` raises `ReconnectNeeded`, which marks the account and its grants `needsReconnect`. In the emulator with no `GOOGLE_OAUTH_CLIENT`, the auth URL comes straight back to the redirect with `code=fixture` and fixtures answer for `personal@example.com` and `work@example.com`. `check:connections-rules` covers accounts, tokens, OAuth states, cursors and the canary; `check:connection-sync` adds the calendar cases (paging, sync token, `updatedMin` fallback, 410, declined, cancelled, duplicates, the cap).

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
| Speaking | `cloudTts.ts`: posts the text to the site function `streamSpeech`, buffers the whole MP3 clip and plays it through `AudioContext` (issue 15) | `deviceTts.ts`: wraps `readAloud` (the natural voice through WebAudio when downloaded, the system voice otherwise); every text through `toSpokenText` first |

Cloud speaking's provider is a server choice, never a client one: `functions/src/voice/providers/` holds `geminiTts.ts` (Gemini Flash-Lite TTS), `deepgramAura.ts` (Aura-2) and `googleTts.ts` (Cloud Text-to-Speech, Chirp 3 HD), each `speak({ text, voiceId, format }) → ReadableStream<Uint8Array>`. `VOICE_PROVIDER_DEFAULT` in `functions/src/voice/voiceConfig.ts` names the one the voice benchmark (issue 13) picks; until then it is `googleTts` (ADC, no new secret). An optional provider credential is read at run time and its absence means that provider is skipped (cloud-functions rule), so a missing `DEEPGRAM_API_KEY` sends every turn to the device adapters and nothing fails.

**As built (issue 13):** the three providers, `voiceConfig.ts` (prices, candidate voices, `costMicros`) and `pcmToWav` exist under `functions/src/voice/` with no function deployed; `npm run voice:benchmark` renders twelve replies through them and opens a local page beside the natural voice, and the owner's pick sets `VOICE_PROVIDER_DEFAULT` later. Everything about the providers was read from the providers' docs (search results, 2026-11-09), unverified until the first real run; the docs pages could not be opened from the build sandbox. Still unverified: the Gemini model id `gemini-3.8-flash-lite-tts` and the candidate voice ids, Deepgram opus in Ogg, Chirp 3 HD with `OGG_OPUS`, Gemini's `alt=sse` stream and its PCM at 24 kHz, a Cloud TTS API key (ADC is used), the 2027 Gemini price rise, the `mip_opt_out` default, Gemini on Vertex, and both key checks' 200 answers (Deepgram `GET /v1/projects`, Gemini `GET /v1beta/models`).

**As built (issue 14):** cloud listening. `mintVoiceToken` (callable; auth and App Check; `DEEPGRAM_API_KEY` read at run time, never bound) counts the token against `voiceUsage/{uid}/days/{dayKey}` (the person's local day; `listenMs`, `mints`, `openMints`) and `voiceBudget/{utcDayKey}.costMicros` (each mint at its worst case, 60 s at $0.0077 a minute) in one transaction, then calls Deepgram's token grant (`POST /v1/auth/grant`, `ttl_seconds: 60`) and returns `{ status: 'ready', token, expiresAt, provider, model, mintId }`, or `{ status: 'held', reason }` for a spent allowance, the site cap, a missing key or a failed grant, so the device never sees an error. The device reports each stream's length (by `mintId`, capped at 60 s, each id once) with its next mint, and a stream whose report is more than a minute overdue (a closed tab, a lost request) is charged the full 60 s; a failed socket reports 0. So the 60-minute allowance rests on the device's reports and on that overdue charge, the 300 mints a day are the hard bound, and the day bucket follows the time zone the device sends (a person could pick a fresh day), which the site's daily cap bounds. The usage doc is rewritten from what the transaction read (its other fields kept, `openMints` replaced whole), so a removed key is really gone. A token that arrives after the 1.5 s wait, or for a listen already cancelled, is reported at 0 ms, and reports stay on the device while the server answers `unavailable`, so neither is charged as overdue. A missing key outside the emulator logs `voice.keyMissing` once per instance. `deepgramStream.ts` opens the socket with the token as a `bearer` subprotocol, model `nova-3` (picked over Flux for being the streaming model the docs describe with interim results; Flux is untried), PCM at 16 kHz from `pcmWorklet.ts`, buffering what is said before the socket opens; a token later than 1.5 s, a held mint or a socket that doesn't open hands the same listen to the browser's recognition. A spent allowance or the cap is remembered for the local day and said once ("Listening with this browser for the rest of today."); a Stop before the token or socket arrives, when the socket then fails, delivers nothing for that listen. The token is asked for at the tap, while the microphone prompt is up (the 1.5 s wait starts once the microphone is open). A Stop or Cancel during that prompt is kept and honoured when it closes, and Cancel (or leaving the screen) ends the stream without sending what was buffered. A browser with no recognition of its own (Firefox) is still told it can't listen, though the cloud could: a later issue. `voiceMode` `deviceOnly` (Settings → Voice) never mints. `sttProvider` records `deepgram` or `browser`. Read from Deepgram's docs (search results, 2026-11-09), unverified until the first real run: the grant endpoint and its answer, the 60 s lifetime, the `bearer` subprotocol, whether an open stream outlives its token (the budget assumes each stream ends by 60 s, which this site's auto-stop keeps to; a modified client could hold one longer if Deepgram allows it), the streaming price, and that `mip_opt_out` applies to streaming.

**As built (issue 15):** the cloud voice. `streamSpeech` (HTTPS `onRequest`, us-central1, at most 10 instances, 30 s) refuses another method (405), a missing or foreign `Origin` (403, checked by the handler, not only by CORS), a missing or invalid ID token or App Check token (401; the emulator takes a present App Check header unverified, since it can't reach App Check, and also allows plain-HTTP dev origins), an unknown `appId` (400) and text over 600 characters (413). It counts the characters in `voiceUsage/{uid}/days/{dayKey}.spokenChars` (only that field is written) and the cost in `voiceBudget/{utcDayKey}.costMicros` in one transaction (`planSpeech`: 30,000 characters a day, the site's $5 cap), answers 429 `{ reason: 'speechLimit' | 'budgetReached' }` when held, then pipes the default provider's MP3 back (`VOICE_PROVIDER_DEFAULT`, Google's Chirp 3 HD through the function's own credentials until the owner's benchmark pick) with the voice id from the app's entry in `VOICE_APPS` (Helm's `HELM_VOICE_IDS` in `functions/src/apps/helm/voiceIdentity.ts`). A provider that fails before any byte gives the reservation back and answers 502; a missing key for a keyed provider answers 503 before anything is counted. The emulator answers a short tone. `cloudTts.ts` posts the line (through `toSpokenText` first), waits for the whole clip and plays it through the shared `AudioContext`: MP3 decodes in every browser, and Google's answer is one clip anyway; playing chunks as they arrive needs MediaSource, which Safari can't use for Opus, so it waits for a provider that streams. No first byte within 2.5 s of the request, a body not done in 8 s, a held or refused answer, or audio that won't decode hands the same line to the device voice; once sound has started it never switches. `pickSpeaker` sends only `reply` and `summary` to the cloud, and only online, with the voice mode on `cloudWhenOnline` (so "Keep voice on this device" keeps answers on the device too), not held today and with a speech source supplied; a held answer is remembered for the local day with nothing said (the one-time line arrives with spoken answers). Every line spoken today is a code-built `ack`, so the device voice still says them all; the cloud voice is first heard when answers are spoken (issue 27). The queue reports the adapter that actually played (`cloud:{provider}`, `natural` or `system`; the device voice's id when it stood in), which is what `ttsProvider` records. A provider whose body ends or fails before its first byte is released and answered 502 like a refusal (the status and headers wait for that byte), and a Firestore failure while counting answers 503 at once. The day's character count is keyed by the time zone the browser sends, as listening's minutes are, so a caller could split it across zones; the site's $5 cap still bounds the spend. `priority` is checked but not yet used by the server. Read from the providers' docs (search results, 2026-11-09), unverified until the first real call: Chirp 3 HD's MP3 output and price.

**As built (issue 16):** one speech gate (`src/lib/speech/voice/bargeIn.ts`, general) serves barge-in and the follow-up window. `createSpeechGate` is pure: each 20 ms frame of 16 kHz audio is speech when its energy clears a slowly following noise floor by 3× (and 0.01 absolute) and its zero crossings sit in a voice band (0.02 to 0.35 per sample), and 200 ms of speech (gaps forgiven) triggers it once with the last 300 ms of frames. `openSpeechGate` opens the microphone with echo cancellation and noise suppression and runs the worklet's frames through the gate on the device; nothing is sent until it triggers, and then it hands over a `FrameSource` (`preRoll`, `subscribe`, `stop`) that `createDeepgramStt({ source })` sends first and then streams live, releasing the microphone when the listen ends (its other callers open the microphone themselves, as before). **Barge-in** runs only while a line plays through Web Audio (`isPlayingThroughWebAudio`) and the listener for this turn would be the cloud: a trigger clears the queue, the hook's `onBargeIn` keeps the playing line's capture id, and the next capture carries it as `interruptedCaptureId` (null on every other capture, and on legacy reads), which the sorter's prompt turns into one line saying the person talked over that reply. Every line said today is an `ack` read by the device voice, so barge-in is first heard with spoken answers (issue 27); until then, and wherever the line is the system voice or the listener is the browser's recognition, a tap on Talk while a line is said stops it and listens (the dock shows Talk, not Stop, while speaking). **The follow-up window:** after the last line of a turn the person started by voice, with `isHandsFreeOn` (default true) and not muted, the gate opens for 8 s with the ring showing listening; speech starts a listen on the routed listener (the cloud fed the pre-roll, or the browser's recognition), and silence closes it with no sound and nothing sent. A listen the gate started (the window or a barge-in) that hears no words also ends quietly (`onNothingHeard(false)`), since the person never asked for it; only a tapped listen says it caught nothing. Taken by the browser's recognition, such a listen misses the pre-roll and the 200 ms that triggered it, which only the cloud is fed. The gate opens only on a visible page with the microphone already granted, so it never asks for permission while a line plays, and a line that arrives during the window ends the window and plays. A tap on Talk in the window listens at once. **The wake phrase:** with `isWakeWordOn` (default false), while the page is visible, the key is open (`keyStatus` ready), no turn is active and the screen is home or a page that publishes its context (a utility screen has nowhere to show the conversation), WAKE mode runs on the browser's recognition with `readWakePhrase` and the spellings of the assistant's current name (`toWakeSpellings`, so a rename renames the phrase). Words after the phrase in the same utterance are sent as the turn (`sttProvider: 'browser'`); the phrase alone starts what a Talk tap starts, from the page in front, and opens the ask bar there. It starts 400 ms after the last state change, so the gap between a line ending and the window opening never starts and stops it, and a halt the browser calls `not-allowed` re-reads the microphone permission, so Talk is blocked only when the person truly refused it (the browser can raise that error for a recognition with no tap behind it). A hidden page pauses it and closes the window and the gate. A browser with no recognition shows the switch as a lock with "This browser can't listen for a phrase." in its row. Both switches are written field-scoped like `voiceMode`, legacy profiles read the defaults, and new profiles are created with them; `firestore.rules` checks no profile fields, so nothing changed there.

### Routing, per turn

`voiceRouter.ts` (pure, fixed-input tests) picks one adapter for each listen and each speak:

- **Listening** goes to the cloud when the browser is online, the person's voice mode is `cloudWhenOnline`, the minted token arrived within 1.5 s and the person is under their listening allowance; otherwise to the device: the on-device model when it is downloaded and loads, else the browser's recognition. Wake listening is always device-only (below).
- **Speaking**: an `ack` (a code-built confirmation of what was done, "Got it, moved to Friday") goes to the device voice, so it starts at once and costs nothing; a `reply` or `summary` goes to the cloud voice when online and under the allowance, else the device voice. A failed or slow cloud stream (no first byte in 2.5 s) falls back to the device voice for that reply, and the turn's `ttsProvider` records which one spoke.
- **Over a limit** the person is never blocked: the router answers `device` and Helm shows one quiet line on the conversation ("Listening with this browser for the rest of today" for listening, as built in issue 14).
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

**As built (issue 12):** device adapters only, in TAP mode. `voiceRouter` answers `browser` for listening and `natural` or `system` for speaking (cloud inputs are accepted and read by nothing yet); `useVoiceConversation` has no wake word, barge-in, follow-up window or cloud. A tap listens, the words show as heard, and a tap, "that's all" or 8 seconds of quiet sends them; `useHelmVoice` writes the turn with `sendCapture` (`inputMode: 'voice'`, `sttProvider: 'browser'`, joining back-to-back as a typed turn does; a joined turn is spoken when any of its messages was) and, when that turn is sorted and its execution's sealed `spoken` is set, says it with priority `ack` unless muted, then writes `ttsProvider` on the turn's first capture with a field-scoped `updateDoc`, only once the line was actually spoken. A `needsYou` or `failed` turn speaks nothing; answers and questions are spoken in their own issues. "Undo that" is matched on the whole utterance (`UNDO_PHRASES`) and runs `takeBack` on the latest undoable execution in the open session (the latest thing it filed), saying its report; while a turn is still being read it declines rather than take back the one before. Transient recognition errors end that attempt only; a refused microphone stays blocked until the permission changes. Mute is hook state only. Helm does not turn the natural voice on yet, so every line is the system voice.

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

The person's allowance and the site budget are checked in one transaction per mint or speech request. Prices (read from the providers' docs (search results, 2026-11-09), unverified until the first real run for speaking; Deepgram streaming about $0.0077 a minute stays **unverified** until issue 14): Aura-2 $0.030 per 1,000 characters, with a 2,000-character limit per request; Cloud TTS Chirp 3 HD $30 per million characters with the first million a month free and 5,000 bytes per request; Gemini 3.8 Flash-Lite TTS $6 per million audio output tokens at 25 tokens a second, about $0.009 a minute, rising to $12 per million on 2027-01-01 (`TTS_PRICES` in `voiceConfig.ts` holds them). At those prices a person at both limits costs about $0.46 of listening and $0.90 of speech a day, so the $5 cap covers about three people at their limits, or many more at normal use.

### Data use

- Conversation audio is never stored by Helm: streamed audio goes to the provider and is gone; a voice note's audio is sealed media and let go after 24 hours unless the person keeps it (section 23).
- Deepgram: the requests opt out of model improvement with `mip_opt_out=true`, said in the docs to be on `/v1/speak` with improvement on by default otherwise (unverified; that it applies to streaming listening is unverified until issue 14). Gemini: never the free tier, whose data may be used to improve Google's products; the paid tier is not used to improve products, and 3.8 Flash-Lite TTS is said to be on Vertex AI at the `global` location (unverified). Cloud TTS: said to be stateless and not logged under Google Cloud's terms; its streaming is said to be gRPC only, so REST returns the whole clip. The "What the AI sees" page gains a voice section, and the same "check before ship" rule as Anthropic's applies to each provider's terms.

### Where it lives

General: `src/lib/speech/onDevice/` and `src/hooks/useOnDeviceRecognition.ts` (on-device recognition, above), `src/lib/speech/voice/` (`types.ts`, `voiceRouter.ts`, `browserStt.ts`, `deepgramStream.ts`, `pcmWorklet.ts`, `deviceTts.ts`, `cloudTts.ts`, `playbackQueue.ts`, `bargeIn.ts`), `src/hooks/useVoiceConversation.ts`, `functions/src/voice/` (`voiceConfig.ts` with `VOICE_APPS` and prices, `mintVoiceToken.ts`, `streamSpeech.ts`, `transcribe.ts`, `usage.ts`, `providers/*`). `check:pinch-voice` (`speechShared.ts`) widens its file list to `src/lib/speech/voice/**`, `useVoiceConversation.ts` and `functions/src/voice/**` (except `VOICE_APPS` entries, which name app ids only). Helm's: `components/voice/VoiceControl.tsx`, `VoiceStateRing.tsx`, `constants.ts` phrases, `functions/src/apps/helm/voiceIdentity.ts`.

## 21. Conversation and screen context

### Sessions and turns

A **session** is a run of turns with no gap over 10 minutes (`SESSION_IDLE_MS`); the device stamps each new capture with the current `sessionId` and `turnIndex`, so no session document exists and no write is needed to start one. The home surface lists the current session's captures (newest at the bottom), each with what was understood, what the assistant did with its Undo, any answer, any kept media and any question; earlier sessions are one scroll up, grouped by day under `SectionDivider`, lazily loaded 20 sessions at a time. `sortHelmCapture` reads the session's last 6 turns (their text and summaries, sealed, opened on the server) as context, so "and move it to Friday" after "add call the florist" works.

**Back-to-back messages**. Every message is its own sealed capture and its own bubble. A message sent while the session's last turn is still `received` or `interpreting` (the reply hasn't started) **joins** that turn: the device writes it with `turnLeadId` and adds its id to the lead's `joinedCaptureIds` in one batch (≤9 joined; a tenth starts a new turn), so it works offline too, and a turn held offline gathers everything said before it is read. The call reads the lead and its joined messages in order and gives one reply covering them all ("Got all three"). Mechanics, chosen for cost: no debounce (it would delay every reply); while the model is streaming, a listener on the lead aborts the stream as soon as a message joins (only the tokens already generated are paid; the cached system prompt and tools make the restart cheap) and, if at least 12 s of the call remain, the call waits until messages stop arriving for a second (at most three), then restarts once with every message and only the time left in the call (otherwise the first run finishes and the late message is released); the commit transaction checks `joinedCaptureIds` against what the call read, and a message that joined after the restart, or after the commit, is released as its own turn (its `turnLeadId` cleared) and gets its own reply. A spoken pause followed by more speech before the reply starts is the same: the second final transcript is a joined message. A message sent after the reply starts is always a new turn. Each model call counts on the limits; a restart costs at most one aborted call per turn.

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
- **What the server does with it:** `sanitizeScreen` keeps only a known view name and, for `collection: 'tasks'`, ids matching `^[A-Za-z0-9_-]{1,128}$` (focus 1, the first 20 visible, each keeping its place in the client's list, deduped); everything else in the object is ignored. It re-reads those ids with `getAll` under the claimed capture's own `apps/helm/users/{uid}/tasks/` (never a path from the client; a missing id is dropped, whatever the task's status), opens each title with the key (an unreadable one is dropped) and adds it to the context package as `<screen>` with an alias and the focus apart from the visible list. No summary or text from the client is ever trusted. The prompt says "this" means the focus, and "these" the visible list.
- **Caps:** focus 1, visible 20; a focused topic's document goes in whole (≤30,000 characters, section 24); visible records go in as their one-line titles.
- **Why kept in Helm, not shared:** the shape names Helm's views and collections; another app wanting the same thing would share the hook's idea, not its types (light call). The `v` field lets a browser extension or another medium publish a different shape later (section 27).

### The home surface and the voice dock

`HomeSurface` (the conversation) is `/helm`; every other view is a route below it. The **voice dock** sits on home only: `VoiceDock` with **Browse** (opens `BrowseSheet`, the one view-switcher component, fed by `views.ts`; see "The Browse sheet" below), **Talk** (starts a spoken turn through `VoiceControl`) and **Type** (focuses the composer). Doors on home are retired. The capture sheet of earlier rounds is the composer at the bottom of the home surface.

### Asking from a content page

- **One control, one place.** `HelmShell` renders one `AskAboutThisControl` (in `components/shell/`) as a full-width ask bar fixed at the foot of the page, part of the layout and never floating (design's pick, round 6e; the page scrolls above it, with mic and keyboard buttons), reading the `screen` slice: it shows "Ask about Grandpa" from the page's `label` when a content view has published, and renders nothing on home and on utility screens (the slice is empty there). Pages never place their own; they only pass their label and ids through `useScreenContext`. Content pages' headers carry Back, Home (left out when Back already says Home) and ⋯ (`HelmHeader`); Browse lives on home only. Kept in Helm, not shared: no other app has an assistant to ask, and the slot is part of Helm's shell (light call).
- **The tap** (as built in issue 9: the bar opens the conversation typed, with the composer focused, and draws no mic or keyboard until issue 12 adds what follows). `useLastInputMode` keeps `'voice' | 'typed'` per uid in local storage (written whenever a turn is sent; `'typed'` until the first turn, so a first tap never surprises with a microphone prompt). Voice starts listening **inside the tap handler** (`useVoiceConversation.start` before the route changes, since a phone only grants the microphone and unlocks audio playback within the gesture), then opens the conversation; typed opens it with the composer focused.
- **The conversation over the page.** `AskConversation` is the home surface's thread and composer (`ConversationThread` and `Composer`, the same components `HomeSurface` uses) inside a `Subview` with `overlay`, opened by `?ask=page` in `useHelmUrlState` with its own history entry (`usePageHistory`), so the page underneath stays mounted and keeps its scroll and open state. Its header's way out reads "Back to Grandpa" from the label; Back, the header control and the phone's back gesture all close it and return to the page at the same position. Turns made there join the current session like any (section 21 "Sessions"), so home shows them too.
- **Opened from a sheet** (a task sheet over a project): the sheet stays open beneath, and closing returns to it over its page.
- **Leaving for another record from a reply** (a link in an answer, a result line; no reply carries one yet, and the pattern is held by `check:back-history`): `afterBackLayersClose` closes the overlay first, then pushes the record's route, so Back from there returns to the page the person asked from, not to the conversation (light call).
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

A who or place photo is a `media` record with `role: 'photo'`, sealed like any media (section 23). It comes from the person picking one on the page (`PhotoPicker` with the camera offered, shrunk to `avatar` size 512 px for a who's first photo and `photo` size 1280 px otherwise), from a photo in a turn the assistant attaches ("this is Miso"), or from a Contacts import. A who shows one photo (`photoMediaId`) and keeps up to 12 in `mediaIds`; a place up to 12. **No face recognition:** a photo is never matched to a who by what is in it, only by what the person or the turn's words say.

**As built (issue 37):** `addPhoto` seals the photo and a 512 px thumbnail, writes the document `uploading` (with `deleteAfter` a day out), uploads both objects, then one transaction marks it `kept` with `attachedTo` and puts it on the who or place (refused past 12; the first photo of a who becomes its main one), and a failure deletes what was uploaded and the document, or leaves the document marked with `deleteAfter` for the media sweep (Issue 52; until then such a document stays). `makeMainPhoto` sets `photoMediaId` or moves a place's photo to the front. `removePhoto` holds the sealed bytes in memory, takes the photo off its record and marks the document `discarded` in one transaction, deletes both objects, then the document; the toast's Undo uploads the held bytes again and restores the document and its place in the list, so it lasts as long as the toast. Forgetting a who or place deletes its photos with it (every id it lists and any medium whose `attachedTo` names it, read again after the record is gone so a photo added from another device meanwhile goes too): every photo's sealed bytes are read into memory before anything is deleted (an object already gone counts as nothing to hold, any other read failure refuses the Forget), then each document is marked `discarded` and its objects and document are deleted together; if any of those fails, the photos already deleted are put back, then the record, and the Forget fails. Undo re-uploads the photos and restores their documents first, then the record; when the photos can't come back it says "Brought back Sam Patel, but not the photos." The confirm says how many photos go. If the record itself can't be put back after its photos are, they stay unattached until the sweep. Make main photo has its own Undo. The page shows the main photo large with the rest in a row (`PhotosSection`), each opening in `MediaViewer` (the picture, which opens full screen in `ImageViewer`, then Make main photo and Remove photo); people rows and the page's header use the main photo as the avatar through `WhoPhoto`, falling back to the mark. The seed gives Miso and Home one sealed photo each, uploaded to the Storage emulator.

### Key dates

Sized for 2,000 who and 20,000 key dates per person; each date is its own `keyDates` document (section 2 "KeyDate"), dates that come back are also entries in the one sealed yearly index, and nothing readable says when any date is.

- **Two kinds.** **Dates that come back** (`shape: 'yearly'`): birthday, anniversary and a custom date with "Comes back each year" on; few per who (≤20); they feed Today and Coming up. **Moments** (`shape: 'moment'`): passed away, met, adopted, started or left a job, moved, graduated and a custom one-time date; unbounded in practice (≤500 per who); precision `day`, `month`, `year` or `decade`; they belong to the who's history and the life timeline and never reach Today or Coming up. Organizations keep both (custom yearly, "Lease renews"; and moments, "Opened · 2019"). The kind decides the shape; only custom asks.
- **How they get in.** Said in a turn ("Mum's birthday is June 3", "we met in March 2015", "Grandpa lived in Lisbon in the 80s"): `setKeyDate { whoRef, keyDateId | null, kind, label | null, dateSpanId, comesBack | null }` (`comesBack` is read only for custom), automatic with Undo (category `remember`), one result line ("Added Mum's birthday: June 3"). Added or changed by hand on the who's page (`source: 'person'`). From Google Contacts' birthday on import. `removeKeyDate { keyDateId }` only when the person asks.
- **Validation (code, not the model).** Parts come only from a resolved date span; a yearly date needs a day or a year (never a month alone, lead's round 6b call); a moment needs its precision's parts; the day exists in the month (29 Feb allowed without a year, and with one only in a leap year); a year is 1900 to this year for past kinds, up to next year for anniversary and custom; custom needs a label (≤60); one `birthday` and one `passedAway` per who: a different date for a kept one is not written but becomes a `whichIsTrue` question (section 2 "Fact"), the new date held in the question's sealed words, and the same date said with more detail (a year, a day) fills it in; per-who and per-person caps from the who's counters and the profile (section 2); a date the person set is never changed by the assistant without the person's words naming it. A refused command is a skipped line, never a guess.
- **Undo** reverses the execution's effects on `keyDates` (create, update with the previous sealed payload, delete with the document kept in the execution), the counter it moved and the yearly index's entry, in one transaction, like any effect (section 9).
- **Today** (quiet lines, never spoken, never a push): from the open yearly index, `selectUpcomingKeyDates` takes the entries with a day whose `nextYearlyOccurrence` (29 February on the 28th in a year without one) falls in the next 7 days (today as day 0, today in the profile's zone, the planner's "today"), drops those whose who is passing, an organization or gone, then orders a date **today or tomorrow first** whoever it belongs to, then **close** (pets and the self count as close), then regular, soonest first within each, and shows at most **3 lines**; when more fall in the week, the last row is a door to Coming up ("+3 more this week"). A year adds an age or count only for birthdays and anniversaries ("turns 32"). Computing it over 4,000 entries is a few milliseconds; it reruns when the index, the tiers or the day change.
- **Coming up** (`comingUp`, a content view and a Browse tile): the next 12 months from today, from the same index with no further read, grouped by month under `SectionDivider`, each month under `LazyMount`. Sorted by day, then close, regular, then the rest; passing people are hidden behind "Show everyone" (a toggle, `AppToggle`); a month shows at most 20 and then "Show N more in March". Only dates that come back appear. Answers ("what's coming up in March?") read the same index on the server, opened once per call.
- **The who's page** takes its dates that come back from the open index (≤20, by next occurrence) and, while open, reads its moments: `keyDates where whoId == X and shape == 'moment'` (≤500, equality only, no composite index), opened and sorted on the device by decade, year, month and day; it shows the newest 3 and "See all 14" from the who's `momentCount`, which can draw before the moments open. A typical who has a handful; a who at the 500 cap is about 150 KB of small documents and 500 decrypts, estimated at 100 to 200 ms at 4× CPU, measured in issue 64. The self's appear the same way in How {name} sees you.
- **See all moments** (`MomentsScreen`, a `Subview`): the moments the page already opened, grouped by decade, then year, on the device (within a year by month and day, a year-only moment after the dated ones, a decade-only moment under its decade as "Sometime in the 1980s"), drawn under `LazyMount` by decade; no further read.
- **29 February** in a year without one falls on 28 February, everywhere. The shared helper `src/utils/yearlyDateUtils.ts` (no app words) holds `nextYearlyOccurrence({ month, day }, todayKey)`, `formatYearlyDate({ month, day, year })` ("June 3", "Aug 1984", "June 3, 1984") and round 6e's `formatMoment({ precision, month, day, year })` ("Aug 2024", "1998", "the 1980s"), with fixed-clock tests across leap and non-leap years and the year's turn. Nine Lives' own `nextOccurrenceOnOrAfter` (which rolls 29 Feb to 1 March and reads today in UTC) moves onto it in the same PR.

### Google Contacts import (picked people only)

- **Consent:** "Bring in people from Google Contacts" on the Who view starts the platform's Google flow (section 19) for `https://www.googleapis.com/auth/contacts.readonly` with `include_granted_scopes=true`. It is a platform connector, `google:contacts`, with one category, `contacts` (kind `person`, mode `live`), read only when the person opens the picker or imports: never synced and never written to `synced`.
- **Under the same unverified-app limits as Calendar** (product asked): `contacts.readonly` is believed to be a sensitive scope, not a restricted one, but that is **unconfirmed**: it could not be checked against Google's scope list from the build sandbox, so confirm it on the consent screen's scope list before relying on it. If it is sensitive it shares Calendar's position: the consent screen's unverified-app warning and the 100-user cap while the site's OAuth client is unverified, and the weekly Reconnect while the consent screen stays in Testing for Gmail and Drive (section 8). It does not need the `google-mail-and-drive` tester gate.
- **The picker** (`ContactsPicker`, a `Subview` with `SearchInput`) reads through `readConnectorOptions({ connectorId: 'google:contacts' })`: the platform pages `people.connections.list` with `personFields=names,emailAddresses,phoneNumbers,photos,birthdays,organizations` and returns up to 2,000 contacts as `{ resourceName, name, email, phone, hasPhoto, organization, hasBirthday }`, held in memory only, never stored. Already-imported contacts (matched by `importedFrom`) show as such.
- **Import:** `importHelmContacts({ resourceNames })` (≤50 per call; the picker batches) re-fetches the picked people with `people.getBatchGet` on the server (the client's list is never trusted for content), matches each to an existing who by email, then phone, then name through `createOptionMatcher` (a match fills only empty fields and asks nothing), creates the rest as `kind: 'person'`, `tier: 'regular'`, `importedFrom: { connectorId: 'google:contacts', accountId, resourceName, importedAt }`, sealed, in one execution with Undo. A contact's birthday (Google's `{ year?, month, day }`, year often missing) becomes a `birthday` key date with `year: null` when Google gives none and `source.by: 'google:contacts'`; it fills an empty birthday only and is tracked in the who's `importedFields` as `birthday` (round 6e: the date itself is a `keyDates` document). A contact photo is fetched on the server (only from Google's photo hosts, allowlisted), shrunk to 512 px, sealed and stored as the who's photo media. The birthday is written as its own `keyDates` document, and its entry is added to the yearly index in the same transaction (`applyToKeyDateIndex`'s server copy).
- **A one-time copy** (PRODUCT.md light call): nothing updates on its own. A who imported from Contacts has "Update from Google" on its page, which calls `importHelmContacts` for that one resource name and fills or replaces only the fields that came from Google and the person hasn't edited since (`importedFields` map of field → hash at import). Disconnecting Contacts leaves imported who records as they are.

**As built (issue 38):** `importHelmContacts` is one callable with two modes: `{ accountId, resourceNames }` (up to 50) and `{ whoId }` for Update from Google, which reads the account and contact from the who's own `importedFrom`. Both check the live `helm__google:contacts__{accountId}` grant first (`failed-precondition`, reason `notConnected` or `reconnect`). The planner is pure (`nomos/contactImport.ts`): a requested name Google did not return is ignored, a match goes by contact id, then email, then phone (last ten digits), then a sure name through `matchWho`, and fills only empty fields; an unsure name makes a new who. A name match is accepted only when the who has no `importedFrom` and no email or phone the contact lacks, and `importedFrom` matches compare the account as well as the contact id; a who filled or made earlier in the batch carries its `importedFrom` while planning, so two same-name contacts are two people. A new who's id is derived (a keyed HMAC of account and contact id, 20 hex characters), so a concurrent second import's `transaction.create` fails (`ALREADY_EXISTS`, answered as `aborted`). Only name, email, phone and photo are read (`personFields=names,emailAddresses,phoneNumbers,photos`): birthdays and companies wait for issue 43, so no key date is written here. `importedFields` holds a keyed HMAC of each imported value (`name`, `email`, `phone`, `photo`, `photoUrl`), not the value, because that field sits outside the seal. A who write re-checks the sealed nonce in the transaction (`aborted` if it changed). The photo is fetched without credentials from an allowlisted `lh*.googleusercontent.com` host (https, no redirects, 5 MB), shrunk to 512 and 256 px, sealed and stored as a `kept` medium; Undo removes the medium with its who and deletes the stored bytes (a failed delete is logged); an import's Undo keeps a person who was edited or is in use as `kept`, so Activity can say "Partly taken back". The digests (`importedFields` and the derived ids) are keyed by the user's data key, so a key rotation resets them: Update from Google then fills empty fields only, and a re-import of a known contact takes the `importedFrom` match instead. A photo uploaded before a crash that never reached the write is orphaned in Storage until the Issue 52 sweep removes it. The photo count that failed is logged beside the count that came in. The execution is category `import`, so Undo counts people ("Took back 3 people") and accepts an execution with no tasks. `ConnectorOption` gained `detail` and `photoUrl`. Not verified against the live People API; the emulator answers from fixtures.

## 23. Media in the conversation

### Kinds and caps

| Kind | Accepted | Cap | How the assistant reads it |
|---|---|---|---|
| Photo or screenshot | JPEG, PNG, WebP, HEIC (converted on the device) | any size; shrunk on the device to 1600 px (built, issue 52: one sealed 1600 px copy plus a 512 px thumbnail serve the model and the keep; no refusal for size) | an image block |
| PDF | `application/pdf` | 10 MB and 20 pages (PRODUCT.md) | its text layer, extracted on the server, up to 12,000 characters to the model; a scanned PDF with no text layer goes as a document block (Claude reads PDFs natively up to its own page limit; unverified current limits) |
| Voice note | recorded in the composer (`audio/webm` or `audio/mp4`) | 5 minutes, 10 MB | transcribed by `transcribeVoiceNote`, charged to voice listening minutes; the transcript is the capture's text |
| Markdown | `.md`, `text/markdown`, `text/plain` with a `.md` name | 20,000 characters (PRODUCT.md), 100 KB | read as text, no vision path; up to 12,000 characters to the model (the whole file when it starts a topic, below) |

Up to 5 attachments per turn (PRODUCT.md); 2,000 kept media per person (a quiet cap row in Settings). Video is Next.

### Flow

**As built (issue 53).** Step 1 checks the count and each file's kind and bytes when picked (`fitAttachments`), then measures a PDF's pages (unpdf, loaded only when a PDF is picked) and a Markdown file's characters (`checkMeasured`) and refuses past 20 pages or 20,000 characters with a line naming the cap. A recording is made in the composer (`useAudioRecorder`, WebM/Opus or MP4), stops itself at 5 minutes, needs a connection, uploads sealed, and is written out by `transcribeHelmVoiceNote` into the text field before Send, so the person can correct it; the turn is then a voice turn (`sttProvider: 'voiceNote'`). A Markdown file is written straight to `received` with no Storage object. The viewer opens a kept PDF's decrypted copy in a new tab ("Open the PDF"), draws a Markdown file with `MarkdownText` and plays a recording with its transcript under it.

**As built (issue 52).** Photos only. Step 1 shrinks to 1600 px with no size refusal and checks only the count (5) and that the file is an image. A turn of photos alone is an `'attachment'` turn. Step 3's decisions are `keep` or `discard` with a caption and an `attachTo` that is a task or fact (an existing one in the context or the turn's own new task); a photo with no target is let go. "Keep it" on a let-go photo attaches it to the first task or fact the turn changed, else keeps it with no record; it writes from the device, so it needs a connection, and it is not an Undo effect. Step 4 writes a keep in the turn's execution (`executionId` on the medium); a let-go photo is `discarded` with `deleteAfter = now + 24 h` outside any execution. Remove photo (`removeKeptMedia`) takes the photo off its record, and with nothing else holding it writes it `discarded` with `deleteAfter = now + 24 h` instead of deleting it; its Undo is a field-scoped write of `attachedTo`, `status`, `decidedAt` and `deleteAfter`. Deleting a task or forgetting a fact releases the photos kept only on it the same way (a fact's inside its transaction, a task's each in its own write so one already gone never holds back the delete; `planPhotoRelease`, `utils/mediaRelease.ts`), and the delete's Undo puts them back. A photo-only turn never waits in Needs you as unread (`SettleInput.hasMedia`). The server sweep reads each document again and deletes it only while it is still `discarded` and expired, with a `lastUpdateTime` precondition, so a Keep it after the sweep listed the photo wins.

1. The device checks the cap, shrinks a photo, makes a 512 px thumbnail, seals bytes and thumbnail with `encryptBytes` under the data key, uploads to `apps/helm/media/{uid}/{mediaId}` and `{mediaId}.thumb` (`application/octet-stream`), and writes `media/{mediaId}` as `uploading`, then `received`.
2. The capture carries `attachmentIds`; `sortHelmCapture` opens each medium (bytes from Storage through the Admin SDK, opened with the person's key in memory) and hands it to the model as above. A PDF's text layer is extracted with a small server dependency chosen in the PDF issue (`pdfjs-dist` legacy build or `unpdf`; licence checked there).
3. `file_results` carries one decision per medium: `keep` or `discard`, a caption (≤200), `attachTo` aliases (records in the context or `$new` refs from this reply) and, for Markdown, `asNote: true` (with `topicAliases`), `asTopic: true` or a record to attach it to. Code keeps a medium only when it is attached to at least one record or becomes a note or a topic; anything else is `discarded`.
4. One transaction writes the medium's decision with the turn's other effects in the same execution, so Undo reverts a keep.

A voice note's audio is always `discarded` by code unless the person taps Keep the recording (its transcript is already the capture's text). Product's light call; the model is never asked about it.

### Markdown as knowledge

When the assistant keeps a Markdown file as knowledge, code (never the model) writes a note with `source: 'importedFile'`, `sourceMediaId`, title from the first `#` heading or the file name, and body = the file text verbatim, filed like any note (its topics then bring it in). With `asTopic: true` ("make this a topic"), code also creates a topic whose version 1 (reason `imported`) is the file split at its headings into sections, each `writtenBy: 'person'` with the note as its source, so the person's words stay theirs; from then on it grows like any topic (section 24). Kept attached to a record instead, it shows as a file row that opens in `MarkdownText`.

### Discarded media and deletion

A discarded medium stays 24 hours with "Didn't keep it · Keep it" on its line in the conversation (design draws it), then is deleted. That line, PRODUCT.md's Keeping and Deleting and "What the AI sees" all name the same promise: a file the assistant didn't keep is deleted within 24 hours, never "as soon as it's read" (the bytes must outlive the turn so Keep it can work). Deletion: Storage objects first, then the document. Three sweeps do this, so no scheduled job is needed: `sortHelmCapture` deletes up to 20 of the caller's expired media (`status in [uploading, received, discarded]`, `deleteAfter <= now`) at the end of every call, sorted, held or failed; the device deletes expired ones over the photos it has loaded on open (`sweepExpiredMedia` in `mediaActions.ts`, at most 20); and `deleteHelmData` removes the whole Storage prefix (issue 63's Delete all will call the exported sweep). A sweep is best effort: Storage objects first, the document only once they are gone, a failure left for the next one. An `uploading` medium older than 24 hours is deleted the same way.

### Showing sealed media

`useSealedObjectUrl({ id, path, nonce, contentType, open, isEnabled })` (`src/hooks/`, general; `open(bytes, nonce)` is the caller's, so the key stays in the app): downloads the sealed bytes, opens them, returns an object URL and revokes it when it changes and on unmount; the last hundred opened objects are remembered for the signed-in person (the oldest dropped first), `forgetSealedObject(id)` drops one (and its `{id}.…` variants) and the memory clears on a user change. Helm's `useMediaUrl` calls it for a thumbnail (`{mediaId}.thumb`) or the full picture. Runway's receipt image hook moves onto it in the same PR (CLAUDE.md "When a UI primitive is promoted"). Thumbnails load in lists, full images in `ImageViewer`.

## 24. Topics as living documents

- **Reading:** a topic opens on its own route (`/helm/knowledge/topic/{topicId}`) as one formatted document rendered by `MarkdownText` (`src/components/MarkdownText.tsx`, general: `react-markdown` with `skipHtml`, links through `ExternalLinkText`, no raw HTML, no images from outside the app; MIT licence). A parent opens with its overview and a link to each subtopic (drawn by code from the tree), then its own sections. Tapping a section opens `SectionSourcesSheet`: each source as "You said, Nov 3", "Saved answer, Oct 12", "From car-care.md", "General knowledge, checked Oct 14" or "You wrote this", each opening the note, the turn or the file. "History" opens `VersionsSheet`: what changed, when and by whom, newest first; any version can be restored (a new version).
- **How it grows, and what it costs.** Filing a note costs nothing extra: the sorting call that files it may also return `addToTopic { topicAlias, afterSectionId | null, heading | null, markdown (≤2,000), noteIds }` when the note plainly fits a part of the document. Code, not the model, inserts it as a new `nomos` section citing those notes, so the command can't remove or reword anything; it is an automatic `draft` with Undo, a new version (reason `addedFromSource`) and a line in the turn ("Added to Car care: winter tyre size"). A note filed without a block marks the topic `behind`. The **document is rewritten in batches, not on each filing**: when the person opens a `behind` topic (or taps "Bring in 2 new notes"), the device calls `writeHelmTopic({ topicId })`. It claims the topic (`writeClaim`), opens the document and up to 20 pending notes (oldest first; more wait for the next write), and asks the `topicWrite` role (Sonnet-class) for at most 8 section changes (`insert`, `replace` or `merge` of `nomos` sections, and `reorder` or `retitle` of any section, which never touches a `person` section's words; each with its sources and ≤6,000 new characters in all) and a change summary. Code applies them: a change that touches a `person` section, drops a source a kept sentence still needs, or passes the size caps is refused; `version + 1`, `versions/{n}` with reason `addedFromSource` (`rearranged` when it only reordered or retitled; `firstWritten` the first time), `pendingNoteIds` cleared, `docState: 'current'`, one execution with Undo. The screen shows the current document with "Bringing in 2 new notes…" and swaps in the result. Cost: about 8,000–14,000 input tokens (a 30,000-character document plus the notes) and 500–2,000 output, about $0.03–0.07 a write at Sonnet-class list prices (**unverified**, checked at build time); counted on the full route's limits, plus at most 30 topic writes a day per person, past which the topic stays `behind` with "2 new notes will be added tomorrow · Read them now".
- **A parent's overview:** when a parent is opened and any child's `version` differs from `overviewOf`, the `topicOverview` role (Haiku-class) writes ≤1,200 characters from the children's outlines and first sections (about $0.002), saved with the new `overviewOf`; not a version, never touching sections.
- **Revising by asking:** "make it shorter", "rewrite the intro", "move the fragrance part to its own topic". The model returns `reviseTopic { topicAlias, changes (as above, `person` sections allowed), changeSummary, requestQuote }`. **Only when asked:** `requestQuote` must be a verbatim span of this turn's text and the topic the turn's screen focus or named in it, else code refuses it (logged `topic-revise-unasked`) and writes nothing. Code checks the `version` hasn't moved since the turn began (else re-reads and asks the model once more), writes the version with reason `revisedOnRequest` and the quote, in one execution. Without a request, the assistant can only add (`addToTopic`), write and reword its own `nomos` sections from their sources (headings, order, joining sentences, logged in History), and move a topic under an existing parent; the person's words are never removed or reworded.
- **By hand:** `SectionEditSheet` edits one section (heading and Markdown) or adds one; the result is `writtenBy: 'person'` with a `person` source, saved as a version with reason `personEdit`.
- **Nesting:** the person's move, the assistant's `moveTopic` under an existing parent (a `moved` version on the topic), or a yes to `groupTopics` (a `grouped` version on the new parent, `moved` on each child). Depth ≤3 and no cycles are checked on the device and in the server's command check; moving a topic recomputes `depth` for it and its subtopics in one transaction, refused if any would pass 3.
- **Asking while viewing:** the topic is the screen focus, so a question goes to the full model with its whole document (≤30,000 characters) in the context; the answer cites the sections it used.
- **History and Undo:** History lists typed rows (added from a source, your edit, changed on request with the quote, moved, grouped, rearranged, restored). The newest row has Undo, which reverses that change (a move or a group puts the tree back); any older row offers Restore, which writes that version's sections as a new version (reason `restored`).

**As built (issue 50).** `writeHelmTopic` answers `{ status, version, broughtIn, waiting, retry }`, with `retry` `'soon'` on `busy` when the 10-minute allowance is spent (the claim is released, the topic stays `behind`, the day's topic-write count is given back), `'tomorrow'` on `limited` (the 30 a day, the full route's day cap or the project's daily budget) and `null` on every other status. A write that fails before the model is asked gives its day count back; one that fails after keeps it counted. The write's Execution carries no `effects` and no `effectRefs`, so Activity offers no Undo that would plan nothing: the topic's Undo is a restore in History. A topic at version 0 takes the notes already filed under it, at most 50 and in no order (a known limit: the oldest are not guaranteed). Each part of the document a question sees has its own alias (`d1`, `d2`, …), all resolving to the topic as a `topic` source, so an answer can cite a part from a topic's page; when a part and a note disagree the part is newer and wins. A parent's overview has its own 20-second cap and `overviewOf` names only the children it summarised (those with a document).

**As built (issue 51).** A turn can change a topic in four ways, each written in the turn's one transaction by the pure `planTopicCommands` and the shared `writeTopicVersionIn`, and each refused while a `writeHelmTopic` claim is live (the note then files as before and the topic is marked `behind`). `addToTopic { topicAlias, noteRef, afterSectionAlias, heading, markdown }` pairs with a `createNote` in the same reply (`noteRef: "$note1"`, since a new note has no alias), targets only a topic with a document (`version ≥ 1`; a first write stays with `writeHelmTopic`), ≤2,000 characters, one per topic and three per turn; the note is not queued. `reviseTopic { topicAlias, topicChanges, changeSummary, requestQuote }` runs only when the quote is a verbatim span of the turn and the topic is the focus or named in it (`topic-revise-unasked` otherwise); a `person` section may change only when the turn names its heading or asks for the intro (`editablePersonSections`). The topic's version is recorded when the model reads it; when it has moved by the final transaction the server re-reads the document and asks once more (`reviseAgain`), and when it moves again the turn says "changed while this was made · Ask again", so a version is never lost. `moveTopic` and `createParentTopic` are checked by a server copy of the device's tree rules (`topicTree.ts`, guarded by `check:server-copies`); a parent not asked for becomes a `groupTopics` yes/no question ("Group them" / "Not now") answered through `resolveHelmQuestion` on the card, the sheet or by voice ("Don't group" closes it; Skip leaves it waiting; Undo of "Group them" reopens it). The new parent gets no version (version 0 still means "first write pending"); each child with a document gets a `grouped` version, a plain move a `moved` one, and a move on a claimed topic is made without a version. These turn changes carry Execution effects (`version`, placement, `made`) that `planUndo` takes back: a version is restored as a new one when nothing newer was written, a move goes back with its whole subtree or not at all, and a made parent is deleted only while it is untouched. A topic named but not focused is opened with the read-only `get_topic` MCP tool. `writeHelmTopic` batch writes keep empty effects. Editing a note's words or deleting it marks every citing topic `behind` (the delete is one offline-safe batch); a message source now carries its `noteId` so a note made from a turn can be found. Not built: "Move the fragrance part to its own topic" (no command makes a topic from a section; the reply says so in words).

## 25. Procedures and runs

- A **procedure** is a reusable routine ("Packing for a work trip", "Closing the cabin"): a title and steps in optional groups, versioned like a topic document. Commands: `createProcedure` (an automatic `draft` with Undo), `reviseProcedure` (a new version, same rules as `reviseDoc`), `startRun`.
- A **run** is one use of it, attached to a project, a task or a synced trip or event (`RunAttachment`). Starting a run copies the procedure's current steps into the run's own `stepState` and sealed `steps`, with `procedureVersion`, so a run keeps the steps it started with whatever the procedure becomes later (PRODUCT.md). Ticks are dotted-path updates on the run's readable `stepState` map (offline-friendly, no execution). A step added during a run is `isExtra` ("this time only"); "Add to the procedure" on it writes a procedure version with reason `fromRun`.
- A **task with steps** stays a task: its steps live on the task (`steps`, `stepState`) and never become a procedure unless the person says "make this a routine", which copies them into a new procedure.
- Group boxes with partial state are `ChecklistGroup`, moved from Runway to `src/components` in the runs issue with Runway's import (logged in round 3, still holds). `utils/procedureMarkdown.ts` builds the Markdown for Copy.

**As built (issue 54).** A procedure is made three ways: by hand (New procedure on the Procedures view, a full-page form of one row per step), from a task's steps (the task's row "Make these steps a procedure", which becomes "Open {title}" once one exists), or by asking. `createProcedure` and `reviseProcedure` are planned by the pure `planProcedureCommands` and written in the turn's one transaction with `writeProcedureVersionIn` (`procedureStore.ts`), which trims history to 200 versions. A create is kept only when its quote is the turn's own words and asks to make one; a revise only when the procedure is the focus or named and the quote is verbatim, and a revise that would drop steps the turn did not name is refused. Past 60 steps, 12 groups or the effects left in the turn, what was not kept is said on the turn's card. Both carry Execution effects: Undo deletes a made procedure and its first version only while it is still at version 1, and puts a revised one back as a new version when nothing newer was written. The person's edits, restores and deletes write from the device in one transaction (a delete reads the versions from the server and removes the procedure first); version 1 can be restored. `search_procedures` (MCP) reads up to 5 procedures with their steps. Not built: runs, filing under a project, drafting from notes.

**As built (issue 55).** Runs start on the procedure's page (Start a run, then "What is it for?": "Just a run" first, then trips, events from other apps in the next 30 days ("Now" for one under way; a trip's stays, rentals and flights are left out, the trip stands for them), and active projects, 4 at a time with Show more; or from a project or trip, which asks only which procedure, written offline-safe from the device; or by asking, through `startRun` (the quote must be the turn's own words with a start word; one per turn; a second open run for the same procedure and thing says it is already running, checked by query inside the turn; the device opens the running one instead). Steps are ticked by tap (a field-scoped write, no execution) or by asking, through `tickRun` over `rs#` aliases of the undone steps in `<open_runs>` (5 runs, 100 steps, 20 ticks a turn), with an Execution effect so Undo unticks while the tick is unchanged; Undo of a start deletes the run only while nothing was ticked. A step added "just this time" is an extra on that run (needs a connection), and can be added to the procedure as a new version (`fromRun`). The context also lists up to 10 upcoming trips when the person has procedures. Runs show on the procedure, its project, the trip or event's sheet and that event's card in the feed. Not built: a run attached to a task, "Run it again", reminders for a run.
- A run attached to a synced event that has left the calendar keeps its sealed snapshot of the event's title and date ("From Cake tasting, Nov 8, no longer on your calendar").
- The planner (section 11) is unchanged: it plans tasks, not runs; a run's attachment shows on Today when its event is today.

## 26. How Nomos sees you, and writing style

### Preferences, favorites and identity

These are facts (section 2) with `kind` and `topic` (built in issue 41); "How Nomos sees you" (`HowNomosSeesYou`, one route) lists the self who's facts grouped by kind, then topic, each editable (Correct writes a new fact and supersedes the old; Forget deletes with Undo), and the style notes below. Facts about other people stay on their who page.

### Learning the writing style

- **From what the person types to Helm:** `learnHelmStyle` (callable, the `style` role on the quick model) runs on the device's request after every 25 new typed captures (never voice transcripts: speech isn't writing), over the last 50 typed captures' text, opened on the server. It returns at most 12 traits and 6 "avoid" lines, each with how many of the samples showed it (`exampleCount`), and code merges them into the `general` profile: a trait the person set or edited is never replaced; a learned one is replaced when its count drops below 3.
- **From sent mail** (needs the Gmail grant and so the `google-mail-and-drive` gate): "Learn from my sent mail" reads up to 300 sent messages from the last 6 months (PRODUCT.md) live through the platform's Gmail connector (`q: in:sent newer_than:6m`, bodies stripped of quoted replies and signatures by code, each cut to 1,500 characters), sends them to the `style` role in batches of 50, and merges the batches' traits with their counts into `occasion` profiles (work email, personal email) and `audience` profiles only for who records the person already has. **Nothing read is stored**: only the traits, with counts. About 300 × 1,500 characters is roughly 110,000 input tokens on the quick model, a few cents a run (unverified price); counted as 6 calls against the quick route's limits.
- **Where it shows:** under "How Nomos sees you", each note with "Seen in 34 of your messages" and Edit / Remove; a removed note is remembered (sealed `removed`, the last 30, normalised) so learning never brings it back, and Undo forgets it. Used now only to shape the assistant's own free writing (summaries stay code-built); drafting in the person's style is Next.

**As built (issue 56).** The device (`useStyleLearning`) counts typed captures newer than `styleLearnedThroughAt` once a session while online and once its windows have loaded (a server count over the `inputMode`, `createdAt` index), and at 25 calls `learnHelmStyle`, which answers `learned`, `notEnough` (under 10 typed texts) or `busy` (a quick call couldn't be reserved). The reply is checked by code before the merge: a trait over 120 characters, an avoid line over 80, a quoted span over 30 or found in fewer than 3 samples, or any 31-character run shared with a sample is dropped, so no run of more than 30 characters of what the person typed is stored. An empty reply writes nothing; an unreadable profile answers `failed-precondition` and is left as it is. The merge keeps every person-set trait, drops learned ones whose count fell below 3, caps at 12, and keeps the avoid lines once the person has edited them; it runs in a transaction that also moves `styleLearnedThroughAt`. The notes reach the model as `<your_style>` in the full and quick prompts, for its own wording only. Edits, adds and removes on the device are transactions on the sealed notes, with Undo on a remove. Sent mail, occasion and audience profiles are issue 57.

**As built (issue 57).** `learnHelmMailStyle` (callable, no input) finds the person's live `helm` Gmail grant, reads sent mail with `listSentMail` through the router's uncached `withLiveAccess`, and answers `{ status, groups }`: `notEnough` under 10 messages, `busy` when a quick call can't be reserved (one per batch, at most 6, counted before any model call). Code splits mail into work and personal (personal only when every recipient is on a common personal provider), and makes an audience of a who record with 5 or more messages by the address in its sealed words (at most 5, most written first). Each group goes to the `style` role in batches of 50 through the same reply checks as `learnHelmStyle`, batches merge by summing counts per normalised note, and each group is written in one transaction as `mail-work` ("Work email"), `mail-personal` ("Personal email") or `mail-who-{whoId}` (the who's name), `learnedFrom: ['sentMail']`, keeping `createdAt`, `removed` and person-set notes. No `firestore.rules` change: the `style` rule already accepts every scope, `learnedFrom` of up to two entries and a string `audienceWhoId`. Only counts are logged.

**As built (issue 30).** Runway's manifest gains `transactions` (kind `transaction`, `mode: 'live'`, off at connect, `addedInVersion: 2`), so an existing grant has no key for it and it reads as off; the sync run skips live categories. `SourceAdapter.query?(ctx, { category, args })` returns `{ records, matchedCount, totalCents, currency, isPartial, from, to }` (no app words; `from` and `to` are the days it actually read as `YYYY-MM-DD`, or null for a category with no range). Runway's reads `apps/runway/plans/{uid}/purchases` by `date` within the range (default the last 30 days, at most 13 months with the day clamped to the month's last, scan cap 500 newest read as 501 so `isPartial` means more existed, or a purchase would not open: that logs `runway.share.transactionsUnreadable` with a count and no uid), unwraps the plan key once, keeps what Runway's own Spend list shows (a filed credit, a charge with no lines) and drops income-day deposits, pairs (card payments included) and a credit still waiting for a home, and matches the typed payee against the label and the merchant (never the bank's description) with the shared option matcher or by whole words ("Costco" fits "Costco Wholesale"). The category is the envelope's newest sealed version name for a one-line purchase, "Split" for several lines, "Bill" for a charge matched to a bill and "Free to Spend" for none or for an envelope since deleted; the currency is the plan's, else the summary's, else null. `listSiteLiveGrants` and `querySiteLive` (`liveRouter.ts`) find the live `app:*` grants with a live category on and re-check the grant, the category and `status()` on every call; a Google connector, an unknown category or a grant that is off, ended or without access answers `notGranted`. `search_app_records` (`{ app, category, payee?, from?, to? }`) is offered only while `siteGrants` is non-empty (loaded for questions only), logs `your Runway transactions` in the searched line ("Looked in your Runway transactions just now."), fills a missing `to` with the person's local day, returns up to 20 rows, the match count, the total and the `from` and `to` it read (the answer names them as real dates), and an answer that found nothing is still filed: a successful app search with 0 found counts as a source, so "No purchases at Costco between Oct 1 and Oct 31" is kept, and a spend question with no payee asks for every payee; and adds the first 5 rows as quotes whose deep link is the app's own path (`isLiveDeepLink` accepts exactly `/{appId}` for an `app:` connector). A kept row is not drawn as a quote: it carries `record` (`name` the merchant, `detail` the category or "Refund", `amount` as written), and the answer card groups an app's rows under "From Runway" with the name, the detail and day (read in UTC) muted and the amount right-aligned, then one "Open in Runway" link for the group that navigates inside the site (a quote kept before `record` existed is split from its `Runway · Costco` label and `$88.00 · Groceries` text); quotes are blanked by connector and account like Gmail's (`blankQuoted`, key `app:runway|site`). The seed turns `transactions` on for Alex and gives Jamie a grant with only `transactions` on, since Jamie's plan is the one that tracks purchases (ask Jamie what they spent at Costco last month). A live category writes no `categoryState`, so it is never stale on Today, the connection page (no "Update now" or status line when only live categories are on) or the refresh check, and `connection_status` reports it as read when asked. No rules, index or Storage change.

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
