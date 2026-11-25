# How apps offer tools to assistants

**Decided** Nov 25, 2026, with the owner, in the session that followed [#1260](https://github.com/NovaMoonX/moondreams-dev-apps/pull/1260). **Held by** `docs/conventions/connections.md` "An app offers an assistant a handful of tools" and `npm run check:helm-mcp`.

## The question

Helm's MCP server offers outside assistants (Gemini, Claude, ChatGPT) and Nomos the tools a connected app publishes. Through #1260 every app action became its own tool, `{app}_{action}`. With Pinch connected, an outside assistant saw 19 tools, 12 of them Pinch's, and every new app or action added more. The site is heading toward about 30 apps, so one tool per action would reach hundreds. How should tools be offered so they stay manageable for the assistant, consistent across apps, easy to add to, and enforced by checks rather than memory?

Three follow-ups shaped the answer: how an assistant that has never heard of "Pinch" knows it means meals; how a grouped tool's fields stay clear when each action takes different ones; and what an assistant sees when the person has switched a read or a change off.

## What we considered

- **One tool per action (what #1260 shipped).** The simplest schema: each tool has exactly its own fields. Lost because the count grows with every action of every app, and each tool's name, description and schema is read by the model on every turn. Anthropic and OpenAI both say fewer tools choose better (below).
- **One MCP server per app** (a Pinch server, a Runway server). Each server stays small, and a client can connect only the apps it wants. Lost because the person would set up and grant each assistant once per app, Helm's grants, switches and Undo would be split across servers, and the assistant would still hold every connected server's tools at once, so the total doesn't shrink.
- **Rely on the client's tool search.** Claude's API can defer tools and load "only the 3–5 tools Claude needs". Lost as the plan, because it is a feature of some clients, not of MCP, and we can't choose what Gemini or ChatGPT do. Grouping still helps a client that searches (the prefix makes one search find an app's group).
- **A discovery meta-tool** (one `find_tools` that returns what to call). Lost because the assistant can't call a tool it was never listed, so it would still need the real ones, and it adds a round trip to every request.
- **Changing the tool list as switches change (`listChanged`).** MCP lets a server notify a client that its tools changed. Lost because Helm's server is stateless (a fresh server per request, nothing held between them), and the notification needs a stream the client asked for; clients also differ in whether they re-read.
- **Group per app by kind (chosen).** Each app gets one read tool and a few change tools, each grouping actions whose fields agree; an `action` field picks the option. Pinch's 12 actions became 6 tools.

For switched-off reads and changes we weighed:

- **Hide anything switched off.** Clean, but the assistant then can't tell the person what to turn on, and because a tool list is read once at connect, turning a switch on would show nothing new until a reconnect anyway.
- **List everything, refuse at run time.** Honest about what exists, but offers changes the assistant can never make, and a client may ask the person to confirm a change that is bound to fail.
- **List reads with an "Off right now" mark, hide change tools that can't run (chosen).** A read is harmless to list, and its mark names the exact switch, so the assistant can say "turn on Recipes in Helm > Connected apps > Pinch". A change tool appears only when the assistant may change things and at least one of its options is on; the guide says which kinds of change are off and that one turned on later appears at the next connect.

## What we chose

- Each manifest action names its `tool`; the manifest lists its `tools` with a person-worded `title`; a tool is named `{app}_{tool}` (`pinch_read`, `pinch_save_recipe`, `pinch_plan_meal`).
- A grouped tool takes a required `action` and optional fields, each described "For get_recipe, …"; the option checks its own fields when called and refuses with "Nothing was run" and what it takes.
- One read tool per app, change tools grouped only where fields agree, never a read and a change together, at most 6 tools an app.
- Every app tool opens with the app's `about` and its `askedAbout` words (meals, groceries, what to cook), so the assistant matches the person's words to the app.
- Titles on every tool; `readOnlyHint` on reads; `destructiveHint` only where an option can alter what exists (`changesExisting`); `openWorldHint` false; refusals returned with `isError: true`.
- The guide is a short map (each app, its `pinch_` prefix and words, the switches that are off), never a list of tool names, under 4,000 characters.
- Every call still re-reads the grant; the mark and the hiding are only what is listed.

## Why

- **Fewer, grouped tools choose better.** Claude's tool-use guide: "Consolidate related operations into fewer tools. Rather than creating a separate tool for every action (`create_pr`, `review_pr`, `merge_pr`), group them into a single tool with an `action` parameter. Fewer, more capable tools reduce selection ambiguity and make your tool surface easier for Claude to navigate." ([Implement tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)). Anthropic's engineering post: "More tools don't always lead to better outcomes… Too many tools or overlapping tools can also distract agents from pursuing efficient strategies." ([Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)). OpenAI: "Aim for fewer than 20 functions available at the start of a turn… though this is just a soft suggestion." ([Function calling](https://developers.openai.com/api/docs/guides/function-calling)). With Pinch connected and every switch on, an outside assistant now sees 13 tools, under that line.
- **A prefix per service.** Claude's guide: "Use meaningful namespacing in tool names… prefix names with the service (for example, `github_list_prs`, `slack_send_message`). This makes tool selection unambiguous", and for tool search "prefix by service or resource… so one search matches the whole group".
- **Hints say what the tool does, honestly.** The MCP spec: `destructiveHint` "If true, the tool may perform destructive updates to its environment. If false, the tool performs only additive updates." ([Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) and the 2026-07-28 schema). Marking every change destructive would make a client confirm an add as if it erased something, so only an edit that replaces is marked. The spec also says clients treat annotations as untrusted unless the server is trusted, so the run-time checks stay.
- **A refusal is an error the model can act on.** The spec: tool execution errors "contain actionable feedback that language models can use to self-correct and retry with adjusted parameters", and "Clients SHOULD provide tool execution errors to language models to enable self-correction." So a switched-off or refused call is `isError: true`, with words that say what to do.
- **The tool list is fixed for a connection.** The spec's `listChanged` is a promise to notify, delivered only on a stream the client asked for; Helm's stateless server can't keep one. That is why a read stays listed with its mark, and why the guide says a newly turned-on change appears next time.
- **The owner's bar:** tools that are "manageable, accessible, and actionable… consistent… something we can build and add to in the future, and ensure that our rules and check guarantee that it's being followed." One server, grouped per app, a manifest-only path for a new app and a check over every adapter answer each part.

## How it is held

`check:helm-mcp` (run by `check:ci` and in CI) walks every adapter in `SOURCE_ADAPTERS`: ids and names, titles, one read tool, no mixed kinds, at most 6 tools an app and 40 overall, at least 3 `askedAbout` words, every declared tool used and every action's tool declared, shared fields of one type, option descriptions long enough, and every `{app}_x` a description names real. It also runs the server in process and checks the titles, hints, `required: ['action']` and `isError`. The convention is `connections.md` "An app offers an assistant a handful of tools".

## When to revisit

- **Gemini's own guidance is unconfirmed:** its function-calling docs answered 403 from the sandbox. Read them when reachable and note here whether they agree.
- **A client that searches tools well** (Claude's tool search, a ChatGPT equivalent) for every assistant the person uses would make one tool per action affordable again; grouping would still help, so revisit only if grouping starts to hurt.
- **An app that needs more than 6 tools**, or a change whose fields can't agree with any group: split by what the person does, not by field, and raise the cap here first if it truly needs it.
- **A stateful server or client support for `listChanged`** would let a switch turned on show its tool at once; then hiding switched-off reads could be weighed again.
- **Results showing assistants pick the wrong option** (from Helm's filed turns): sharpen descriptions before splitting tools.

## Changes

- Nov 25, 2026: first written.
