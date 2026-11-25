import type { SourceShares } from '@/lib/connections/contract';

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
          detail:
            'Each recipe with its servings, time, kind of dish and whether it is a favourite',
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
            {
              label: 'Whether it is a favourite',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
        {
          id: 'savedMeals',
          kind: 'artifact',
          label: 'Saved meals',
          meaning:
            'Meals the person saved to plan again, each a plate of recipes or foods eaten together.',
          detail:
            'Each saved meal, what is on its plate and whether it is a favourite',
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
            {
              label: 'Whether it is a favourite',
              sinceVersion: 2,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 2,
        },
        {
          id: 'ideas',
          kind: 'artifact',
          label: 'Recipe ideas',
          meaning:
            'Recipe ideas the person saved to try later, each a saved link, photo or written idea. Only the title, the kind and the site name are shared, never the note, the link itself or the photo.',
          detail: 'Each idea you want to try and the site it came from',
          mode: 'sync',
          isOnAtConnect: false,
          addedInVersion: 2,
          reads: [
            {
              label: "Each idea's title",
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
            {
              label:
                'Whether it is a link, a photo or a written idea, and the site it came from',
              sinceVersion: 1,
              addedOn: '2026-11-14',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'recipeIngredients',
          kind: 'artifact',
          label: 'Recipe ingredients',
          meaning:
            "Recipes read live, for what that one leaves out: each recipe's ingredients with amounts and the collections it is in, plus how long it takes (not servings or kind of dish). Never the steps, description, notes or links.",
          detail:
            'Each recipe, its ingredients and amounts, time and collections',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: "Each recipe's ingredients and how much of each",
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'How long it takes',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The collections it is in',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'fullRecipes',
          kind: 'artifact',
          label: 'Full recipes',
          meaning:
            "The method of each saved recipe: the written description and every step, in order. Never the recipe's notes, links, prices or nutrition.",
          detail: 'Each recipe with its description and steps',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 4,
          reads: [
            {
              label: "Each recipe's description",
              sinceVersion: 1,
              addedOn: '2026-11-25',
            },
            {
              label: "Each recipe's steps, in order",
              sinceVersion: 1,
              addedOn: '2026-11-25',
            },
          ],
          scopeVersion: 1,
        },
        {
          id: 'cooked',
          kind: 'event',
          label: 'What you cooked',
          meaning:
            'Recipes the person has made, each with the day it was cooked. Never how it turned out, its servings or photos.',
          detail: 'Each recipe you cooked and when',
          mode: 'live',
          isOnAtConnect: false,
          addedInVersion: 3,
          reads: [
            {
              label: 'The recipe you cooked',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
            {
              label: 'The day you cooked it',
              sinceVersion: 1,
              addedOn: '2026-11-16',
            },
          ],
          scopeVersion: 1,
        },
      ],
      never: [
        'Recipe notes and links',
        'prices and costs',
        'nutrition',
        'how a cook turned out',
      ],
      actions: [
        {
          id: 'get_meal_plan',
          kind: 'read',
          categories: ['plannedMeals'],
          permission: null,
          label: 'Look up planned meals',
        },
        {
          id: 'search_recipes',
          kind: 'read',
          categories: ['recipes', 'savedMeals', 'ideas'],
          permission: null,
          label: 'Search recipes, saved meals and ideas',
        },
        {
          id: 'get_recipe',
          kind: 'read',
          categories: ['recipes', 'recipeIngredients', 'fullRecipes'],
          permission: null,
          label: 'Open one recipe',
        },
        {
          id: 'get_shopping_list',
          kind: 'read',
          categories: ['shoppingList'],
          permission: null,
          label: 'Read the shopping list',
        },
        {
          id: 'get_kitchen',
          kind: 'read',
          categories: ['pantryStock', 'useSoon'],
          permission: null,
          label: 'See what is in the kitchen',
        },
        {
          id: 'update_recipe',
          kind: 'change',
          categories: [],
          permission: 'editRecipes',
          label: 'Edit a recipe',
        },
        {
          id: 'add_recipe',
          kind: 'change',
          categories: [],
          permission: 'addRecipes',
          label: 'Add a recipe',
        },
        {
          id: 'plan_meal',
          kind: 'change',
          categories: [],
          permission: 'planMeals',
          label: 'Plan a meal',
        },
        {
          id: 'add_to_shopping_list',
          kind: 'change',
          categories: [],
          permission: 'addToShoppingList',
          label: 'Add to the shopping list',
        },
      ],
      changes: [
        {
          id: 'editRecipes',
          label: 'Edit recipes',
          meaning:
            "Change a recipe's name, servings, times, description, ingredients or steps.",
        },
        {
          id: 'addRecipes',
          label: 'Add recipes',
          meaning: 'Save a new recipe. It can never remove one.',
        },
        {
          id: 'planMeals',
          label: 'Plan meals',
          meaning: 'Put a recipe or dish on your plan. It never takes one off.',
        },
        {
          id: 'addToShoppingList',
          label: 'Add to the shopping list',
          meaning:
            'Add to your shopping list. It never ticks or removes anything.',
        },
      ],
      capabilities: { read: true, write: true, backgroundSync: true },
      connect: { kind: 'siteGrant' },
    },
  ],
};
