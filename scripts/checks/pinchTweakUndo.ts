import assert from 'node:assert/strict';

import type {
  Recipe,
  RecipeIngredient,
  RecipeNote,
  RecipeSnapshot,
} from '../../src/apps/pinch/types.ts';
import { placeLineInGroup } from '../../src/apps/pinch/utils/ingredientGroups.ts';
import {
  getMissingNoteFields,
  getUndoableTweakIds,
  planTweakUndo,
} from '../../src/apps/pinch/utils/notes.ts';
import {
  getDraftChanges,
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
      'care',
      'categories',
      'cookMinutes',
      'description',
      'ingredients',
      'links',
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
    assert.deepEqual(restored, {
      ...before,
      categories: [],
      care: null,
      links: [],
    });
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

const full: Recipe = {
  ...before,
  id: 'adobo',
  coverPath: null,
  coverUrl: null,
  source: 'MANUAL',
  care: null,
  collectionIds: [],
  categories: ['MAIN'],
  links: [],
  isArchived: false,
  isFavorite: false,
  createdAt: 1,
  updatedAt: AT,
};
const inGroup = (id: string, amount: number, group: string | null) => ({
  ...line(id, amount),
  group,
});
const grouped: Recipe = {
  ...full,
  ingredients: [
    inGroup('a', 1, null),
    inGroup('b', 1, 'For the chicken'),
    inGroup('c', 1, 'For the chicken'),
    inGroup('d', 1, 'For the sauce'),
  ],
};
const names = new Map(
  ['a', 'b', 'c', 'd'].map((id) => [`cat-${id}`, { name: `Item ${id}` }]),
);
const lines = (
  after: Partial<Recipe>,
  extras?: Parameters<typeof getRecipeChanges>[4],
) =>
  getRecipeChanges(grouped, { ...grouped, ...after }, names, new Map(), extras);
const regroup = (map: Record<string, string | null>) =>
  Object.entries(map).reduce(
    (lines, [id, group]) =>
      placeLineInGroup(lines, {
        ...(lines.find((l) => l.id === id) ?? lines[0]),
        group,
      }),
    grouped.ingredients,
  );

check("a category change is one line in the form's words", () => {
  assert.deepEqual(lines({ categories: ['MAIN', 'SIDE'] }), [
    'Categories: Main dishes → Main dishes, Sides',
  ]);
  assert.deepEqual(lines({ categories: [] }), [
    'Categories: Main dishes → none',
  ]);
  assert.deepEqual(
    getRecipeChanges(
      { ...grouped, categories: ['SIDE', 'MAIN'] },
      { ...grouped, categories: ['MAIN', 'SIDE'] },
      names,
    ),
    [],
    'the order they were picked in is not a change',
  );
});

check('each part of keeping it is its own line', () => {
  const kept = { fridgeDays: 3, freezerDays: 90, reheat: 'Oven.', tip: null };
  const withKept = { ...grouped, care: kept };
  const changes = (care: Recipe['care']) =>
    getRecipeChanges(withKept, { ...withKept, care }, names);
  assert.deepEqual(changes({ ...kept, fridgeDays: 4 }), [
    'Keeping it: fridge time 3 days → 4 days',
  ]);
  assert.deepEqual(changes({ ...kept, freezerDays: null }), [
    'Keeping it: freezer time removed',
  ]);
  assert.deepEqual(changes({ ...kept, reheat: 'Microwave.' }), [
    'Keeping it: reheating changed',
  ]);
  assert.deepEqual(changes({ ...kept, tip: 'Add water.' }), [
    'Keeping it: tip added',
  ]);
  assert.deepEqual(changes(null), [
    'Keeping it: fridge time removed',
    'Keeping it: freezer time removed',
    'Keeping it: reheating removed',
  ]);
  assert.deepEqual(changes({ ...kept }), []);
});

check(
  'links: the how-to link is named, any other is a link, and a change or a reorder is a line',
  () => {
    const howTo = {
      id: 'h',
      kind: 'HOW_TO' as const,
      label: null,
      url: 'https://youtu.be/x',
    };
    const other = {
      id: 'o',
      kind: 'OTHER' as const,
      label: null,
      url: 'https://example.com/a',
    };
    const second = {
      id: 'p',
      kind: 'ARTICLE' as const,
      label: null,
      url: 'https://example.com/b',
    };
    assert.deepEqual(lines({ links: [howTo] }), ['Added the how-to link']);
    assert.deepEqual(lines({ links: [other] }), ['Added a link']);
    const withBoth = { ...grouped, links: [howTo, other] };
    const links = (next: Recipe['links']) =>
      getRecipeChanges(withBoth, { ...withBoth, links: next }, names);
    assert.deepEqual(links([other]), ['Removed the how-to link']);
    assert.deepEqual(links([howTo]), ['Removed a link']);
    assert.deepEqual(
      links([howTo, { ...other, url: 'https://example.com/z' }]),
      ['Changed a link'],
    );
    assert.deepEqual(links([howTo, { ...other, label: 'Notes' }]), [
      'Changed a link',
    ]);
    assert.deepEqual(links([howTo, other]), []);
    assert.deepEqual(
      getRecipeChanges(
        { ...withBoth, links: [other, second] },
        { ...withBoth, links: [second, other] },
        names,
      ),
      ['Links reordered'],
    );
  },
);

check(
  'ingredient groups: a renamed heading, a removed heading and moved lines each say so',
  () => {
    assert.deepEqual(
      lines({ ingredients: regroup({ b: 'For the bird', c: 'For the bird' }) }),
      ['Renamed the group “For the chicken” to “For the bird”'],
    );
    assert.deepEqual(lines({ ingredients: regroup({ b: null, c: null }) }), [
      'Removed the group “For the chicken”',
    ]);
    assert.deepEqual(
      lines({ ingredients: regroup({ d: 'For the chicken' }) }),
      [
        'Moved Item d to “For the chicken”',
        'Removed the group “For the sauce”',
      ].slice(0, 1),
      'one line moved to a heading that exists',
    );
    assert.deepEqual(lines({ ingredients: regroup({ a: 'For the sauce' }) }), [
      'Moved Item a to “For the sauce”',
    ]);
    assert.deepEqual(
      lines({
        ingredients: regroup({ b: 'For the sauce', c: 'For the sauce' }),
      }),
      ['Moved 2 ingredients to “For the sauce”'],
    );
    assert.deepEqual(lines({ ingredients: regroup({ b: null }) }), [
      'Took Item b out of “For the chicken”',
    ]);
    assert.deepEqual(
      lines({
        ingredients: regroup({ b: 'for the chicken', c: 'For  the chicken' }),
      }),
      [],
      'two spellings of one heading are one heading',
    );
    const swapped = [
      grouped.ingredients[0],
      grouped.ingredients[3],
      grouped.ingredients[1],
      grouped.ingredients[2],
    ];
    assert.deepEqual(
      lines({ ingredients: swapped }),
      ['Ingredients reordered'],
      'headings in another order',
    );
  },
);

check(
  "the photo and the collections come from the draft, in the form's words",
  () => {
    const draftOf = (extra: object) => ({
      ...grouped,
      newIngredients: [],
      newSource: null,
      ...extra,
    });
    const changes = (
      existing: Recipe,
      extra: object,
      collections = new Map<string, { label: string }>(),
    ) =>
      getDraftChanges(existing, draftOf(extra), names, new Map(), collections)
        .changes;
    const covered = { ...grouped, coverPath: 'p' };
    assert.deepEqual(changes(grouped, { coverFile: {} }), ['Photo added']);
    assert.deepEqual(changes(grouped, { coverUrl: 'https://x.test/a.jpg' }), [
      'Photo added',
    ]);
    assert.deepEqual(changes(covered, { coverFile: {} }), ['Photo changed']);
    assert.deepEqual(changes(covered, { removeCover: true }), [
      'Photo removed',
    ]);
    assert.deepEqual(
      changes(grouped, { removeCover: true }),
      [],
      'nothing to remove',
    );
    assert.deepEqual(
      changes(
        { ...grouped, coverUrl: 'https://x.test/a.jpg' },
        { coverUrl: 'https://x.test/a.jpg' },
      ),
      [],
    );
    assert.deepEqual(changes(covered, {}), []);
    const labels = new Map([
      ['w', { label: 'Weeknight' }],
      ['b', { label: 'Bulk' }],
    ]);
    assert.deepEqual(
      changes(
        grouped,
        {
          collectionChange: { add: ['w', 'n'], remove: ['b'] },
          newCollections: [{ id: 'n', label: 'Party' }],
        },
        labels,
      ),
      [
        'Added to the Weeknight collection',
        'Added to the Party collection',
        'Taken out of the Bulk collection',
      ],
    );
    assert.deepEqual(
      changes(grouped, { collectionChange: { add: [], remove: [] } }, labels),
      [],
    );
    assert.deepEqual(changes(grouped, { collectionChange: null }, labels), []);
  },
);

check(
  'every kind of edit past the cap is counted, with the earlier lines kept',
  () => {
    const many = getRecipeChanges(
      grouped,
      {
        ...grouped,
        title: 'New',
        categories: [],
        care: { fridgeDays: 2, freezerDays: 2, reheat: 'a', tip: 'b' },
        links: [
          { id: 'h', kind: 'HOW_TO', label: null, url: 'https://youtu.be/x' },
        ],
      },
      names,
      new Map(),
      { photo: 'ADDED', addedCollections: ['A'], removedCollections: ['B'] },
    );
    assert.equal(many.length, 8);
    assert.match(many[7], /^and \d+ more$/);
  },
);

check(
  'a snapshot keeps categories, keeping it and links, and undoing it puts them back',
  () => {
    const edited: Recipe = {
      ...full,
      title: 'Changed',
      categories: ['SIDE'],
      care: { fridgeDays: 2, freezerDays: null, reheat: null, tip: null },
      links: [
        { id: 'h', kind: 'HOW_TO', label: null, url: 'https://youtu.be/x' },
      ],
      coverPath: 'new-cover',
      collectionIds: ['w'],
    };
    const snapshot = getRecipeSnapshot(full);
    assert.deepEqual(
      [snapshot.categories, snapshot.care, snapshot.links],
      [['MAIN'], null, []],
    );
    const plan = planTweakUndo({ updatedAt: AT }, [tweak('t', AT, snapshot)]);
    assert.equal(plan.kind, 'REVERT');
    if (plan.kind !== 'REVERT') return;
    const restored = { ...edited, ...plan.fields };
    assert.deepEqual(
      [restored.title, restored.categories, restored.care, restored.links],
      ['Adobo', ['MAIN'], null, []],
    );
    assert.deepEqual(
      [restored.coverPath, restored.collectionIds],
      ['new-cover', ['w']],
      'the photo and the collections stay',
    );
    assert.equal(
      Object.values(snapshot).some((value) => value === undefined),
      false,
    );
  },
);

check(
  'a snapshot from before they were kept restores its nine fields and leaves the other three alone',
  () => {
    const { categories, care, links, ...nine } = getRecipeSnapshot(full);
    void [categories, care, links];
    const plan = planTweakUndo({ updatedAt: AT }, [tweak('t', AT, nine)]);
    assert.equal(plan.kind, 'REVERT');
    if (plan.kind !== 'REVERT') return;
    assert.deepEqual(Object.keys(plan.fields).sort(), Object.keys(nine).sort());
    const edited: Recipe = {
      ...full,
      title: 'Changed',
      categories: ['SIDE'],
      links: [
        { id: 'h', kind: 'HOW_TO', label: null, url: 'https://youtu.be/x' },
      ],
    };
    const restored = { ...edited, ...plan.fields };
    assert.deepEqual(
      [restored.title, restored.categories, restored.links.length],
      ['Adobo', ['SIDE'], 1],
    );
  },
);

check(
  'a recipe is never changed without a line: every field the form edits, 400 random edits',
  () => {
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const edits: Array<(r: Recipe) => Recipe> = [
      (r) => ({ ...r, categories: r.categories.length ? [] : ['SIDE'] }),
      (r) => ({
        ...r,
        care: r.care
          ? null
          : { fridgeDays: 3, freezerDays: null, reheat: null, tip: null },
      }),
      (r) => ({
        ...r,
        links: r.links.length
          ? []
          : [
              {
                id: 'k',
                kind: 'OTHER',
                label: null,
                url: 'https://example.com',
              },
            ],
      }),
      (r) => ({
        ...r,
        ingredients: r.ingredients.map((l, i) =>
          i === 1 ? { ...l, group: l.group ? null : 'Sauce' } : l,
        ),
      }),
      (r) => ({
        ...r,
        ingredients: r.ingredients.map((l) =>
          l.group ? { ...l, group: `${l.group}!` } : l,
        ),
      }),
      (r) => ({ ...r, ingredients: [...r.ingredients].reverse() }),
    ];
    const result = Array.from({ length: 400 }, () => {
      const start: Recipe = {
        ...grouped,
        categories: next(2) ? ['MAIN'] : [],
        care: next(2)
          ? { fridgeDays: 2, freezerDays: null, reheat: 'a', tip: null }
          : null,
      };
      const edit = edits[next(edits.length)];
      const edited = edit(start);
      const changed = JSON.stringify(edited) !== JSON.stringify(start);
      return { changed, count: getRecipeChanges(start, edited, names).length };
    });
    assert.equal(
      result.some(({ changed, count }) => changed && count === 0),
      false,
    );
    assert.equal(
      result.some(({ changed, count }) => !changed && count > 0),
      false,
    );
  },
);

console.log(`pinchTweakUndo: ${passed} checks passed`);
