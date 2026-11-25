# How voice works

How any app on the site listens to a person and talks back. Listening and speaking are two separate jobs with their own options, so each has its own section. The code is `src/lib/speech/` and the hooks in `src/hooks/`; none of it names an app's words (`check:pinch-voice` fails if it does). The apps that use each option are listed at the very end, only as a reference.

## Listening: three ways to turn speech into text

| Way | What it is | Needs | Costs | Where the audio goes |
|---|---|---|---|---|
| **Cloud** | Deepgram, streamed live | Online, a saved `DEEPGRAM_API_KEY`, under the allowance | Paid, capped | The browser streams to Deepgram with a one-minute token |
| **On-device model** | sherpa-onnx, a small streaming English model run in a Web Worker | The person downloads it once (about 57 MB) | Free | Nowhere. It never leaves the phone. |
| **Browser recognition** | The browser's own Web Speech API | A browser that has one | Free | Chrome sends it to Google. Firefox has none. |

Waiting for a wake phrase ("Hey" plus the assistant's name, or a name that sounds like it) is never done by the cloud: the on-device model if it's downloaded, else the browser's. No audio goes to the cloud before the phrase or a tap.

### Which way listens (apps that offer all three)

Picked fresh for every turn by `voiceRouter.ts`:

1. **Cloud**, if the person is online, their mode allows it, they are under today's allowance, and the cloud token arrives within 6 seconds (what is said meanwhile is kept).
2. Otherwise the **on-device model**, if it is downloaded.
3. Otherwise **browser recognition**.

An app that doesn't use the router always uses browser recognition.

## Speaking: three ways to turn text into sound

| Way | What it is | Needs | Costs |
|---|---|---|---|
| **Cloud voice** | A server-chosen provider (Google Chirp 3 HD by default), streamed through the site's `streamSpeech` as raw 16-bit PCM (`audio/L16; rate=24000; channels=1`) and played as it arrives | Online, under the allowance | Paid, capped |
| **Natural voice** | Piper, a nicer voice that runs on the device | The person downloads it once (about 90 MB) | Free |
| **System voice** | The browser's `speechSynthesis` | Nothing | Free |

Every text goes through `toSpokenText` first ("1/2 tsp" becomes "half a teaspoon").

**Streaming playback.** The server streams the provider's audio as it is made. `cloudTts` waits for the first byte (6 seconds for a conversation's first line, 5 after that: sign-in, App Check, a cold function and the first sound), then times the gaps between chunks; `pcmStream.ts` schedules each chunk on the shared `AudioContext` with a 200 ms prebuffer, so a reply starts speaking before it is fully made, and the speaking state begins at the first sound, not at the request. Before a line, `wakeAudioOutput` starts an inaudible looping hiss if none is playing and holds the first sound back until 2.5 s after it began, because phone speakers and Bluetooth headphones drop the start of the sound that wakes them and no browser says when they are awake. The hiss keeps them awake for a minute after each line, so only a first line after a quiet minute waits. The wake starts when the line is asked for, so a line that waits on a request spends that time already. **Warm-up:** while a screen with the cloud voice or cloud listening is open and visible, `useVoiceConversation` sends `{ warm: true }` to the speech endpoint and to `mintVoiceToken` on arrival and every 10 minutes. Each starts its server and checks sign-in and App Check, and nothing is spoken, minted or counted. Without it, the first line after the server sat idle took longer than the 6 s first-byte limit and fell back to the device voice. Waits are bounded by the clock, never only by the end of playback.

**The speech source's voice.** `createSpeechSource` sends the app's `voiceId` and `speed` (from its `readVoice`, or per call) with each request. The server checks the voice against the app's allowed names (otherwise its default) and the speed against 0.8 to 1.2 (otherwise 1), so a bad value never fails a reply.

### Which way speaks

