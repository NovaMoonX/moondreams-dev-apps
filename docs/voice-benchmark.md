# Voice benchmark

Three cloud voices are compared with the site's natural voice before any cloud voice ships: Deepgram Aura-2, Gemini 3.8 Flash-Lite TTS and Google Cloud Text-to-Speech Chirp 3 HD. Each speaks the same twelve replies, three candidate voices apiece. The script times every reading (first sound, finished, and how long the response stream takes to close after an abort) and prices it, and a local page lets you listen to each beside the natural voice.

## The twelve replies

Each is spoken after `toSpokenText`, as the site will.

| # | Kind | Tone | Reply |
| --- | --- | --- | --- |
| 1 | got-it | Composed | Got it. Call Dana, Friday. |
| 2 | got-it | Warm | Got it. Call Dana on Friday, and I'll keep it handy. |
| 3 | answer | Composed | Your cake tasting is today at 3:00 PM at Sweet Layer Bakery. |
| 4 | answer | Warm | Your cake tasting is today at 3:00 PM at Sweet Layer Bakery. Hope it's a good one. |
| 5 | general | Composed | This isn't from your records, and it may be out of date. A frosted cake keeps about three days in the fridge. |
| 6 | general | Warm | This isn't from your records, and it may be out of date. A frosted cake usually keeps about three days in the fridge, covered. |
| 7 | caution | Composed | Biscuit's next flea treatment is due Saturday. For anything about the dose, check with the vet first. |
| 8 | caution | Warm | Biscuit's next flea treatment is due Saturday. If you're unsure about the dose, a quick word with the vet first is worth it. |
| 9 | question | Composed | Do you mean Dana Lee or Dana Ortiz? |
| 10 | question | Warm | Just to be sure, do you mean Dana Lee or Dana Ortiz? |
| 11 | summary | Composed | This week you have four things. Tuesday, the dentist at 9:30 AM. Wednesday, renew the car registration. Thursday, Mia's recital at 6:00 PM at Lincoln Hall. Friday, call Dana about the lease. |
| 12 | summary | Warm | Here's your week. Tuesday, the dentist at 9:30 AM. Wednesday, renew the car registration. Thursday, Mia's recital at 6:00 PM at Lincoln Hall, which should be lovely. Friday, call Dana about the lease. That's everything so far. |

## How to run it

Run these once on your own machine (each reads what you paste hidden and checks it before saving): Each key script first checks whether its key is already saved in Firebase and, if so, stops with a line saying so (and offers to add a new version only if you ask).

```
npm run voice:deepgram-secret
```

```
npm run voice:gemini-secret
```

```
npm run voice:google-setup
```

Then:

```
npm run voice:benchmark
```

A voice whose key is missing is skipped with one line. Each voice makes one untimed warm-up call first (connection and token setup stay out of the medians), then the run renders each reply five times, keeps the first audio, writes `voice-benchmark/` (ignored by git) and this page's table, then opens the listening page. `-- --no-open` skips the page; `-- --fixture` makes tones with made-up timings to try the page without keys (it writes no docs and refuses to replace a real run unless you add `-- --force`). A run is built in `voice-benchmark/.next/` and swapped in only when it finishes, so a crash or Ctrl-C leaves the previous run. The "Stream cut" column is the time for the response stream to close after an abort on this machine, not when the audio goes quiet; it is n/a when the stream had already ended. A failed voice does not stop its provider's other voices; only a 401 or 403 does.

## Results

<!-- results:start -->

Not run yet.

<!-- results:end -->

## Prices

Read on 2026-11-09 from the providers' docs (search results; the pages could not be opened from the sandbox), unverified until the first real run. They live in `TTS_PRICES` in `functions/src/voice/voiceConfig.ts`.

- Deepgram Aura-2: $0.030 per 1,000 characters; 2,000 characters per request.
- Gemini 3.8 Flash-Lite TTS: $6 per million audio output tokens at 25 audio tokens a second, about $0.009 a minute. It doubles to $12 per million on 2027-01-01.
- Google Cloud TTS Chirp 3 HD: $30 per million characters, the first million a month free; 5,000 bytes per request.

## Data use

All of this is from the providers' docs (search results, 2026-11-09), unverified until the first real run. Still unverified: the model id `gemini-3.8-flash-lite-tts`, the voice ids, Chirp 3 HD with `OGG_OPUS`, Gemini's PCM at 24 kHz, the 2027 Gemini price rise, the `mip_opt_out` default, Gemini on Vertex, and both key checks' 200 answers.

- Deepgram: the requests send `mip_opt_out=true`, said in the docs to be on `/v1/speak` and on by default otherwise (unverified), so what is sent is not used to improve their models.
- Gemini: use a key from a project with billing on. The paid tier is not used to improve Google's products; the free tier may be. The model is said to be on Vertex AI at the `global` location (unverified).
- Google Cloud TTS: stateless and not logged under Google Cloud's terms. Streaming is gRPC only, so the REST call returns the whole clip.

## The pick

Not made yet. `VOICE_PROVIDER_DEFAULT` stays `googleTts` until the owner chooses.
