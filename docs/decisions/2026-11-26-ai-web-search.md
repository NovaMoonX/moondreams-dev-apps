# Letting an assistant search the web

## The question

Pepper changes a recipe on request. The owner first held links out (an assistant could invent an address), then decided Pepper may change links and should "search the web if necessary" while the person talks with it, never unprompted or without a reason, and that the person must be told it can search. The photo stays out, and nutrition is its own later decision ("So just links"). That raised a second question: which model and which search.

## What we considered

- **No links at all.** Safe, but "add a video for the folding" is a natural ask, and the owner asked for it.
- **Links from the model's memory only.** Models invent plausible addresses; the reason links were held out in the first place.
- **Gemini with Google Search grounding, from the browser through Firebase AI Logic.** Built first, since the editor already called Gemini. Lost: Google requires showing its search suggestions and sources as given ("It's _required_ to display Google Search suggestions and _required_ to display sources", [Grounding with Google Search](https://firebase.google.com/docs/ai-logic/grounding-google-search)), whether search works with a JSON answer was unconfirmed, and its price could not be read here (ai.google.dev was blocked and the owner declined opening it).
- **Claude Haiku with Anthropic's web search, in a callable (chosen).** Cooking Pepper already runs on Haiku with capped search on our server (`docs/decisions/2026-11-25-spoken-assistant-turns.md`), so Pepper is one assistant with one key, one spend cap and known prices. The owner chose it once the costs were laid side by side.

## What we chose

- The revision runs in a Pinch callable on Claude Haiku (`claude-haiku-5-5`, low effort), behind the `pepper-edits` switch checked on the server, with the basic web search tool capped at two searches; the answer comes back through a terminal tool shaped like the revision.
- The prompt allows link changes only when the ask is about links or plainly needs one, never invented.
- A link is kept only if the search returned it (a server allowlist of the recipe's own links, the pages the search found and any the person typed); the rest are dropped on the server and counted, and Pepper's line says how many.
- On the device a found link is also dropped when its page is clearly gone (`fetchPageContent` says 404, 410 or an unknown host), never for a timeout or a block, and the line says so.
- A round that searched shows up to three of its sources in the change summary (`SearchSourcesNote`).
- The disclosure line before the first ask says Pepper may search the web.

## Why

- Price, from Anthropic's [web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) page: "web search costs $10 USD per 1,000 searches, plus standard token costs for search-generated content. Search results count as input tokens", and "A web search that fails with an error is not billed." Haiku is $0.10 per million input tokens and $0.50 per million output tokens (Anthropic's model table, as cached in the claude-api reference on 2026-11-03). An ask that rewrites a recipe is a few thousand tokens each way, about a tenth of a cent; one that searches adds a cent per search plus the pages read.
- The model decides: "Claude determines when to search based on the prompt", and `max_uses` caps it.
- Display terms: "When displaying API outputs directly to end users, citations must be included to the original source." Pepper's reply and links draw on what it found, so the summary names the sources.
- The allowlist closes the gap that held links out: a model writes a plausible address as readily as a real one, so only an address that came from the input or the search is kept, and checking that a kept one still opens catches a dead page.

## How it is held

`docs/conventions/cloud-functions.md` "A model's reading never changes a person's record on its own word alone" (an address is kept only if it was in the input or the search, and what the server drops is reported in the reply), checked by `scripts/checks/pinchPepperRevision.ts` (`check:pinch-math`: an invented link dropped and counted, a `www` or `http` copy of a recipe link kept as the original); also `docs/conventions/design-ux.md` "What an AI changed is marked where it changed…" (its search sentence), `.claude/rules/pinch.md` (Pepper's scope), the shared `SearchSourcesNote`, and the per-person assistant spend cap the callable reserves against.

## When to revisit

- When nutrition is decided: it would use the same search and the same citation rule.
- If Haiku's links or edits prove wrong in real use: move the role up a model, as the spoken-turns record says for cooking.
- When a second app's assistant searches: it shows sources with `SearchSourcesNote`.

## Changes

- 2026-11-26: first built on Gemini with Google Search grounding; the owner asked "Is Haiku cheaper here?", and once the costs were compared chose Haiku, so the revision moved to a callable and Google's suggestion box was dropped.
- 2026-11-26: the check on found links changed from "opened on the device, dropped if it fails" to a server allowlist (the search's own results, the recipe's links, the person's typed addresses) with the dropped count in the reply, and the device drops only a page that is clearly gone, since a timeout or a block says nothing about the page.
