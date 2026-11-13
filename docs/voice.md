# How voice works

How an app listens to a person and talks back, for every app on the site. The code is `src/lib/speech/` and the hooks in `src/hooks/`; none of it names an app's words (`check:pinch-voice` fails if it does). Each app supplies its own phrases, wake name and voice. The build log and numbers for the conversation shape are in Helm's `TECHNICAL.md` section 20.

## One base, two shapes

Every app that uses voice stands on the same base:

- **The browser's recognition**, wrapped once as `createSpeechListener` (`useSpeechCommands.ts`).
- **The listening machine** `listeningMode.ts`: closed, waiting for a wake phrase, a command window, or kept open, and its clocks.
- **The wake phrase reader** `readWakePhrase`: a wake phrase at the start of what was heard.
- **Reading aloud** `readAloud`: the natural voice when it is downloaded, the system voice otherwise. Every text goes through `toSpokenText` first ("1/2 tsp" becomes "half a teaspoon").
- **The opt-in natural voice** `useNaturalVoice` with `NaturalVoiceOption`.

On top of that base there are two shapes. Which one an app uses depends on the job.

| | **Command voice** | **Conversation voice** |
|---|---|---|
| The job | Say one of a fixed set of phrases and the screen does it ("next step", "start a timer") | Say anything, in your own words, to an assistant that answers |
| Hook | `useSpeechCommands` | `useVoiceConversation` |
| Who listens | The browser's recognition | Picked for each turn by a router: cloud, on-device model or browser |
| Who speaks | `readAloud` | A router and a playback queue: cloud voice or device voice |
| Works offline | Only where the browser itself can | Yes, once the person downloads the on-device model |
| Used by | Pinch's cooking mode | Helm |

**This is deliberate layering, not two copies.** Conversation voice's browser listener is the same `createSpeechListener` command voice uses, and both read aloud through the same `readAloud`. What conversation voice adds is a router, the cloud, the offline model and a playback queue.

**What command voice does not have today:** the router, the cloud and the offline model. A kitchen with weak Wi-Fi therefore hears the cook only as well as the browser's own recognition can. Whether to give command voice the offline model is an open question for the owner, not something already decided.

## Conversation voice: three layers that never know about each other

1. **Listening** turns sound into text.
2. **Reasoning** is the assistant. It only ever sees text in and text out.
3. **Speaking** turns text into sound.

Because they are separate, a provider can change without touching the others.

## One conversation turn, start to finish

1. The person taps the mic, or says the app's wake phrase (the word "Hey" and the assistant's current name).
2. The microphone opens, with echo cancellation and noise suppression on.
3. Words appear on screen as they are heard.
4. The turn ends on a tap, on an end phrase such as "that's all", or after 8 seconds of quiet.
5. The text goes to the assistant like a typed message.
6. A short confirmation ("Got it, moved to Friday") is spoken as soon as the work is filed.
7. A longer answer is spoken after it.
8. A follow-up window stays open for 8 seconds, so the person can answer without tapping again.

Talking over a reply stops it and starts a new turn (barge-in). A fixed phrase such as "undo that" is matched on the device and never goes to the assistant. Mute lasts for the sitting only.

## Who listens: picked fresh for every turn

`voiceRouter.ts` decides, using plain facts about the moment:

| Situation | Who listens |
|---|---|
| Online, the person's mode allows the cloud, under today's allowance, and the cloud token arrives within 1.5 seconds | **The cloud** (Deepgram) |
| Otherwise, and the person downloaded the offline model | **The on-device model** |
| Otherwise | **The browser's own recognition** (Chrome sends this audio to Google; Firefox has none) |
| Waiting for the wake phrase | **Never the cloud.** The on-device model if downloaded, else the browser's. |

## Who speaks

| The line is | Spoken by |
|---|---|
| A **confirmation** (priority `ack`) | The device voice, always, so it starts at once and costs nothing. The natural voice if downloaded, else the system voice. |
| A **reply** or a long **summary**, online, under the allowance | The cloud voice |
| A reply otherwise, or if the cloud voice has no first byte in 2.5 seconds | The device voice, for that reply only |

## Every environment, side by side

| Situation | Hears you | Speaks to you |
|---|---|---|
| Online, within limits | Cloud | Confirmations on the device, replies from the cloud |
| Online, today's allowance spent | Device (on-device model, else browser), one quiet line says so | Device |
| Online, no `DEEPGRAM_API_KEY` saved | Device. Nothing fails; the cloud is skipped. | Device |
| Offline, offline model downloaded | On-device model | Device voice |
| Offline, nothing downloaded | Nobody. The app says talking needs a connection and points to the offline model's switch. Typing still works. | Device voice |
| This phone can't run the model | The row says why and offers no button; the browser's recognition is the fallback online | Device voice |

**The person is never blocked by a limit.** The router answers "device" and one quiet line appears.

## The allowances

- **Listening:** 60 minutes a day for each person, and 300 cloud tokens a day.
- **Speaking:** 30,000 characters a day for each person.
- **The whole site:** a $5 a day cap across everyone.

Past any of them, that turn goes to the device. The numbers live in `functions/src/voice/` and are checked on the server.

## The person who chooses to download the model

The switch is in the app's voice settings (`useOnDeviceRecognition`, drawn by the app).

1. The row says the real size before anything downloads: about 57 MB.
2. It checks the phone can run it (WebAssembly SIMD, `AudioWorklet`, enough free storage, enough memory) and says why if not.
3. A tap downloads six files from the site's own server, with progress and a Cancel.
4. Each file is checked by size and SHA-256. Any mismatch, cancel or failure deletes everything, so nothing half-done is kept.
5. The files are kept in the browser's own Cache Storage. The service worker never pre-downloads them, so nobody gets 57 MB without asking.
6. Remove deletes them again, with an Undo.

The model is sherpa-onnx with a small streaming English model. It runs in a Web Worker on the same audio the cloud would get. Whether it is downloaded is browser state, never saved on the person's profile.

## Keys and privacy

- **No provider key ever reaches a browser.**
- **Listening** goes straight from the browser to the cloud provider with a one-minute token that `mintVoiceToken` mints on the server after checking the allowance.
- **Speaking** goes through the site (`streamSpeech`), which checks sign-in and the allowance, then pipes the provider's audio back.
- **The wake phrase is only ever heard on the device.** No audio goes to the cloud before the phrase or a tap.
- **Voice notes** are transcribed by the server from the sealed file, which is never stored unsealed.

## When something fails

- **No token in 1.5 seconds, a socket that fails, or a spent allowance:** that turn listens on the device.
- **No first byte from the cloud voice in 2.5 seconds, or a provider error:** that reply is spoken on the device, and the turn records which voice spoke.
- **A model that can't start on the phone:** its own sentence ("Couldn't start listening on this phone"), never a silent "nothing heard".
- **A refused microphone:** stays blocked until the permission changes.
- **One playback queue:** a confirmation and a reply never overlap, and a newer turn cuts the older one's audio.

## Not yet confirmed

Provider prices and ids, how an open stream behaves when its token ends, speed and memory of the offline model on mid-range phones, and iOS Safari's microphone during playback are listed as unverified in Helm's `TECHNICAL.md` section 20. Check there before relying on them.
