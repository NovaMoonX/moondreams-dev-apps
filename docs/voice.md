# How voice works

How any app on the site listens to a person and talks back. Listening and speaking are two separate jobs with their own options, so each has its own section. The code is `src/lib/speech/` and the hooks in `src/hooks/`; none of it names an app's words (`check:pinch-voice` fails if it does). The apps that use each option are listed at the very end, only as a reference.

## Listening: three ways to turn speech into text

| Way | What it is | Needs | Costs | Where the audio goes |
|---|---|---|---|---|
| **Cloud** | Deepgram, streamed live | Online, a saved `DEEPGRAM_API_KEY`, under the allowance | Paid, capped | The browser streams to Deepgram with a one-minute token |
| **On-device model** | sherpa-onnx, a small streaming English model run in a Web Worker | The person downloads it once (about 57 MB) | Free | Nowhere. It never leaves the phone. |
| **Browser recognition** | The browser's own Web Speech API | A browser that has one | Free | Chrome sends it to Google. Firefox has none. |

Waiting for a wake phrase ("Hey" plus the assistant's name) is never done by the cloud: the on-device model if it's downloaded, else the browser's. No audio goes to the cloud before the phrase or a tap.

### Which way listens (apps that offer all three)

Picked fresh for every turn by `voiceRouter.ts`:

1. **Cloud**, if the person is online, their mode allows it, they are under today's allowance, and the cloud token arrives within 1.5 seconds.
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

**Streaming playback.** The server streams the provider's audio as it is made. `cloudTts` waits for the first byte (2.5 seconds), then times the gaps between chunks; `pcmStream.ts` schedules each chunk on the shared `AudioContext` with a 200 ms prebuffer, so a reply starts speaking before it is fully made, and the speaking state begins at the first sound, not at the request. Waits are bounded by the clock, never only by the end of playback.

**The speech source's voice.** `createSpeechSource` sends the app's `voiceId` and `speed` (from its `readVoice`, or per call) with each request. The server checks the voice against the app's allowed names (otherwise its default) and the speed against 0.8 to 1.2 (otherwise 1), so a bad value never fails a reply.

### Which way speaks

- **A confirmation** (priority `ack`, such as "Got it, moved to Friday"): the device, always, so it starts at once and costs nothing. The natural voice if downloaded, else the system voice.
- **A reply or a long summary:** the cloud voice when online and under the allowance, otherwise the device.
- **A slow cloud voice** (no first byte in 2.5 seconds), a gap between chunks that runs too long before any sound, or a provider error: that reply is spoken on the device. Once sound has played, it never switches part-way.
- **The voice is latched per conversation.** The first cloud line fixes the voice and speed for the conversation. Once a line falls back to the device, the rest of that conversation stays on the device voice (no flip-flopping between two voices). An end phrase, a stop, the idle gap or a newly picked voice or speed ends the conversation and clears both, so a pick is heard on the very next line.
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
- **Conversation voice:** say anything to an assistant that answers. `useVoiceConversation` runs the router, the playback queue and the follow-up window; the app supplies its end phrases, identity and what an utterance becomes.

Both stand on the same base: `createSpeechListener` (browser recognition), `listeningMode` (closed, waiting for a phrase, a command window, kept open, and their clocks), `readWakePhrase` and `readAloud`. Conversation voice adds the router, the cloud, the on-device model and the queue.

### One conversation turn

1. The person taps the mic or says the wake phrase.
2. The microphone opens with echo cancellation and noise suppression.
3. Words appear as they are heard.
4. The turn ends on a tap, an end phrase such as "that's all", or 8 seconds of quiet.
5. The text goes to the assistant like a typed message.
6. A confirmation is spoken as soon as the work is filed, then the answer.
7. An 8-second follow-up window lets the person reply without tapping again.

Talking over a reply stops it and starts a new turn (barge-in). A fixed phrase such as "undo that" is matched on the device and never goes to the assistant. So is a closing phrase (`readClosingPhrase` over `CLOSING_PHRASES`: "never mind", "forget it", "that's all", "thanks"): it ends the conversation, plays the quiet `close` cue once and releases the microphone, and an app supplies only extra words such as the assistant's name, never its own list. Mute lasts for the sitting only. A confirmation and a reply never overlap, and a newer turn cuts the older one's audio.

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
- **Cloud listening** goes straight from the browser to the provider with a one-minute token that `mintVoiceToken` mints on the server after checking the allowance.
- **Cloud speaking** goes through the site (`streamSpeech`), which checks sign-in and the allowance, then pipes the provider's audio back.
- **Voice notes** are transcribed on the server from the sealed file, which is never stored unsealed.

## When something fails

- **No token in 1.5 seconds, a socket that fails, or a spent allowance:** that turn listens on the device.
- **A model that can't start on the phone:** its own sentence ("Couldn't start listening on this phone"), never a silent "nothing heard".
- **A refused microphone:** stays blocked until the permission changes, which is watched, so allowing it in the browser's settings clears the notice without a reload. The notice is `MicrophoneAccess`: an Allow microphone button that asks properly and, once the browser refuses, Try again and the steps for the device it runs on behind one tap. It is never asked before a speech start: an iPhone lets recognition start only straight from the tap, so a request awaited first would break every start there.
- **The browser's speech service is off** (`service`, Siri or Dictation off on an iPhone): it says the browser can't listen, never that the microphone is blocked, since allowing the microphone would not help.

## Not yet confirmed

Provider prices and ids, how an open stream behaves when its token ends, the offline model's speed and memory on mid-range phones, and iOS Safari's microphone during playback are listed as unverified in Helm's `TECHNICAL.md` section 20. Check there before relying on them.

## Reference: which apps use what

A snapshot of the code, written to find the source. It does not define the process: the sections above and the code do. If this table disagrees with the code, the code wins and this table is stale.

| App | Listening | Speaking |
|---|---|---|
| Helm | Cloud, on-device model, browser (conversation voice) | Cloud voice (a chosen voice and speed), system voice (no natural-voice choice offered) |
| Pinch (cooking mode) | Browser (command voice) | Natural voice if the person turned it on, else system voice |

Where each is wired: Helm in `src/apps/helm/hooks/useHelmVoice.ts` and `components/voice/VoiceSettings.tsx`; Pinch in `src/apps/pinch/hooks/useCookVoice.ts`. Helm's build log is `src/apps/helm/TECHNICAL.md` section 20.
