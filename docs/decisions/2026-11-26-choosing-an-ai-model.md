# Which AI model a feature uses: Claude or Gemini

## The question

The site calls two families of models: Claude (Haiku 5.5, Sonnet 5.5) through Cloud Functions, and Gemini (3.5 Flash-Lite) from the browser through Firebase AI Logic and from a few functions. Each feature picked one on its own. The owner asked for one rule, weighing effort, cost and what each model is good at, and the fact that the Anthropic account has $100 a month of API credit shared by every app (owner, Pepper revisions: "establish a guideline for when Gemini is used and when Haiku is used").

## What we considered

- **Gemini for everything.** One SDK in the browser, no function to write. It costs more per token than Haiku for text (below), and the Anthropic credit would go unused.
- **Claude for everything.** Cheapest for text and one spend cap. Claude does not take audio or video, and the photo readers that already work on Gemini would have to be rebuilt and re-tuned for no clear gain.
- **Chosen: pick by what the model must read, then by price.** Text goes to Claude Haiku; audio and video go to Gemini; photos and scans stay where they are and move only when a reading misses.

## What we chose

- **Text in, text or JSON out** (chat, a revision, a summary, sorting, reading an email or pasted text): Claude Haiku 5.5, on a callable or streaming function with the shared spend reserve. Move up to Sonnet 5.5 only when Haiku fails on real samples (Helm's research and topic writing do).
- **Audio or video in**: Gemini. Claude takes only text, images and PDFs.
- **Photos, screenshots and scans** (receipts, bookings, recipe photos): Gemini 3.5 Flash-Lite from the browser stays the default, since those readers are built and tuned. A reader that keeps missing on real samples is tried on Haiku with the same samples before anything else changes.
- **Web search**: follows the model the feature already uses. At our volume either is pennies; a feature never switches model only to reach the other's search.
- **Listening and speaking are neither**: speech-to-text is Deepgram (`nova-3`, `flux`), the voice is Gemini TTS or the device. Haiku only writes the answer between them.

## Why

Prices per million tokens, on the paid tier:

| Model                                 | Input                                | Output            | Search                                                  |
| ------------------------------------- | ------------------------------------ | ----------------- | ------------------------------------------------------- |
| Claude Haiku 5.5 (prompts up to 100K) | $0.10                                | $0.50             | $10 per 1,000 searches, no free allowance               |
| Gemini 3.5 Flash-Lite                 | $0.30 (text, image, video, audio)    | $2.50             | 5,000 free a month across Gemini 3+, then $14 per 1,000 |
| Gemini 3.8 Flash                      | $0.75 until Dec 31, 2026, then $1.50 | $3.75, then $7.50 | as above                                                |

- Claude prices: the claude-api reference's model table (cached 2026-11-03), "Claude Haiku 5.5 … $0.10 … $0.50", and "Prices above are for prompts up to 100K tokens ($0.50 / $2.50 beyond)". Anthropic web search: "$10 per 1,000 searches" ([web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)).
- Gemini prices: [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing), read 2026-11-26: Flash-Lite "$0.30 (text / image / video / audio)", "$2.50"; Google Search "5,000 free search requests per month (shared across all Gemini 3 and newer models), then $14 per 1,000 requests". The free tier is marked "Used to improve our products: Yes", so nothing personal goes through it.
- So for text Haiku is 3 times cheaper to read and 5 times cheaper to write than Flash-Lite. A typical ask of 3,000 tokens in and 1,000 out costs about $0.0008 on Haiku (about $0.0034 on Flash-Lite): the $100 credit covers roughly 125,000 such asks a month, or 10,000 searches.
- Quality: no vendor publishes a head-to-head. Roboflow's own vision evals put Gemini 3.6 Flash ahead of Haiku 5.5 on images (83.0% against 77.2% averaged over six tasks) and Gemini 3 Flash just behind it ([Roboflow comparisons](https://playground.roboflow.com/models/compare/claude-haiku-5-5-vs-gemini-3-6-flash)); no audio or document scores exist for these versions. That supports keeping photos on Gemini and settling any move with our own samples, not a benchmark.

## How it is held

`docs/conventions/code.md` "Pick an AI model by what it reads, then by price" points here. Model ids and prices for Claude live in `functions/src/ai/models.ts`, one role per use.

## When to revisit

- Gemini 3.8 Flash doubles in price on January 1, 2027; Flash-Lite's price may change too.
- The Anthropic credit runs out in a month, or a single feature takes more than a fifth of it.
- A Claude model gains audio input, or a photo reader misses often enough to test on Haiku.
- Existing text-only Gemini calls (Nine Lives' pasted-text extraction, Pinch's step splitting) are candidates to move to Haiku when next touched; none is moved by this record.

## Changes

- 2026-11-26: written while moving Pinch's "Change with Pepper" from Gemini to Haiku.
- 2026-11-28: Runway's email reading and filter suggestions moved from Gemini to Haiku (`functions/src/apps/runway/email/askClaude.ts`, role `readEmail`) on the shared spend reserve, after an Amazon order email was missed (owner: "Claude would be an appropriate use here").
