# Letting an assistant search the web

## The question

Pepper changes a recipe on request. The owner first held links out (an assistant could invent an address), then decided Pepper may change links and should "search the web if necessary" while the person talks with it, never unprompted or without a reason, and that the person must be told it can search. The photo stays out, and nutrition is its own later decision ("So just links").

## What we considered

- **No links at all.** Safe, but "add a video for the folding" is a natural ask, and the owner asked for it.
- **Links from the model's memory only.** Cheap, but models invent plausible addresses; the reason links were held out in the first place.
- **Our own search call, then the model picks.** A second provider, key and cost for one feature.
- **Gemini's Google Search grounding through Firebase AI Logic (chosen).** The model Pepper already uses, one `tools` entry, and the model decides when a search would help.

## What we chose

- Pepper's model is created with `tools: [{ googleSearch: {} }]`; the prompt allows link changes only when the ask is about links or plainly needs one, never invented, never a search-redirect address.
- Every new link is opened with `fetchPageContent` before it reaches the form; one that fails is dropped, and Pepper's line says so.
- A round that searched shows Google's search suggestion (its HTML in a shadow root, untouched) and up to three sources, in the change summary (`SearchGroundingNote`).
- The disclosure line before the first ask says Pepper may search the web.
- If the model refuses search with a JSON response, Pepper falls back to the plain model and reports it with `reportFallback`.

## Why

- Firebase's grounding page ([Grounding with Google Search](https://firebase.google.com/docs/ai-logic/grounding-google-search)): grounding is turned on by adding the `googleSearch` tool, and the model "decides whether to use Google Search". It lists the Flash-Lite model Pepper uses as supported.
- The same page sets the display terms: "It's *required* to display Google Search suggestions and *required* to display sources", with the suggestion's `renderedContent` meant to be shown as given. That is why the note is a shared component and is never restyled.
- Checking each link loads closes the gap that held links out: an invented or dead address never reaches the form.

## How it is held

`docs/conventions/design-ux.md` "What an AI changed is marked where it changed…" (its search sentence), `.claude/rules/pinch.md` (Pepper's scope), and the shared `SearchGroundingNote`.

## When to revisit

- Unconfirmed, because this session could not reach ai.google.dev (the owner declined opening it): whether `googleSearch` is accepted together with a JSON response schema on every model (the fallback covers a refusal), grounding's price and free quota, and the full Gemini terms for grounded results. Read them before turning `pepper-edits` on for more people.
- When nutrition is decided: it would use the same search and the same display terms.
- When a second app grounds an answer: it uses `SearchGroundingNote` as is.