- **A confirmation** (priority `ack`, such as "Got it, moved to Friday"): the device, always, so it starts at once and costs nothing. The natural voice if downloaded, else the system voice.
- **A reply or a long summary:** the cloud voice when online and under the allowance, otherwise the device.
- **A slow cloud voice** (no first byte in time, a buffered answer that takes longer than 6 seconds plus 30 ms a character, a gap between chunks that runs too long before any sound), or a provider error: that reply is spoken on the device. Once sound has played, it never switches part-way.
- **A long reply** (over 600 characters) is cut at sentence ends into pieces, each spoken by the cloud in order; if one fails before it makes a sound, it and the rest go to the device voice.
- **The chosen voice is held.** The first cloud line fixes the voice and speed for the conversation. A line that goes to the device for a passing reason (offline for a moment, the sign-in not ready) is only that line. Two cloud lines in a row that fall back (or whose piece stalls or breaks after it sounded) make the rest of that conversation the device voice (no flip-flopping between two voices); a cloud line that plays resets the count. Starting or ending a live conversation, an end phrase, a stop, the idle gap or a newly picked voice or speed clears the latch, so a pick is heard on the very next line.
- **Which voice spoke is known.** `useVoiceConversation` exposes `speakingVoice` (`chosen`, `device`, or null): `device` when the app's cloud voice is on and a device voice spoke a reply (offline, a fallback, the latch); a confirmation never counts, since it is the device's by design. An app says so in one quiet line only then.
- **The system voice** speaks a sentence or two at a time (Chrome stops a single utterance after about 15 seconds) and a line isn't over while the browser still says it is speaking, unless it has gone silent for longer than its current sentence would take at a slow pace plus 5 seconds.
- **The text follows the voice.** Each adapter can report how far through the line it is (`onProgress`: the cloud from its audio clock, the natural voice from each sentence's timing, the system voice from sentence starts and word boundaries); the queue keeps it forward-only and estimates it from the text's length for a voice that reports nothing. `useVoiceConversation` exposes it as `lineProgress` (`get` and `subscribe`, never state) for a screen that scrolls with the line.
- **A sample outside a conversation** (a voice picker's play button) is `playSpeechSample`: one line in the cloud voice, never the device voice, reporting played, stopped or failed.
- **Apps that don't use the router** read aloud with `readAloud`: the natural voice when it is ready, else the system voice.

## Every environment, side by side

| Situation | Hears you | Speaks to you |
|---|---|---|
| Online, within limits | Cloud | Confirmations on the device, replies from the cloud |
| Online, today's allowance spent | On-device model if downloaded, else browser, with one quiet line | Device |
| Online, no `DEEPGRAM_API_KEY` saved | On-device model if downloaded, else browser. Nothing fails. | Device |
| Offline, on-device model downloaded | On-device model | Device |
| Offline, no model downloaded | Only the browser, and only if it works offline. Otherwise the app says talking needs a connection and points to the download. Typing still works. | Device |
| This phone can't run the model | The browser's recognition. The model's row says why and offers no button. | Device |

**A limit never blocks the person.** The router answers "device" and one quiet line appears.

## Two ways an app can use listening

- **Command voice:** say one of a fixed set of phrases and the screen does it ("next step", "start a timer"). `useSpeechCommands` owns the recognizer, its wake window and its restarts; the app supplies the phrases.
- **Conversation voice:** say anything to an assistant that answers. `useVoiceConversation` runs the router, the playback queue, the follow-up window and, when the app asks, a live conversation (`startLive`: it listens again after every reply until an end phrase, `endLive` or a quiet spell, with a microphone mute of its own); the app supplies its end phrases, identity and what an utterance becomes.

Both stand on the same base: `createSpeechListener` (browser recognition), `listeningMode` (closed, waiting for a phrase, a command window, kept open, and their clocks), `readWakePhrase` (which also takes loose names: after "Hey", one or two words that `soundsLike` the name wake it) and `readAloud`. Conversation voice adds the router, the cloud, the on-device model and the queue. A recognizer is reused between listens, so an option set on it (the name hints in `phrases`) stays until replaced: every start sets it, to an empty list when the feature is off or the browser refused it, and a refusal counts as a failed start so a browser that keeps refusing stops instead of restarting forever (`speechListener` check).

### One conversation turn

1. The person taps the mic or says the wake phrase. The phrase does not send anything: the listener that heard it (the browser's, kept running, or the on-device model's open microphone, handed over with the rest of that breath as its first words) carries on as the turn's listener, so what follows the phrase is part of the turn like any other.
2. The microphone opens with echo cancellation and noise suppression, and the device cleans background noise out of it with RNNoise before the speech gate, the cloud and the on-device model hear it (the browser's own recognition hears the raw stream; a device-local switch turns the cleaning off).
3. Words appear as they are heard.
4. The turn ends on a tap, an end phrase such as "that's all" (held 0.9 s so "that's all I need" keeps going), or a pause after the words stop changing: 2.4 seconds, 3.6 seconds when the words end on a connector, a filler or a comma (`readTurnEndDelay`), and 8 seconds only while nothing has been heard. Nothing listens while the assistant works on a turn, so words said then are lost. Empty or repeated partials never restart the wait, and an error mid-turn sends the words heard so far.
5. The text goes to the assistant like a typed message.
6. A confirmation is spoken as soon as the work is filed, then the answer.
7. An 8-second follow-up window lets the person reply without tapping again. In a live conversation it reopens after every reply instead, for as long as the conversation lasts. Every way a live conversation ends (an end phrase, the quiet limit, repeated failures) is checked on every path that would listen again, and the quiet limit is also checked on a timer, so no state (muted, waiting on a reply, a failed reopen) holds the microphone open: two minutes by default, 15 seconds when a wake phrase opened it and nothing has been said, five minutes with the microphone off.

Talking over a reply starts a new turn (barge-in), but only once it is sure: the microphone opens only over sound that goes through the page's audio (the cloud voice and the natural voice, never the system voice, which echo cancellation can't hear, so it is not opened over a line that fell back to it), a listen over a line that came to nothing shuts it for 6 seconds, or until the next line starts, the gate is strict, the playing line ducks (the cloud voice only; the natural and system voices cannot) while a hidden listen must hear at least two words that are not the line's own within 1.5 seconds (the line's own words are its written text and its spoken form, `toSpokenText`, since the echo is what was played: "350°F" comes back as "350 degrees Fahrenheit"; numbers never count), and then the line stops and the listen carries on; otherwise the listen is dropped silently and the line returns to full volume. A fixed phrase such as "undo that" or "say that again" is matched on the device and never goes to the assistant as a turn. So is a closing phrase (`readClosingPhrase` over `CLOSING_PHRASES`: "never mind", "forget it", "that's all", "thanks"): it ends the conversation, lets go of the open questions the way a dismiss does, plays the quiet `close` cue once and releases the microphone, and an app supplies only extra words such as the assistant's name (with its spelling variants), never its own list. **Every voice command accepts loose, natural phrasing on the device** (leading fillers and politeness, several wordings: `isRepeatRequest` in `@/lib/speech/repeatRequest` is the reference, and it never fires on a sentence that merely contains the words), **and what the phone's matching cannot place goes to the assistant to decide**, which may answer with an outcome that leaves no turn behind (a repeat deletes its own turn on the server and the device replays the last line; the cloud audio is cached per voice and text, so a replay makes no new request, and nothing enters the history). Never make the person say an exact phrase. Capture setup that loads files lazily (the noise-cleaning model) is capped in time and a failure is remembered for the page's life, so a listen never hangs on it and never retries a path that already failed. A line that answers something the person said earlier (`joinsLine`) waits for a line already playing instead of cutting it. A line replayed from a tap (a speaker button) goes through the conversation's `repeat(text)`, at its current turn, never a fresh `Date.now()` turn key, which would cancel a reply still on its way; a replay says why when the microphone is muted or there is nothing to repeat, and a listen in progress is dropped unsent and reopens after the line, and a per-line replay control sits on the newest reply only. Mute lasts for the sitting only. A confirmation and a reply never overlap, and a newer turn cuts the older one's audio.

### Every listen keeps its first words

Audio said after a tap, or after a listen opens, always reaches a recognizer that can use it, except through the browser's own recognition, which takes no audio of its own and listens only from its start (so its "Getting ready" line stays until Chrome reports it has started).

- **The microphone opens first and buffers.** The on-device listen captures at once and holds up to 15 seconds while the model loads, then feeds the held audio before the live audio; a stop while it loads waits for the model and transcribes what was held. A model that fails to load releases the microphone. A cold model therefore costs a delay, never words: it is started ahead of time only where it will be the listener (the wake phrase, or no cloud), and a cloud listen that falls back loads it then.
- **A no-speech timer never runs while a recognizer is still loading.** "Listening" may show as soon as audio is captured (`onListening`), but the quiet timer that ends a listen with nothing heard starts only when a recognizer is open on the audio (`onReady`): at the listen's start for the cloud, and when Chrome reports it has started for the browser's recognition. A fallback that starts clears whatever timer the failed listener had armed.
- **A cloud listen that gives up hands over what it heard.** A slow or failed token, a socket that doesn't open, or a capture that never starts passes the frames so far, and the still-open microphone, to the on-device model, which hears them first and then the live audio. A listen the person had already ended (they tapped send while the token was slow) falls back with its audio and is transcribed on the device; only with no model on the device is it empty, with the cause recorded. The browser's recognition can't take audio, so there the microphone is released as before.
- **An open socket that closes unexpectedly hands its audio over too.** The stream remembers the last 10 seconds it sent; a close it did not ask for (not the `CloseStream` it sends on stop) falls back like a failed start, with those frames, the live audio relayed and the close code recorded. A drop after the person pressed stop hands over the same way (only the stream's normal close delivers its words). **A replay starts at the end of the last finished phrase, so carried text and replayed audio meet without a gap or overlap:** when that phrase ends inside the remembered audio, all finished phrases are carried and only the audio after it replays; when it ends before the window (a long unfinished stretch), the whole window replays. **A fallback that replays audio carries the earlier recognizer's text only up to where the replay starts, so no word is lost or repeated:** the cloud's finished phrases that end (start plus duration) at or before the replay window go in front of what the fallback hears as a prefix; a listener that cannot replay audio (the browser's) gets everything the cloud had heard. Waiting audio is held for up to 15 seconds (the 6 s token wait, the 3 s socket wait and a second of pre-roll, with margin).
- **A gate keeps a pre-roll sized to what is in it.** The follow-up gate keeps a second of audio from before it opens (`preRollMs` 1000), and the wake listener on the device keeps the last 600 ms for the turn it hands over, so the first word of a follow-up or of what comes straight after a phrase is not cut. A gate that opens while the assistant speaks (barge-in) keeps only 300 ms, since earlier audio is the assistant's own voice.
- **No capture step delays the first frame.** The noise cleaner is fetched when listening becomes possible (`preloadNoiseCleaning`); a listen that opens before it is loaded is captured raw and the next one gets it, and cleaning the person chose that isn't applied is a reported fallback (`NOISE_CLEANING_FALLBACK_KEY`), cleared once it is. Only a failure inside a capture turns the cleaner off for the page's life; a preload that fails or is slow is recorded and tried again, and turning the cleaning off clears the report.
- **The listening line shows only once audio is captured** (the microphone is capturing on the device route, Chrome has started on the browser route).

## The allowances

- **Cloud listening:** 60 minutes a day for each person, and 300 cloud tokens a day.
- **Cloud speaking:** 30,000 characters a day for each person.
- **The whole site:** a $5 a day cap across everyone.

Past any of them, that turn uses the device. The numbers live in `functions/src/voice/` and are checked on the server.

## Downloading a model

Both downloads work the same way: an opt-in row in the app's voice settings that states the real size first, checks the phone can run it and says why if not, offers Cancel, and keeps the files in the browser's Cache Storage.

- **Where they live:** one shared cache per browser for each model (`on-device-asr-zipformer-en-20m-v1` for listening, `natural-voice-v1` for speaking), so a download is made once and any app that uses the model finds it.
- **The choice is per app:** each app saves its own on/off in local storage, so a person enables each model in each app that offers it.
- **Integrity:** each listening file is checked by size and SHA-256. A mismatch, cancel or failure deletes everything, so nothing half-done is kept.
- **Not pre-downloaded:** the service worker leaves the files out, so nobody gets them without asking.
- **Remove** deletes the shared cache, for every app on that browser, with an Undo.
- **Per browser, not per account:** a second browser or phone downloads again, and clearing site data removes it.

## Keys and privacy

- **No provider key ever reaches a browser.**
- **Cloud listening** goes straight from the browser to the provider with a one-minute token that `mintVoiceToken` mints on the server after checking the allowance. An app picks its model in `VOICE_APPS` (`sttModel`): Helm listens with Nova-3, which ends a turn on quiet; Pinch with Flux (`flux-general-en`, Deepgram's `/v2/listen`), which judges from the words and the pause whether the person has finished, so a cook who stops mid-sentence to stir isn't cut off. The adapter reads Flux's `TurnInfo` events and calls `onEndOfTurn`; `useVoiceConversation` then ends the listen at once and keeps its own quiet timer only as a 6 s guard. An app with a gate in `VOICE_APPS` (`gate`) gets tokens and cloud speech only for people the gate lets in, and a voice that fails before its first sound tries the app's `fallbackVoices` in order (Pinch: Zephyr, then Aoede, Erinome, Autonoe), reporting which spoke in `X-Voice-Name`.
- **A spoken assistant's turn** streams back as server-sent events from the app's endpoint (`pepperTurn`, over the shared `functions/src/assistant/streamTurn.ts`): `streamAssistantTurn` (`src/lib/speech/assistant/`) reads them as they arrive and `createSentenceFeed` hands each finished sentence to `speak` with the turn's key, the first as soon as it ends and later ones joined to a natural length, so the first sentence plays while the rest is still being written. Why, what else was weighed and when to revisit: [docs/decisions/2026-11-25-spoken-assistant-turns.md](decisions/2026-11-25-spoken-assistant-turns.md).
- **Cloud speaking** goes through the site (`streamSpeech`), which checks sign-in and the allowance, then pipes the provider's audio back.
- **Voice notes** are transcribed on the server from the sealed file, which is never stored unsealed.

## When something fails

- **No token in 6 seconds, a socket that fails, or a spent allowance:** that turn listens on the device.
- **A model that can't start on the phone:** its own sentence ("Couldn't start listening on this phone"), never a silent "nothing heard".
- **A refused microphone:** stays blocked until the permission changes, which is watched, so allowing it in the browser's settings clears the notice without a reload. The notice is `MicrophoneAccess`: an Allow microphone button that asks properly and, once the browser refuses, Try again and the steps for the device it runs on behind one tap. It is never asked before a speech start: an iPhone lets recognition start only straight from the tap, so a request awaited first would break every start there. An installed app on Android can refuse recognition at once while the permission still reads "prompt", so a refusal is remembered on the device until the permission reads granted, Listening shows only once the browser starts (or after 400 ms) until the microphone is known to be allowed, and every listener checks `needsMicrophoneAsk` before starting: the tap then shows the notice where it was made rather than a flash of listening. Listed debug emails see what went wrong under the notice (`SpeechDebugDetails`), with Copy.
- **The browser's speech service is off** (`service`, Siri or Dictation off on an iPhone): it says the browser can't listen, never that the microphone is blocked, since allowing the microphone would not help.

- **Every fallback is reported.** Anything that stands in for what was chosen (a cloud line spoken by the device, the device-voice latch, a cloud listen that fell to the device, the downloaded model that wouldn't start or was missing files, a natural voice that wasn't ready) calls `reportFallback` (`@/lib/fallbacks/fallbacks`) with a required `cause` (the step that failed and the raw error: a thrown error's code and message, an HTTP status, a close code, the limit that ran out; a cloud listen's stages are `CLOUD_LISTEN_STAGES`, and `voiceToken` keeps a mint failure's code and a server's stated why instead of a bare "unavailable") and `clearFallback` once the chosen route works again (`removeFallback` when the person removes or turns off the preferred route). The site's `FallbackNotices` shows them to debug viewers (local builds, the admin, listed debug emails) as a left-edge tab that opens one sheet with Copy all; nobody else sees it.

## Not yet confirmed

Provider prices and ids, how an open stream behaves when its token ends, the offline model's speed and memory on mid-range phones, and iOS Safari's microphone during playback are listed as unverified in Helm's `TECHNICAL.md` section 20. Check there before relying on them.

## Reference: which apps use what

A snapshot of the code, written to find the source. It does not define the process: the sections above and the code do. If this table disagrees with the code, the code wins and this table is stale.

| App | Listening | Speaking |
|---|---|---|
| Helm | Cloud, on-device model, browser (conversation voice) | Cloud voice (a chosen voice and speed), system voice (no natural-voice choice offered) |
| Pinch (cooking mode) | Browser (command voice) | Natural voice if the person turned it on, else system voice |

Where each is wired: Helm in `src/apps/helm/hooks/useHelmVoice.ts` and `components/voice/VoiceSettings.tsx`; Pinch in `src/apps/pinch/hooks/useCookVoice.ts`. Helm's build log is `src/apps/helm/TECHNICAL.md` section 20.
