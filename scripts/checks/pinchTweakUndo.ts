import assert from 'node:assert/strict';

import type {
  RecipeIngredient,
  RecipeNote,
  RecipeSnapshot,
} from '../../src/apps/pinch/types.ts';
import {
  getMissingNoteFields,
  getUndoableTweakIds,
  planTweakUndo,
} from '../../src/apps/pinch/utils/notes.ts';
import {
  getRecipeChanges,
  getRecipeSnapshot,
} from '../../src/apps/pinch/utils/recipeChanges.ts';

let passed = 0;
const check = (name: string, run: () => void) => {
  try {
    run();
    passed += 1;
  } catch (error) {
    console.error(`FAILED: ${name}`);
    throw error;
  }
};

const line = (id: string, amount: number | null): RecipeIngredient => ({
  id,
  ingredientId: `cat-${id}`,
  amount,
  unit: 'TBSP',
  note: null,
  group: null,
});
const ingredients = new Map([
  ['cat-garlic', { name: 'Garlic' }],
  ['cat-soy', { name: 'Soy sauce' }],
]);
const before: RecipeSnapshot = {
  title: 'Adobo',
  description: 'Sticky chicken.',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 35,
  ingredients: [line('garlic', 4), line('soy', 2)],
  steps: ['Sear the chicken.', 'Simmer.'],
  nutritionOverride: null,
  sourceId: 'src-1',
};
const after: RecipeSnapshot = {
  ...before,
  title: 'Weeknight adobo',
  servings: 6,
  ingredients: [line('garlic', 6), line('soy', 2)],
  steps: ['Sear the chicken.', 'Simmer until sticky.'],
};
const AT = 5_000;
const tweak = (
  id: string,
  createdAt: number,
  previous: RecipeSnapshot | null,
): RecipeNote => ({
  id,
  recipeId: 'adobo',
  kind: 'TWEAK',
  text: null,
  changes: ['Serves 4 → 6'],
  cookId: null,
  stepIndex: null,
  stepText: null,
  reason: null,
  previous,
  createdAt,
  updatedAt: createdAt,
});
const note = (id: string, createdAt: number): RecipeNote => ({
  ...tweak(id, createdAt, null),
  kind: 'NOTE',
  text: 'Good.',
  changes: [],
});

check(
  'a snapshot has every compared key, with null for what a legacy recipe lacks',
  () => {
    const legacy = {
      title: 'Old',
      servings: 2,
      ingredients: [line('garlic', 1)],
      steps: [],
    } as unknown as RecipeSnapshot;
    const snapshot = getRecipeSnapshot(legacy);
    assert.deepEqual(Object.keys(snapshot).sort(), [
      'cookMinutes',
      'description',
      'ingredients',
      'nutritionOverride',
      'prepMinutes',
      'servings',
      'sourceId',
      'steps',
      'title',
    ]);
    assert.equal(
      Object.values(snapshot).some((value) => value === undefined),
      false,
      'Firestore refuses undefined',
    );
    assert.deepEqual(
      [
        snapshot.description,
        snapshot.prepMinutes,
        snapshot.cookMinutes,
        snapshot.nutritionOverride,
        snapshot.sourceId,
      ],
      [null, null, null, null, null],
    );
  },
);

check('a snapshot compares equal to the recipe it was taken from', () => {
  assert.deepEqual(
    getRecipeChanges(getRecipeSnapshot(before), before, ingredients),
    [],
  );
});

check(
  'putting a snapshot back leaves no change against the recipe it came from',
  () => {
    const tweakOfEdit = tweak('t', AT, getRecipeSnapshot(before));
    const plan = planTweakUndo({ updatedAt: AT }, [tweakOfEdit]);
    assert.equal(plan.kind, 'REVERT');
    if (plan.kind !== 'REVERT') return;
    const restored = { ...after, ...plan.fields };
    assert.deepEqual(getRecipeChanges(before, restored, ingredients), []);
    assert.deepEqual(restored, before);
    assert.notEqual(getRecipeChanges(before, after, ingredients).length, 0);
  },
);

