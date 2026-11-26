# How a spoken assistant hears, answers and speaks

## The question

Pepper, Pinch's cooking helper, has to feel like a smart speaker (owner: "like using Google Home w/ Gemini or Alexa+"): it waits for "Hey Pepper" for the whole cook, hears a question asked over a stove and music without cutting the cook off mid-thought, answers in a second or two, and acts on the screen. Pinch's cooking mode used the browser's recognizer and a fixed grammar, which missed natural phrasing and was thrown by noise. Helm and later apps will want the same shape, so the parts had to be shared.

## What we considered

- **Listening: the browser only, Deepgram Nova-3, or Deepgram Flux.** The browser is free but mishears in a noisy kitchen and ends a turn on any pause. Nova-3 (already Helm's) hears well but also ends a turn on quiet, so a cook who stops to stir is cut off, and sending a whole cook's audio is about $0.29 an hour. Flux ends a turn by judging the words and the pause together. Won: the wake phrase stays on the device (free), and only the question after it goes to Flux.
- **Answering: one big model, a small one, or code only.** Code only (the grammar) stays first, offline and free, for the commands it knows. A large model is slower to its first word. Claude Haiku answers fast and well enough for cooking questions; it won, with low effort.
- **Waiting for the whole answer, or streaming it.** Waiting adds the whole writing time before any sound. Streaming the answer as server-sent events and speaking each finished sentence lets the first sentence play while the rest is still written. Won.
- **Tools run on the server, or on the device.** Pepper's actions are taps on the cook's own screen (a timer, a step, a note), so the device runs them; the server tells the model each was done and lets it confirm in the same breath, with no second round trip.
- **Web search: always offered, never, or capped.** Offered only for exact or current facts (a safe temperature, a ratio), at most 3 a turn and 50 a day per person (owner: per day, so leaving cooking doesn't reset it), and left out of the request once spent.

## What we chose

- Device wake phrase, then Flux (`flux-general-en` on `/v2/listen`, `eot_threshold` 0.75, `eot_timeout_ms` 4000); the adapter calls `onEndOfTurn` and the conversation hook ends the listen then, keeping a 6 s guard. If Flux fails, the device listens (the existing handover).
- `pepperTurn` streams Claude Haiku (`converse` role) through the shared `streamTurn`: device tools as `action` events, web search capped, the system prompt, tools and recipe cached for the cook.
- `createSentenceFeed` and `streamAssistantTurn` on the device; speech in Zephyr with Aoede, Erinome and Autonoe as fallbacks (`fallbackVoices`).
- Everything behind the per-person `pepper` gate at Testing.

## Why

- Flux: "Real-time conversational speech recognition with contextual turn detection for natural voice conversations"; `EndOfTurn` is "The user has finished speaking for the turn", with `trigger` `model`, `manual` or `timeout` ([Flux reference](https://developers.deepgram.com/reference/speech-to-text/listen-flux)). Price: Flux STT English streaming $0.0065 a minute pay as you go, Nova-3 $0.29 an hour ([pricing](https://deepgram.com/pricing)), so the site's listen budget, which counts $0.0077 a minute, stays on the safe side.
- Tokens: "Temporary tokens have usage::write permission for … `/listen` WebSocket API" ([token auth](https://developers.deepgram.com/guides/fundamentals/token-based-authentication)); that page doesn't name `/v2`, so it is confirmed on the first live run.
- Caching: the system prompt and tools carry `cache_control`, the recipe block another, and the request's top-level `cache_control` caches the growing conversation, so a later turn reads its prefix at a tenth of the input price.

## How it is held

- `docs/voice.md` (cloud listening, a spoken assistant's turn), `docs/conventions/cloud-functions.md` (speech and text through `functions/src/voice/`).
- `check:pinch-voice` runs `scripts/checks/assistantTurn.ts`: the sentence feed, the tool round trip, the search cap, the body and the stream reader.

## When to revisit

- Flux refusing the grant token (then mint a Flux-scoped key or proxy the socket).
- Haiku answers that are wrong on cooking facts in real use (move the `converse` role up a model).
- The 50 a day cap before the gate goes to Everyone (owner: sized for testing, lowered before Everyone).

## Changes
