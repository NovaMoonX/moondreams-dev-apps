# Helm: Issue Roadmap

The tiers mirror PRODUCT.md's Build Plan: `## MVP` is Core MVP, `## Next Steps` is Next Steps, `## Beyond` is Stretch Goals. Each issue adds only the fields, types, sealed-payload fields and rules clauses its own feature uses; a sealed payload gains an inner field in the issue that seals, opens and shows it, and readers default it (`?? null`) for payloads sealed before it existed, with nothing resealed to backfill. Section numbers are `src/apps/helm/TECHNICAL.md`'s. Sizes: S is about 250 lines or fewer, M about 250 to 400. Issues are stacked in this order, each on the one before.

**Order (round 6).** The conversation and the assistant come first (1–8: the home surface, sealed turns, reading, tasks, waiting, Undo, the task sheet), then what makes it a conversation (9: screen context and sessions; 10: several messages before the reply, one answer, owner's round 6c review; 11: quick turns), then the voice (12: device voice and the shared skeleton; 13: the voice benchmark, which picks the default cloud voice before any ships; 14–16: cloud listening, cloud speaking, barge-in and "Hey {name}"; 17: the opt-in on-device model, so voice works offline on every phone). The connections platform follows as in round 5 (18–20, then one small issue per app 21–26, then questions 27–30), then Today (31–33), people and places (34–35), questions in every shape (36, owner's round 6b review), photos, Contacts and "I'm home" (37–39), facts, preferences, "How {name} sees you" and contradictions (40–42), key dates sized for a lifetime: dates that come back with Today's lines and Coming up, then moments on the who page (43–44, owner's round 6d review), projects with roles (45–46), Knowledge: notes and nested topics, filing, the topic question, topics as living documents and how they grow (47–51, owner's round 6c review), media (52–53), procedures (54–55), writing style (56–57), and the round-5 tail (58–64). Navigation: home's voice dock (Browse · Talk · Type, home only; Browse opening the one Browse sheet: Search on top, then a bento of tiles sized by importance with a typed cap on big tiles, and a foot row), from issue 1; every content page carries Back and Home in its header and one standard "Ask about this" control from issue 9 (owner's round 6d review). Every issue ends with the same two checks:

1. **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
2. **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

**Round 6 renumbering.** Round 5 → round 6: 1 and 2 → 1 (merged: no tab bar), 3 → 2, 4 → 3, 5 → 4 (dictation dropped), 6–9 → 5–8, 10–25 → 18–33, 26 → 34, 27 → 35, 28 → 39, 29 → 40, 30 → 42, 31 → 44, 32 → 45, 33–35 → 46–48, 36–37 → 53–54 (checklists became procedures and runs), 38–44 → 57–63. Moved into the MVP: round 5's Next 57 (hands-free and the name as wake word) → 16, Next 59 (change a note by asking) → 50, Next 63 (a note linked to a project) → 49, and the first cut's Beyond 95 (on-device recognition) → 17 (owner, round 6 second set). New: 9–15, 17, 36, 37, 38, 41, 43, 49, 51, 52, 55, 56, and Next 89. Against this round's first cut (59 MVP issues): 1–9 unchanged, 10–15 → 11–16, 16–33 → 18–35, 34–39 → 37–42, 40–59 → 44–63, Next 60–84 → 64–88, Beyond 85–94 → 90–99, Beyond 95 → 17. Against the 6c cut (62): 1–9 unchanged, 10–98 → 11–99; new is 10 (back-to-back messages), and 49–50 are rewritten as topic documents in place of living docs. Against the 6d cut (63): 1–43 unchanged, 44–99 → 45–100; 43 is rewritten as dates that come back with Coming up, and 44 (moments) is new.

**Conventions the docs PR writes** (the text is TECHNICAL.md section 18; the issue that first implements each re-reads it and corrects it if the code taught otherwise):
- `docs/conventions/security-privacy.md`: Sign out everywhere's sentence in the existing "Trust this browser" rule (PR #819) and per-account device leftovers as device secrets; untrusted content in a prompt (mail, documents, another app's words, an attached file); a copy one app keeps of another's data; round 6: conversation audio never stored and the wake phrase heard only on the device; attached media sealed before upload and let-go media deleted within a day.
- `docs/conventions/data-contracts.md`: the pointer from "kept in memory only, never persisted" to the Trust this browser rule; the drop box; the two-map sealed shape.
- `docs/conventions/cloud-functions.md`: vendored server copies kept identical by `check:server-copies`; model calls through `functions/src/ai/` by role, a model id only in `models.ts`; the Anthropic provider, its secret script and the in-process MCP server; keyring helpers in `functions/src/appKeys/`; `functions/src/auth/recentSignIn.ts`; App Check on callables that open sealed data; round 6: the voice service (`functions/src/voice/`, its own budget, keys only on the server, `VOICE_APPS`).
- `docs/conventions/connections.md` (new): the cross-app read contract; a `CLAUDE.md` "Read before you touch" row; a `new-app.md` item; `firestore-rules.md` gains `connections/`, `connectionsServer/`, and round 6's `voiceUsage/` and `voiceBudget/` (no client rule).
- `docs/conventions/code.md` (CLAUDE.md "Voice for any app"): round 6 adds `src/lib/speech/voice/`, `useVoiceConversation`, `readSpokenAnswer` (round 6c), the on-device recognizer in `src/lib/speech/onDevice/` and `useOnDeviceRecognition`, all covered by `check:pinch-voice`; the on-device model's licences and download size are said where the person turns it on, as for the natural voice.
- `docs/conventions/data-contracts.md` (round 6b, 6e): a yearly date whose year or day may be unknown is `month`, a nullable `day` and a nullable `year`, never a placeholder, read through `@/utils/yearlyDateUtils`; a one-time life event is a moment with a precision, never a yearly date. `docs/conventions/state-data.md` (round 6e, owner's choice: seal everything): a sealed app that must find records by a sealed value keeps one sealed index document, rewritten in the same transaction as each change, with a stated size cap and split plan, never a readable or derived field.
- `docs/conventions/product.md`: an answer from outside the person's records is labelled wherever it shows, aloud too, and is never stored as one of their records unless they save it.

**Shared code built or moved, by issue:** `createSealedReader` and `functions/src/appKeys/` (2), `parseNaturalDate` (4), `functions/src/ai/` (5), the voice skeleton in `src/lib/speech/voice/` and `useVoiceConversation` (12), the server voice providers and `voiceConfig` (13), `mintVoiceToken`, the streaming listener and the voice usage counters (14), `streamSpeech` (15), barge-in (16), the on-device recognizer in `src/lib/speech/onDevice/` and `useOnDeviceRecognition` (17), the connections contract, `useConnections`, `ConnectedSourcesList` and `functions/src/connections/` (18), the sync runner and expiry (19), `requestGoogleAuthCode`, the token store and the Google connectors (20, 28, 29, 38), `functions/src/vendor/` and `check:server-copies` (24; the matcher copies in 34), `readSpokenAnswer` in `@/lib/speech` (36), `useSealedObjectUrl` with Runway's receipt hook moved onto it (37), `yearlyDateUtils` with Nine Lives' anniversary helper moved onto it, and the server copy of `keyDateIndex.ts` under `check:server-copies` (43), `LinkedText` (46), `MarkdownText` (49), `transcribeVoiceNote` (52), `ChecklistGroup` moved from Runway (54), `recentSignIn` (62, moved from Runway), the site callable `signOutEverywhere` and `TrustBrowserRow`'s optional `onSignOutEverywhere` (61). Trust this browser itself is PR #819's shared store and row, reused by 60 with nothing rebuilt. Round 5's `BottomTabBar` and `DictationField` are dropped. Each adds its Pattern-index line in that PR. The account page's "Connected apps" index lands with issue 18.

## MVP

### Issue 1: Register Helm: its look, its profile, the home surface and the way to every view

**Prerequisites:** none
**Target PR Size:** ~400 lines (M)
**Files:** `src/lib/app/app.registry.ts`, `src/lib/types/appCatalog.ts`, `src/routes/AppRoutes.tsx`, `public/logos/by-app/logo-helm.svg`, `public/banners/by-app/banner-helm.png`, `cloudflare-worker.js` (one registry entry), `functions/src/apps/helm/findFirstActivityAt.ts`, `functions/src/appUsage/registerAppUsage.ts` (`FIRST_ACTIVITY_FINDERS`), `functions/README.md`, `src/apps/helm/Helm.tsx`, `src/apps/helm/types.ts`, `src/apps/helm/constants.ts`, `src/apps/helm/screen/views.ts`, `src/apps/helm/hooks/{useHelmSync,useHelmUrlState,useAssistantName,useHelmTheme}.ts`, `src/apps/helm/store/helmSlice.ts`, `src/apps/helm/store/listeners/profileListener.ts`, `src/apps/helm/store/actions/settingsActions.ts`, `src/store/index.ts`, `src/apps/helm/components/shell/{HelmShell,HelmHeader,VoiceDock,BrowseSheet}.tsx` (the dock on home only; Back and Home in a content page's header), `src/apps/helm/components/home/{HomeSurface,Composer}.tsx` (empty composer), `src/apps/helm/components/today/TodayView.tsx` (first run), `src/apps/helm/helm.css`, `public/fonts/source-serif-4/*` + `NOTICE`, `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`, `scripts/seeds/types.ts`, `scripts/seed.ts`, `package.json` (`seed:helm`, `check:helm-copy`, `check:helm-rules`), `scripts/checks/helmCopy.ts`, `SEEDING.md`, `src/lib/dev/fixtureAccounts.ts`, `README.md` (Current apps), `.claude/rules/helm.md`
**Context:** `TECHNICAL.md` sections 1, 2 ("Paths", "HelmProfile"), 14 (rules), 15, 17, 21 ("The home surface and the voice dock", "The Browse sheet": bento tiles; round 6e: the dock on home only, `VIEW_KINDS`); `UX.md` home, the voice dock, a content page's header and the Browse sheet; `canvas.md` look; `docs/conventions/new-app.md`.
### Description
Helm exists on the site: registered, reachable at `/helm` behind sign-in, in its own look. Home is the conversation's empty state (the assistant's mark, "Tap to talk, or type", an empty composer). The voice dock (Browse · Talk · Type) sits on home only (round 6e); every other page carries Back and Home in its header (Browse is on home only), and content pages get their "Ask about this" control in issue 9. Browse opens the Browse sheet: tiles as a bento of mixed sizes by importance (owner, round 6b review), Today's wide tile now and every other view's tile as its issue lands, and home; Connected apps, Settings and Activity sit in a foot row. A later section is a small tile unless decided otherwise; Search sits at the top of the sheet once issue 59 lands it. No footer tab bar, no doors on home (owner, round 6 second set). Talk and Type are drawn on home's dock and wired by issues 2 and 12. The profile is created on first open with the device's time zone and the default day window.
### Possible Approach
1. Walk `new-app.md`: registry and catalog entries, `ProtectedRoute appId='helm'`, logo, `npm run make:banner -- helm`, worker entry, finder (oldest readable `createdAt` of captures or tasks, `null` until they exist), seed scope.
2. `helm.css` with the theme tokens `check:apps` requires; self-host Source Serif 4 600 (Latin subset) with its OFL `NOTICE`.
3. `views.ts` declares `BROWSE_TILES` (each `{ view, importance: 'lead' | 'major' | 'minor', grows }`; the lead's set is Today `lead`, Needs you, People and Projects `major`, the rest `minor`) and `BROWSE_FOOT`; a type-level count makes `npm run typecheck` fail above one `lead` or three `major` tiles; a tile appears once its view's issue lands, and the grid re-flows without holes. Needs you grows to a big tile with open questions and shrinks to a small one without (it lands with issue 6). `views.ts` also declares `VIEW_KINDS` (`satisfies Record<HelmView, 'home' | 'content' | 'utility'>`, so a later view can't build without choosing). `VoiceDock` on home and `HelmHeader`'s Back and Home elsewhere, with `BrowseSheet` (a `Drawer`), are the only navigation; the open view lives in the URL (`useHelmUrlState`) and survives a reload and Back.
4. `helmSlice`, `useHelmSync` keyed on uid, profile listener; `ensureHelmProfile` creates the profile once in a transaction (`timeZone`, `dayStartTime`, `dayEndTime`, `planFillPercent`, `createdAt`, `lastEditedAt`).
5. `useAssistantName()` returns `DEFAULT_ASSISTANT_NAME` (the field lands in issue 58); `check:helm-copy` fails on a literal "Nomos" under `components/`.
6. Rules: `isHelmOwner(uid)` and the profile path (no delete); `check:helm-rules`.
### CRUD & Entry-Point Requirements
- [ ] **Create:** the profile on first open, with the device's zone.
- [ ] **Read:** Helm opens on home; Browse reaches Today's first-run card and back.
- [ ] **Update:** deferred to issue 31 ("Your day") and issue 58 (name and tone).
- [ ] **Delete:** deferred to issue 63.
### Success Criteria
- [ ] The person can open Helm from Home after signing in, land on the conversation's empty state, reach Today through Browse and come back; signed out, `/helm` asks them to sign in.
- [ ] A fourth `major` or a second `lead` tile fails `npm run typecheck`; a tile declared without `importance` fails too; the bento has no holes at 320, 360 and 390px with one, three and all tiles landed.
- [ ] The voice dock is checked at 320, 340, 360 and 390px with 40px hit areas on each control on home, and is absent on Today, whose header's Back and Home get the same checks; no footer tab bar or home doors exist; a view missing from `VIEW_KINDS` fails `npm run typecheck`.
- [ ] `firestore.rules` gains only the profile path, proven in `check:helm-rules` as owner, another user and signed out.
- [ ] Seed creates a Helm profile for the fixtures; `SEEDING.md` and `fixtureAccounts.ts` updated; every profile field added is read here.
- [ ] `check:helm-copy` passes and fails on a planted literal "Nomos".
- [ ] The font's licence `NOTICE` is beside it and named in the PR; root `README.md` has Helm's line; `.claude/rules/helm.md` exists.
- [ ] Conventions: none new; `new-app.md` walked in full and the check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 2: Tell Helm something: sealed turns on the home surface

**Prerequisites:** 1
**Target PR Size:** ~400 lines plus moved key helpers (M)
**Files:** `functions/src/appKeys/*` (moved from `functions/src/apps/runway/planKey.ts`), `functions/src/apps/runway/planKey.ts`, `functions/src/apps/helm/{getHelmKey,helmKey,verifyHelmKeys}.ts`, `functions/src/index.ts`, `functions/README.md`, `scripts/appKeys/*` (moved from `scripts/runway/`), `scripts/helm/keyring.sh`, `package.json` (`helm:keyring`), `src/lib/security/*` (`createSealedReader` moved from Runway), `src/apps/runway/security.ts`, `src/apps/helm/security.ts`, `src/apps/helm/queries/helmKeyQueries.ts`, `src/apps/helm/hooks/useSession.ts`, `src/apps/helm/store/listeners/captureListener.ts`, `src/apps/helm/store/actions/captureActions.ts`, `src/apps/helm/components/home/{HomeSurface,Composer,TurnCard}.tsx`, `src/apps/helm/components/inbox/InboxView.tsx`, `src/apps/helm/types.ts`, `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`, `docs/conventions/cloud-functions.md`
**Context:** `TECHNICAL.md` sections 2 ("Capture"), 3 ("The key", "How listeners open what they read", "The keyring"), 16, 21 ("Sessions and turns"); Runway's `TECHNICAL.md` "Master secret management".
### Description
The person types a line in the composer and sends it; it appears as a turn on the home surface, "Saved as written", sealed on the device. Turns group into sessions (a new one after 10 quiet minutes); earlier sessions are a scroll up. The Inbox view appears with "New since you looked". This lands the per-person data key, Helm's own keyring and the sealed reader every later issue uses.
### Possible Approach
1. Move the general keyring code to `functions/src/appKeys/` (no app words); Runway's `planKey.ts` keeps its path and prefix; `check:runway-keys` proves Runway unchanged.
2. `getHelmKey({ deviceId: null })` with `enforceAppCheck: true`; `verifyHelmKeys` with its canary; `npm run helm:keyring`.
3. `createSealedReader` moves to `@lib/security` with Runway's import; `security.ts` with `sealJson`/`openJson`.
4. Composer: a plain text field; Send seals `{ text, reading: empty }` and writes `received` with `sessionId`, `turnIndex`, `medium: 'web'`.
5. Home lists the current session's turns; earlier sessions under `LazyMount`, 20 at a time, grouped by day with `SectionDivider`.
6. Inbox "New since you looked" by `createdAt`; opening one sets `seenAt`; "Mark all seen" at 2 or more.
7. Rules: the owner wildcard with `captures` in its list.
### CRUD & Entry-Point Requirements
- [ ] **Create:** type → Send writes a sealed turn.
- [ ] **Read:** home shows it in its session; Inbox lists it; a row opens its result sheet.
- [ ] **Update:** `seenAt` by opening or Mark all seen; status changes come with issue 5.
- [ ] **Delete:** deferred to issue 6 (a failed or unreadable turn offers Delete).
### Success Criteria
- [ ] The person can tell Helm a line, see it on home, find yesterday's session by scrolling up, and mark what's new as seen in the Inbox.
- [ ] Firestore shows only ciphertext for the words; a document sealed with another key shows "Couldn't open this".
- [ ] `HELM_MASTER_KEYS` is created by `npm run helm:keyring`, listed in "What you need to do" before merge, with the three alert policies spelled out.
- [ ] `check:runway-keys` passes on the moved helpers; Runway's sealed reads still open in the browser.
- [ ] `firestore.rules` covers `captures` for the owner only, proven; seed writes the wrapped key and sealed turns in two sessions.
- [ ] `Capture` holds only the fields this issue uses (`inputMode`, `medium`, `sessionId`, `turnIndex`, `status`, `seenAt`, `createdAt`, `sealed` with `text` and an empty `reading`).
- [ ] Shared moves: `functions/src/appKeys/`, `scripts/appKeys/`, `createSealedReader` to `@lib/security`.
- [ ] Conventions: the docs PR's `appKeys` text in `cloud-functions.md` is re-read against the code, and "a callable that opens sealed data sets `enforceAppCheck: true`" is confirmed there.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 3: Nothing typed is lost: unsent drafts, opening offline, a key that won't come

**Prerequisites:** 2
**Target PR Size:** ~250 lines (S)
**Files:** `src/apps/helm/components/home/Composer.tsx`, `src/apps/helm/security.ts`, `src/apps/helm/components/states/{NeedsConnectionState,CannotOpenState}.tsx`, `src/apps/helm/Helm.tsx`, `src/apps/helm/constants.ts`
**Context:** `TECHNICAL.md` sections 2 (device-only keys), 3, 13 (key failure, opened offline); `UX.md` G6, O1.
### Description
Text typed but not sent survives the phone closing the app, stored only sealed. Opened with no connection, Helm says "Your things open once you're back online"; when the key call fails, "Helm can't open your things right now" with Try again.
### Possible Approach
1. Unsent text is a sealed form draft (`declareSealedFormDrafts('helm:')`, `unlockSealedFormDrafts` once the key is ready).
2. `CannotOpenState` and `NeedsConnectionState` per UX G6 and O1; the composer says it needs a connection until issue 60 adds the drop box.
### CRUD & Entry-Point Requirements
- [ ] **Read:** both states are reachable (emulator offline; a broken keyring).
### Success Criteria
- [ ] The person can close the app mid-sentence and find the words still there; nothing they typed is ever stored in plain text (checked by reading `localStorage`).
- [ ] Key failure and opened-offline states are reachable and screenshotted; Try again recovers.
- [ ] No rules or schema change; stated. Conventions: none new; security-privacy "One device, several accounts" checked.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 4: What Helm read: shorthand and dates

**Prerequisites:** 2
**Target PR Size:** ~350 lines (M)
**Files:** `src/utils/naturalDateUtils.ts`, `scripts/checks/naturalDates.ts`, `src/apps/helm/utils/captureReading.ts`, `src/apps/helm/components/home/{ShorthandRow,ReadChips,Composer}.tsx`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`, `package.json` (`check:natural-dates`), `CLAUDE.md` (Pattern index)
**Context:** `TECHNICAL.md` section 2 ("CaptureReading"); `PRODUCT.md` "Capture, In Detail"; `UX.md` composer boards.
### Description
As the person types, a chip line shows what Helm read for certain (who, places, procedures, urgent, dates); a date chip opens a calendar, "Read as text" undoes a chip. The reading is sealed with the turn. (Speaking lands with the voice issues, 11 onward; round 5's dictation field is dropped.)
### Possible Approach
1. `parseNaturalDate(text, { now, timeZone })` in `src/utils` (general), with fixed-clock cases.
2. `captureReading.ts` (pure): `@ # ^ !` tokens, date spans, a leading `addressedAs` token matched to the assistant's name.
3. Counter from 3,800; Send waits past 4,000 with "Too long by N characters".
### CRUD & Entry-Point Requirements
- [ ] **Create:** the reading is sealed into the turn at Send.
- [ ] **Read:** chips before Send and on the result sheet.
- [ ] **Update:** date chip and "Read as text" before Send only.
- [ ] **Delete:** n/a (part of the turn).
### Success Criteria
- [ ] The person can type, see exactly what Helm read before sending, fix a date and undo a chip.
- [ ] `check:natural-dates` covers the product's examples in two zones and across a DST change.
- [ ] Shared util built: `parseNaturalDate`, with no Helm words.
- [ ] Each `CaptureReading` field added is shown as a chip; older turns open with an empty reading; no rules change (sealed); seed turns carry readings.
- [ ] Checked at 320px with a long paste and the keyboard open.
- [ ] Conventions: `CLAUDE.md` Pattern index gains `parseNaturalDate`.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 5: The assistant files a capture as tasks

**Prerequisites:** 4
**Target PR Size:** ~400 lines (M, server-heavy)
**Files:** `functions/src/ai/{modelProvider,models}.ts`, `functions/src/ai/providers/anthropic.ts`, `functions/package.json` (`@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`), `functions/src/apps/helm/mcp/{server,buildTools}.ts`, `functions/src/apps/helm/{sortHelmCapture,aiLimits}.ts`, `functions/src/apps/helm/nomos/{buildContext,prompt,commands,normalizeNomosReply,policy,executeCommands,summaries}.ts`, `functions/src/index.ts`, `functions/README.md`, `firestore.indexes.json`, `scripts/ai/anthropicSecret.sh`, `package.json` (`ai:anthropic-secret`), `src/apps/helm/queries/nomosMutations.ts`, `src/apps/helm/store/listeners/{task,execution}Listener.ts`, `src/apps/helm/components/home/ResultLines.tsx`, `src/apps/helm/components/activity/AssistantLine.tsx`, `src/apps/helm/components/today/TodayView.tsx`, `src/apps/helm/types.ts`, `src/apps/helm/constants.ts`, `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 5 (flow, "Helm's MCP server and the tool loop", context, commands, provider, limits, injection, App Check), section 2 ("Task", "Execution"); the `claude-api` skill for model ids and the tool-use loop.
### Description
A sent capture is read on the server by Claude and turned into tasks: "Reading…", then one past-tense line per thing made. Today lists them under "Due soon". The first capture shows the one-line AI notice.
### Possible Approach
1. `functions/src/ai/` general provider over the Anthropic SDK: `generateStructured` and `runToolLoop` (`tool_choice` any, prompt caching), role → model id and price in `models.ts` only, checked against the `claude-api` skill.
2. Helm's MCP server built per call with the uid in its closure, offering only `search_tasks` and the terminal `file_results` here (later issues add tools), joined to the loop by `InMemoryTransport`.
3. `sortHelmCapture`: claim, context (tasks and projects only, aliases, no ids), the loop (≤6 turns, ≤12 calls, 40 s), normalize, policy, one transaction writing tasks and one `Execution`; `requestKey` idempotence.
4. Per-person limits (20 per 10 minutes, 150 a day) and the dollar budget in transactions; `heldReason` on refusal.
5. Rules: `tasks` and `executions` (no execution delete); index `tasks status ASC, createdAt DESC`.
6. Device: result lines; Today's untimed "Due soon"; `hasSeenAiNotice` and the first-capture line.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a capture makes tasks through the server.
- [ ] **Read:** result lines in the sheet and result sheet; tasks on Today.
- [ ] **Update:** `updateTask`/`completeTask` by capture; hand edits in issue 8.
- [ ] **Delete:** deferred to issue 8.
### Success Criteria
- [ ] The person can say "call Dana Friday, buy the rings" and see two tasks made, with dates from Helm's own reading.
- [ ] The model never receives a document id or a uid (fixture test of `buildContext` and of every tool's output); an unknown alias, dropped token or model-made date is refused (fixtures); a loop that hits its limit ends as a normal failed reading.
- [ ] Rate limit and budget hold under a scripted burst; a retried `requestKey` writes once; two devices racing write once.
- [ ] `firestore.rules` covers `tasks` and `executions`, proven; `check:indexes` passes.
- [ ] `ANTHROPIC_API_KEY` is created by `npm run ai:anthropic-secret` (which checks the key) and listed with the Anthropic console spend limit, click by click, in "What you need to do"; the model ids used are named in the PR with where they were checked.
- [ ] Every Task and Execution field added is used here; seed carries sealed tasks and executions.
- [ ] Shared infrastructure built: `functions/src/ai/` with no app words.
- [ ] Conventions: the docs PR's `cloud-functions.md` lines (model call by role; the Anthropic provider and the in-process MCP server) are re-read against the code.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 6: When the assistant can't read it yet: waiting, retries and Needs you

**Prerequisites:** 5
**Target PR Size:** ~300 lines (M)
**Files:** `src/apps/helm/hooks/useCaptureSweep.ts`, `functions/src/apps/helm/sortHelmCapture.ts` (lease, attempts, `mode: 'rest'`), `functions/src/apps/helm/nomos/{commands,executeCommands}.ts` (`ask` couldNotRead, moreToSort), `src/apps/helm/components/inbox/{NeedsYouList,QuestionSheet,HeldCaptureCard}.tsx`, `src/apps/helm/components/shell/HelmShell.tsx` (badge), `src/apps/helm/store/actions/captureActions.ts`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 5 ("Offline and failure"), section 13 (AI rows); `PRODUCT.md` "Capture, In Detail"; `UX.md` B8.
### Description
A capture the AI couldn't reach, or the day's limit held, waits as "Saved as written" and is read on the next open or return. After three failures it offers Try again, "Make it a task as written" and Delete. Words it can't make sense of wait in Needs you; more than 20 changes leave "Sort the rest". The Inbox tab badge counts Needs you.
### Possible Approach
1. Sweep on open, `online` and `useOnTabReturn`, oldest first, skipping held windows; 90 s lease.
2. Attempts and `failed` with `getFailedCause`; Try again resets.
3. `couldNotRead` and `moreToSort` questions; "Sort the rest" calls `mode: 'rest'`.
4. "Make it a task as written" (person-made) and Delete.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a task as written.
- [ ] **Read:** Needs you and the held capture card.
- [ ] **Update:** Try again; Sort the rest.
- [ ] **Delete:** a failed or unreadable capture.
### Success Criteria
- [ ] The person never loses a capture when the AI, limit or budget is away, and can always turn it into a task by hand or delete it.
- [ ] Each held reason shows its own line and is retried after its window (fixed clock).
- [ ] No rules change (covered by issue 5); stated. Fields added are used here; seed has a failed and a held capture.
- [ ] Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 7: Undo, Activity and Settings

**Prerequisites:** 5
**Target PR Size:** ~350 lines (M)
**Files:** `src/apps/helm/nomos/undoExecution.ts`, `src/apps/helm/store/actions/undoActions.ts`, `src/apps/helm/components/home/ResultLines.tsx`, `src/apps/helm/components/activity/{ActivityScreen,ExecutionSheet}.tsx`, `src/apps/helm/components/settings/{SettingsScreen,WhatTheAiSees}.tsx`, `src/apps/helm/components/shell/HelmHeader.tsx`, `scripts/checks/helmUndo.ts`, `package.json`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 5 ("What goes to the model", including the to-do check), 9; `docs/conventions/state-data.md` "An Undo re-reads current state"; `UX.md` S1.
### Description
One Undo takes back what the assistant did for a capture, keeping records the person changed since and saying so. Settings opens from the header with Activity (every change and Undo under day headings, each row opening a small sheet) and "What the AI sees".
### Possible Approach
1. `undoExecution` per section 9, one transaction; writes the `undo` execution and `undoneByExecutionId`.
2. Fixed-clock check: full, partial, repeated undo.
3. Activity: lazy listener, 30 at a time under `LazyMount`, `SectionDivider` per day.
4. Settings with its first rows; "What the AI sees" in product's words.
### CRUD & Entry-Point Requirements
- [ ] **Create:** Undo writes an `undo` execution.
- [ ] **Read:** Activity lists executions; a row opens its sheet.
- [ ] **Update:** the original gets `undoneByExecutionId`.
- [ ] **Delete:** never (rules refuse it).
### Success Criteria
- [ ] The person can undo a capture's changes and read in Activity what was taken back and what was kept.
- [ ] `check:helm-undo` passes; offline, Undo says it needs a connection.
- [ ] To do before ship: "Anthropic doesn't use what Helm sends to train its models." appears in "What the AI sees" only if the check of Anthropic's current API terms and the account's retention setting passes; the PR records what was checked, and the line is left out otherwise.
- [ ] No new rules; stated. Seed has an undone execution.
- [ ] Conventions: none new; `state-data.md` Undo rule checked.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 8: Task sheet: edit, complete, delete, steps, not yet

**Prerequisites:** 5
**Target PR Size:** ~400 lines (M)
**Files:** `src/apps/helm/components/tasks/{TasksView,TaskSheet}.tsx`, `src/apps/helm/store/actions/taskActions.ts`, `src/apps/helm/engine/activation.ts`, `src/apps/helm/store/selectors.ts`, `src/apps/helm/types.ts`, `src/apps/helm/constants.ts`, `scripts/checks/helmActivation.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("Task"), 9 ("The person's own edits"), 10; `PRODUCT.md` "Tasks, In Detail"; `UX.md` D15.
### Description
A task opens a sheet with its summary and "More details" (importance, urgency, deadline, length, energy, context, notes, steps, not until, waits on). A task's own steps are ticked on the sheet (round 6: steps belong to the task; reusable routines are procedures, issue 54). Tick done with Undo on the line, reopen, delete with confirm and Undo. Latent tasks stay out of lists until their condition holds.
### Possible Approach
1. `FormSheet` + `Form`/`FormFactories`; sealed words resealed in a transaction.
2. `selectTaskActivity` (pure, minute clock); check script.
3. Tick is a one-field write with its own Undo; a step tick is a dotted-path write on `stepState` (round 6), steps added, reordered and removed in the form.
### CRUD & Entry-Point Requirements
- [ ] **Create:** "New task" by hand from Today.
- [ ] **Read:** the sheet from any task row.
- [ ] **Update:** every field; tick and reopen.
- [ ] **Delete:** confirm plus Undo while the id is absent.
### Success Criteria
- [ ] The person can open, edit, finish, reopen and delete a task, and a "not until" task appears on its own when due.
- [ ] `check:helm-activation` covers not until, waits on a task, waits on a who.
- [ ] A second device's edit to another sealed field survives a save.
- [ ] Each Task field added is shown and edited here; no rules change; seed has latent and waiting tasks. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 9: Ask about this page, and the assistant follows the conversation

**Prerequisites:** 8
**Target PR Size:** ~400 lines (M)
**Files:** `src/apps/helm/store/screenSlice.ts`, `src/apps/helm/hooks/{useScreenContext,useLastInputMode,useHelmUrlState}.ts`, `src/apps/helm/screen/views.ts` (`VIEW_KINDS` read), `src/apps/helm/components/shell/{HelmShell,AskAboutThisControl,AskConversation}.tsx`, `src/apps/helm/components/home/{HomeSurface,ConversationThread,Composer}.tsx` (thread and composer reused over a page), `src/apps/helm/components/{today/TodayView,tasks/TaskSheet}.tsx` (publish), `scripts/checks/backHistory/harness.tsx` (the ask flows), `functions/src/apps/helm/nomos/{buildContext,prompt}.ts`, `functions/src/apps/helm/sortHelmCapture.ts`, `firestore.indexes.json`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 21 (the contract, sessions, "Asking from a content page"), section 5 ("Sessions and the screen"); `PRODUCT.md` "The assistant on every screen"; `UX.md` the ask control's placement; `docs/conventions/validation.md` (back history).
### Description
 On Today, or on a task's sheet, the person taps the page's one "Ask about this" control, always in the same place (design's chosen slot), and the conversation opens over the page with an "About Call the florist" chip they can remove; it listens at once if their last turn was spoken, or opens the field if they last typed. "Move this to Friday" changes that task; on Today, "the second one is done". Closing it ("Back to Today"), Back or the phone's back gesture returns to the page where they were. Within a session, "and make it urgent" follows the turn before. Utility screens (Search, Settings, Connected apps, Activity, forms) and home have no control; every later content view publishes its context and gets the control when it lands.
### Possible Approach
1. `useScreenContext(view, focus, visible, label)`, typed to content views, writes the capped context to the `screen` slice and clears it on unmount; a turn sent from the conversation over the page stamps it (`screen`, `v: 1`).
2. `AskAboutThisControl`, rendered once by `HelmShell`, shows when the slice holds a content view; the tap reads `useLastInputMode` and starts listening inside the gesture or focuses the composer, then sets `?ask=page`. `AskConversation` is the home thread and composer in an overlay `Subview` with its own history entry (`usePageHistory`; `keepEntryFor` from a sheet; a reply's link leaves through `afterBackLayersClose`), the page mounted beneath.
3. The server re-reads each referenced record under the caller's uid, drops missing or foreign ids, aliases them with a `focus` marker; reads the session's last 6 turns (index `captures sessionId ASC, turnIndex DESC`).
4. Prompt lines: "this" is the focus, "these" the visible list, earlier turns are context and never re-filed.
5. The chip comes from the page's label on the device; removing it sends `focus: null` and `visible: []` for that opening only. The contract is unchanged: ids only, re-read on the server.
### CRUD & Entry-Point Requirements
- [ ] **Update:** a task changed by "this" from its sheet.
- [ ] **Read:** the control on Today and a task's sheet, the conversation over the page with its chip; the context on the turn's result sheet in dev only.
### Success Criteria
- [ ] The person can change the task on screen by saying "this", and follow up on the last turn without repeating it.
- [ ] A forged context naming another person's ids or a missing id reaches nothing (fixture against the emulator); a client summary is never read by the server.
- [ ] Caps hold: 1 focus, 20 visible; a list longer than 20 publishes the first 20 in view.
- [ ] A removed chip sends no screen ids for that opening and is back the next time the control is tapped.
- [ ] `check:back-history` drives page → ask → Back to the page at its scroll, sheet → ask → Back to the sheet, ask → a reply's link → the record → Back to the first page, and a reload with the conversation open.
- [ ] The control shows on Today and a task's sheet and on no utility screen or home (a census of every landed view against `VIEW_KINDS`); its slot is checked at 320, 340, 360 and 390px with a 40px hit area; a tap after a spoken turn listens at once on Android Chrome and after a typed one focuses the field.
- [ ] `check:indexes` passes; each Capture field added (`screen`) is used; no rules change; stated.
- [ ] Conventions: if design's slot becomes the site's way to ask about a page, `.claude/rules/helm.md` records it; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 10: Several messages before the reply: one turn, one answer

**Prerequisites:** 9
**Target PR Size:** ~250 lines (S)
**Files:** `src/apps/helm/store/actions/captureActions.ts` (join while the last turn is received or interpreting), `src/apps/helm/hooks/useSession.ts`, `src/apps/helm/components/home/{HomeSurface,TurnCard}.tsx` (bubbles, one reply), `functions/src/apps/helm/sortHelmCapture.ts` (joined messages, abort and restart once, release late ones), `functions/src/ai/providers/anthropic.ts` (abortable stream), `functions/src/apps/helm/nomos/{buildContext,prompt,spoken}.ts`, `src/apps/helm/types.ts` (`turnLeadId`, `joinedCaptureIds`), `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("Capture"), 5 ("Flow of one capture"), 13 (back-to-back row), 21 ("Back-to-back messages"); `UX.md` the first reply and back-to-back boards.
### Description
The person sends "add milk", then "and eggs", then "oh and call Dana" before Helm has answered: each shows as its own bubble, and one reply covers all three ("Got all three"), with one card of what it did and one Undo. A message sent after the reply has started is a new turn. It works the same offline: everything said before a held turn is read joins it.
### Possible Approach
1. On Send, if the session's last turn is `received` or `interpreting`, write the new capture with `turnLeadId` and `arrayUnion` its id on the lead's `joinedCaptureIds` in one batch (≤9; a tenth is a new turn).
2. `sortHelmCapture` reads the lead and its joined messages in order; a Firestore listener on the lead aborts the model stream when one joins, and the call restarts once with every message.
3. The commit transaction compares `joinedCaptureIds` with what the call read; a message that joined after the restart or the commit has its `turnLeadId` cleared and gets its own turn.
4. The reply and its spoken line address every message; the turn card shows the bubbles, then the assistant's words, then what it did.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a message that joins the turn in progress.
- [ ] **Read:** the bubbles and the one reply.
- [ ] **Update:** n/a (Undo covers the turn's execution).
- [ ] **Delete:** n/a.
### Success Criteria
- [ ] The person can send three messages in a row and get one reply that covers all three, then send a fourth after it and get its own reply.
- [ ] A message landing during the model call aborts and restarts it once (call log shows one aborted stream); one landing after the restart or the commit gets its own reply; nothing is lost or filed twice (fixed-clock and emulator fixtures).
- [ ] Offline, three messages typed before reconnecting become one turn.
- [ ] Each Capture field added is used; no rules change (the owner wildcard covers it); stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 11: Quick turns on a lighter model

**Prerequisites:** 10
**Target PR Size:** ~250 lines (S)
**Files:** `functions/src/apps/helm/nomos/route.ts`, `functions/src/apps/helm/mcp/buildTools.ts` (`hand_over`), `functions/src/apps/helm/{sortHelmCapture,aiLimits}.ts`, `functions/src/ai/models.ts` (`quick`, `style` roles and prices), `scripts/checks/helmRoute.ts`, `package.json` (`check:helm-route`), `src/apps/helm/types.ts`
**Context:** `TECHNICAL.md` section 5 ("Model routing", "Cost, latency and limits"); the `claude-api` skill for the current Haiku-class model id and price.
### Description
Short, plain turns ("add milk", "done with the florist") are filed by a quick, cheap model; anything longer, a question, an attachment or a focused topic goes to the Sonnet-class model, and the quick one can hand a turn over. The person sees no difference except speed.
### Possible Approach
1. `route.ts` pure with fixtures; the quick loop offers fewer tools plus `hand_over` (once).
2. `AI_LIMITS` by route (quick 60 per 10 minutes and 400 a day; full 20 and 150, accepted by the owner) in one transaction on `aiUsage`.
3. The capture records `route`.
### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** as issue 5, on either route.
### Success Criteria
- [ ] The person's short turns are filed faster, and a turn the quick model can't handle is still filed right after a hand-over.
- [ ] `check:helm-route` covers each rule; a hand-over counts once on each route; a second hand-over is impossible.
- [ ] The model ids and prices are named in the PR with where they were checked; only `models.ts` has them.
- [ ] No rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 12: Talk to Helm: device voice and the shared voice skeleton

**Prerequisites:** 11
**Target PR Size:** ~400 lines (M)
**Files:** `src/lib/speech/voice/{types,voiceRouter,browserStt,deviceTts,playbackQueue}.ts`, `src/hooks/useVoiceConversation.ts`, `scripts/checks/speechShared.ts` (file list widened), `src/apps/helm/components/voice/{VoiceControl,VoiceStateRing}.tsx`, `src/apps/helm/components/shell/VoiceDock.tsx`, `functions/src/apps/helm/nomos/{spoken,summaries}.ts`, `src/apps/helm/constants.ts` (phrases, "undo that"), `src/apps/helm/types.ts`, `src/apps/helm/nomos/undoExecution.ts`, `CLAUDE.md` (Pattern index), `docs/conventions/code.md`
**Context:** `TECHNICAL.md` sections 20 ("Adapters", "Routing", "Wake word, barge-in and hands-free"), 5 ("The spoken reply"); `src/lib/speech`, `useSpeechCommands`, `useNaturalVoice`; `UX.md` voice states.
### Description
The person taps Talk on the voice dock and speaks; the browser's recognition writes the turn, and the reply is spoken by the phone's voice (the natural voice when downloaded): "Got it" lines for changes, the answer's spoken line for questions. "Undo that" by voice undoes the last turn. Only a spoken turn gets a spoken reply; a typed turn gets the written reply only, and Mute on the dock silences spoken lines for the sitting (owner, round 6 second set). This lands the provider-independent voice service with its device adapters; cloud adapters plug in next.
### Possible Approach
1. `types.ts` (adapters, priorities, identity), `voiceRouter.ts` pure with fixtures (device-only for now), `browserStt.ts` over `createSpeechListener`, `deviceTts.ts` over `readAloud`, `playbackQueue.ts`.
2. `useVoiceConversation` over `listeningMode` (TAP mode here); Helm's `VoiceControl` supplies phrases and callbacks.
3. Server: code-built `ack` lines from summaries; `answer.spoken` reserved for issue 27; the capture's `sttProvider`, `ttsProvider` and sealed `spoken`.
4. "Undo that" matched on the device before Send, running the device-side Undo on the session's latest execution.
5. Spoken lines only for `inputMode: 'voice'` turns; Mute is session state in `useVoiceConversation`, never stored.
6. Extend `check:pinch-voice` to the new shared files.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a spoken turn (`inputMode: 'voice'`).
- [ ] **Update:** "undo that" reverts the last turn.
- [ ] **Read:** listening, thinking and speaking states on the button.
### Success Criteria
- [ ] The person can tap, say "call Dana Friday", hear "Got it" and see the task; say "undo that" and hear it undone.
- [ ] Without microphone permission or recognition, the button opens the composer with one line on how to allow it.
- [ ] `check:pinch-voice` covers `src/lib/speech/voice/**` and `useVoiceConversation.ts` and fails on a planted app word.
- [ ] Shared code built: the voice skeleton and `useVoiceConversation`, no Helm words; Pinch's cooking voice unchanged (driven in the browser).
- [ ] No rules change (sealed fields only); each Capture field added is used; stated.
- [ ] Conventions: `code.md`'s "Voice for any app" bullet gains the voice service; Pattern index line for `useVoiceConversation`.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 13: Choose the assistant's voice: a benchmark across providers

**Prerequisites:** 12
**Target PR Size:** ~350 lines (M, mostly a script and a page)
**Files:** `functions/src/voice/providers/{googleTts,geminiTts,deepgramAura}.ts`, `functions/src/voice/voiceConfig.ts` (`VOICE_PROVIDER_DEFAULT`, prices), `scripts/voice/{benchmark.ts,deepgramSecret.sh,geminiSecret.sh,googleSetup.sh}`, `package.json` (`voice:benchmark`, `voice:deepgram-secret`, `voice:gemini-secret`, `voice:google-setup`), `functions/README.md`, `docs/voice-benchmark.md` (results)
**Context:** `TECHNICAL.md` section 20 ("Adapters", "Budget and limits", "Data use"); `PRODUCT.md` "Under the Hood" (10 to 15 replies).
### Description
Before any cloud voice ships, 12 of the assistant's real replies (a "Got it", a short answer, an answer with a "Not from your records" part, a health caution, a question with two options, a long summary, in Composed and Warm) are rendered by Gemini Flash-Lite TTS, Deepgram Aura-2, Google Cloud TTS (Chirp 3 HD) and the site's natural voice. The owner listens and picks the default; the result is recorded.
### Possible Approach
1. The three server provider adapters, each `speak({ text, voiceId, format })` streaming, each skipped when its credential is absent.
2. `voice:benchmark` renders every reply through each provider, measures time to first byte and total time over 5 runs each, counts characters and works out the cost from the price table, and writes a static page of players with the figures (published as a PR screenshot artefact, never on the site).
3. Interruption: how quickly each stream can be cut (abort to silence) is measured in the browser harness.
4. The owner's pick sets `VOICE_PROVIDER_DEFAULT` and the voice id per provider for the "Nomos" identity.
### CRUD & Entry-Point Requirements
- [ ] **Read:** the benchmark page with every sample and its figures.
### Success Criteria
- [ ] The owner can listen to every reply in every voice side by side, with delay and cost beside each, and their choice is recorded in `docs/voice-benchmark.md` and `voiceConfig.ts`.
- [ ] Each provider's current price, data-use terms (Deepgram's model-improvement opt-out, Gemini's paid tier or Vertex) and streaming format are checked and `TECHNICAL.md`'s "unverified" marks corrected.
- [ ] Secrets: `DEEPGRAM_API_KEY` and, only if needed, `GEMINI_API_KEY` by their scripts (each checks the key before saving); the Text-to-Speech API enabled by `voice:google-setup`; listed in "What you need to do".
- [ ] No rules, schema or client change; stated.
- [ ] Conventions: none new yet (the voice-service line lands in issue 14); check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 14: Cloud listening: short-lived tokens, a voice budget and per-person allowances

**Prerequisites:** 13
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/voice/{mintVoiceToken,usage}.ts`, `functions/src/voice/providers/deepgram.ts`, `functions/src/voice/voiceConfig.ts` (`VOICE_APPS`, limits), `functions/src/index.ts`, `functions/README.md`, `src/lib/speech/voice/{deepgramStream,pcmWorklet,voiceRouter}.ts`, `src/apps/helm/components/voice/VoiceSettings.tsx` (voice mode), `src/apps/helm/types.ts` (`voiceMode`, `hasSeenVoiceNotice`), `scripts/checks/voiceRouter.ts`, `docs/conventions/{cloud-functions,security-privacy}.md`
**Context:** `TECHNICAL.md` section 20 ("Streaming, tokens and keys", "Budget and limits", "Data use"); section 14.
### Description
Online, what the person says is heard by the cloud listener (faster and better than the browser's), streamed from the browser with a token that lasts about a minute. Past 60 minutes a day, or when the site's $5 voice cap is reached, Helm quietly uses the phone's listening instead. A setting keeps voice on the phone only.
### Possible Approach
1. `mintVoiceToken`: auth, App Check, one transaction over `voiceUsage/{uid}/days/{dayKey}` and `voiceBudget/{dayKey}`; returns `{ token, expiresAt, provider, model }`. Check the token endpoint, lifetime and whether a stream outlives its token; correct `TECHNICAL.md`.
2. `deepgramStream.ts` with `getUserMedia` (echo cancellation on) and the PCM worklet; the device reports each stream's length at close, capped per mint.
3. The router: cloud when online, under the allowance and the token arrives within 1.5 s; else device, with one quiet line when a limit caused it.
4. `VOICE_APPS` entry for Helm (id and limits only); a first-use voice notice (`hasSeenVoiceNotice`).
### CRUD & Entry-Point Requirements
- [ ] **Update:** voice mode in Settings.
- [ ] **Read:** the quiet "Using this phone's voice for the rest of today" line when it applies.
### Success Criteria
- [ ] The person can talk online and see words appear as they speak, and keeps talking when the allowance or the budget runs out.
- [ ] No provider key reaches the browser (network log); a token from one person can't be minted for another; a burst of mints stops at the hard bound.
- [ ] Limits and the site cap hold under a scripted burst; `voice.budgetReached` is logged and its alert policy spelled out.
- [ ] `voiceUsage` and `voiceBudget` have no client rule, proven denied in `check:helm-rules` (site rows); each profile field added is used.
- [ ] A Deepgram project spend limit is spelled out click by click in "What you need to do".
- [ ] Conventions: the voice-service line in `cloud-functions.md` and the audio line in `security-privacy.md` are written here from TECHNICAL.md section 18.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 15: The assistant's own voice: cloud speech, identity and routing by priority

**Prerequisites:** 14
**Target PR Size:** ~300 lines (M)
**Files:** `functions/src/voice/streamSpeech.ts`, `functions/src/apps/helm/voiceIdentity.ts`, `functions/src/index.ts`, `src/lib/speech/voice/{cloudTts,voiceRouter,playbackQueue}.ts`, `src/apps/helm/components/voice/VoiceControl.tsx`, `firebase.json` (function rewrite if needed), `scripts/checks/voiceRouter.ts`
**Context:** `TECHNICAL.md` section 20 ("Streaming", "Voice identity", "Routing, per turn").
### Description
Answers are spoken in the assistant's own voice (the one the benchmark chose) while online and under the day's allowance; "Got it" lines stay on the phone's voice so they start at once. A slow or failed cloud voice falls back to the phone's for that reply.
### Possible Approach
1. `streamSpeech` (`onRequest`): ID token and App Check from headers, site-origin CORS, ≤600 characters after `toSpokenText`, charge `spokenChars`, pipe the provider's stream.
2. `cloudTts.ts` plays chunks through `AudioContext`; the queue never overlaps an ack and a reply; 2.5 s without audio falls back.
3. The "Nomos" identity mapped per provider on the server and to the natural voice or system hints on the device; tone never changes the voice.
### CRUD & Entry-Point Requirements
- [ ] **Read:** a spoken answer in the cloud voice; `ttsProvider` on the turn.
### Success Criteria
- [ ] The person hears answers in one consistent voice, starting within about a second, and never hears two lines at once.
- [ ] A request without a valid ID token or App Check, or from another origin, is refused (scripted); text over 600 characters is refused.
- [ ] Over the speech allowance, replies use the device voice with no error.
- [ ] No rules change; stated. Conventions: the voice-service line re-read against the code.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 16: Talk over it, keep talking, and "Hey {name}"

**Prerequisites:** 15
**Target PR Size:** ~350 lines (M)
**Files:** `src/lib/speech/voice/{bargeIn,deepgramStream}.ts`, `src/hooks/useVoiceConversation.ts` (follow-up window, WAKE mode), `src/apps/helm/components/voice/{VoiceControl,VoiceSettings}.tsx`, `src/apps/helm/types.ts` (`isWakeWordOn`, `isHandsFreeOn`, `interruptedCaptureId`), `functions/src/apps/helm/nomos/prompt.ts`, `scripts/checks/bargeIn.ts`
**Context:** `TECHNICAL.md` section 20 ("Wake word, barge-in and hands-free"); `PRODUCT.md` the voice lines; round 5's Next issue "Hands-free voice answering to the assistant's name" moved here.
### Description
The person can talk over a spoken reply and it stops at once, hearing their first word; after a reply Helm listens for 8 seconds for the answer without a tap. With "Hey {name}" turned on, saying the assistant's name while Helm is open starts a turn; the phrase is heard only by the phone's own recognition.
### Possible Approach
1. `bargeIn.ts` VAD on worklet frames with 300 ms pre-roll; interrupting aborts the stream and records `interruptedCaptureId`; the prompt knows the earlier reply was cut.
2. The follow-up WINDOW after a reply (`isHandsFreeOn`, default on).
3. WAKE mode on `browserStt` with `readWakePhrase` and the current name; cloud listening starts only after the phrase; `isWakeWordOn` default off with copy saying the browser's recognition listens while it is on.
4. Talking over a reply on browser recognition (no on-device model yet) and over a system-voice ack falls back to a tap; issue 17 brings voice interrupting to offline listening.
### CRUD & Entry-Point Requirements
- [ ] **Update:** hands-free and wake word switches in voice settings.
### Success Criteria
- [ ] The person can interrupt a reply mid-sentence and be understood, answer a question without tapping, and start a turn by saying "Hey {name}" after turning it on; renaming the assistant renames the wake phrase; said on a content page, it opens the conversation over that page with its chip (round 6e), and on a utility screen with none.
- [ ] No audio reaches the cloud listener before the wake phrase or a tap (network log while waiting).
- [ ] Barge-in checked with a long reply in Chrome desktop and Android; iOS behaviour recorded, and the tap fallback works there.
- [ ] Each profile field added is used; no rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 17: Voice offline on every phone: an opt-in on-device recognition model

**Prerequisites:** 16
**Target PR Size:** ~400 lines plus vendored model files (M)
**Files:** `src/lib/speech/onDevice/{capability,modelStore,recognizerWorker,onDeviceStt}.ts`, `src/hooks/useOnDeviceRecognition.ts`, `public/speech/asr/*` + `NOTICE`, `src/lib/speech/voice/{voiceRouter,bargeIn}.ts`, `src/hooks/useVoiceConversation.ts` (wake listening on the model), `scripts/checks/speechShared.ts` (file list widened), `scripts/checks/voiceRouter.ts`, `src/apps/helm/components/voice/VoiceSettings.tsx` ("Hear me offline" row), `vite.config.ts` or the service worker's cache list (the model files), `CLAUDE.md` (Pattern index), `docs/conventions/code.md`
**Context:** `TECHNICAL.md` section 20 ("On-device recognition", "Routing", "Wake word, barge-in and hands-free"); `useNaturalVoice` and its licence row as the pattern; CLAUDE.md "A vendored third-party asset keeps its licence beside it".
### Description
In voice settings, "Hear me offline" downloads a speech-recognition model to the phone (the row says the size, about 40–75 MB, before it starts), after checking the phone can run it. From then on Helm hears the person with no connection on any phone, talking over a reply works offline too, and "Hey {name}" listens on the phone itself so nothing leaves it.
### Possible Approach
1. Build sherpa-onnx's WebAssembly speech-recognition-only target with a streaming English Zipformer (int8); measure size and real-time factor on a mid-range Android phone and an iPhone; fall back to `vosk-browser` if it fails. Correct `TECHNICAL.md`'s unverified sizes.
2. Licences: confirm Apache-2.0 (sherpa-onnx) and MIT (ONNX Runtime) for the release used, prove from the build's file list that eSpeak NG (GPL-3.0) is not inside, and record the model weights' licence; `NOTICE` beside the files and the licences named on the row, as the natural voice does.
3. `capability.ts` (WebAssembly SIMD, `AudioWorklet`, storage estimate, memory hint) gates the row; `modelStore.ts` downloads from the site's origin with a hash check, a progress line and Cancel, caches it, and removes it on "Remove".
4. `recognizerWorker.ts` runs the model in a Web Worker on the PCM worklet's frames; `onDeviceStt.ts` is an `SttAdapter`; the router prefers it whenever cloud listening isn't used, and for wake listening.
### CRUD & Entry-Point Requirements
- [ ] **Create:** download the model ("Hear me offline").
- [ ] **Read:** the row's state (size, downloading with progress, ready, can't run here).
- [ ] **Update:** n/a.
- [ ] **Delete:** Remove frees the space.
### Success Criteria
- [ ] The person can turn on "Hear me offline", go into airplane mode, and still talk to Helm, interrupt a reply by voice and say "Hey {name}".
- [ ] A phone that can't run it, or lacks the space, is told why before any download; a cancelled or failed download leaves nothing cached.
- [ ] No audio leaves the device while the model listens (network log); the model files are served from the site's origin and checked by hash.
- [ ] The licences are named in the PR with the eSpeak NG check's evidence; anything not confirmed is listed in the PR as unverified and the owner decides whether to ship it.
- [ ] `check:pinch-voice` covers `src/lib/speech/onDevice/**` and `useOnDeviceRecognition.ts`; shared code has no Helm words.
- [ ] No rules or schema change (download state is browser state); stated.
- [ ] Conventions: `code.md`'s "Voice for any app" bullet gains the on-device model; Pattern index line for `useOnDeviceRecognition`.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 18: Connected apps: the site's read contract, grants and the Pinch adapter

**Prerequisites:** 7
**Target PR Size:** ~400 lines (M)
**Files:** `src/lib/connections/{contract,sources,readers,useConnections,connectionCalls}.ts` (new, shared), `functions/src/vendor/connectionsContract.ts`, `functions/src/connections/{registry,grants,callables,sourceClient}.ts` (new, shared), `src/apps/pinch/share/manifest.ts`, `functions/src/apps/pinch/share/adapter.ts`, `src/apps/helm/share/manifest.ts` (`shares: []`), `src/components/ConnectedSourcesList.tsx` (new, shared), `src/apps/helm/components/connections/{ConnectedAppsScreen,ConnectSheet,ConnectionPage}.tsx`, `src/apps/helm/components/settings/SettingsScreen.tsx`, `functions/src/index.ts`, `firestore.rules`, `scripts/connections/{rulesMatrix.py,boundaries.ts,adapterMatrix.ts}`, `scripts/checks/serverCopies.ts`, `package.json` (`check:connections-rules`, `check:connection-boundaries`, `check:adapters`), `CLAUDE.md` (Pattern index, Read before you touch), `docs/conventions/connections.md`
**Context:** `TECHNICAL.md` section 19 ("Where it lives", "The connector contract", "What each source shares", "Grants and accounts"); `PRODUCT.md` "Connected Apps, In Detail", "What Each Source Shares", "What Is On at First"; `UX.md` 1b and the L boards.
### Description
Settings → Connected apps lists the site apps the person can open. Connecting Pinch shows its categories with staged ticks (planned meals and the shopping list ticked, food to use soon unticked, "Never shared: recipes' text, prices…") and "Helm reads these and changes nothing in Pinch."; Connect writes a site grant. The connection's page shows the account ("Your moondreams account"), the switches, and Disconnect (the copies arrive in issue 19).
### Possible Approach
1. The contract in `src/lib/connections/contract.ts`, vendored to functions under `check:server-copies`.
2. Site grants at `connections/{uid}/grants/{id}`, owner read only; `grantConnection` and `updateConnection` check the reader, the connector, the declared categories and app access.
3. Pinch's manifest and adapter (`kitchens/{uid}`: planned meals as events, unticked list items as tasks, use-soon as tasks), proven by `check:adapters`.
4. `ConnectedSourcesList` and Helm's screens; `endConnection` stops reading (copies come in 11).
5. `check:connection-boundaries` and the new `connections.md` text re-read against the code.
### CRUD & Entry-Point Requirements
- [ ] **Create:** connect Pinch with staged ticks.
- [ ] **Read:** Settings → Connected apps; a connection's page.
- [ ] **Update:** a category's switch (applies at once).
- [ ] **Delete:** Disconnect ends the grant.
### Success Criteria
- [ ] The person can connect Pinch to Helm, choose what Helm may read, see what is never shared, and disconnect.
- [ ] `check:connections-rules` proves `connections/{uid}/**` owner-read and every client write refused, as owner, another user and signed out, against the base rules too.
- [ ] `check:adapters` shows Pinch's adapter returns nothing for another uid's kitchen and no field outside each kind's allowlist; `check:connection-boundaries` fails on a planted cross-app import or path.
- [ ] No app's words in `src/lib/connections`, `functions/src/connections` or `ConnectedSourcesList` (grep in the PR).
- [ ] Shared built: the contract, `useConnections`, `ConnectedSourcesList`. Conventions: `connections.md`, the CLAUDE.md row and the new-app.md item from the docs PR are re-read and corrected.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 19: Copies kept in step: sync, freshness, disconnect and delete, Pinch on Today

**Prerequisites:** 18
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/connections/{syncRunner,expire}.ts`, `functions/src/apps/helm/connections/sink.ts`, `functions/src/index.ts` (`syncConnections`, `syncConnectionsHourly`, `expireKeptCopies`, `deleteKeptCopies`), `firestore.indexes.json`, `firestore.rules` (`synced`), `scripts/helm/rulesMatrix.py`, `src/apps/helm/store/listeners/syncedListener.ts`, `src/apps/helm/hooks/useHelmSync.ts`, `src/apps/helm/components/connections/{DisconnectSheet,SyncedSourceBlock}.tsx`, `src/apps/helm/components/today/{SyncedCard,StaleSourceLine}.tsx`, `src/apps/helm/types.ts`, `src/apps/helm/constants.ts` (`DISCONNECT_DELETES_BY_DEFAULT`, `KEPT_COPY_DAYS`), `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("SyncedRecord"), 19 ("Kept in step", "Disconnect and delete", "Keeping and deleting"); `PRODUCT.md` "Where a Synced Thing Shows Its Source", "Disconnect and Delete", "Keeping and Deleting".
### Description
What Pinch shares is copied into Helm, sealed, and kept in step every hour and on open: tonight's meal shows on Today with Pinch's mark, and the shopping list's items show under it. Each copy opens a "From Pinch" block ("Updated today 9:30 AM · read only in Helm", Open in Pinch). A source that can't be reached says so. Disconnect asks once whether to also delete what came from Pinch, naming the count, with "Also delete" ticked (owner, round 5); kept copies say "no longer updated" and when they go, with Delete now.
### Possible Approach
1. Runner with a grant lease, the 30-day window, full reads for site apps; hourly sweep and the on-open call (15-minute throttle).
2. Helm's sink: seal, `contentHash`, write only changes, delete what a full read didn't see and what passed the window.
3. `endConnection` both ways, `deleteKeptCopies`, `expireKeptCopies`; `DISCONNECT_DELETES_BY_DEFAULT = true` and `KEPT_COPY_DAYS = 90` (owner, round 5): a kept copy always carries `deleteAfter`.
4. Today: synced events as cards, synced tasks as a group; freshness lines.
### CRUD & Entry-Point Requirements
- [ ] **Create:** copies on the first sync.
- [ ] **Read:** Today, the "From Pinch" block, the connection's status.
- [ ] **Update:** Sync now / Try now; a switch turned off deletes its copies, with Undo.
- [ ] **Delete:** Disconnect with or without copies; Delete now.
- [ ] Flow: a meal deleted in Pinch leaves Helm at the next sync.
### Success Criteria
- [ ] The person sees tonight's Pinch meal and their shopping list in Helm within the hour of changing them, always with where they came from and when.
- [ ] `firestore.rules` adds `synced` owner-read, client writes refused, proven; indexes pass `check:indexes`.
- [ ] Fixed-clock tests: a full read deletes what's gone, the window drops what is over 30 days past, an unchanged record isn't rewritten, a failed page keeps the copies and records the error.
- [ ] Disconnect opens with "Also delete" ticked; unticked, every kept copy is deleted 90 days after the disconnect (fixed clock), and none is kept without a `deleteAfter`.
- [ ] Nothing read from Pinch appears in logs (log census in the PR). Seed has a connected Pinch with copies and a kept-after-disconnect set.
- [ ] Conventions: `connections.md` "sink" lines re-read; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 20: Google accounts and Calendar on the platform

**Prerequisites:** 19
**Target PR Size:** ~400 lines (M)
**Files:** `src/lib/google/requestGoogleAuthCode.ts` (new, shared), `functions/src/connections/{tokens,verifyConnectionKeys}.ts`, `functions/src/connections/google/{oauth,calendar,deepLinks}.ts`, `functions/src/index.ts` (`startGoogleConnection`, `finishGoogleConnection`, `readConnectorOptions`, `verifyConnectionKeys`), `functions/README.md` (keyring runbook), `scripts/connections/{keyring,googleSecrets,googleSetup}.sh`, `package.json` (`connections:keyring`, `connections:google-secrets`, `connections:google-setup`), `src/apps/helm/components/connections/{ConnectedAppsScreen,ConnectionPage,CalendarPicker}.tsx`, `src/apps/helm/components/today/ConnectCalendarRow.tsx`, `src/apps/helm/components/settings/ShiftCalendars.tsx`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 8, 19 ("Several Google accounts", "Tokens", "Restricted scopes"); `PRODUCT.md` "Google Calendar, In Detail", "Several Accounts"; `UX.md` F1, 1b.
### Description
"Connect Google Calendar" on Today (with the unverified-app and weekly-reconnect line first) or "Add a Google account" in Connected apps. After Google, the person picks which calendars count (holidays and subscriptions off) and which are shifts. Events from the last 30 days and everything ahead are kept in step like Pinch's copies. A second account (work) connects beside the first, each named by its email with an optional label. Reconnect when Google stops sharing.
### Possible Approach
1. Site OAuth client and `CONNECTIONS_MASTER_KEYS`; tokens sealed per account (keyed by `sub`); incremental scopes.
2. Calendar connector: `syncPage` with sync tokens and the 30-day window; `readConnectorOptions` for the calendar list; checked `htmlLink`.
3. Several accounts: one Google account document each; Today merges their events (an event on both counts once).
4. Check Google's current rules for "In production, unverified" with restricted scopes and record the outcome.
### CRUD & Entry-Point Requirements
- [ ] **Create:** connect a Google account and its Calendar; add another account.
- [ ] **Read:** the account's page; the calendar picker.
- [ ] **Update:** which calendars count, shifts, the account's label, Reconnect.
- [ ] **Delete:** disconnect Calendar; the last grant on an account revokes it at Google.
### Success Criteria
- [ ] The person can connect a personal and a work calendar read-only, pick what counts, see both on one day, and disconnect either.
- [ ] Tokens never reach a client (network census in the PR) and live only in `connectionsServer/`; `check:connections-rules` still passes.
- [ ] Popup and redirect tested on an emulated phone; the installed-iPhone part named as device-only.
- [ ] `CONNECTIONS_MASTER_KEYS` and `GOOGLE_OAUTH_CLIENT` are created by their scripts (the second checked against Google) before the merge, with the console clicks spelled out; three `connections.keys.*` alerts added.
- [ ] Shared built: `requestGoogleAuthCode`, the token store and the Calendar connector, with no reader's words. Conventions: `connections.md` "Tokens" re-read.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 21: A-List shares movie nights and theaters

**Prerequisites:** 19
**Target PR Size:** ~200 lines (S)
**Files:** `src/apps/a-list/share/manifest.ts`, `functions/src/apps/a-list/share/adapter.ts`, `functions/src/connections/registry.ts`, `src/lib/connections/sources.ts`, `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`, `.claude/rules/a-list.md`
**Context:** `TECHNICAL.md` section 19 ("What each source shares"); `PRODUCT.md` "What Each Source Shares" (A-List row).
### Description
Connecting A-List shares planned showings (movie, time, theater) and saved theaters, with movies seen and rated offered off. Planned showings appear on Today with A-List's mark and "Open in A-List".
### Possible Approach
1. Manifest from product's row; adapter over `memberships/{uid}`, showings as events (theater as place label), theaters as places, seen movies as knowledge.
### CRUD & Entry-Point Requirements
- [ ] **Read:** A-List's copies on Today, in Search and as sources.
### Success Criteria
- [ ] The person can connect A-List and see their movie nights in Helm's day.
- [ ] `check:adapters` covers owner and another uid; no price, savings, membership or share-link field exists in the output.
- [ ] Deep links open the showing in A-List. No rules change (the platform covers it); stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 22: Going Once shares pickups and where each sale stands

**Prerequisites:** 19
**Target PR Size:** ~200 lines (S)
**Files:** `src/apps/going-once/share/manifest.ts`, `functions/src/apps/going-once/share/adapter.ts`, `functions/src/connections/registry.ts`, `src/lib/connections/sources.ts`, `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`, `.claude/rules/going-once.md`
**Context:** `TECHNICAL.md` section 19; `PRODUCT.md` "What Each Source Shares" (Going Once row).
### Description
Connecting Going Once shares pickups set (the thing and the day) and the person's sales (name and how many are available, pending and sold). Pickups show on Today.
### Possible Approach
1. Adapter over sales the uid is a member of; pickups as events, sales as projects with counts in `extra`.
### CRUD & Entry-Point Requirements
- [ ] **Read:** pickups on Today; sales as sources and in Search.
### Success Criteria
- [ ] The person can connect Going Once and see their pickups in Helm's day.
- [ ] `check:adapters` covers owner, a co-seller, a non-member and a buyer's inquiry: no buyer name, contact, message, floor price, note or price leaves the adapter.
- [ ] No rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 23: Nine Lives shares cats, vet visits, care due and clinics

**Prerequisites:** 19
**Target PR Size:** ~250 lines (S)
**Files:** `src/apps/nine-lives/share/manifest.ts`, `functions/src/apps/nine-lives/share/adapter.ts`, `functions/src/connections/registry.ts`, `src/lib/connections/sources.ts`, `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 19; `PRODUCT.md` "What Each Source Shares" (Nine Lives row); `CLAUDE.md` "Nine Lives placement".
### Description
Connecting Nine Lives shares the person's cats, vet visits coming up, vaccination and preventive due dates, and clinics, with conditions offered off. Visits show on Today; due care shows as tasks with the cat's name.
### Possible Approach
1. Adapter over households the uid is a member of: cats as pets, visits as events, due dates as tasks, clinics as places, conditions as knowledge.
### CRUD & Entry-Point Requirements
- [ ] **Read:** visits and care on Today; clinics and cats as sources.
### Success Criteria
- [ ] The person can connect Nine Lives and see what's coming up for their cats in Helm.
- [ ] `check:adapters` covers member, non-member and a household the person left: no uploaded record, expense, weight or litter log leaves the adapter.
- [ ] No rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 24: Waypoint shares trips, their plans and your tasks

**Prerequisites:** 19
**Target PR Size:** ~300 lines (M)
**Files:** `src/apps/waypoint/share/manifest.ts`, `functions/src/apps/waypoint/share/adapter.ts`, `functions/src/vendor/zonedTime.ts` (already vendored), `functions/src/connections/registry.ts`, `src/lib/connections/sources.ts`, `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`, `.claude/rules/waypoint.md`
**Context:** `TECHNICAL.md` section 19; `PRODUCT.md` "What Each Source Shares" (Waypoint row); `docs/conventions/data-contracts.md` (trip-relative time).
### Description
Connecting Waypoint shares the trips the person is in, the timeline's activities, flights, drives, stays and rentals (in the trip's time zone), and Before the Road tasks assigned to them or private to them, with what they owe and are owed offered off. A trip day on Today shows its plans.
### Possible Approach
1. Adapter over trips whose `members` holds the uid; trip-relative times turned into instants only through `zonedDateTimeToEpoch`; tasks filtered to assigned or private to the uid.
### CRUD & Entry-Point Requirements
- [ ] **Read:** trip plans on Today; trips as sources and in Search.
### Success Criteria
- [ ] The person can connect Waypoint and see their trip's plans and their own to-dos in Helm, at the right local times.
- [ ] `check:adapters` covers a member, a non-member, another member's private task and a trip the person left; no contact, suggestion, expense line, receipt or album item leaves the adapter.
- [ ] Fixed-clock tests across a time-zone change. No rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 25: Runway shares its money summary, worked out on the server

**Prerequisites:** 19
**Target PR Size:** ~350 lines (M)
**Files:** `src/apps/runway/share/manifest.ts`, `functions/src/apps/runway/share/adapter.ts`, `functions/src/vendor/runway*.ts` (Runway's pure money functions), `scripts/checks/serverCopies.ts`, `functions/src/connections/registry.ts`, `src/lib/connections/sources.ts`, `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`, `.claude/rules/runway.md`, `src/apps/runway/TECHNICAL.md`
**Context:** `TECHNICAL.md` section 19 ("Runway and Worth the Wait"); `src/apps/runway/TECHNICAL.md` "The key"; `PRODUCT.md` "What Each Source Shares" (Runway row).
### Description
Connecting Runway shares one money summary: Free to Spend now, the next income day and what is due before it as one total; bills coming up and Horizon events are offered off. The assistant can say whether money is fine for a plan without seeing a single purchase. Transactions, offered off and read live, are issue 30; nothing here reads a purchase.
### Possible Approach
1. Adapter on the server unwraps Runway's key through `planKey.ts`, computes the summary with Runway's vendored pure functions (kept identical by `check:server-copies`), and returns totals only. If the engine is too large to vendor cleanly, stop and raise it: the fallback is a sealed summary Runway writes when it computes.
### CRUD & Entry-Point Requirements
- [ ] **Read:** the summary as a source in answers; bills on Today when switched on.
### Success Criteria
- [ ] The person can connect Runway and ask "can I afford the weekend?" with Helm seeing only the summary they allowed.
- [ ] `check:adapters`: no transaction, account, balance, card, income source or receipt field exists in the output; another uid gets nothing; Runway's key never leaves Runway's key file.
- [ ] `check:runway-keys` still passes; no rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 26: Worth the Wait shares box counts, never an item

**Prerequisites:** 19
**Target PR Size:** ~150 lines (S)
**Files:** `src/apps/worth-the-wait/share/manifest.ts`, `functions/src/apps/worth-the-wait/share/adapter.ts`, `functions/src/connections/registry.ts`, `src/lib/connections/sources.ts`, `src/lib/connections/contract.ts` (`countSummary` kind), `functions/src/vendor/connectionsContract.ts`, `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 19 ("Runway and Worth the Wait"); `PRODUCT.md` "What Each Source Shares" (Worth the Wait row), "What Is On at First"; decisions.md "Round 5 owner answers" (counts only).
### Description
Worth the Wait offers one category, "Box counts: each box's name, how many things are in it and how many are revealed", off until switched on. Once on, "how many are still waiting in Date ideas?" is answered with the numbers; Helm never sees what any item says, revealed or not.
### Possible Approach
1. For each space whose `members` holds the uid, open each box's name and emoji with the space's key (box fields only), and count its items with two aggregation `count()` queries (all, and `where isRevealed == true`), which read no item document; `notYetRevealed` is the difference. "Whether you're in it" is space membership (boxes have none of their own).
2. Synced like the other site categories, one `countSummary` record per box.
### CRUD & Entry-Point Requirements
- [ ] **Update:** switch Box counts on or off on Worth the Wait's page.
- [ ] **Read:** the counts as a source in answers.
### Success Criteria
- [ ] The person can ask how many things wait in a box and get the numbers, with nothing an item says ever reaching Helm.
- [ ] `check:adapters`: the output holds only box name, emoji, space membership and the three counts; the adapter issues no item `get` or item query other than the two counts (asserted with a spy on the Admin SDK); another uid and a non-member get nothing; no invite code field exists.
- [ ] No rules change (Admin SDK); stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 27: Ask a question: records first, general knowledge labelled

**Prerequisites:** 5, 19
**Target PR Size:** ~350 lines (M)
**Files:** `functions/src/apps/helm/nomos/{prompt,answerGuards,normalizeNomosReply,executeCommands,summaries,buildContext}.ts`, `functions/src/apps/helm/mcp/tools/*.ts`, `firestore.indexes.json`, `scripts/checks/helmAnswers.ts`, `package.json` (`check:helm-answers`), `src/apps/helm/components/home/{AnswerCard,GeneralKnowledgeCard}.tsx`, `src/apps/helm/components/activity/ExecutionSheet.tsx`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 6, section 2 ("CaptureAnswer"); `PRODUCT.md` "Asking a Question"; `UX.md` A6, A9, A11, A12.
### Description
"When is the cake tasting?" is answered from the person's records with sources, synced copies included ("From Pinch"); people, facts and notes join the answer's records as their issues land. A world question with nothing in the records gets "Nothing in Helm says …" and a general answer under "Not from your records"; a question the records half answer gets two blocks; a question about the person's own things never falls back. Health questions carry the stronger caution. A question writes nothing and shows in Activity.
### Possible Approach
1. `answer` command with `scope` (`yourThings | theWorld | both`), `isHealth`, guards per section 6; synced records as `kind: 'synced'` sources; the MCP tools `search_tasks`, `search_synced`, `get_calendar`, `list_connections`, `connection_status`; index `synced kind, startAt`.
2. Fixture check of the guards.
3. `AnswerCard` and `GeneralKnowledgeCard` (no Save button yet: issue 49).
### CRUD & Entry-Point Requirements
- [ ] **Create:** an answer sealed into the capture and an `answer` execution.
- [ ] **Read:** composer, result sheet, Activity.
- [ ] **Update:** never.
- [ ] **Delete:** n/a.
### Success Criteria
- [ ] The person can ask a question and always tell which words came from their records and which from general knowledge.
- [ ] `check:helm-answers` passes; the general part never shows without its label, in Activity too.
- [ ] Answer fields added are shown here (`generalDiffersFrom`, `suggestedTopicId` land in issue 49); no rules change; seed carries each kind of answer.
- [ ] Conventions: the docs PR's labelled-general-answer line in `product.md` is re-read.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 28: Gmail, searched when a question needs it

**Prerequisites:** 27, 20
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/connections/google/gmail.ts`, `functions/src/connections/liveRouter.ts`, `functions/src/apps/helm/mcp/tools/{searchMail,readMail}.ts`, `functions/src/apps/helm/mcp/buildTools.ts`, `functions/src/apps/helm/nomos/{answerGuards,normalizeNomosReply,executeCommands}.ts` (quotes, searched, one noted fact), `src/lib/gates/gates.registry.ts` (`google-mail-and-drive`), `src/apps/helm/components/home/{QuoteLine,SearchedLine}.tsx`, `src/apps/helm/components/today/DiscrepancyLine.tsx`, `src/apps/helm/components/connections/ConnectionPage.tsx`, `src/apps/helm/types.ts`, `scripts/checks/helmAnswers.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 5 ("Helm's MCP server"), 6 ("Connected sources count as records", "One noted fact"), 19 ("Read when asked", "Restricted scopes"); `PRODUCT.md` Gmail row; `UX.md` 1b.
### Description
For someone the switch lets in, Gmail connects on its own tap on a Google account. A question that needs mail is answered from it with the lines quoted ("Looked in Gmail (you@gmail.com) just now. The email isn't kept.", Open in Gmail). When an email disagrees with the calendar, the answer notes it as one inferred fact with Undo, and the event's card then shows "Two times: an email says 2:00 PM".
### Possible Approach
1. `gmail.readonly` by incremental consent, gated by `google-mail-and-drive` on the client and in `startGoogleConnection`.
2. Live router with the 15-minute instance cache; `search_mail`/`read_mail` tools offered only with a live grant.
3. Quotes copied by code, `searched` on every answer, the one noted fact, `quotedSourceKeys`.
### CRUD & Entry-Point Requirements
- [ ] **Create:** connect Gmail; a noted fact with Undo.
- [ ] **Read:** answers with quotes and what was searched.
- [ ] **Update:** "The calendar is right" on the discrepancy.
- [ ] **Delete:** disconnect Gmail blanks its quotes.
### Success Criteria
- [ ] The person can ask "what time is the tasting?" and get an answer from their mail with the quoted line, a link to the email and a note of where Helm looked.
- [ ] Nothing from mail is stored beyond the answer's quotes and the noted fact (Firestore and log census); a hostile-email fixture can't make a tool send, write outside Helm or fetch a URL.
- [ ] Someone outside the switch never sees the tick and the callable refuses the scope; the tester steps (the switch and Google's test-user list) are spelled out.
- [ ] `check:helm-answers` covers quotes, a fabricated quote alias, a second noted fact (refused), and a failed search's line.
- [ ] Conventions: `security-privacy.md` "untrusted content in a prompt" re-read.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 29: Drive, searched when a question needs it

**Prerequisites:** 28
**Target PR Size:** ~250 lines (S)
**Files:** `functions/src/connections/google/drive.ts`, `functions/package.json` (a PDF text extractor), `functions/src/apps/helm/mcp/tools/{searchDocuments,readDocument}.ts`, `functions/src/apps/helm/mcp/buildTools.ts`, `src/apps/helm/components/connections/ConnectionPage.tsx`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 19 ("Read when asked", "Restricted scopes"); `PRODUCT.md` Drive row.
### Description
Drive connects on its own tap, behind the same switch. A question that needs a document is answered from a Doc's or PDF's text with the quoted lines and "Open in Drive"; any other file type says Helm can't read it.
### Possible Approach
1. `drive.readonly`; `files.list` by name and full text; Docs exported as text, PDFs extracted (≤10 MB).
### CRUD & Entry-Point Requirements
- [ ] **Create:** connect Drive. **Read:** answers quoting documents. **Delete:** disconnect blanks its quotes.
### Success Criteria
- [ ] The person can ask "what does the venue contract say about the deposit?" and get the line with a link to the file.
- [ ] Nothing from Drive is stored beyond quotes; a Sheet or image is never opened. The PDF extractor's licence is named in the PR. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 30: Runway's transactions, looked up when a question needs them

**Prerequisites:** 25, 28
**Target PR Size:** ~250 lines (S)
**Files:** `src/apps/runway/share/manifest.ts` (`transactions`, off), `functions/src/apps/runway/share/adapter.ts` (`query`), `functions/src/connections/liveRouter.ts` (site adapters' live categories), `functions/src/apps/helm/mcp/tools/searchAppRecords.ts`, `functions/src/apps/helm/mcp/buildTools.ts`, `src/lib/connections/contract.ts` (`transaction` kind), `functions/src/vendor/connectionsContract.ts`, `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 19 ("Runway and Worth the Wait", "Read when asked"); decisions.md "Round 5 owner answers" (Transactions offered, off).
### Description
Runway's connection page offers "Transactions: the date, who you paid, the amount and its category", off until switched on. Once on, "what did I spend at Costco last month?" is answered from Runway with the rows quoted ("Looked in Runway just now. Nothing is kept."), and nothing is copied into Helm.
### Possible Approach
1. The adapter's live `query` opens purchases within the asked range on the server under Runway's key, keeps spending and refunds, matches the payee with `createOptionMatcher`, and returns at most 20 rows plus the count and total.
2. The live router serves a site adapter's live category with no token; `search_app_records` is offered only while the category is on.
### CRUD & Entry-Point Requirements
- [ ] **Update:** switch Transactions on or off on Runway's page.
- [ ] **Read:** answers quoting transaction rows, with Open in Runway.
### Success Criteria
- [ ] The person can ask what they spent at a place and get the rows and a total, with Helm keeping none of them.
- [ ] `check:adapters`: a row has only date, payee, amount, currency and category; no note, receipt, link, card, account, bank description or deposit leaves the adapter; another uid gets nothing.
- [ ] No transaction appears in Firestore outside Runway or in logs (census). No rules change; stated. Conventions: `connections.md` gains "a site app's category may be live" if the docs PR lacks it.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 31: Today suggests a few tasks

**Prerequisites:** 8
**Target PR Size:** ~350 lines (M)
**Files:** `src/apps/helm/engine/planner.ts`, `scripts/checks/helmPlanner.ts`, `src/apps/helm/store/listeners/planDayListener.ts`, `src/apps/helm/store/actions/planActions.ts`, `src/apps/helm/components/today/{DayStrip,PlannedCard,SuggestedCard,SuggestionSheet}.tsx`, `src/apps/helm/components/settings/SettingsScreen.tsx` (Your day), `functions/src/apps/helm/nomos/*` (`planIt`), `src/apps/helm/types.ts`, `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("PlanDay"), 11 ("Planner"); `PRODUCT.md` "Today, In Detail".
### Description
Today suggests a few tasks (untimed "Worth doing today" with no calendar; synced events from connected apps count as busy) with Keep, Another time and Not today; the day strip reaches yesterday (as it was) and six days ahead; "Your day" sets the window.
### Possible Approach
1. Planner pure with fixed clocks; slots, reasons and a `proposed` execution in one batch.
2. Dotted-path slot updates.
### CRUD & Entry-Point Requirements
- [ ] **Create:** plan days on first open, Plan my day, Plan it.
- [ ] **Read:** Today and the day strip.
- [ ] **Update:** Keep, Another time, Not today; Your day.
- [ ] **Delete:** n/a.
### Success Criteria
- [ ] The person can open Today to a short realistic plan, keep or skip each suggestion, and look back at yesterday.
- [ ] `check:helm-planner` covers fill percent, late in the day, re-runs keeping decided slots.
- [ ] `firestore.rules` adds `planDays`, proven; seed has yesterday and today. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 32: Today around the calendar, and rest days

**Prerequisites:** 20, 31
**Target PR Size:** ~400 lines (M)
**Files:** `src/apps/helm/engine/{planner,restDay}.ts`, `scripts/checks/helmRestDay.ts`, `src/apps/helm/components/today/{EventCard,EventSheet,RestDayLine,TodayView}.tsx`, `functions/src/apps/helm/nomos/buildContext.ts` (calendar), `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("PlanDay" snapshot), 11 ("Rest day"), 13; `UX.md` C7.
### Description
Today shows events as fixed cards with free gaps, plans around them, keeps a snapshot so a past day reads as it was, flags overlaps on kept tasks, handles couldn't-update and stopped-sharing states, opens an event sheet with "Open in Google Calendar", and leaves a rest day empty with "Plan my day anyway".
### Possible Approach
1. Busy blocks into the planner; snapshot rules per section 2.
2. `restDay.ts` per the logged rule; synced events in the assistant's context; Today reads events from synced copies (offline on a trusted browser), "may be out of date" past a day.
### CRUD & Entry-Point Requirements
- [ ] **Create:** the snapshot.
- [ ] **Read:** event cards and sheet; past days.
- [ ] **Update:** Plan my day anyway; Keeps me busy all day.
- [ ] **Delete:** n/a.
### Success Criteria
- [ ] The person can see their day's events with realistic suggestions in the gaps, and a rest day after a night shift stays empty.
- [ ] `check:helm-rest-day` covers 03:00 and 01:30 ends, marked shift calendars and zone changes; a calendar that can't update never shows an empty day.
- [ ] No rules change; seed has a night shift. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 33: One thing in two places, and which source wins

**Prerequisites:** 32, 21, 24
**Target PR Size:** ~250 lines (S)
**Files:** `src/apps/helm/utils/sameThing.ts`, `src/apps/helm/engine/authority.ts`, `src/apps/helm/store/selectors.ts` (`selectSyncedForDay`), `src/apps/helm/components/today/{EventCard,SyncedCard,DiscrepancyLine}.tsx`, `scripts/checks/helmSameThing.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 19 ("Field authority and the same thing twice"); `PRODUCT.md` "When Sources Disagree"; `UX.md` 1b.
### Description
A movie night on the calendar and in A-List, or a flight in the calendar and in Waypoint, shows once with both marks. The calendar's time is shown; if the app's differs, one line says what the app says. Two accounts' copies of one event count once.
### Possible Approach
1. `sameThing.ts`: matching titles and starts within 15 minutes; `authority.ts` decides the shown value; the planner counts the merged event once.
### CRUD & Entry-Point Requirements
- [ ] **Read:** merged cards on Today and in the event sheet.
### Success Criteria
- [ ] The person never sees the same event twice in a day, and always sees when two sources disagree.
- [ ] `check:helm-same-thing` covers 14 and 16 minutes apart, near titles, two accounts and a moved event. No rules change. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 34: People, pets, organizations and places from what you say

**Prerequisites:** 5
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/vendor/{optionMatchUtils,stringSimilarity,zonedTime}.ts`, `scripts/checks/serverCopies.ts`, `package.json` (`check:server-copies`), `functions/src/apps/helm/nomos/{matchEntities,commands,buildContext,executeCommands}.ts`, `src/apps/helm/engine/whoTier.ts`, `scripts/checks/whoTier.ts`, `src/apps/helm/store/listeners/{who,place}Listener.ts`, `src/apps/helm/components/who/{WhoView,WhoDetail,PlaceDetail}.tsx`, `src/apps/helm/screen/views.ts` (People joins the Browse sheet), `src/apps/helm/types.ts`, `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("Who", "Place"), 5 ("Matching on the server"), 22 ("Kinds, tiers and roles"); `PRODUCT.md` "People, Pets and Organizations"; `UX.md` People boards.
### Description
`@Dana`, "my cat Miso" or "Acme Bakery" links to the one sure match or makes a new who of the right kind, written like the others. A name that just comes up is a passing who, out of the way under "Others"; links and repeat mentions make it regular. The person themself is a who, made with the profile. The People view appears with Close, Regular and Others, and each who's page; names show on task rows.
### Possible Approach
1. Vendor copies with `check:server-copies`.
2. `upsertWho` (kind; tier only by `whoTier.ts`, never `close`), `upsertPlace`, `link`; the assistant's name never matches a who; the self who created with the profile (`selfWhoId`, `isSelf`).
3. `whoTier.ts` pure with fixed-clock checks (three captures on two days; a task link; a role later).
4. People view (Close · Regular · Others, A to Z, search from 8), a who's page with Facts · Tasks · Mentions (Facts filled in issue 40).
### CRUD & Entry-Point Requirements
- [ ] **Create:** by turn; the self who on first open.
- [ ] **Read:** People → a who's page; names on task rows; places.
- [ ] **Update:** deferred to issue 35.
- [ ] **Delete:** deferred to issue 35.
### Success Criteria
- [ ] The person can mention a friend, a pet and a shop in one turn and find each in People with the tasks that name them, passing ones under "Others".
- [ ] The assistant's name never matches a who (fixture); `check:server-copies` fails on a changed copy; `whoTier` fixtures pass.
- [ ] `firestore.rules` covers `who` and `places`, proven; seed has two Sams, a cat, a bakery, the self who and a home place; each field added is shown.
- [ ] Shared: `functions/src/vendor/` and `check:server-copies`.
- [ ] Conventions: the docs PR's vendored-copies line in `cloud-functions.md` is re-read against the code.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 35: Which person?, and editing people, pets, organizations and places

**Prerequisites:** 34, 6
**Target PR Size:** ~300 lines (M)
**Files:** `functions/src/apps/helm/resolveHelmQuestion.ts`, `functions/src/apps/helm/nomos/executeCommands.ts` (held commands), `functions/src/index.ts`, `functions/README.md`, `src/apps/helm/queries/nomosMutations.ts`, `src/apps/helm/components/home/QuestionSheet.tsx` (WhichWho, WhichPlace), `src/apps/helm/components/who/{WhoDetail,PlaceDetail}.tsx`, `src/apps/helm/store/actions/whoActions.ts`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("NomosQuestion", "Who"), 5 ("Resolving an Inbox question"), 12 (bulk changes); `PRODUCT.md` "The Inbox, In Detail"; `UX.md` People edit boards.
### Description
Two Sams become "Which person?", asked in the conversation (aloud if the turn was spoken) and kept in Needs you, with what tells them apart, "Someone new" and "Don't link anyone". The person edits a who (name, aliases, kind, level, relation, contact; key dates come in issue 43) or a place, and forgets one with a confirm that names what goes and Undo.
### Possible Approach
1. Held commands on the question; `resolveHelmQuestion` runs them with no model call; `already-exists` closes a second device's sheet; a spoken answer goes through the same option matcher as a tap.
2. Edit forms; the level picker sets `tierSetBy: 'person'`; forget re-reads per chunk and reports counts.
### CRUD & Entry-Point Requirements
- [ ] **Update:** edit fields, kind and level; home flag on a place.
- [ ] **Delete:** forget with confirm and Undo; linked tasks stay with no who.
- [ ] Flow: the question is asked (this issue), seen in Needs you (issue 6's list) and resolved here.
### Success Criteria
- [ ] The person can answer "Which Sam?" in one tap or by voice, and edit, re-level or forget a who or place.
- [ ] A level the person set is never changed by the assistant (fixture); a question answered on two devices is applied once; offline, the sheet says answering needs a connection.
- [ ] No rules change; stated. Seed has a waiting Which person question. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 36: The assistant asks in the shape that fits: pick one, pick several, yes or no, a few words, a date, a record, a number

**Prerequisites:** 35, 16
**Target PR Size:** ~400 lines (M)
**Files:** `src/apps/helm/types.ts` (`QuestionShape`, `NomosQuestion`, `QuestionAnswer`, `answersQuestion`, `questionRef`), `src/apps/helm/constants.ts` (caps, the code-added options' words), `functions/src/apps/helm/nomos/{commands,responseSchema,normalizeNomosReply,executeCommands,buildContext,prompt}.ts` (`ask` shapes, the answer turn's context), `functions/src/apps/helm/resolveHelmQuestion.ts` (answer by shape; answer turn), `functions/src/apps/helm/sortHelmCapture.ts` (`answersQuestion`), `src/lib/speech/readSpokenAnswer.ts` (new, shared), `scripts/checks/pinchVoice.ts` (covers it), `src/hooks/useVoiceConversation.ts` (one question at a time, asked again once), `src/apps/helm/components/home/{QuestionCard,PickOneAnswer,PickSeveralAnswer,YesNoAnswer,FreeTextAnswer,DateTimeAnswer,PickRecordAnswer,NumberAnswer,TurnCard}.tsx`, `src/apps/helm/components/inbox/NeedsYouList.tsx` (skipped, "2 more questions"), `src/apps/helm/components/activity/ExecutionSheet.tsx` (question and answer), `src/apps/helm/queries/nomosMutations.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("Capture", `NomosQuestion`, "Execution"), 5 ("Commands and validation", "Questions: shapes, answers and Needs you"), 13 (question rows), 20 (follow-up window); `PRODUCT.md` "Questions, In Detail"; `UX.md` question cards.
### Description
When the assistant needs the person to choose, it asks in the shape that fits, like a modern chat: pick one (2 to 6, with "Something else" when it helps), pick several (2 to 8, with "None of these"), yes or no, a few words typed or said (up to 500 characters), a date or a time, a person, place or project from their records (ending with a "new" option), or a number with its unit. Up to 3 show on a turn and the rest wait in Needs you; in a spoken conversation they come one at a time and can be answered aloud ("the first two", "both", "skip"). A misheard answer is asked again once, then the question waits. Every question can be skipped and is never answered by default. An answer comes back as a turn, and what it changes shows in Activity with the question and Undo. The code-built questions (Which person?, Which is true now?, couldn't read, which date, sort the rest) keep their wording and take the same cards.
### Possible Approach
1. Types and the `ask` command's flat response fields; `normalizeNomosReply` validates by shape (caps, cut at a word, dedupe, code-added yes/no, "None of these" and "new" options, aliases resolved or dropped, ≤5 per reply, ≤20 open model-written per person).
2. `QuestionCard` draws each shape from existing parts (`PillGroup`, `MultiPillGroup`, a text field, `DateInput` or a time field, the who/place/project search as in Which person?, `MoneyInput` or a number field with its unit), Skip on each; up to 3 per turn.
3. `resolveHelmQuestion` takes `answer`: code-built questions bind held commands as before; model-written ones write an answer turn (`answersQuestion`) sorted on the quick route with the question in context, its execution carrying `questionRef`; offline the answer turn is saved and sorted on return.
4. `readSpokenAnswer` in `@/lib/speech` (no app words; fixtures for ordinals, both, all, none, skip, numbers in words, "something else: …"); what it can't place goes to the quick model; asked again once, then Needs you.
5. Spoken: the prompt and up to 4 options read aloud, the next question after an answer or a skip.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a question by the assistant in any shape; an answer turn.
- [ ] **Read:** the cards on the turn; Needs you with skipped ones marked; the answer and its question in Activity.
- [ ] **Update:** answer by tap or voice; Skip; Undo the answer's effect.
- [ ] **Delete:** n/a (a question closes when answered, or as "No longer needed" when its records went).
### Success Criteria
- [ ] The person can answer a pick-several question by saying "the first two", a yes/no by tapping, a number with its unit and a free answer by typing, and see each answer's change in Activity with Undo.
- [ ] A fourth question waits in Needs you; a skipped one stays there and nothing runs; no question is ever answered by default (fixtures).
- [ ] The model can't add "None of these", yes/no labels or a "new" option itself; a seventh pick-one option is cut, a one-option question is refused, an 81-character label is cut at a word, an unknown record alias is dropped (normalizer fixtures).
- [ ] A misheard spoken answer is asked again once, then waits; an answer given on two devices is applied once.
- [ ] No rules or index change (questions live on the capture); stated. `check:pinch-voice` covers `readSpokenAnswer.ts`; shared code has no Helm words.
- [ ] Conventions: Pattern-index line for `readSpokenAnswer`; `code.md`'s "Voice for any app" line re-read.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 37: Photos for people, pets and places, sealed in Storage

**Prerequisites:** 35
**Target PR Size:** ~350 lines (M)
**Files:** `storage.rules`, `scripts/helm/storageRulesMatrix.py` (or the rules matrix widened), `src/hooks/useSealedObjectUrl.ts` (new, shared), `src/apps/runway/hooks/useReceiptImageUrl.ts` (moved onto it), `src/apps/helm/hooks/useMediaUpload.ts`, `src/apps/helm/store/listeners/mediaListener.ts`, `src/apps/helm/store/actions/mediaActions.ts`, `src/apps/helm/components/who/{WhoPhoto,WhoDetail,PlaceDetail}.tsx`, `src/apps/helm/components/media/{MediaThumb,MediaViewer}.tsx`, `src/apps/helm/types.ts` (`Media` with `role: 'photo'`), `firestore.rules`, `scripts/seeds/helm.ts`, `CLAUDE.md` (Pattern index)
**Context:** `TECHNICAL.md` sections 2 ("Media", "Who", "Place"), 3 ("Media bytes"), 14 (Storage row), 22 ("Photos"), 23 ("Showing sealed media"); Runway's receipt Storage rule.
### Description
The person adds a photo to a who or a place (camera or library), sees it on the page and in lists, and opens it full screen. Every byte is sealed on the phone before upload. No face matching: a photo belongs to whoever the person put it on.
### Possible Approach
1. `media` collection and the Storage path `apps/helm/media/{uid}/{mediaId}` (+ `.thumb`), owner-only, octet-stream, 10 MiB + 1 KiB, as Runway's receipts.
2. `useMediaUpload`: `PhotoPicker`/`useImageUpload` (avatar 512 for the who photo, photo 1280 otherwise), a 512 px thumbnail, `encryptBytes`, upload, media doc `uploading` → `kept` with `attachedTo`.
3. `useSealedObjectUrl` shared, Runway's receipt hook moved onto it in this PR.
4. A who shows one photo and keeps up to 12; a place up to 12; remove with Undo.
### CRUD & Entry-Point Requirements
- [ ] **Create:** add a photo to a who or place.
- [ ] **Read:** on the page, as a list avatar, full screen in `ImageViewer`.
- [ ] **Update:** make another photo the main one.
- [ ] **Delete:** remove a photo (Storage objects and doc) with Undo while the session lasts.
### Success Criteria
- [ ] The person can give Miso a photo and see it on Miso's page and in People, and open it full screen.
- [ ] Storage holds only ciphertext (a downloaded object doesn't open as an image); another user and signed out are denied read and write, proven against the emulator, base rules too.
- [ ] Runway's receipt photos still show (before/after screenshots); the shared hook has no app words.
- [ ] `firestore.rules` covers `media`, proven; each Media field added is used; seed has photos for a cat and a place.
- [ ] Conventions: Pattern index line for `useSealedObjectUrl`.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 38: Bring people in from Google Contacts, one by one

**Prerequisites:** 37, 20
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/connections/google/contacts.ts`, `functions/src/connections/registry.ts`, `src/lib/connections/{contract,sources}.ts` (`google:contacts`), `functions/src/vendor/connectionsContract.ts`, `functions/src/apps/helm/importHelmContacts.ts`, `functions/src/index.ts`, `functions/README.md`, `scripts/connections/googleSetup.sh` (People API), `src/apps/helm/queries/contactsQueries.ts`, `src/apps/helm/components/contacts/ContactsPicker.tsx`, `src/apps/helm/components/who/{WhoView,WhoDetail}.tsx` ("Bring in people", "Update from Google"), `src/apps/helm/types.ts` (`importedFrom`, `importedFields`), `scripts/connections/adapterMatrix.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 19 (Google accounts, tokens, the connector contract), 22 ("Google Contacts import"); `PRODUCT.md` People "From Google Contacts".
### Description
From People, "Bring in people from Google Contacts" asks Google for read-only contacts, then lists them to tick; only the ticked people become who records (regular level, with their photo), matched to anyone already in Helm. It is a one-time copy: a who brought in from Google has "Update from Google" on its page. Disconnecting leaves them as they are.
### Possible Approach
1. Connector `google:contacts` (category `contacts`, kind `person`, mode `live`) on the platform's Google flow with `contacts.readonly`; `readConnectorOptions` pages `people.connections.list` up to 2,000, held in memory.
2. `importHelmContacts` (≤50 per call): `people.getBatchGet`, match by email, phone, name, write sealed who records and photos (fetched from allowlisted Google hosts, shrunk, sealed) in one execution with Undo.
3. "Update from Google" for one who replaces only fields unchanged since import (`importedFields`).
4. Check `contacts.readonly`'s classification on Google's scope list and the unverified-app limits; correct `TECHNICAL.md`.
### CRUD & Entry-Point Requirements
- [ ] **Create:** ticked contacts become who records.
- [ ] **Read:** the picker with search; "From Google Contacts" on the page.
- [ ] **Update:** "Update from Google" per who.
- [ ] **Delete:** Undo the import; Disconnect leaves records.
### Success Criteria
- [ ] The person can tick five contacts and find them in People with their photos, and refresh one from Google later.
- [ ] Nothing about an unticked contact is ever written (Firestore and logs checked); the client's list is never trusted for content (a forged name is ignored).
- [ ] A picked contact already in Helm fills only empty fields; an edited field survives "Update from Google".
- [ ] `check:adapters` covers the connector; the People API is enabled by the setup script; no rules change (who exists); stated.
- [ ] Conventions: `connections.md` gains the `live` pick-only use; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 39: When you get home, and "I'm home"

**Prerequisites:** 31, 35
**Target PR Size:** ~200 lines (S)
**Files:** `src/apps/helm/components/today/HomeGroup.tsx`, `src/apps/helm/engine/planner.ts`, `functions/src/apps/helm/nomos/*` (`setCurrentPlace`), `src/apps/helm/store/actions/planActions.ts`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 10 ("Places without location tracking").
### Description
Tasks for a home place group under "When you get home"; "I'm home" (or saying it) lifts them for 3 hours. Helm never reads location.
### Possible Approach
1. `currentPlace` with `saidAt` on the profile; `setCurrentPlace` with Undo; planner preference.
### CRUD & Entry-Point Requirements
- [ ] **Update:** I'm home on the group or by capture; Undo.
### Success Criteria
- [ ] The person can say or tap "I'm home" and see home tasks come up for the next 3 hours.
- [ ] No Geolocation call anywhere (grep). No rules change; `currentPlace` used here. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 40: Facts with sources

**Prerequisites:** 34
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/apps/helm/nomos/{commands,buildContext,executeCommands,normalizeNomosReply}.ts` (`remember`, quote check), `firestore.indexes.json`, `src/apps/helm/store/listeners/factListener.ts`, `src/apps/helm/components/who/{WhoView,FactSheet,SourceRing,WhoDetail}.tsx`, `src/apps/helm/store/actions/memoryActions.ts`, `src/apps/helm/types.ts`, `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 2 ("Fact"); `PRODUCT.md` "Memory and Sources"; `UX.md` E2, E5, E6.
### Description
"Dana is the florist" becomes a fact with its source: "You said this" or "{Name} inferred this", drawn differently everywhere. People opens on "Inferred (3)" when there are any; Confirm, Correct, Forget with Undo.
### Possible Approach
1. `remember` with provenance by code (verbatim quote → confirmed); facts in the context; index `facts status, createdAt desc`.
2. A `remember` with no subject is dropped here (it becomes a note in issue 48).
3. Correct as a transaction over both facts; Forget with snapshot Undo.
### CRUD & Entry-Point Requirements
- [ ] **Create:** by turn; "Add a fact" on a who.
- [ ] **Read:** facts with rings; a who's and a place's Facts.
- [ ] **Update:** Confirm, Correct.
- [ ] **Delete:** Forget with Undo.
### Success Criteria
- [ ] The person can see where every fact came from, confirm an inferred one, correct or forget it.
- [ ] An inferred fact can't reach `confirmed` without the person's tap.
- [ ] `firestore.rules` covers `facts`; `check:indexes` passes; seed has confirmed, inferred and superseded facts; each field added is shown.
- [ ] Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 41: Your preferences, favorites and identity, and "How {name} sees you"

**Prerequisites:** 40
**Target PR Size:** ~350 lines (M)
**Files:** `functions/src/apps/helm/nomos/{commands,executeCommands,buildContext,sensitive}.ts`, `src/apps/helm/types.ts` (`FactKind`, `topic`, `value`), `src/apps/helm/components/howNomosSeesYou/{HowNomosSeesYou,FactKindGroup}.tsx`, `src/apps/helm/screen/views.ts`, `src/apps/helm/store/selectors.ts` (`selectSelfFacts`), `scripts/checks/helmSensitive.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("Fact": kinds, topics, sensitive facts), 26; `PRODUCT.md` "How [name] Sees You".
### Description
"I always go to Shell for gas", "my favorite movie is Arrival", "I'm vegan" are kept as facts about the person with a kind and a topic. "How {name} sees you" shows them grouped by kind and topic, each editable or forgettable; two preferences on one topic become a "which is true now" question. Sensitive facts are kept only when the person says them about themself.
### Possible Approach
1. `remember` gains `kind`, `topic`, `value`, `sensitive`; topics matched by `createOptionMatcher` against topics of the same kind; round-5 facts read as `world`.
2. Sensitive categories in `sensitive.ts`; code drops a sensitive fact unless `personSaid` about the self who, and the turn's summary says so.
3. The view (one route, from Settings and the Browse sheet), Correct and Forget as facts do; the context sends self facts so answers use them.
### CRUD & Entry-Point Requirements
- [ ] **Create:** by turn.
- [ ] **Read:** "How {name} sees you", grouped.
- [ ] **Update:** Correct (supersedes).
- [ ] **Delete:** Forget with Undo.
### Success Criteria
- [ ] The person can tell Helm a preference and a favorite, see them under "How {name} sees you", correct one, and get an answer that uses one ("Where should I get gas?").
- [ ] A health fact said about someone else is not kept (fixture), and one inferred about the person shows as inferred and is never spoken as certain.
- [ ] No rules change (facts exist); each field added is shown; seed has preferences on two topics.
- [ ] Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 42: Contradictions as a question

**Prerequisites:** 40, 35, 23
**Target PR Size:** ~250 lines (S)
**Files:** `functions/src/apps/helm/nomos/executeCommands.ts`, `src/apps/helm/components/home/QuestionSheet.tsx` (WhichIsTrue), `src/apps/helm/components/who/FactSheet.tsx`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 2 ("Fact" provenance); `PRODUCT.md` "The Inbox"; `UX.md` B3.
### Description
A connected app that contradicts a fact Helm keeps (Nine Lives says Mar 12, a fact says Mar 5) asks the same question, derived on the device; picking the app's value changes Helm's fact only, and keeping Helm's isn't asked again until the source changes.
A capture that contradicts a fact keeps both and asks "Which is true now?" with nothing preselected; the other is kept as "Was $1,800 until Nov 8". "Neither" opens Correct.
### Possible Approach
1. `disputedWithId` on both and a `whichIsTrue` question, resolved through `resolveHelmQuestion` in one transaction.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a disputed fact by capture.
- [ ] **Read:** Needs you and both facts' sheets.
- [ ] **Update:** the answer supersedes and clears both.
- [ ] **Delete:** n/a.
### Success Criteria
- [ ] The person can settle a contradiction in one tap and still see the old value with its dates.
- [ ] Nothing is overwritten (fixture). No rules change; seed has a waiting contradiction; dispute fields used here. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 43: Dates that come back: birthdays and anniversaries on the who page, Today and Coming up

**Prerequisites:** 42, 38, 31
**Target PR Size:** ~400 lines (M)
**Files:** `src/utils/yearlyDateUtils.ts` (new, shared), `src/apps/helm/utils/keyDateIndex.ts` (`applyToKeyDateIndex`, rebuild, split; pure) and its server copy in `functions/src/apps/helm/`, `scripts/checks/{yearlyDates,serverCopies}.ts`, `package.json` (`check:yearly-dates`), `src/apps/nine-lives/utils/catAnniversaries.ts` (moved onto it), `src/apps/helm/types.ts` (`KeyDate`, `KeyDateSealed`, `KeyDateIndex`, `KeyDateKind`, `KeyDateShape`, who counters, `'comingUp'`), `src/apps/helm/constants.ts` (kinds, shapes, words, caps), `src/apps/helm/hooks/useKeyDates.ts`, `src/apps/helm/store/listeners/keyDateIndexListener.ts`, `functions/src/apps/helm/nomos/{commands,responseSchema,normalizeNomosReply,executeCommands,buildContext}.ts` (`setKeyDate`, `removeKeyDate` for dates that come back, the index in the same transaction, answers read it), `functions/src/apps/helm/importHelmContacts.ts` (birthday), `src/apps/helm/store/selectors.ts` (`selectUpcomingKeyDates`), `src/apps/helm/components/who/{WhoDetail,KeyDatesList,KeyDateSheet}.tsx`, `src/apps/helm/components/howNomosSeesYou/HowNomosSeesYou.tsx` (the self's), `src/apps/helm/components/today/{TodayView,KeyDatesLine}.tsx`, `src/apps/helm/components/comingUp/ComingUpView.tsx`, `src/apps/helm/screen/views.ts` (Coming up: a content view, a small tile), `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`, `CLAUDE.md` (Pattern index), `docs/conventions/state-data.md` (the sealed index line)
**Context:** `TECHNICAL.md` sections 2 (date-only and key dates, "Who", "KeyDate" with the yearly index, its size and cap), 3 ("Readable versus sealed"), 5 ("Commands and validation"), 12 (forgetting a who), 13 (key-date rows), 14 (rules), 15 (the index listener), 22 ("Key dates", "Google Contacts import"); `PRODUCT.md` "Key Dates, In Detail"; `docs/conventions/data-contracts.md` "Know which of the two kinds of time value a field is"; Nine Lives' `catAnniversaries.ts`.
### Description
People, pets, organizations and the person themself keep dates that come back: a birthday, an anniversary, or a custom date with "Comes back each year" ("Gotcha day", "Lease renews"). A date may have no year ("June 3"). "Mum's birthday is June 3" adds one with a line and Undo; a contact brought in from Google brings its birthday. The who's page lists them, and the self's appear in How {name} sees you. Today shows at most 3 quiet lines for the next 7 days, close people first (pets and the person count as close), then regular people, soonest first within each, then a door to **Coming up**: its own page and a Browse tile, the next 12 months by month, at most 20 a month then "Show 4 more in March", with passing people behind "Show everyone". Ages show only with a year. Built for 2,000 people and 20,000 dates.
### Possible Approach
1. `yearlyDateUtils.ts`: `nextYearlyOccurrence` (29 Feb on the 28th in other years) and `formatYearlyDate`, no app words; fixed-clock checks across leap years and the year's turn. Nine Lives' `nextOccurrenceOnOrAfter` moves onto it (its 29 Feb cats move from 1 March to 28 February; stated in the PR).
2. `keyDates/{id}` with readable `whoId` and `shape` only, sealed parts; `setKeyDate` / `removeKeyDate` with code validation (a day or a year, the day exists, years in range, custom needs a label, ≤20 per who through `yearlyDateCount`, 20,000 per person); the date only from a resolved span.
3. The sealed `meta/keyDateIndex`: every create, edit, delete, Undo and forget of a date that comes back reseals it in the same transaction through `applyToKeyDateIndex` (device and server copies identical); past 2,000 entries it splits into twelve month documents; a count mismatch rebuilds it. Hand edits need a connection and say so.
4. Today: `selectUpcomingKeyDates` over the open index joins tiers from the open who records and orders close, then regular, soonest first, 3 lines.
5. Coming up: 12 months from the same index, one `LazyMount` per month; "Show everyone" and "Show N more in {month}" on the device. Answers about upcoming dates read the index on the server.
6. `importHelmContacts` writes Google's birthday as a `keyDates` document into an empty birthday (`source: 'google:contacts'`, `importedFields.birthday`) and adds its index entry in the same transaction.
### CRUD & Entry-Point Requirements
- [ ] **Create:** by turn; by hand on a who's page or the self's; from a Contacts birthday.
- [ ] **Read:** the who's dates; the self's in How {name} sees you; Today's lines; Coming up from Today and from Browse.
- [ ] **Update:** the key-date sheet (date, label, "Comes back each year" for custom); Undo.
- [ ] **Delete:** remove in the sheet with Undo; forgetting a who deletes its dates first; Delete all takes them.
### Success Criteria
- [ ] The person can say "Dana's birthday is June 3", see it on Dana's page, see "Dana's birthday is Saturday" on Today that week in their own time zone, and find it under June in Coming up.
- [ ] Today with five dates this week shows a close person's and the pet's before a regular person's sooner one, three lines, then the door; Coming up hides a passing person's birthday until Show everyone, and a month with 24 shows 20 then "Show 4 more in March" (fixed-clock fixtures, a zone ahead of and behind UTC).
- [ ] A 29 February birthday shows on 28 February in 2027 on Today and in Coming up; a date with no year shows no age; a yearly date with no day never reaches either.
- [ ] A Google contact with a birthday and no year imports as June 3 with no year and appears in the index in the same write; an edited birthday survives "Update from Google".
- [ ] On the scale seed (2,000 who, 4,000 dates that come back), the index is one read of about 0.5 MB and opens in under 150 ms at 4× CPU (estimate 40 to 80 ms), measured and stated; Coming up makes no further read.
- [ ] The index never drifts: a change and its Undo, a Contacts import and a forget each leave `entryCount` equal to the summed `yearlyDateCount` (emulator fixtures); a planted mismatch is rebuilt; a fixture past 2,000 entries splits into twelve month documents and Today still reads right.
- [ ] Offline, the key-date sheet says it needs a connection and keeps the typed date.
- [ ] No key date or index stores a readable day, month, year or kind, nor anything derived from one (census of the readable fields against the types); section 12's "nothing sealed is indexed anywhere" still holds.
- [ ] `firestore.rules` adds `keyDates` and `meta` to the owner wildcard, proven in `check:helm-rules`; no composite index (stated).
- [ ] Shared: `yearlyDateUtils` with Nine Lives moved onto it (Nine Lives' upcoming birthday banner checked before and after); `keyDateIndex.ts`'s server copy identical under `check:server-copies`.
- [ ] Conventions: `data-contracts.md`'s yearly-date line, `state-data.md`'s sealed-index line and the Pattern-index line for `yearlyDateUtils` re-read against the code.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 44: Moments: a life's one-time events on the who page, and a date that clashes

**Prerequisites:** 43
**Target PR Size:** ~350 lines (M)
**Files:** `src/utils/yearlyDateUtils.ts` (`formatMoment`), `src/apps/helm/types.ts` (`MomentPrecision`), `src/apps/helm/constants.ts`, `src/apps/helm/hooks/useKeyDates.ts` (a who's moments), `functions/src/apps/helm/nomos/{commands,normalizeNomosReply,executeCommands}.ts` (moments, `momentCount`, clash → `whichIsTrue`), `functions/src/apps/helm/resolveHelmQuestion.ts` (a date answer), `src/apps/helm/utils/captureReading.ts` (a bare year or a decade as a span: "in 1998", "in the 80s"), `src/apps/helm/components/who/{WhoDetail,MomentsPreview,MomentsScreen,KeyDateSheet}.tsx`, `src/apps/helm/components/home/QuestionSheet.tsx` (Which is true for a date), `src/apps/helm/components/search/SearchScreen.tsx` (moments in pages), `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("KeyDate"), 5 ("Commands and validation"), 13 (key-date rows), 22 ("Key dates": moments, See all), 27 (the life timeline); `PRODUCT.md` "Key Dates, In Detail"; `UX.md` the who page's moments and See all.
### Description
A life's one-time events are moments: met, moved, started or left a job, graduated, adopted, passed away, or a custom one, known to the day, the month, the year or only the decade ("Grandpa lived in Lisbon in the 80s"). Organizations keep them too ("Opened · 2019"). "We met in March 2015" adds one with Undo. The who's page shows the newest 3 and "See all 14", which opens them grouped by decade, then year, however many a lifetime brings. A different birthday or passed-away date for one Helm already keeps writes nothing and asks "Which is true now?"; the same date with more detail fills it in. Moments never reach Today or Coming up; they are what the life timeline will read.
### Possible Approach
1. `setKeyDate` for moment kinds and custom without "Comes back each year": precision from the span (day, month, year, decade), sealed with no readable year; `momentCount` in the same transaction (≤500 per who).
2. While the who page is open, one listener on `keyDates where whoId == X and shape == 'moment'` (≤500); opened, sorted and grouped by decade and year on the device; the page shows the newest 3, and `MomentsScreen` draws the rest under `LazyMount` with no further read.
3. A different date for a kept birthday or passed-away date writes nothing and asks `whichIsTrue` with both dates and sources, the new one held in the question.
4. Search reads moments in pages of 500 after the first results show.
### CRUD & Entry-Point Requirements
- [ ] **Create:** by turn; by hand on a who's page.
- [ ] **Read:** the newest 3 on the who page; See all by decade and year; Search.
- [ ] **Update:** the key-date sheet (date and precision, label); Undo; "Which is true now?".
- [ ] **Delete:** remove in the sheet with Undo; forgetting a who and Delete all take them.
### Success Criteria
- [ ] The person can say "Grandpa lived in Lisbon in the 80s" and "we met in March 2015", see both on the right pages, and open See all to find them under the 1980s and 2015.
- [ ] A who with 500 moments draws "See all 500" at once from `momentCount` and its newest 3 within the measured budget (estimate 100 to 200 ms at 4× CPU, stated); no moment carries a readable year or date (census).
- [ ] "Mum's birthday is June 4" when June 3 is kept writes nothing and asks Which is true now; "Mum was born June 3, 1958" fills in the year.
- [ ] No moment ever appears on Today or in Coming up (fixture with a moment on today's date).
- [ ] Each field added is used; no rules or index change (issue 43's wildcard covers it); stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.
### Issue 45: Projects: start, follow, finish, and the people in them

**Prerequisites:** 35
**Target PR Size:** ~400 lines (M)
**Files:** `src/apps/helm/components/projects/{ProjectsView,ProjectDetail,ProjectQuestionFlow,EvidenceLine}.tsx`, `src/apps/helm/screen/views.ts` (Projects joins the Browse sheet), `src/apps/helm/store/listeners/projectListener.ts`, `src/apps/helm/store/actions/projectActions.ts`, `src/apps/helm/engine/{projectEvidence,whoTier}.ts`, `scripts/checks/helmEvidence.ts`, `functions/src/apps/helm/nomos/*` (`createProject`, `upsertWho` roles), `src/apps/helm/types.ts` (`whoRoles`, sealed `roleNotes`), `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("Project", roles), 22 ("Kinds, tiers and roles"); `PRODUCT.md` "Projects and Health"; `UX.md` project boards.
### Description
Projects appear in the Browse sheet with the first project, started by a turn or "New project" (a `QuestionFlow`). A project shows its objective, its Next list, its people by role (key and involved, then "Also mentioned") and an evidence line, never a percentage; finish, reopen, delete (tasks stay) with Undo.
### Possible Approach
1. `selectProjectEvidence` pure with fixed-clock checks; key people's open tasks feed the evidence line.
2. Projects join the record question's kinds (issue 36's `pickRecord`). `createProject`; tasks link by `projectId`; roles set by `upsertWho` per section 22 and by hand on the project; a key or involved role makes a passing who regular.
### CRUD & Entry-Point Requirements
- [ ] **Create:** by turn and `QuestionFlow`.
- [ ] **Read:** Projects → detail with people by role.
- [ ] **Update:** name, emoji, objective, target date, roles, finish/reopen.
- [ ] **Delete:** confirm names its tasks; Undo.
### Success Criteria
- [ ] The person can start a project, see who is key in it and its health stated from evidence, and finish or delete it.
- [ ] No percentage, bar or colour grade anywhere.
- [ ] `firestore.rules` covers `projects`; seed has the Wedding project with a key, an involved and a mentioned who. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 46: Milestones and clearing done tasks

**Prerequisites:** 45
**Target PR Size:** ~250 lines (S)
**Files:** `src/apps/helm/components/projects/{ProjectDetail,MilestonesTab}.tsx`, `src/apps/helm/store/actions/projectActions.ts`, `functions/src/apps/helm/nomos/*` (`addMilestone`), `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 (two-map note, "Project"), 12 (bulk changes).
### Description
A project gains milestones with dates (by hand or by capture), ticked done with a one-field write, and "Clear done tasks" with the count it really cleared.
### Possible Approach
1. Two-map milestones (`milestoneState` readable, titles sealed).
2. Clear done re-reads per chunk in a transaction.
### CRUD & Entry-Point Requirements
- [ ] **Create:** by hand and by capture.
- [ ] **Read:** Milestones tab; the evidence line names the next one.
- [ ] **Update:** title, date, done (dotted path).
- [ ] **Delete:** a milestone, with Undo.
### Success Criteria
- [ ] The person can add, tick and remove milestones and clear done tasks with an honest count.
- [ ] Clear done reports the real count with a second device ticking meanwhile.
- [ ] No rules change; seed milestones. Conventions: the docs PR's two-map text in `data-contracts.md` is re-read against the code.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 47: Knowledge: notes, and topics that nest

**Prerequisites:** 34
**Target PR Size:** ~400 lines (M)
**Files:** `src/apps/helm/store/listeners/{note,topic}Listener.ts`, `src/apps/helm/store/actions/{noteActions,topicActions}.ts`, `src/apps/helm/components/knowledge/{KnowledgeView,TopicScreen,NoteRow,NoteSheet,NoteForm,TopicPicker}.tsx`, `src/apps/helm/utils/topicTree.ts` (depth, cycles, legal parents), `scripts/checks/helmTopicTree.ts`, `src/components/LinkedText.tsx` (new, shared), `src/apps/helm/store/selectors.ts`, `src/apps/helm/screen/views.ts` (Knowledge tile), `src/apps/helm/types.ts`, `src/apps/helm/constants.ts`, `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`, `CLAUDE.md` (Pattern index)
**Context:** `TECHNICAL.md` sections 2 ("Note and Topic"), 7; `PRODUCT.md` knowledge section; `UX.md` K1, K2, K3, K5.
### Description
**Knowledge** gets its tile in Browse: the person writes notes (a title and up to 20,000 characters, the count showing from 18,000), puts each in several topics or none with a `MultiPillGroup` ("+ New topic", up to 10 per note), and finds them in the topic tree (Car care › Washing, Fragrance; three levels at most) or under "Loose notes". A topic can be moved under another or to the top, never into its own subtopics; deleting one keeps its notes (loose or in their other topics) and moves its subtopics up a level. A note's sheet shows its words with tappable links, where it came from, Copy, Edit and Delete with Undo. A topic's page lists its notes for now; it becomes a document in issue 50.
### Possible Approach
1. Types and listeners for `notes` and `topics` (`parentId`, `depth`); the tree sorted by name at each level on the device.
2. `topicTree.ts` (pure): legal parents, depth after a move, cycle refusal; moving recomputes `depth` for the topic and its subtopics in one transaction.
3. `NoteForm` in a `FormSheet`; `TopicPicker` over `MultiPillGroup`, and as a parent picker filtered to legal parents.
4. `LinkedText` (http(s) links as `ExternalLinkText`, no app words).
5. Caps: 1,000 notes, 100 topics, 3 levels, 20 subtopics, 10 topics per note, 20,000 characters.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a note by hand; a topic from "+ New topic" or as a subtopic.
- [ ] **Read:** Knowledge → the tree or Loose notes → a topic → the note sheet.
- [ ] **Update:** edit a note (any edit sets `checkedAt`); rename, emoji and move a topic.
- [ ] **Delete:** a note with confirm and Undo; a topic with a confirm naming its notes and subtopics.
### Success Criteria
- [ ] The person can write a note, put it in two topics, nest Washing and Fragrance under Car care, and find the note under each.
- [ ] A move into a topic's own subtopic or past three levels is never offered and is refused by the action (`check:helm-topic-tree` fixtures).
- [ ] Deleting a parent keeps every note and lifts its subtopics a level (emulator census).
- [ ] `firestore.rules` adds `notes` and `topics` to the owner wildcard, proven in `check:helm-rules`. Copy says Knowledge for the place, "note" and "topic" for items (grep).
- [ ] Each Note/Topic field added is shown here; seed has 8 topics two levels deep and 20 notes, 3 of them loose.
- [ ] Shared component built: `LinkedText`. Conventions: `CLAUDE.md` Pattern index gains `LinkedText`.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 48: Knowledge from captures and long pastes, and editing topics

**Prerequisites:** 47
**Target PR Size:** ~300 lines (M)
**Files:** `functions/src/apps/helm/nomos/{commands,normalizeNomosReply,executeCommands,summaries}.ts` (`createNote`, remember-without-subject → note), `src/apps/helm/components/home/Composer.tsx` ("Save as a note"), `src/apps/helm/components/knowledge/{KnowledgeScreen,TopicScreen}.tsx` (search from 8, ⋯ More), `src/apps/helm/store/actions/noteActions.ts`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 5 ("Notes and topics"), 7 ("How notes get in"), 12; `UX.md` K1, K2, K5.
### Description
"Remember that cakes keep 3 days in the fridge" or "note: …" saves a note (with Undo), filed in a topic only when one plainly fits; when it could fit two, the assistant asks which (one or both); when none fits it stays loose. The assistant never makes a topic on its own. A paste too long to send offers "Save as a note", read by no AI. Something already kept word for word says "Already in your notes". Topics can be renamed, given an emoji and deleted (notes stay).
### Possible Approach
1. `createNote` with existing `topicAliases` only; two or more candidates make a code-built `whichTopic` pick-several question (issue 36's cards); filing marks each topic `behind` with the note pending.
2. Duplicate check by `toComparable` body.
3. Topic delete removes the id from each note per chunk; confirm names the count.
4. Search from 8 notes.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a note by capture and by long paste.
- [ ] **Read:** the result line opens the note.
- [ ] **Update:** topic name and emoji.
- [ ] **Delete:** a topic with confirm; a capture-made note by Undo.
### Success Criteria
- [ ] The person can tell the assistant to remember something general and find it in Knowledge, save a long paste as a note, and tidy their topics.
- [ ] "Remember that Dana's birthday is June 3" is a key date on Dana and "Dana is allergic to nuts" a fact; "remember that cakes keep 3 days" is a note (fixtures).
- [ ] No rules change; seed has a capture-made note. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 49: Answers from your knowledge, and Save to my knowledge

**Prerequisites:** 27, 48
**Target PR Size:** ~350 lines (M)
**Files:** `src/apps/helm/utils/noteSearch.ts`, `scripts/checks/helmNoteSearch.ts`, `package.json`, `src/apps/helm/queries/nomosMutations.ts`, `src/apps/helm/hooks/useCaptureSweep.ts`, `functions/src/apps/helm/{sortHelmCapture.ts,nomos/buildContext.ts,nomos/answerGuards.ts}`, `src/apps/helm/components/home/{AnswerCard,GeneralKnowledgeCard,SavedNoteLine}.tsx`, `src/apps/helm/components/knowledge/NoteSheet.tsx` (I checked this, caution), `src/apps/helm/store/actions/noteActions.ts`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 6 ("Save to my knowledge"), 7 ("How notes reach the assistant"); `UX.md` A9, A11–A13, K3, K4.
### Description
Answers cite the person's notes with the book mark ("Your note · 🍰 Kitchen"). A general answer that differs from a note says so. "Save to my knowledge" saves the general answer in one tap. When no topic fits, which is always the first time, the assistant asks "Which topic should this go in?" with the likeliest topics and "New topic" (skip leaves it loose, waiting in Needs you); once a topic fits, it files there itself and says "Saved to Car care" with Undo (owner, round 6c review); the note says "Not checked" until "I checked this" or an edit. A health answer keeps its caution on the note.
### Possible Approach
1. `rankNotes` (pure) on the device; `noteIds` (≤8) to `sortHelmCapture`; the server reads them by id under the caller's path, 6,000-character cap.
2. `generalDiffersFrom`, `suggestedTopicId`; one-tap save in one batch with `answerSavedNoteId`.
3. A code-built `whichTopic` pick-one question with "New topic" (a name and an optional parent) when no topic fits; a clear match, or the topic picked before for this kind of answer, files it with Undo.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a note from a general answer in one tap.
- [ ] **Read:** the answer's note source opens the note.
- [ ] **Update:** answer Which topic, or New topic; Change topic; I checked this.
- [ ] **Delete:** Undo on the saved line.
### Success Criteria
- [ ] The person can keep a general answer in one tap, pick or make its topic the first time, see the next similar answer filed there on its own with Undo, and have later answers cite it, marked as saved from a general answer until checked.
- [ ] `check:helm-note-search` ranks fixtures and runs 1,000 notes under 20 ms; a hint for a missing or foreign id is dropped (server fixture).
- [ ] `isFromGeneralAnswer`, `checkedAt`, `hasHealthCaution`, `answerSavedNoteId` and the new answer fields are written and shown here; no rules change; seed has a saved general answer.
- [ ] Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 50: A topic reads as one document: written from its notes, with sources and history

**Prerequisites:** 49
**Target PR Size:** ~400 lines (M)
**Files:** `src/components/MarkdownText.tsx` (new, shared), `package.json` (`react-markdown`), `functions/src/apps/helm/writeHelmTopic.ts`, `functions/src/ai/models.ts` (`topicWrite`, `topicOverview`), `functions/src/apps/helm/aiLimits.ts` (topic writes a day), `functions/src/index.ts`, `functions/README.md`, `src/apps/helm/components/knowledge/{TopicScreen,SectionSourcesSheet,SectionEditSheet,VersionsSheet}.tsx`, `src/apps/helm/store/listeners/topicListener.ts` (versions, lazy), `src/apps/helm/store/actions/topicActions.ts` (edit a section, restore), `src/apps/helm/types.ts` (`TopicSection`, `TopicSource`, `TopicVersion`, `docState`, `pendingNoteIds`, `overviewOf`), `functions/src/apps/helm/nomos/buildContext.ts` (the focused topic whole), `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`, `CLAUDE.md` (Pattern index)
**Context:** `TECHNICAL.md` sections 2 ("Note and Topic"), 7, 16 (`writeHelmTopic`), 24; `PRODUCT.md` "Knowledge"; `UX.md` topic document boards.
### Description
Opening a topic shows one properly formatted document (headings, lists) that the assistant wrote from everything filed under it. Tapping any part shows where it came from: what the person said and when, a saved answer, a file, general knowledge, or their own typing. New notes since the last write are brought in when the topic is opened ("Bringing in 2 new notes…"). A parent opens with an overview of its subtopics and a link to each. History lists every change (what, when, who); the newest can be undone and any older one restored. The person can edit a section by hand, and that section stays theirs. While reading, "what's the tyre pressure?" is answered from the document.
### Possible Approach
1. `MarkdownText` (react-markdown, `skipHtml`, links through `ExternalLinkText`; licence named in the PR).
2. `writeHelmTopic`: claim, up to 20 pending notes, at most 8 section changes from `topicWrite`, applied by code (no `person` section's words touched, caps held), version and execution in one transaction; a parent's overview from `topicOverview` when a child's version moved.
3. `topics/{id}/versions/{n}` (no update rule); typed History rows; Undo on the newest, Restore on older ones as a new version.
4. `SectionEditSheet` writes a `person` section and a `personEdit` version.
### CRUD & Entry-Point Requirements
- [ ] **Create:** the first document when a topic with notes is opened; a section by hand.
- [ ] **Read:** the document, a section's sources, History, a parent's overview and subtopic links.
- [ ] **Update:** bring in new notes; edit a section; Undo; Restore.
- [ ] **Delete:** a topic with its versions (issue 47's delete).
### Success Criteria
- [ ] The person can open Car care and read one formatted document, tap a paragraph and see "You said, Nov 3", see a new note brought in the next time they open it, and undo that change.
- [ ] A write that would change a `person` section's words, drop a still-needed source or pass 30,000 characters is refused by code (fixtures); two devices opening a `behind` topic run one write.
- [ ] A failed write leaves the document as it was with "2 new notes aren't in the document yet · Try again"; past 30 writes a day the topic waits ("2 new notes will be added tomorrow · Read them now").
- [ ] Versions can't be rewritten (rules proven: create yes, update no); the 200-version cap holds; raw HTML renders as text; shared `MarkdownText` has no Helm words.
- [ ] Cost per write measured on the seed and stated in the PR against `TECHNICAL.md`'s estimate.
- [ ] Conventions: Pattern index line for `MarkdownText`; `cloud-functions.md` App Check line covers the new callable.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 51: Topics grow on their own: adding, rewording, moving, and changing one when asked

**Prerequisites:** 50
**Target PR Size:** ~350 lines (M)
**Files:** `functions/src/apps/helm/nomos/{commands,normalizeNomosReply,executeCommands,policy,summaries}.ts` (`addToTopic`, `reviseTopic`, `moveTopic`, `createParentTopic` held as `groupTopics`), `functions/src/apps/helm/resolveHelmQuestion.ts` (`groupTopics`), `functions/src/apps/helm/mcp/buildTools.ts` (`get_topic`), `src/apps/helm/store/actions/noteActions.ts` (an edited or deleted note marks its topics behind), `src/apps/helm/components/knowledge/{TopicScreen,VersionsSheet}.tsx` (change lines with Undo), `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 5 ("Notes and topics"), 7 ("Editing or deleting a note"), 9, 24 ("How it grows", "Revising by asking", "Nesting", "History and Undo"); round 5's Next issue "Change a note by asking" moved here.
### Description
When something the person says plainly fits a part of a topic ("the winter tyres are 205/55 R16"), the assistant adds it to the document on its own with a line and Undo. It may reword its own text (headings, order, joining sentences), logged in History, and move a topic under an existing parent with Undo; it always asks before making a new parent ("Group Washing and Fragrance under Car care?"). It never removes or rewrites the person's words unless asked: reading a topic, the person says "make it shorter" or "rewrite the intro", the document changes, a line says what changed, and Undo puts the earlier version back. Editing a note updates every topic that cites it, each as a new version.
### Possible Approach
1. `addToTopic` (add-only: code inserts a `nomos` section citing its notes) in the sorting call, no extra model call.
2. `reviseTopic` with section changes, a change summary and `requestQuote`; refused unless the quote is a verbatim span of the turn and the topic is the screen focus or named; version check, re-read and retry once.
3. `moveTopic` under an existing parent (automatic, `moved` row); `createParentTopic` only as a `groupTopics` question unless the turn asked for it (`grouped` and `moved` rows on yes); depth and cycles checked.
4. A note edit or delete marks every citing topic `behind`; the next write re-reads it.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a section added on its own; a parent on a yes.
- [ ] **Update:** reword its own text; move a topic; revise by asking; Undo.
- [ ] **Delete:** a sentence only a deleted note supported goes with the next write; the person's words never do.
### Success Criteria
- [ ] The person sees the assistant add a fact to the right topic with Undo, is asked before Washing and Fragrance get a new parent, can change a topic by saying what to change, and can undo any of it.
- [ ] A `reviseTopic` with no matching request is refused and writes nothing; an `addToTopic` and a rewording leave every `person` section byte for byte (fixtures); a `createParentTopic` never runs without a yes or an asking turn.
- [ ] Editing a note cited by two topics makes a new version in each on their next write.
- [ ] Two devices revising at once never lose a version (scripted race). No rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 52: Send a photo or screenshot in the conversation

**Prerequisites:** 51, 37
**Target PR Size:** ~400 lines (M)
**Files:** `src/apps/helm/components/home/{Composer,MediaLine,TurnCard}.tsx`, `src/apps/helm/hooks/useMediaUpload.ts`, `src/apps/helm/utils/mediaCaps.ts`, `functions/src/apps/helm/media/{openMedia,sweepMedia}.ts`, `functions/src/apps/helm/nomos/{buildContext,responseSchema,normalizeNomosReply,executeCommands}.ts`, `functions/src/apps/helm/sortHelmCapture.ts`, `firestore.indexes.json` (`media status, deleteAfter`), `src/apps/helm/types.ts` (`attachmentIds`, `Media` attachment role and statuses, `deleteAfter`), `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 5 ("Media into the model"), 23; `PRODUCT.md` "Attachments".
### Description
The person attaches up to 5 photos or screenshots to a turn ("this is the venue's quote"). The assistant reads them, keeps each on the record it changed or lets it go, and says which; a let-go photo shows "Didn't keep it · Keep it" for 24 hours, then is deleted (never "as soon as it's read").
### Possible Approach
1. Composer attach (camera and library), caps on the device, sealed upload before the turn is written.
2. The server opens each medium, sends an image block (1600 px), and `file_results` decides per medium; code keeps only what is attached; one execution with Undo.
3. Expired media swept at the end of each call, on device open and by Delete all; index `media status ASC, deleteAfter ASC`.
### CRUD & Entry-Point Requirements
- [ ] **Create:** attach to a turn.
- [ ] **Read:** in the conversation and on the record it was kept on.
- [ ] **Update:** "Keep it" on a let-go photo; Undo a keep.
- [ ] **Delete:** automatic after 24 h when let go; remove from a record.
### Success Criteria
- [ ] The person can send a screenshot of a quote and find it on the task or fact it changed, with the assistant saying it kept it.
- [ ] A sixth attachment is refused before upload; a let-go photo is gone from Storage after 24 h (fixed-clock check).
- [ ] `check:indexes` passes; each field added is used; no rules change (Storage and `media` exist); stated.
- [ ] Conventions: the media line in `security-privacy.md` re-read against the code.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 53: PDFs, Markdown files and voice notes in the conversation

**Prerequisites:** 52
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/apps/helm/media/pdfText.ts`, `functions/package.json` (PDF text dependency, licence checked), `functions/src/voice/transcribe.ts`, `functions/src/index.ts`, `functions/src/apps/helm/nomos/{buildContext,executeCommands}.ts` (Markdown kept as a note or a topic), `src/apps/helm/components/home/{Composer,MediaLine}.tsx` (record a voice note, file pick), `src/apps/helm/components/media/MediaViewer.tsx` (PDF pages, Markdown in `MarkdownText`), `src/apps/helm/utils/mediaCaps.ts`, `src/apps/helm/types.ts` (`pdf`, `voiceNote`, `markdown`, `text`), `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 20 ("Streaming, tokens and keys": voice notes), 23 ("Kinds and caps", "Markdown as knowledge"), 24; owner addition (round 6): Markdown files.
### Description
The person can also attach a PDF (up to 20 pages, 10 MB), a Markdown file (up to 20,000 characters) or a voice note (up to 5 minutes). A PDF is read from its text, or as pages when scanned; a Markdown file is read as text and may be kept as a note filed in topics, start a topic of its own (its words stay the person's, imported as version 1, then growing like any topic) or be attached to a record; a voice note is written out, and its words become the turn while the recording is let go unless the person keeps it, with the same 24-hour "Keep it" window as a photo.
### Possible Approach
1. `pdfText.ts` extracts the text layer (up to 12,000 characters to the model); no layer → a document block.
2. Markdown read as text inside the data delimiters (no vision path); `asNote` makes code write a note with the file text verbatim (`source: 'importedFile'`, `sourceMediaId`); `asTopic` also makes a topic whose version 1 (reason `imported`) is the file split at its headings into `person` sections citing the note.
3. `transcribeVoiceNote` opens the sealed note on the server, sends it to the pre-recorded endpoint, charges listening minutes; the audio is `discarded` by code unless Keep the recording is tapped.
### CRUD & Entry-Point Requirements
- [ ] **Create:** attach a PDF or Markdown file; record a voice note.
- [ ] **Read:** the PDF or Markdown in the viewer; the transcript as the turn.
- [ ] **Update:** keep a recording; keep a Markdown file as a note or a topic.
- [ ] **Delete:** as issue 52.
### Success Criteria
- [ ] The person can send a vet's PDF and see the visit filed, drop a packing-list `.md` and find it as a topic in Knowledge with its words intact, and leave a voice note that becomes a task.
- [ ] Caps refuse before upload (21 pages, 20,001 characters, a 6-minute note); a password-protected PDF says it couldn't be opened and the turn goes on.
- [ ] Markdown with HTML or a prompt-like line is read as data (fixture); the PDF dependency's licence is named in the PR.
- [ ] No rules change; each field added is used; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 54: Procedures: routines kept once, asked for by voice or text

**Prerequisites:** 45, 51
**Target PR Size:** ~400 lines (M)
**Files:** `functions/src/apps/helm/nomos/{commands,executeCommands,policy,summaries}.ts` (`createProcedure`, `reviseProcedure`), `functions/src/apps/helm/mcp/buildTools.ts` (`search_procedures`), `src/apps/helm/store/listeners/procedureListener.ts`, `src/apps/helm/store/actions/procedureActions.ts`, `src/apps/helm/components/procedures/{ProceduresView,ProcedureScreen}.tsx`, `src/apps/helm/components/knowledge/VersionsSheet.tsx` (reused), `src/apps/helm/utils/{procedureMarkdown,stepGroups}.ts`, `src/apps/helm/screen/views.ts`, `src/apps/helm/types.ts` (`Procedure`, `ProcedureVersion`), `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("Procedure"), 25; `PRODUCT.md` "Procedures".
### Description
"Make me a packing routine for work trips" makes a procedure: steps in optional groups, with Undo. The person edits it by hand or by asking; every change is a version; Copy gives Markdown. "Make this a routine" on a task with steps copies them into a new procedure.
### Possible Approach
1. `createProcedure` as an automatic `draft`; `reviseProcedure` as `reviseTopic` (only when asked, version checks, Undo restores as a new version).
2. Hand edits on the device with a version; groups ordered by one pure helper.
3. Rules: `procedures` and `procedures/{id}/versions/{n}` (no update).
### CRUD & Entry-Point Requirements
- [ ] **Create:** by turn, by hand, from a task's steps.
- [ ] **Read:** Procedures view → a procedure with its versions.
- [ ] **Update:** edit by hand or by asking; restore a version.
- [ ] **Delete:** confirm and Undo; runs keep their copied steps.
### Success Criteria
- [ ] The person can ask for a routine, change it by saying what to change, and copy it as a list.
- [ ] Rules proven for both paths; 60 steps cap holds.
- [ ] Each field added is used; seed has two procedures with versions. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 55: Runs: use a procedure for a trip, an event or a project

**Prerequisites:** 54
**Target PR Size:** ~350 lines plus the moved group component (M)
**Files:** `src/components/ChecklistGroup.tsx` (moved from Runway), `src/apps/runway/components/*` (import updated), `functions/src/apps/helm/nomos/{commands,executeCommands}.ts` (`startRun`), `src/apps/helm/store/listeners/runListener.ts`, `src/apps/helm/store/actions/runActions.ts`, `src/apps/helm/components/procedures/RunScreen.tsx`, `src/apps/helm/components/{projects/ProjectDetail,today/EventCard}.tsx` (runs shown), `src/apps/helm/types.ts` (`ProcedureRun`, `RunAttachment`), `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`, `CLAUDE.md` (Pattern index)
**Context:** `TECHNICAL.md` sections 2 ("ProcedureRun"), 25; `PRODUCT.md` "Procedures".
### Description
"Start packing for Lisbon" starts a run of the packing routine attached to the Waypoint trip; the person ticks steps by tap or voice ("done with the charger"), adds one just for this time, and can add it to the routine. A run keeps the steps it started with.
### Possible Approach
1. `startRun` copies the current steps; ticks are dotted-path updates (offline, no execution); `isExtra` steps; "Add to the procedure" writes a version.
2. A run on a synced event that leaves the calendar keeps its sealed label.
3. `ChecklistGroup` moved with Runway's import (logged decision).
### CRUD & Entry-Point Requirements
- [ ] **Create:** start a run by turn or from the procedure.
- [ ] **Read:** the run on its project, trip or event and on Today when its event is today.
- [ ] **Update:** tick, add an extra step, finish.
- [ ] **Delete:** delete a run with Undo.
### Success Criteria
- [ ] The person can run a routine for a trip, tick it by voice, and later see the procedure change without the finished run changing.
- [ ] Runway's grouped checklists look the same (before/after screenshots).
- [ ] Rules cover `procedureRuns`, proven; each field added is used; seed has an open and a finished run.
- [ ] Conventions: Pattern index line for `ChecklistGroup` moves to the shared set.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 56: How you write: style notes learned from what you type

**Prerequisites:** 41
**Target PR Size:** ~300 lines (M)
**Files:** `functions/src/apps/helm/learnHelmStyle.ts`, `functions/src/ai/models.ts` (`style` prompt), `functions/src/index.ts`, `src/apps/helm/queries/styleMutations.ts`, `src/apps/helm/store/listeners/styleListener.ts`, `src/apps/helm/components/howNomosSeesYou/StyleNotes.tsx`, `functions/src/apps/helm/nomos/prompt.ts` (style in free writing), `src/apps/helm/types.ts` (`StyleProfile`, `styleLearnedThroughAt`), `firestore.rules`, `scripts/helm/rulesMatrix.py`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("StyleProfile"), 26.
### Description
After every 25 typed turns, Helm learns a few notes about how the person writes ("Short sentences", "Signs off 'Cheers,'"), each saying how many examples it rests on. They show under "How {name} sees you", editable and removable, and shape the assistant's own free writing.
### Possible Approach
1. `learnHelmStyle` over the last 50 typed turns (never voice), quick model, ≤12 traits and ≤6 avoid lines with counts; merge keeps person-set traits.
2. Nothing written is stored besides the traits.
### CRUD & Entry-Point Requirements
- [ ] **Create:** learned automatically; add one by hand.
- [ ] **Read:** style notes with "Based on N examples".
- [ ] **Update:** edit (becomes person-set).
- [ ] **Delete:** remove with Undo.
### Success Criteria
- [ ] The person can see how Helm thinks they write, fix a note, and see a fixed note survive the next learning run.
- [ ] No sample text is stored (Firestore checked); counts against the quick route's limits.
- [ ] Rules cover `style`, proven; each field added is used. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 57: Style from your sent mail, if you switch it on

**Prerequisites:** 56, 28
**Target PR Size:** ~250 lines (S)
**Files:** `functions/src/apps/helm/learnHelmStyle.ts` (sent mail), `functions/src/connections/google/gmail.ts` (sent search), `src/apps/helm/components/howNomosSeesYou/StyleNotes.tsx` ("Learn from my sent mail"), `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 26 ("From sent mail"), 19 (Gmail, the tester gate).
### Description
With Gmail connected, "Learn from my sent mail" reads up to 300 sent messages from the last 6 months, once, and adds notes by occasion (work, personal) and for people already in Helm; nothing read is kept.
### Possible Approach
1. `in:sent newer_than:6m`, quoted replies and signatures stripped, each cut to 1,500 characters, batches of 50 to the quick model, merged with counts.
2. Behind the `google-mail-and-drive` gate.
### CRUD & Entry-Point Requirements
- [ ] **Create:** occasion and audience notes from mail.
### Success Criteria
- [ ] The person can switch it on and see notes for work email and for a person they write to often.
- [ ] No message text is stored or logged (checked); a person outside the gate doesn't see the row.
- [ ] No rules change; stated. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 58: The assistant's name and tone

**Prerequisites:** 27
**Target PR Size:** ~250 lines (S)
**Files:** `src/apps/helm/components/settings/AssistantNameToneSheet.tsx`, `src/apps/helm/hooks/useAssistantName.ts`, `src/apps/helm/constants.ts`, `functions/src/apps/helm/assistantName.ts`, `functions/src/apps/helm/nomos/prompt.ts`, `scripts/checks/serverCopies.ts`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` sections 2 ("HelmProfile"), 5 ("Name and tone"); `PRODUCT.md` "Your Assistant".
### Description
Settings → Your assistant: rename (1–16 characters, "Use the default name") and pick Composed, Warm, Brief or Formal with a fixed sample each. The name shows everywhere at once; tone shapes only answers, their spoken lines and a drafted procedure's intro, never the voice. Renaming also renames the wake phrase ("Hey {name}", issue 16) at once.
### Possible Approach
1. Same name pattern on device and server (`check:server-copies`); tone lines fill one prompt block.
### CRUD & Entry-Point Requirements
- [ ] **Read:** the Settings row shows "Nomos · Composed"; the dock's Talk control reads the name.
- [ ] **Update:** name and tone on the profile.
### Success Criteria
- [ ] The person can rename the assistant and pick its tone, and every screen uses the new name.
- [ ] A name that fails the pattern never reaches a prompt or the wake phrase reader; a rename never changes a stored line.
- [ ] No rules change; seed renames one fixture's assistant. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 59: Search

**Prerequisites:** 48, 54, 19
**Target PR Size:** ~300 lines (M)
**Files:** `src/apps/helm/components/search/SearchScreen.tsx`, `src/apps/helm/store/selectors.ts`, `src/apps/helm/queries/doneTaskQueries.ts`, `src/apps/helm/components/shell/HelmHeader.tsx`
**Context:** `TECHNICAL.md` section 12 ("Search"); `UX.md` H1.
### Description
One field over tasks (open and done), projects, who records, key dates and moments ("birthday", "June"; round 6e: dates that come back from the open index, moments read in pages of 500 for the session), places, facts, notes and topic documents, procedures, media captions and what connected apps shared (each with its source's logo), grouped by kind; mail and Drive are not searched here; nothing found says what was searched.
### Possible Approach
1. `toComparable` substrings over decrypted state; done tasks read once when Search opens.
### CRUD & Entry-Point Requirements
- [ ] **Read:** Search from the header and from the top of the Browse sheet; each result opens its record.
### Success Criteria
- [ ] The person can find anything they told Helm from one field.
- [ ] Nothing sealed leaves the device for a search; measured on the scale seed at 4× CPU.
- [ ] No rules change. Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 60: Capture with no connection, through the drop box

**Prerequisites:** 6
**Target PR Size:** ~300 lines (M)
**Files:** `functions/src/apps/helm/{dropBox,importHelmOutbox,getHelmKey}.ts`, `functions/src/index.ts`, `functions/README.md`, `src/apps/helm/utils/dropBox.ts`, `src/apps/helm/hooks/useCaptureOutbox.ts`, `src/apps/helm/queries/nomosMutations.ts`, `src/apps/helm/components/inbox/OutboxRow.tsx`, `src/apps/helm/components/home/Composer.tsx`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`, `docs/conventions/security-privacy.md`
**Context:** `TECHNICAL.md` sections 2 ("On the device"), 3 ("The drop box"), 13; `UX.md` O1, A7.
### Description
Opened with no connection on a browser that isn't trusted, Helm still takes a capture: sealed on the device to the person's drop-box key, shown as "Saved on this device", sorted once back online. Signing out with such captures asks first.
### Possible Approach
1. `getHelmKey` creates the P-256 pair and returns the public key.
2. `utils/dropBox.ts` (ECDH + HKDF + AES-GCM); `importHelmOutbox` creates only if absent.
3. The outbox and the public key are device secrets (`keepDeviceSecret(uid, 'helmOutbox' | 'helmDropBoxKey', …)`, PR #819), so the site's sign-out (`forgetDeviceSecretsFor`) already clears them; no new registry.
### CRUD & Entry-Point Requirements
- [ ] **Create:** a capture via the outbox, then a sealed capture.
- [ ] **Read:** the Inbox's "Saved on this device" rows.
- [ ] **Delete:** the envelope after import; sign-out clears it after asking.
### Success Criteria
- [ ] The person can capture with no signal on any browser and find it sorted once back online.
- [ ] Neither `localStorage` nor IndexedDB ever holds a capture's plain text; a repeated import creates nothing twice; plain HTTP and private windows say Helm needs a connection.
- [ ] `arrivedVia` written and shown; no rules change.
- [ ] Conventions: `security-privacy.md` "One device, several accounts" says an app's per-account leftovers are device secrets; the docs PR's drop-box line in `data-contracts.md` is re-read.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 61: Trust this browser: Helm opens offline

**Prerequisites:** 60
**Target PR Size:** ~200 lines (S)
**Files:** `src/apps/helm/hooks/useHelmKey.ts`, `src/apps/helm/queries/helmKeyQueries.ts`, `src/apps/helm/components/settings/DevicesSettings.tsx`, `src/apps/helm/components/OfflineAsOfLine.tsx`, `src/apps/helm/Helm.tsx`, `src/apps/helm/types.ts`, `scripts/seeds/helm.ts`
**Context:** `TECHNICAL.md` section 4; `security-privacy.md` "Data sealed with a server-held key offers Trust this browser"; Runway's use of `createTrustedKeyStore` and `TrustBrowserRow` (PR #819) is the reference; `UX.md` S1, O2.
### Description
Settings → Devices shows the site's "Trust this browser" switch for Helm. Turned on, Helm opens and reads with no connection, marked "As of 8:30 AM"; turned off, the copy here is forgotten at once. The person's other trusted browsers are listed with Remove. A browser that hasn't reached the server in 30 days stops opening offline and says "Connect once to keep opening Helm offline." Sign-out forgets it.
### Possible Approach
1. One `createTrustedKeyStore` over `getHelmKey` (server first, kept copy only offline); `isKeptKey` keeps a kept key from creating a profile, key or drop-box pair.
2. `TrustBrowserRow` with `appName` "Helm" in Settings → Devices; the "As of" line from the store's last check.
3. Nothing new is built: no callable, no rules, no shared component.
### CRUD & Entry-Point Requirements
- [ ] **Create:** the switch on keeps the key and adds this browser to the site's list.
- [ ] **Read:** Settings → Devices, the other trusted browsers.
- [ ] **Delete:** the switch off; Remove another browser; sign-out. Sign out everywhere: issue 62.
### Success Criteria
- [ ] The person can trust their phone's browser and open Helm with no signal, reading what was last loaded with its "As of" time.
- [ ] After 30 days without reaching the server it refuses to open offline (fixed clock), through the shared store's own limit.
- [ ] A kept key never creates anything (asserted); the key is never in `localStorage`, the query cache or a log; the switch is hidden on plain HTTP and in a private window.
- [ ] Offline open checked against a production-like build (the emulator uses a memory cache).
- [ ] No rules change (`trustedBrowsers` is the site's, unchanged); stated. Conventions: the docs PR's `data-contracts.md` exception re-read; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 62: Lost a phone? Sign out everywhere

**Prerequisites:** 61
**Target PR Size:** ~150 lines (S)
**Files:** `functions/src/auth/signOutEverywhere.ts` (new, shared), `functions/src/index.ts`, `functions/README.md`, `src/components/TrustBrowserRow.tsx` (optional `onSignOutEverywhere`), `src/lib/security/trustedBrowsers.ts` (the callable's wrapper), `src/apps/helm/components/settings/DevicesSettings.tsx`, `CLAUDE.md` (Pattern index line for `TrustBrowserRow` updated)
**Context:** `TECHNICAL.md` section 4 ("Sign out everywhere"); `UX.md` S10, S11.
### Description
Under the list of other trusted browsers, "Lost a phone? Sign out everywhere" ends every trusted browser and every session, and its confirm says plainly that it signs the person out of every app on the site, on every device, and that a phone that never comes online keeps what it showed until its 30 days run out.
### Possible Approach
1. Site callable `signOutEverywhere` (auth, App Check, no app words): deletes every `trustedBrowsers/{uid}/browsers` entry, then `revokeRefreshTokens(uid)`; the caller then signs out.
2. `TrustBrowserRow` shows the action only when `onSignOutEverywhere` is passed; Runway is unchanged.
3. No re-key (owner, round 3).
### CRUD & Entry-Point Requirements
- [ ] **Delete:** Sign out everywhere, online only.
### Success Criteria
- [ ] The person who lost a phone can sign out everywhere from any other browser and is told plainly what stays readable until it goes online.
- [ ] After it, another emulated browser is signed out within a token refresh and its kept key is forgotten; Runway's Trust this browser row renders exactly as before (before/after shot).
- [ ] No rules change (Admin SDK on the site's path); stated.
- [ ] Shared built: `signOutEverywhere`; the `TrustBrowserRow` prop. Conventions: `security-privacy.md` "Trust this browser" gains its Sign out everywhere sentence.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 63: Delete all my Helm data

**Prerequisites:** 20, 29, 62
**Target PR Size:** ~250 lines (S)
**Files:** `functions/src/auth/recentSignIn.ts` (moved from `functions/src/apps/runway/deleteRunwayPlan.ts`, shared), `functions/src/apps/runway/deleteRunwayPlan.ts`, `functions/src/apps/helm/deleteHelmData.ts`, `functions/src/index.ts`, `functions/README.md`, `src/apps/helm/components/settings/DeleteHelmData.tsx`, `src/apps/helm/store/actions/settingsActions.ts`, `src/apps/helm/hooks/useHelmSync.ts` (profile vanished)
**Context:** `TECHNICAL.md` section 12 ("Delete all my Helm data").
### Description
One action deletes everything, ends every connection Helm holds (revoking a Google account no other app uses) and deletes every synced copy; the confirm names the counts and that it can't be undone. Other open devices reopen to first run.
### Possible Approach
1. `endReaderGrants` for Helm first, then `recursiveDelete` of the user tree, the `apps/helm/media/{uid}/` Storage prefix and the person's `voiceUsage` days (round 6), then the server tree, wrapped key last; recent sign-in. The browser then calls the key store's `store.forget` and forgets the outbox device secrets.
### CRUD & Entry-Point Requirements
- [ ] **Delete:** Settings → Delete all my Helm data (key dates go with their who records).
### Success Criteria
- [ ] The person can delete all their Helm data in one action and every device reflects it.
- [ ] A rerun finishes; a second device drops its key when the profile vanishes; no Helm grant, synced copy, Storage object, voice usage day or unused Google token remains (emulator census).
- [ ] No rules change. Shared moved: `recentSignIn` (Runway's delete uses it, unchanged behaviour). Conventions: `cloud-functions.md`'s `recentSignIn` line re-read; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

### Issue 64: Scale seed and performance

**Prerequisites:** 49, 32, 55, 59, 44
**Target PR Size:** ~250 lines (S)
**Files:** `scripts/seeds/helmScale.ts`, `scripts/seed.ts`, `SEEDING.md`, fixes where measured
**Context:** `TECHNICAL.md` sections 15, 17; `docs/conventions/state-data.md` "Performance is a design check".
### Description
An oversized sealed fixture (600 tasks, 2,000 who records with 20,000 key dates, 4,000 of them dates that come back in one index and one who at 500 moments (round 6e), 2,000 facts, 300 notes in 40 topics three levels deep, each with its document, 30 procedures with 120 runs, 400 turns in 60 sessions, 200 media, 40 projects, 1,500 synced copies from four sources) and measurements: first open to home, decrypt time (the key-date index within 150 ms at 4× CPU), view switches at 4× CPU, a sealed thumbnail list's load, a capture's round trip, an hourly sync's duration and writes.
### Possible Approach
1. Measure, fix, record.
### Success Criteria
- [ ] The person's Helm stays quick at scale: numbers before and after in a `## Performance` section; any view switch over 300 ms fixed or explained.
- [ ] Conventions: none new; check made.
- [ ] **Release and validation**: the PR carries the repo's `patch` or `minor` label at the size the issue warrants, `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] **Docs current**: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and `.claude/rules/helm.md` still match what shipped.

## Next Steps

Bodies are filled in before each starts; titles and prerequisites are settled. Round 5's Next 57, 59 and 63 moved into the MVP (16, 51, 50), and this round's Beyond 95 (on-device recognition) moved to MVP 17; "Playbooks" (Beyond) is absorbed by procedures.

### Issue 65: Documents the assistant drafts: briefings, research notes, interview questions and plans
**Prerequisites:** 51. Drafted as topics whose sections cite their sources (`source: 'assistantDraft'`), refined by asking with versions; replaces round 5's artifacts and their threads.

### Issue 66: Export a topic's document to Google Docs
**Prerequisites:** 65, 20. Adds `drive.file` by incremental consent; export through a callable on the platform's token store.

### Issue 67: Put a planned task on Google Calendar, approved one by one
**Prerequisites:** 32, 81. The first outbound action: `calendar.events` scope, `executing` / `verificationRequired` states, an approvals queue.

### Issue 68: Preparation before an event
**Prerequisites:** 65, 55. A scheduled drafter leaves a procedure run or a briefing topic on Today; no push.

### Issue 69: Suggestions tuned by what you kept, declined or moved
**Prerequisites:** 31.

### Issue 70: Repeating tasks, and procedures run on a schedule
**Prerequisites:** 8, 55.

### Issue 71: Merge two who records, and Google Contacts kept in step
**Prerequisites:** 38. Merge keeps every link and fact with Undo; a synced Contacts category (mode `sync`) beside the MVP's pick-only one.

### Issue 72: Commitments
**Prerequisites:** 40.

### Issue 73: Scenarios
**Prerequisites:** 46.

### Issue 74: Research on request (`/research`)
**Prerequisites:** 65.

### Issue 75: Google Tasks kept in step
**Prerequisites:** 20. A Google Tasks connector on the platform (`tasks.readonly`), synced like Calendar.

### Issue 76: A weekly look back and ahead, on request
**Prerequisites:** 65.

### Issue 77: Knowledge found by meaning
**Prerequisites:** 49. `embedHelmNote` seals an embedding per note.

### Issue 78: Knowledge from a link, and many notes at once
**Prerequisites:** 48. A page read once and kept as a note with its link; import a folder of text files or a Google Docs folder.

### Issue 79: Procedures drafted from your knowledge
**Prerequisites:** 55, 49. The notes used are listed as the procedure's sources.

### Issue 80: Topics inside topics, and suggested topics
**Prerequisites:** 48.

### Issue 81: Change things in another app, with that app's own permission
**Prerequisites:** 26. The contract gains `capabilities.write` per category and a write grant the person gives per app ("add milk to my Pinch list" made in Pinch), each write an Execution with Undo where the source allows it; read grants never imply write.

### Issue 82: The same grants from every app's side: another reader, and Stop sharing in each source
**Prerequisites:** 19, 26. A second reader (Waypoint reading Pinch's meals, say) registers a sink and a grant page in `READER_APPS`; no platform change. Each source app's settings gain a "Stop sharing" list on the shared `ConnectedSourcesList`, filtered to grants where it is the source (`useConnections` by `sourceAppId`): who reads it, which categories, and a stop that calls the platform's `endConnection` with the copies deleted, exactly as the account page's index does (PRODUCT "Disconnect and Delete"). No new callable or rule: `connections/{uid}/grants` is already owner-read and callable-written. About 250 lines (S) for the list across the seven source apps' settings.

### Issue 83: Drafting in your style
**Prerequisites:** 57. Messages and replies drafted from the style profiles by person and occasion, for the person to copy; nothing sent.

### Issue 84: Video in the conversation
**Prerequisites:** 53. `MediaKind` gains `video`; a frame sampler before the model; same sealing, caps and deletion.

### Issue 85: App cards in the conversation and on records
**Prerequisites:** 33. A `card` on an answer source or synced record drawn from the source app's manifest (a Pinch recipe, a Waypoint trip), with the default line as fallback (TECHNICAL.md section 27).

### Issue 86: Spoken replies sentence by sentence
**Prerequisites:** 15. Stream the model's spoken text into `streamSpeech` as it arrives, so long answers start sooner.

### Issue 87: A choice of voices for the assistant
**Prerequisites:** 15. More `VoiceIdentity` entries per provider and a picker; no code change in the router.

### Issue 88: Groups and households as who records
**Prerequisites:** 45. New `who.kind` values with member links.

### Issue 89: Milestones: a life timeline
**Prerequisites:** 41, 44. A timeline for the person and for each of their people over the moments every who already keeps (round 6e: one who's from its page's read; the whole life from a sealed moment index, one document per decade, built once from every moment and kept in step by each moment write from then on), facts' `occurredOn`, media's `takenAt` and a `lifeEvents` collection for what isn't one who's key date (TECHNICAL.md section 27).

### Issue 90: Browse ordered by how you use it
**Prerequisites:** 1. Tiles keep their declared importance and the cap on big tiles; inside each size, tiles are ordered by how often the person opens each view, counted on the device only (TECHNICAL.md section 27).

## Beyond

### Issue 91: Information service: a digest of what matters
**Prerequisites:** 77.

### Issue 92: Gmail: commitments and dates from mail, replies drafted for approval
**Prerequisites:** 67, 72, 81, 83.

### Issue 93: Acting without asking (levels 3–4), per kind of action
**Prerequisites:** 67.

### Issue 94: A choice of AI provider
**Prerequisites:** 5. Gemini (or another) as a second `ModelProvider` implementing the tool loop.

### Issue 95: Change my key
**Prerequisites:** 62. Reseals every document under a new data key, so a key taken from a lost phone can't open anything written afterwards (owner, round 3: not in the MVP). PR #819's store already forgets a kept key the server no longer returns, so the work is the reseal itself, and it would serve every app on `createTrustedKeyStore`, not only Helm.

### Issue 96: Helm in Claude.ai: Helm's MCP server as a remote connector
**Prerequisites:** 29. The in-process server served over HTTP with MCP's OAuth against the site's identity, so the person can ask Claude.ai about their Helm; same tools, same per-request closure, read only.

### Issue 97: An app on its own domain keeps sharing
**Prerequisites:** 26. `HttpSourceClient` and `/connections/v1` with a site-signed, grant-scoped token, built when the first app graduates.

### Issue 98: A browser extension and other ways to reach the assistant
**Prerequisites:** 97, 9. Calls the same callables with `medium` and a versioned screen context (`v: 2`: page URL, selected text); a share target posts media through the same flow (TECHNICAL.md section 27).

### Issue 99: Orders from the places you buy
**Prerequisites:** 28. A connected category of kind `order`, from mail or a store connector.

### Issue 100: Apple: contacts, and Sign in with Apple across the site
**Prerequisites:** 38. Site-wide work: an auth provider and a contacts connector.