check(
  "only the recipe's latest save can be undone, and only while the recipe is as that save left it",
  () => {
    const previous = getRecipeSnapshot(before);
    const older = tweak('old', 1_000, previous);
    const latest = tweak('new', AT, previous);
    assert.deepEqual(
      getUndoableTweakIds([older, latest, note('n', 9_000)], AT),
      ['new'],
    );
    assert.deepEqual(
      getUndoableTweakIds([latest], AT + 1),
      [],
      'saved again since',
    );
    assert.deepEqual(
      getUndoableTweakIds([latest], null),
      [],
      'recipe not loaded',
    );
    assert.deepEqual(
      getUndoableTweakIds([older], AT),
      [],
      "an older one is not the recipe's state",
    );
    assert.deepEqual(getUndoableTweakIds([older], 1_000), ['old']);
    assert.deepEqual(
      getUndoableTweakIds([note('n', AT)], AT),
      [],
      'a note is never undone',
    );
    assert.deepEqual(getUndoableTweakIds([], AT), []);
  },
);

check(
  'a change written before undo existed gets no undo, and it hides the older ones too',
  () => {
    const previous = getRecipeSnapshot(before);
    assert.deepEqual(getUndoableTweakIds([tweak('legacy', AT, null)], AT), []);
    assert.deepEqual(
      getUndoableTweakIds(
        [tweak('older', 1_000, previous), tweak('legacy', AT, null)],
        AT,
      ),
      [],
    );
    const legacyKeyMissing = { ...tweak('l', AT, null) } as Partial<RecipeNote>;
    delete legacyKeyMissing.previous;
    assert.deepEqual(
      getUndoableTweakIds([legacyKeyMissing as RecipeNote], AT),
      [],
    );
  },
);

check(
  'tweaks written at the same moment are undone together, or none are',
  () => {
    const previous = getRecipeSnapshot(before);
    assert.deepEqual(
      getUndoableTweakIds(
        [tweak('a', AT, previous), tweak('b', AT, previous)],
        AT,
      ).sort(),
      ['a', 'b'],
    );
    assert.deepEqual(
      getUndoableTweakIds([tweak('a', AT, previous), tweak('b', AT, null)], AT),
      [],
    );
  },
);

check(
  'undo refuses, in a sentence, when the recipe or a tweak is no longer as it was',
  () => {
    const previous = getRecipeSnapshot(before);
    const t = tweak('t', AT, previous);
    const refusal = (plan: ReturnType<typeof planTweakUndo>) =>
      plan.kind === 'REFUSE' ? plan.message : null;
    assert.match(refusal(planTweakUndo(null, [t])) ?? '', /recipe is gone/);
    assert.match(
      refusal(planTweakUndo({ updatedAt: AT }, [null])) ?? '',
      /already undone/,
    );
    assert.match(
      refusal(planTweakUndo({ updatedAt: AT }, [t, null])) ?? '',
      /already undone/,
    );
    assert.match(
      refusal(planTweakUndo({ updatedAt: AT }, [])) ?? '',
      /already undone/,
    );
    assert.match(
      refusal(planTweakUndo({ updatedAt: AT + 1 }, [t])) ?? '',
      /saved again/,
    );
    assert.match(
      refusal(planTweakUndo({ updatedAt: AT }, [tweak('l', AT, null)])) ?? '',
      /before undo existed/,
    );
    assert.match(
      refusal(planTweakUndo({ updatedAt: AT }, [note('n', AT)])) ?? '',
      /before undo existed/,
    );
    assert.equal(
      planTweakUndo({ updatedAt: AT }, [t, tweak('u', AT, previous)]).kind,
      'REVERT',
    );
    assert.match(
      refusal(
        planTweakUndo({ updatedAt: AT }, [t, tweak('u', AT - 1, previous)]),
      ) ?? '',
      /saved again/,
    );
  },
);

check('editing an older tweak backfills the previous key as null', () => {
  assert.deepEqual(
    getMissingNoteFields({ text: null, changes: [] }).previous,
    null,
  );
  assert.deepEqual(
    'previous' in getMissingNoteFields({ previous: getRecipeSnapshot(before) }),
    false,
  );
});

console.log(`pinchTweakUndo: ${passed} checks passed`);
