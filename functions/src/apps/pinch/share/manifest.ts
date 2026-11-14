// Generated from src/apps/pinch/share/manifest.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import type { SourceShares } from '../../../vendor/connectionsContract.js';

export const PINCH_SHARES: SourceShares = {
  appId: 'pinch',
  shares: [
    {
      id: 'app:pinch',
      kind: 'firstPartyApp',
      contractVersion: 1,
      about:
        "Pinch is the person's kitchen planner: their recipes, the meals they plan on a calendar, their shopping list and the food they have on hand.",
      transformVersion: 1,
      categories: [
        {
          id: 'plannedMeals',
          kind: 'event',
          label: 'Planned meals',
          detail: 'The meal, day and slot',
          meaning:
            'Meals the person plans to cook or eat, each on a day in a slot such as breakfast, lunch or dinner.',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: "The meal's name", sinceVersion: 1, addedOn: null },
            {
              label: 'The day and the slot, like dinner',
              sinceVersion: 1,
              addedOn: null,
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'shoppingList',
          kind: 'task',
          label: 'Shopping list',
          detail: "What's still to buy",
          meaning:
            'Ingredients the person still needs to buy, with how much of each.',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 1,
          reads: [
            { label: 'Each item still to buy', sinceVersion: 1, addedOn: null },
            { label: 'How much of it to buy', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'useSoon',
          kind: 'task',
          label: 'Food to use soon',
          detail: 'What in the fridge, freezer or pantry is near its date',
          meaning:
            "Food in the person's fridge, freezer or pantry that is close to its date and should be used soon.",
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 1,
          reads: [
            {
              label: 'Each food near its date',
              sinceVersion: 1,
              addedOn: null,
            },
            { label: 'Where it is kept', sinceVersion: 1, addedOn: null },
            { label: 'The day to use it by', sinceVersion: 1, addedOn: null },
          ],
          scopeVersion: 1,
        },
        {
          id: 'pantryStock',
          kind: 'artifact',
          label: 'Pantry, fridge and freezer stock',
          meaning:
            'All the food the person has on hand in their pantry, fridge and freezer.',
          detail: 'Everything you have on hand, not only what is near its date',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 2,
          reads: [
            {
              label: 'Each thing in your pantry, fridge or freezer',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'Where it is kept',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'How much is left and the day to use it by',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'recipes',
          kind: 'artifact',
          label: 'Recipes',
          meaning:
            "The person's saved recipes, each with how many it serves, how long it takes and what kind of dish it is.",
          detail: 'Each recipe with its servings, time and kind of dish',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 2,
          reads: [
            {
              label: "Each recipe's name",
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'How many it serves and how long it takes',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'The kinds of dish it is, like Main dishes',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'savedMeals',
          kind: 'artifact',
          label: 'Saved meals',
          meaning:
            'Meals the person saved to plan again, each a plate of recipes or foods eaten together.',
          detail: 'Each saved meal and what is on its plate',
          mode: 'sync',
          isOnAtConnect: true,
          addedInVersion: 2,
          reads: [
            {
              label: "Each saved meal's name",
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label: 'What is on its plate, in one line',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'Recipe steps and ingredients',
        'prices and costs',
        'nutrition',
        'cooking history',
      ],
      capabilities: { read: true, write: false, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
