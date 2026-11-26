# How an AI's changes are shown

## The question

Pinch's "Change with Pepper" lets a person tell an assistant what to change in a recipe, and the owner asked us to use it to start site-wide guidelines for "how to indicate and show changes made in the UI using AI": sparkles, colour, animation. Before this, the site had a rule for the sparkle (`design-ux.md` "The sparkle is strictly for AI") but nothing on marking changed content, no AI colour token and no change animation anywhere in `src/`.

## What we considered

- **An "AI" text label on every changed item, Carbon's way.** Clear and colour-free, but a recipe changed in eight places would carry eight labels on a phone, and the site already names its assistants (Pepper, Nomos), which says more than "AI".
- **A purple or gradient "AI colour" for the whole family, Carbon's aura or Polaris's magic role.** Recognisable, but it fights each app's own theme (Pinch's warm kitchen, Helm's palettes), and GitLab Pajamas, which weighs the same trade-off, uses none.
- **An inline diff (old words struck through, new ones highlighted).** Most exact, but unreadable at phone width across a recipe's ingredients and steps; kept for a future text-only editor.
- **One summary plus a per-item mark in the app's own accent (chosen).** The summary carries the words (who, what, what was taken out, Undo); each changed item carries a tint and an edge, so the mark is never colour alone.

## What we chose

- One shared summary, `AiChangeNotice`: the muted sparkle, who changed it and how much, the assistant's reply line, what was taken out by name, and Undo. It is a live region.
- One shared mark, the `ai-changed` class: a tint of `--ai-mark` (an app sets it; default its accent) and a 3px leading edge, with one fade-in of about 600 ms that doesn't run under reduced motion.
- The mark lasts until save, the person's own edit of that item, or the next change.
- Review first for the person's own content; apply with Undo only for small, easily reversed changes.

## Why

- Every system we could read agrees on disclosure near the content, the mark never used as decoration, and easy undo. IBM Carbon: "Use the AI label and styling to mark any instances of AI usage", "Don't use the Carbon for AI styling as decoration", and once the person edits AI content "the AI presence styling is removed and the AI label is replaced by a 'revert' action" ([Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/), [AI label](https://carbondesignsystem.com/components/ai-label/usage/)). That is where "your edit makes it yours" comes from.
- GitLab Pajamas: "There is no specific color associated with AI", a label "only once per context", and high-risk actions need "a review step before execution" ([AI-human interaction](https://design.gitlab.com/patterns/ai-human-interaction)). That is why there is one summary per screen and no family-wide AI hue.
- Apple: "Clearly identify when and where you use AI", put "Edit, Undo, Retry, or Adjust near generated content", and say what is happening instead of "Processing…" ([HIG Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai)).
- Microsoft HAX: G9 "Support efficient correction" (G9-C "Undo automated actions") and G11's caution that an explanation alone can raise trust too far ([HAX guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)). That is why the summary states what changed instead of explaining why.
- The owner's answers for Pepper's first use: show the result and let the person save, and have Pepper reply in one short written line.

## How it is held

`docs/conventions/design-ux.md` "What an AI changed is marked where it changed…", next to the sparkle rule. Design reviewers check new AI surfaces against it. Pinch's recipe form is the first user.

## When to revisit

- When the blocked sources can be read. This session's network refused Fluent 2, Shopify Polaris, Atlassian, Shape of AI, NN/g and Google PAIR, so their positions here come from search snippets only and are unconfirmed: Polaris's purple "magic" role, NN/g's finding that the sparkle is read "widely and wildly" (73% read it as save or favourite), and Fluent's shimmer for waits over a second.
- When an app needs a text-only AI editor, where an inline diff would be readable.
- When a second app adopts the mark: check that its `--ai-mark` reads in light and dark mode.

## Changes
