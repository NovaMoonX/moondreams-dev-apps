# Pinch — User goals, journeys and flows

Status: **audit in progress.** This file is filled in as the audit finishes; until then it states what is being checked and why, so the PR that carries it is reviewable from the first commit.

## Why this exists

Pinch grew one feature at a time: a calendar, recipes, saved meals, ideas, sources, a catalog of ingredients with products, stores and prices, nutrition, a shopping list, cooking mode, cook records, notes, care, prepared meals in the fridge and freezer, and re-pricing a past day. Each piece was reviewed on its own. The owner's concern is the whole: the app feels disjointed or busy in a way that isn't obvious, with too many entry points to the same things and too many insights volunteered on every screen. They want everything the app offers to feel intentional.

This document answers, for the person using the app:

1. **What are they trying to get done?** User goals and outcomes, with how often each happens and how much it matters.
2. **What does the app make them do today?** Each journey as it is, walked on a phone and on a wide screen, with the taps and screens counted.
3. **Where is the friction?** Small things (a label, a dead tap) and high-arching things (one feature reachable from five places, two features that are really one, an insight shown in four spots, a concept that does no work, a step missing from a journey).
4. **What should change?** Each change is one of trim, merge, add, fill, rearrange or keep, names the goal it serves, says why it is better for the person and what it costs. Nothing is changed without a stated reason, and what should stay is written down too, so it isn't touched by accident.

## How it is being checked

A set of independent audits, each walked in a real browser at 390×844 first and 1280×900 second, against the seeded returning user, the empty first-time user and the oversized scale kitchen:

| Audit                                    | Question                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inventory                                | Every surface, every way to reach each feature, every volunteered insight, every noun in the copy, and the taps for the 25 most common tasks, as facts |
| First run and setup                      | What the first ten minutes teach, and which features should stay invisible until there is data for them                                                |
| Capture, curate and find recipes         | Whether Recipes, Meals, Ideas, Sources and the recipe drawer are one coherent thing                                                                    |
| Plan and review the week                 | What the calendar is for, and how few taps it takes to go from "what's for dinner?" to planned                                                         |
| Shop                                     | Whether the list, stores, products and prices fit the moment of standing in a shop                                                                     |
| Cook                                     | Whether cooking mode, cooks, notes, tweaks, history and care add up to something a cook uses                                                           |
| Prepared meals and leftovers             | Whether the fridge and freezer stay honest at a realistic effort, and where the feature belongs                                                        |
| Costs, prices, nutrition and the catalog | The cheapest path to a number the person can trust                                                                                                     |
| Navigation and information architecture  | Where things live, how many ways lead to each, and whether four tabs is right                                                                          |
| Insight budget                           | Everything the app volunteers, classified by whether the person would act on it                                                                        |

The lens each audit applies:

- **Intentional.** A feature has one home where a person would look. An extra entry point exists only where a journey needs the feature in context, and the journey is named.
- **Insight budget.** The app volunteers information only when it changes what the person is about to do, where they can act on it, once. Each one is a _decision_, a _status_, a _reference_ (they opened it to see it) or _noise_.
- **Concepts.** Every noun the person must learn earns its place, is named the same everywhere and appears when it becomes relevant, not on day one.
- **Journeys, not features.** The path from "I want X" to "done" across screens, without retyping what the app knows or choosing between two ways when one would do.
- **Calm by default, depth on demand.** First screens show what is needed now.
- **Phone first.** One hand, a shop with bad signal, a stove, a sofa.

## Goals and outcomes

_To be filled from the audits._

## Journeys

_To be filled from the audits._

## Flows

_To be filled from the audits._

## Findings

_To be filled from the audits._

## Decisions: what changes and why

_To be filled from the audits._

## What stays, and why

_To be filled from the audits._

## Rules this adds for people and agents building Pinch

_To be filled from the audits (they go into `CLAUDE.md`, the Pinch rules pair and the review agents' checklists)._
