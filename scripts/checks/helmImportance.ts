// What matters most: each relation's rank, a renumbering that keeps ties and order, a place running out, health and care refused, dates ordering the unplaced, and "Which comes first?" only from 3.
import assert from 'node:assert/strict';

import {
  applyImportance,
  findImportanceTie,
  readProjectPlaces,
  readUnderGoalIds,
  CAN_WAIT_PLACE,
  NOT_SAID_PLACE,
  readImportanceOrder,
  readPlace,
  renumberRanks,
  withPlaceChanges,
  type ImportanceCommand,
  type ImportanceItem,
  type ImportancePlace,
} from '../../src/apps/helm/engine/importance.ts';
import {
  planImportance,
  planResolveImportance,
} from '../../functions/src/apps/helm/nomos/planImportance.ts';
import { readImportanceCommands } from '../../functions/src/apps/helm/nomos/readImportanceCommands.ts';
import { hasImportanceCue } from '../../functions/src/apps/helm/nomos/route.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import type { ImportanceRecord } from '../../functions/src/apps/helm/importanceStore.ts';
import type { SetImportanceCommand } from '../../functions/src/apps/helm/nomos/commands.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 8);
const TODAY = NOW;

let failures = 0;
const test = (name: string, run: () => void) => {
  try {
    run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
};

const place = (rank: number, until: number | null = null): ImportancePlace => ({
  rank,
  words: 'said',
  saidAt: NOW,
  until,
  captureId: null,
});

const item = (
  id: string,
  over: Partial<ImportanceItem> = {},
): ImportanceItem => ({
  id,
  kind: 'project',
  name: id,
  place: null,
  goalId: null,
  isCare: false,
  status: 'running',
  date: null,
  ...over,
});

const say = (
  subjectId: string,
  relation: ImportanceCommand['relation'],
  otherId: string | null = null,
  until: number | null = null,
): ImportanceCommand => ({
  subjectId,
  relation,
  otherId,
  words: 'the wedding matters most',
  until,
  captureId: 'c1',
});

const apply = (items: ImportanceItem[], command: ImportanceCommand) => {
  const result = applyImportance(
    readImportanceOrder(items, TODAY),
    command,
    NOW,
  );
  assert.equal(result.kind, 'applied');
  if (result.kind !== 'applied') throw new Error('not applied');
  return {
    result,
    items: withPlaceChanges(items, result.changes),
    ranks: Object.fromEntries(
      result.changes.map((change) => [change.id, change.place?.rank ?? null]),
    ),
  };
};

const ids = (items: ImportanceItem[]) =>
  readImportanceOrder(items, TODAY).rows.map((row) => row.id);

test('most puts one thing alone above the top, and what was first moves to second', () => {
  const first = apply([item('wedding'), item('work')], say('wedding', 'most'));
  assert.equal(first.ranks.wedding, 1);
  const next = apply(first.items, say('work', 'most'));
  assert.equal(next.ranks.work, 2);
  assert.deepEqual(ids(next.items).slice(0, 2), ['work', 'wedding']);
  const order = readImportanceOrder(next.items, TODAY);
  assert.deepEqual(
    order.inOrder.map((row) => row.position),
    [1, 2],
  );
});

test('most on a thing that is already alone first changes nothing', () => {
  const items = [
    item('wedding', { place: place(3) }),
    item('work', { place: place(1) }),
  ];
  const result = applyImportance(
    readImportanceOrder(items, TODAY),
    say('wedding', 'most'),
    NOW,
  );
  assert.deepEqual(result, { kind: 'unchanged', reason: 'already' });
});

test('above and below land between neighbours, and above does not move what already is', () => {
  const items = [
    item('a', { place: place(3) }),
    item('b', { place: place(2) }),
    item('c', { place: place(1) }),
    item('d'),
  ];
  assert.equal(apply(items, say('d', 'above', 'b')).ranks.d, 2.5);
  assert.equal(apply(items, say('d', 'below', 'b')).ranks.d, 1.5);
  assert.equal(apply(items, say('d', 'below', 'c')).ranks.d, 0.5);
  assert.equal(apply(items, say('d', 'above', 'a')).ranks.d, 4);
  assert.equal(apply(items, say('c', 'above', 'b')).ranks.c, 2.5);
  assert.deepEqual(
    applyImportance(
      readImportanceOrder(items, TODAY),
      say('a', 'above', 'c'),
      NOW,
    ),
    { kind: 'unchanged', reason: 'already' },
  );
});

test('above an unplaced thing puts the subject at the foot of In order; below an unplaced thing places that one above', () => {
  const items = [
    item('a', { place: place(2) }),
    item('b', { place: place(1) }),
    item('guitar'),
    item('italian'),
  ];
  assert.equal(
    apply(items, say('guitar', 'above', 'italian')).ranks.guitar,
    0.5,
  );
  const below = apply(items, say('b', 'below', 'guitar'));
  assert.equal(below.ranks.guitar, 1.5);
});

test("same takes the other thing's rank, and needs the other to be placed", () => {
  const items = [
    item('work', { place: place(2) }),
    item('guitar'),
    item('home'),
  ];
  assert.equal(apply(items, say('guitar', 'same', 'work')).ranks.guitar, 2);
  assert.deepEqual(
    applyImportance(
      readImportanceOrder(items, TODAY),
      say('guitar', 'same', 'home'),
      NOW,
    ),
    { kind: 'unchanged', reason: 'otherNotPlaced' },
  );
});

test('matters is first when nothing is placed, else the foot of In order', () => {
  assert.equal(
    apply([item('guitar'), item('work')], say('guitar', 'matters')).ranks
      .guitar,
    1,
  );
  assert.equal(
    apply(
      [item('guitar'), item('work', { place: place(2) })],
      say('guitar', 'matters'),
    ).ranks.guitar,
    1,
  );
  assert.equal(
    apply(
      [
        item('guitar'),
        item('a', { place: place(4) }),
        item('b', { place: place(2) }),
      ],
      say('guitar', 'matters'),
    ).ranks.guitar,
    1,
  );
});

test('canWait goes below the lowest Can wait, and clear takes a place away', () => {
  const items = [
    item('a', { place: place(1) }),
    item('b', { place: place(-1) }),
    item('c'),
  ];
  assert.equal(apply(items, say('c', 'canWait')).ranks.c, -2);
  assert.equal(apply([item('c')], say('c', 'canWait')).ranks.c, -1);
  assert.equal(apply(items, say('a', 'clear')).ranks.a, null);
  assert.deepEqual(
    applyImportance(readImportanceOrder(items, TODAY), say('c', 'clear'), NOW),
    { kind: 'unchanged', reason: 'already' },
  );
});

test('a place keeps the words, the day, the end day and the turn it came from', () => {
  const { result } = apply(
    [item('wedding')],
    say('wedding', 'most', null, NOW + 30 * DAY),
  );
  assert.deepEqual(result.changes[0].place, {
    rank: 1,
    words: 'the wedding matters most',
    saidAt: NOW,
    until: NOW + 30 * DAY,
    captureId: 'c1',
  });
});

test('renumbering spaces every rank evenly and keeps ties and order', () => {
  const spaced = renumberRanks(
    new Map([
      ['a', 10],
      ['b', 10],
      ['c', 2.5],
      ['d', 2 ** -40],
      ['e', -0.25],
      ['f', -8],
    ]),
  );
  assert.deepEqual(Object.fromEntries(spaced), {
    a: 3,
    b: 3,
    c: 2,
    d: 1,
    e: -1,
    f: -2,
  });
});

test('a gap that would be too small renumbers everyone in the same write', () => {
  const crowded = [
    item('a', { place: place(1) }),
    item('b', { place: place(1 + 2 ** -31) }),
    item('c', { place: place(1 + 2 ** -31) }),
    item('d', { place: place(-3) }),
    item('e'),
  ];
  const { result, items } = apply(crowded, say('e', 'above', 'a'));
  assert.equal(result.isRenumbered, true);
  const order = readImportanceOrder(items, TODAY);
  assert.deepEqual(
    order.inOrder.map((row) => [row.id, row.rank]),
    [
      ['b', 3],
      ['c', 3],
      ['e', 2],
      ['a', 1],
    ],
  );
  assert.equal(order.canWait[0].rank, -1);
});

test('a place past its end day reads as not said, and comes back when it has not passed', () => {
  const items = [
    item('wedding', { place: place(2, TODAY - DAY) }),
    item('work', { place: place(1, TODAY) }),
  ];
  const order = readImportanceOrder(items, TODAY);
  assert.deepEqual(
    order.inOrder.map((row) => row.id),
    ['work'],
  );
  assert.equal(order.notSaid[0].id, 'wedding');
  assert.equal(order.notSaid[0].isExpired, true);
  assert.equal(readImportanceOrder(items, TODAY - 2 * DAY).inOrder.length, 2);
});

test("a habit with no place of its own sits at its goal's place, and finished things leave", () => {
  const items = [
    item('guitar', { kind: 'goal', place: place(2) }),
    item('practice', { kind: 'habit', goalId: 'guitar' }),
    item('water', { kind: 'habit' }),
    item('move', { status: 'out', place: place(5) }),
    item('stretch', { kind: 'habit', place: place(-1) }),
    item('paused', { status: 'paused', place: place(1) }),
  ];
  const order = readImportanceOrder(items, TODAY);
  assert.deepEqual(
    order.inOrder.map((row) => [row.id, row.position, row.isInherited]),
    [
      ['guitar', 1, false],
      ['paused', 2, false],
    ],
  );
  const practice = order.rows.find((row) => row.id === 'practice');
  assert.deepEqual(
    [practice?.position, practice?.isInherited],
    [1, true],
    'read at its goal, never counted in a place',
  );
  assert.equal(
    order.rows.some((row) => row.id === 'move'),
    false,
  );
  assert.equal(order.inOrder[1].isPaused, true);
  assert.deepEqual(
    order.canWait.map((row) => row.id),
    ['stretch'],
  );
});

test('a health or care thing is refused and counted in Always kept, never placed', () => {
  const items = [
    item('pills', { kind: 'habit', isCare: true }),
    item('mom', { kind: 'habit', isCare: true, place: place(4) }),
    item('wedding'),
  ];
  const order = readImportanceOrder(items, TODAY);
  assert.deepEqual(order.alwaysKept, ['pills', 'mom']);
  assert.equal(
    order.rows.some((row) => row.id === 'pills' || row.id === 'mom'),
    false,
  );
  assert.deepEqual(applyImportance(order, say('pills', 'most'), NOW), {
    kind: 'refused',
    reason: 'care',
    id: 'pills',
  });
  assert.deepEqual(
    applyImportance(order, say('wedding', 'above', 'pills'), NOW),
    { kind: 'refused', reason: 'care', id: 'pills' },
  );
  assert.equal(
    applyImportance(order, say('nobody', 'most'), NOW).kind,
    'missing',
  );
});

test('things nobody placed are ordered by their nearest date, undated last', () => {
  const items = [
    item('none'),
    item('later', { date: TODAY + 40 * DAY }),
    item('soon', { date: TODAY + 3 * DAY }),
    item('overdue', { date: TODAY - 2 * DAY }),
    item('placed', { place: place(1) }),
  ];
  assert.deepEqual(ids(items), ['placed', 'overdue', 'soon', 'later', 'none']);
});

test('Which comes first is for 3 or more sharing a place, never 2', () => {
  const two = [item('a', { place: place(1) }), item('b', { place: place(1) })];
  assert.equal(findImportanceTie(readImportanceOrder(two, TODAY)), null);
  const three = [...two, item('c', { date: TODAY + DAY })];
  const joined = apply(three, say('c', 'same', 'a'));
  const tie = findImportanceTie(readImportanceOrder(joined.items, TODAY));
  assert.deepEqual(tie?.ids.sort(), ['a', 'b', 'c']);
  assert.equal(tie?.isTop, true);
  const lower = [
    item('top', { place: place(5) }),
    item('x', { place: place(1) }),
    item('y', { place: place(1) }),
    item('z', { place: place(1) }),
  ];
  const lowerTie = findImportanceTie(readImportanceOrder(lower, TODAY));
  assert.equal(lowerTie?.isTop, false);
  assert.equal(
    findImportanceTie(readImportanceOrder(lower, TODAY), new Set(['top'])),
    null,
    'asked again only when something new joins',
  );
});

test('the pick goes just above the others, which keep sharing their place', () => {
  const tied = [
    item('a', { place: place(1) }),
    item('b', { place: place(1) }),
    item('c', { place: place(1) }),
  ];
  const { items } = apply(tied, say('b', 'above', 'a'));
  const order = readImportanceOrder(items, TODAY);
  assert.deepEqual(
    order.inOrder.map((row) => [row.id, row.position]),
    [
      ['b', 1],
      ['a', 2],
      ['c', 2],
    ],
  );
});

test('a stored place that is malformed reads as none', () => {
  assert.equal(
    readPlace({
      rank: 0,
      words: null,
      saidAt: 1,
      until: null,
      captureId: null,
    }),
    null,
  );
  assert.equal(readPlace({ rank: 'x' }), null);
  assert.equal(readPlace(null), null);
  assert.equal(
    readPlace({ rank: 1, words: 5, saidAt: 1, until: null, captureId: null }),
    null,
  );
  assert.deepEqual(
    readPlace({
      rank: -2,
      words: 'x'.repeat(200),
      saidAt: 1,
      until: null,
      captureId: null,
    })?.words?.length,
    120,
  );
});

const record = (
  id: string,
  name: string,
  over: Partial<ImportanceRecord['item']> = {},
  isPrivate = false,
): ImportanceRecord => ({
  item: {
    id,
    kind: 'project',
    name,
    place: null,
    goalId: null,
    isCare: false,
    status: 'running',
    date: null,
    ...over,
  },
  collection: 'projects',
  emoji: null,
  isPrivate,
  words: { name },
  lastEditedAt: 1,
});

const saying = (
  relation: SetImportanceCommand['relation'],
  subjectId: string | null,
  otherId: string | null = null,
): SetImportanceCommand => ({
  kind: 'setImportance',
  subjectId,
  unknownName: subjectId === null ? 'Garden' : null,
  relation,
  otherId,
  words: 'said it',
  until: null,
});

const plan = (
  commands: SetImportanceCommand[],
  records: ImportanceRecord[],
  over: { blocked?: string[]; isUnattended?: boolean } = {},
) =>
  planImportance({
    commands,
    records,
    today: TODAY,
    now: NOW,
    captureId: 'c1',
    blockedIds: new Set(over.blocked ?? []),
    isUnattended: over.isUnattended ?? false,
    newId: () => 'q1',
    seal: (fields) => fields as never,
    room: 20,
  });

test('server: "the wedding matters most, then work" places both and says the order back', () => {
  const made = plan(
    [saying('most', 'a'), saying('below', 'b', 'a')],
    [record('a', 'Wedding'), record('b', 'Work')],
  );
  assert.equal(made.effects.length, 2);
  assert.deepEqual(made.lines.slice(-1), [
    'Wedding comes first now, then Work',
  ]);
  assert.equal(made.questions.length, 0);
  assert.deepEqual(made.effects[0].previous?.['sealed.importance'], null);
});

test('server: health and care are refused and an unknown name offers to start one', () => {
  const made = plan(
    [saying('most', 'c'), saying('most', null)],
    [record('c', 'Pills', { isCare: true }), record('a', 'Wedding')],
  );
  assert.equal(made.effects.length, 0);
  assert.deepEqual(made.notKept, [
    "Pills is always kept, so it doesn't need a place",
    "I couldn't find that in your projects, goals or habits, so nothing moved.",
  ]);
});

const tieRecords = () => [
  record('a', 'A', { place: place(1) }),
  record('b', 'B', { place: place(1) }),
  record('c', 'C'),
];

test('server: a third thing at the top is held and asked, never written first', () => {
  const made = plan([saying('same', 'c', 'a')], tieRecords());
  assert.equal(made.questions.length, 1);
  assert.equal(made.questions[0].sealed.kind, 'whichComesFirst');
  assert.equal(
    made.updates.some(({ id }) => id === 'c'),
    false,
    'the tied thing is not written before it is asked',
  );
  assert.deepEqual(made.questions[0].sealed.heldCommands, [
    {
      kind: 'whichComesFirst',
      ids: ['a', 'b', 'c'],
      held: [{ subjectId: 'c', otherId: 'a' }],
    },
  ]);
});

test('server: an unattended tie writes nothing for the tied thing and says it waits', () => {
  const made = plan([saying('same', 'c', 'a')], tieRecords(), {
    isUnattended: true,
  });
  assert.equal(made.questions.length, 0);
  assert.equal(made.updates.length, 0);
  assert.equal(made.notKept.length, 1);
  assert.match(made.notKept[0], /waits until you're here/);
});

const asked = (over: { heldC?: boolean } = {}) => {
  const made = plan([saying('same', 'c', 'a')], tieRecords());
  return {
    sealed: {
      ...(made.questions[0].sealed as Record<string, unknown>),
      ...(over.heldC === false
        ? { heldCommands: [{ kind: 'whichComesFirst', ids: ['a', 'b', 'c'] }] }
        : {}),
    },
  };
};

const resolve = (optionId: string, records: ImportanceRecord[], heldC = true) =>
  planResolveImportance({
    captureId: 'c1',
    questionId: 'q1',
    optionId,
    by: 'tap',
    now: NOW,
    executionId: 'e1',
    records,
    today: TODAY,
    capture: {
      status: 'needsYou',
      executionIds: [],
      questionState: {
        q1: {
          kind: 'whichComesFirst',
          shape: 'pickOne',
          askedAt: NOW,
          answeredAt: null,
          skippedAt: null,
          dismissedAt: null,
        },
      },
    },
    opened: { questions: { q1: asked({ heldC }).sealed } },
    seal: (fields) => fields as never,
  });

const rankOf = (
  result: ReturnType<typeof resolve>,
  records: ImportanceRecord[],
) => {
  assert.equal(result.refused, null);
  if (result.refused !== null || !result.plan) throw new Error('no plan');
  const written = new Map(
    result.plan.updates.map(({ id, data }) => [
      id,
      (data.sealed as { importance: ImportancePlace | null }).importance,
    ]),
  );
  const items = records.map((entry) => ({
    ...entry.item,
    place: written.has(entry.item.id)
      ? (written.get(entry.item.id) ?? null)
      : entry.item.place,
  }));
  return Object.fromEntries(
    readImportanceOrder(items, TODAY).inOrder.map((row) => [
      row.id,
      row.position,
    ]),
  );
};

test('server: answering puts the pick first and the held thing shares second, with nothing "already there"', () => {
  assert.deepEqual(rankOf(resolve('a', tieRecords()), tieRecords()), {
    a: 1,
    b: 2,
    c: 2,
  });
  assert.deepEqual(rankOf(resolve('c', tieRecords()), tieRecords()), {
    c: 1,
    a: 2,
    b: 2,
  });
  const answered = resolve('b', tieRecords());
  assert.equal(answered.refused, null);
  if (answered.refused === null && answered.plan)
    assert.deepEqual(answered.plan.notKept, []);
});

test('server: a question asked before things were held still puts the pick above the others', () => {
  const sharing = [
    record('a', 'A', { place: place(1) }),
    record('b', 'B', { place: place(1) }),
    record('c', 'C', { place: place(1) }),
  ];
  assert.deepEqual(rankOf(resolve('c', sharing, false), sharing), {
    c: 1,
    a: 2,
    b: 2,
  });
});

test('server: the only one in place keeps its place while the held ones follow it', () => {
  const made = plan(
    [saying('same', 'b', 'a'), saying('same', 'c', 'a')],
    [record('a', 'A', { place: place(1) }), record('b', 'B'), record('c', 'C')],
  );
  assert.equal(made.updates.length, 0);
  assert.deepEqual(made.questions[0].sealed.heldCommands, [
    {
      kind: 'whichComesFirst',
      ids: ['a', 'b', 'c'],
      held: [
        { subjectId: 'b', otherId: 'a' },
        { subjectId: 'c', otherId: 'a' },
      ],
    },
  ]);
});

test("server: a goal's habit is pointed at its goal, and a name is matched against the records", () => {
  const records = [
    record('g', 'Guitar', { kind: 'goal' }),
    record('h', 'Practice', { kind: 'habit', goalId: 'g' }),
    record('w', 'Work', { place: place(1) }),
  ];
  const made = plan([saying('most', 'h')], records);
  assert.deepEqual(
    made.updates.map(({ id }) => id),
    ['g'],
  );
  const named = plan(
    [{ ...saying('most', null), unknownName: 'guitar' }],
    records,
  );
  assert.deepEqual(
    named.updates.map(({ id }) => id),
    ['g'],
  );
  const heard = planImportance({
    commands: [{ ...saying('most', null), unknownName: 'Garden' }],
    records,
    today: TODAY,
    now: NOW,
    captureId: 'c1',
    blockedIds: new Set(),
    isUnattended: false,
    newId: () => 'q1',
    seal: (fields) => fields as never,
    room: 20,
    captureText: 'the garden matters most',
  });
  assert.deepEqual(heard.notKept, [
    "I couldn't find Garden in your projects, goals or habits, so nothing moved.",
  ]);
});

test("a goal's habit ignores its own place while the goal is in the order, and is listed alone once it leaves", () => {
  const items = [
    item('guitar', { kind: 'goal', place: place(2) }),
    item('practice', { kind: 'habit', goalId: 'guitar', place: place(2) }),
    item('scales', { kind: 'habit', goalId: 'guitar', place: place(2) }),
    item('work', { place: place(2) }),
  ];
  assert.deepEqual(readUnderGoalIds(items), ['practice', 'scales']);
  const order = readImportanceOrder(items, TODAY);
  assert.deepEqual(order.inOrder.map((row) => row.id).sort(), [
    'guitar',
    'work',
  ]);
  assert.equal(findImportanceTie(order), null, 'habits never make a tie');
  const gone = items.map((entry) =>
    entry.id === 'guitar' ? { ...entry, status: 'out' as const } : entry,
  );
  assert.deepEqual(readUnderGoalIds(gone), []);
  assert.deepEqual(
    readImportanceOrder(gone, TODAY)
      .inOrder.map((row) => row.id)
      .sort(),
    ['practice', 'scales', 'work'],
  );
  const care = items.map((entry) =>
    entry.id === 'guitar' ? { ...entry, isCare: true } : entry,
  );
  assert.deepEqual(readUnderGoalIds(care), []);
});

test('the planner is given a finite place for every project', () => {
  const places = readProjectPlaces(
    readImportanceOrder(
      [
        item('first', { place: place(3) }),
        item('second', { place: place(2) }),
        item('open'),
        item('later', { place: place(-1) }),
        item('latest', { place: place(-2) }),
      ],
      TODAY,
    ),
  );
  assert.deepEqual(places, {
    first: 1,
    second: 2,
    open: NOT_SAID_PLACE,
    later: CAN_WAIT_PLACE,
    latest: CAN_WAIT_PLACE + 1,
  });
});

test('every phrase the order is said in opens the importance reading', () => {
  [
    'The wedding matters most',
    'Wedding comes first',
    'Wedding is my top priority',
    'Guitar matters more than work',
    'Guitar before work',
    'Work matters less than guitar',
    'Work after guitar',
    'Guitar comes after work',
    'Guitar matters as much as work',
    'Guitar and work matter equally',
    'Guitar is important',
    'Home can wait',
    "Home isn't a priority right now",
    'Home, whenever',
    "Guitar doesn't matter so much now",
    'Take guitar out of the order',
    'Clear what matters',
  ].forEach((phrase) => assert.equal(hasImportanceCue(phrase), true, phrase));
  ['Guitar too', 'The wedding, then work, then guitar'].forEach((phrase) => {
    assert.equal(hasImportanceCue(phrase), false, phrase);
    assert.equal(hasImportanceCue(phrase, 'importance'), true, phrase);
  });
  assert.equal(hasImportanceCue('Buy milk too'), false);
});

test('server: the newer sentence wins and a private name is masked unattended', () => {
  const made = plan(
    [saying('most', 'a'), saying('most', 'b')],
    [record('a', 'A'), record('b', 'Secret', {}, true)],
    { isUnattended: true },
  );
  assert.equal(made.effects.length, 2);
  assert.equal(
    made.lines.slice(-1)[0],
    'a private item comes first now, then A',
  );
});

test('server: a document another plan writes keeps its place', () => {
  const made = plan(
    [saying('most', 'a')],
    [record('a', 'A'), record('b', 'B', { place: place(1) })],
    { blocked: ['a'] },
  );
  assert.equal(made.effects.length, 0);
  assert.equal(made.notKept.length, 1);
});

test('server: the reply is read by alias, the words are cut from the capture', () => {
  const projects = createAliasBook('p');
  const alias = projects.add('a');
  const read = readImportanceCommands(
    [
      {
        kind: 'setImportance',
        subjectAlias: alias,
        importanceRelation: 'most',
        requestQuote: 'wedding matters most',
        dateSpanId: null,
      },
      {
        kind: 'setImportance',
        subjectAlias: 'p9',
        importanceRelation: 'most',
        requestQuote: 'wedding matters most',
      },
      {
        kind: 'setImportance',
        subjectAlias: alias,
        importanceRelation: 'most',
        requestQuote: 'something never said',
      },
    ],
    {
      projects,
      reading: { dates: [] } as never,
      captureText: 'The Wedding matters most, then work',
    },
  );
  assert.equal(read.commands.length, 1);
  assert.equal(read.commands[0].words, 'Wedding matters most');
  assert.deepEqual(read.dropped, ['importance-unknown', 'importance-unasked']);
});

if (failures > 0) {
  console.error(`check:helm-importance: ${failures} failed`);
  process.exit(1);
}
console.log('check:helm-importance: ok');
