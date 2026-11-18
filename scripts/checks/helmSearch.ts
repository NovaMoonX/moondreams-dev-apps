import assert from 'node:assert/strict';

import type {
  OpenFact,
  OpenMedia,
  OpenNote,
  OpenPlace,
  OpenProcedure,
  OpenProject,
  OpenTask,
  OpenTopic,
  OpenWho,
  SyncedRecord,
} from '../../src/apps/helm/types.ts';
import type { ByWho } from '../../src/apps/helm/utils/keyDateIndex.ts';
import type { WhoMoment } from '../../src/apps/helm/utils/moments.ts';
import {
  SEARCH_GROUPS,
  SEARCH_PREVIEW,
  buildSearchIndex,
  mergeTasks,
  searchEntries,
  toGroupRows,
  type SearchSources,
} from '../../src/apps/helm/utils/searchRecords.ts';

const empty: SearchSources = {
  who: [],
  places: [],
  tasks: [],
  facts: [],
  byWho: {},
  moments: [],
  notes: [],
  topics: [],
  projects: [],
  procedures: [],
  media: [],
  synced: [],
};

const who = (id: string, name: string, extra: Partial<OpenWho> = {}) =>
  ({
    id,
    name,
    kind: 'person',
    tier: 'regular',
    isSelf: false,
    aliases: [],
    relation: null,
    species: null,
    organizationKind: null,
    photoMediaId: null,
    isUnreadable: false,
    ...extra,
  }) as unknown as OpenWho;

const task = (id: string, title: string, extra: Partial<OpenTask> = {}) =>
  ({
    id,
    title,
    notes: null,
    steps: {},
    status: 'open',
    createdAt: 1,
    completedAt: null,
    isUnreadable: false,
    ...extra,
  }) as unknown as OpenTask;

const note = (id: string, title: string, body: string, topicIds: string[]) =>
  ({
    id,
    title,
    body,
    topicIds,
    createdAt: 1,
    lastEditedAt: null,
    isUnreadable: false,
  }) as unknown as OpenNote;

const topic = (id: string, name: string) =>
  ({
    id,
    name,
    emoji: null,
    overview: null,
    sections: [],
    parentId: null,
    depth: 1,
    isUnreadable: false,
  }) as unknown as OpenTopic;

const titlesOf = (sources: SearchSources, query: string, group: string) =>
  searchEntries(buildSearchIndex(sources), query)[
    group as (typeof SEARCH_GROUPS)[number]
  ].map((entry) => entry.describe().title);

// Every word must appear, in any order, in the title or the body; title hits lead.
const words = {
  ...empty,
  notes: [
    note('n1', 'Cake', 'Keeps three days in the fridge', []),
    note('n2', 'Fridge cake keeping', 'Wrap it well', []),
    note('n3', 'Other', 'Nothing', []),
  ],
};
assert.deepEqual(titlesOf(words, 'fridge cake', 'notes'), [
  'Fridge cake keeping',
  'Cake',
]);
assert.deepEqual(titlesOf(words, 'cake fridge', 'notes'), [
  'Fridge cake keeping',
  'Cake',
]);
assert.deepEqual(titlesOf(words, 'cake dragon', 'notes'), []);
assert.deepEqual(titlesOf(words, '   ', 'notes'), []);

// Accents and case fold.
const accents = { ...empty, who: [who('w1', 'José Núñez'), who('w2', 'Dana')] };
assert.deepEqual(titlesOf(accents, 'JOSE nunez', 'people'), ['José Núñez']);
assert.deepEqual(titlesOf(accents, 'josé', 'people'), ['José Núñez']);

// An unreadable record is never found.
const unreadable = {
  ...empty,
  who: [who('w1', '', { isUnreadable: true }), who('w2', 'Mia')],
  tasks: [task('t1', 'Pay rent', { isUnreadable: true })],
};
assert.deepEqual(titlesOf(unreadable, 'mia', 'people'), ['Mia']);
assert.deepEqual(titlesOf(unreadable, 'rent', 'tasks'), []);

// Open tasks lead; a done one from the earlier read joins after, and the live store wins on an id.
const doneEarlier = task('t9', 'Book dentist', {
  status: 'done',
  completedAt: 5,
});
const reopened = task('t9', 'Book dentist', { status: 'open' });
const open = task('t1', 'Book dentist visit', { createdAt: 3 });
const merged = mergeTasks([doneEarlier], [open]);
assert.deepEqual(titlesOf({ ...empty, tasks: merged }, 'dentist', 'tasks'), [
  'Book dentist visit',
  'Book dentist',
]);
const mergedOpen = mergeTasks([doneEarlier], [reopened, open]);
assert.equal(mergedOpen.length, 2);
assert.equal(mergedOpen.find((entry) => entry.id === 't9')?.status, 'open');
const doneRows = searchEntries(
  buildSearchIndex({ ...empty, tasks: merged }),
  'dentist',
).tasks;
assert.equal(doneRows[0].mark, null);
assert.deepEqual(doneRows[1].mark, { kind: 'done', completedAt: 5 });

// A birthday, a month name or a custom label finds a yearly date; a moment too.
const maya = who('w1', 'Maya');
const byWho: ByWho = {
  w1: [
    ['k1', 'birthday', 6, 14, 1990, null],
    ['k2', 'custom', 11, 2, null, 'Gotcha day'],
  ],
};
const moment: WhoMoment = {
  id: 'm1',
  whoId: 'w1',
  kind: 'met',
  label: null,
  precision: 'month',
  month: 3,
  day: null,
  year: 2015,
  source: 'person',
  createdAt: 1,
  captureId: null,
};
const dates = { ...empty, who: [maya], byWho, moments: [moment] };
assert.deepEqual(titlesOf(dates, 'birthday', 'dates'), ["Maya's birthday"]);
assert.deepEqual(titlesOf(dates, 'June', 'dates'), ["Maya's birthday"]);
assert.deepEqual(titlesOf(dates, 'maya june', 'dates'), ["Maya's birthday"]);
assert.deepEqual(titlesOf(dates, 'gotcha', 'dates'), ["Maya's gotcha day"]);
assert.deepEqual(titlesOf(dates, 'march', 'dates'), ['Maya · Met']);
assert.deepEqual(titlesOf({ ...dates, who: [] }, 'birthday', 'dates'), []);
const dateRow = searchEntries(buildSearchIndex(dates), 'birthday').dates[0];
assert.deepEqual(dateRow.target, { kind: 'view', view: 'who', id: 'w1' });

// A note carries its topic, and the topic's name finds it.
const filed = {
  ...empty,
  topics: [topic('p1', 'Baking')],
  notes: [
    note('n1', 'Cake', 'Keeps three days', ['p1']),
    note('n2', 'Loose thing', 'Nowhere', []),
  ],
};
const noteRows = searchEntries(buildSearchIndex(filed), 'cake').notes;
assert.equal(noteRows[0].describe().line, 'Baking');
assert.equal(
  searchEntries(buildSearchIndex(filed), 'loose').notes[0].describe().line,
  'Loose note',
);
assert.deepEqual(titlesOf(filed, 'baking', 'notes'), ['Cake']);

// A fact opens its subject, else the page about the person.
const fact = (id: string, whoIds: string[]) =>
  ({
    id,
    statement: `Statement ${id}`,
    topic: null,
    value: null,
    status: 'confirmed',
    whoIds,
    placeIds: [],
    projectIds: [],
    createdAt: 1,
    lastEditedAt: null,
  }) as unknown as OpenFact;
const facts = searchEntries(
  buildSearchIndex({
    ...empty,
    who: [maya],
    facts: [fact('f1', ['w1']), fact('f2', [])],
  }),
  'statement',
).facts;
assert.deepEqual(
  facts.map((entry) => entry.target.kind),
  ['view', 'seesYou'],
);

// A group shows three rows and counts the rest; opened, it shows them all up to the cap.
const many = {
  ...empty,
  who: Array.from({ length: 7 }, (_, index) =>
    who(`w${index}`, `Sam ${index}`),
  ),
};
const sam = searchEntries(buildSearchIndex(many), 'sam').people;
assert.equal(sam.length, 7);
assert.deepEqual(
  [toGroupRows(sam, false).rows.length, toGroupRows(sam, false).hidden],
  [SEARCH_PREVIEW, 4],
);
assert.deepEqual(
  [toGroupRows(sam, true).rows.length, toGroupRows(sam, true).hidden],
  [7, 0],
);
assert.equal(
  toGroupRows(
    Array.from({ length: 500 }, () => sam[0]),
    true,
  ).rows.length,
  200,
);

// The scale: a lifetime, built once and then filtered on every keystroke.
const FIRST = ['Maya', 'Dana', 'José', 'Aiko', 'Lena', 'Omar', 'Priya', 'Sam'];
const LAST = ['Okafor', 'Núñez', 'Lindqvist', 'Haddad', 'Tanaka', 'Rossi'];
const SENTENCE = [
  'remember to call the florist about the wedding flowers',
  'the dentist moved the appointment to the second Thursday',
  'keeps three days in the fridge wrapped well',
  'winter tyre size is 205 55 16 on the blue car',
  'Grandpa likes the window seat on every flight',
];
const sentence = (index: number) =>
  `${SENTENCE[index % SENTENCE.length]} ${index}`;
const KINDS = ['met', 'moved', 'startedJob', 'leftJob', 'graduated'] as const;

const bigWho = Array.from({ length: 2_000 }, (_, index) =>
  who(
    `w${index}`,
    `${FIRST[index % FIRST.length]} ${LAST[index % LAST.length]} ${index}`,
    {
      aliases: [`Nick ${index}`],
      relation: index % 3 === 0 ? 'my cousin' : null,
    },
  ),
);
const bigByWho: ByWho = Object.fromEntries(
  bigWho.map((entry, index) => [
    entry.id,
    [
      [
        `y${index}a`,
        'birthday',
        (index % 12) + 1,
        (index % 28) + 1,
        1980,
        null,
      ],
      [`y${index}b`, 'anniversary', ((index + 5) % 12) + 1, 3, null, null],
    ],
  ]),
) as ByWho;
const bigMoments: WhoMoment[] = Array.from({ length: 16_000 }, (_, index) => ({
  id: `m${index}`,
  whoId: `w${index % 2_000}`,
  kind: KINDS[index % KINDS.length],
  label: null,
  precision: 'month',
  month: (index % 12) + 1,
  day: null,
  year: 1950 + (index % 70),
  source: 'person',
  createdAt: index,
  captureId: null,
}));
const bigTopics = Array.from({ length: 40 }, (_, index) => ({
  ...topic(`p${index}`, `Topic ${index}`),
  overview: sentence(index),
  sections: Array.from({ length: 6 }, (_, section) => ({
    id: `s${section}`,
    heading: `Part ${section}`,
    level: 1,
    markdown: sentence(index + section).repeat(4),
    writtenBy: 'nomos',
    sources: [],
  })),
})) as unknown as OpenTopic[];
const makeBig = (): SearchSources => ({
  who: bigWho,
  places: Array.from({ length: 50 }, (_, index) => ({
    id: `pl${index}`,
    name: `Place ${index}`,
    aliases: [],
    address: `${index} Main Street`,
    notes: null,
    isUnreadable: false,
  })) as unknown as OpenPlace[],
  tasks: Array.from({ length: 3_600 }, (_, index) =>
    task(`t${index}`, sentence(index), {
      status: index < 600 ? 'open' : 'done',
      completedAt: index,
      notes: index % 4 === 0 ? sentence(index + 1) : null,
      steps: index % 10 === 0 ? { a: { text: sentence(index + 2) } } : {},
    }),
  ),
  facts: Array.from({ length: 2_000 }, (_, index) => ({
    ...fact(`f${index}`, [`w${index}`]),
    statement: sentence(index),
    topic: 'gas station',
    value: 'Shell',
  })),
  byWho: bigByWho,
  moments: bigMoments,
  notes: Array.from({ length: 300 }, (_, index) =>
    note(`n${index}`, sentence(index), sentence(index).repeat(8), [
      `p${index % 40}`,
    ]),
  ),
  topics: bigTopics,
  projects: Array.from({ length: 20 }, (_, index) => ({
    id: `pr${index}`,
    name: `Project ${index}`,
    emoji: null,
    objective: sentence(index),
    milestones: { a: { title: sentence(index + 1) } },
    status: 'active',
    isUnreadable: false,
  })) as unknown as OpenProject[],
  procedures: Array.from({ length: 30 }, (_, index) => ({
    id: `pc${index}`,
    title: `Routine ${index}`,
    steps: Object.fromEntries(
      Array.from({ length: 12 }, (_, step) => [
        `s${step}`,
        { text: sentence(step + index), detail: null },
      ]),
    ),
  })) as unknown as OpenProcedure[],
  media: Array.from({ length: 1_000 }, (_, index) => ({
    id: `me${index}`,
    kind: 'photo',
    fileName: null,
    status: 'kept',
    caption: sentence(index),
    attachedTo: [{ kind: 'who', id: `w${index}` }],
    createdAt: index,
    isUnreadable: false,
  })) as unknown as OpenMedia[],
  synced: Array.from({ length: 2_000 }, (_, index) => ({
    id: `sy${index}`,
    startAt: index,
    sealed: {
      title: sentence(index),
      subtitle: 'Seattle',
      detail: sentence(index + 3),
      placeLabel: 'Pike Place',
    },
  })) as unknown as SyncedRecord[],
});

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const timed = <T>(run: () => T) => {
  const start = performance.now();
  const result = run();
  return { ms: performance.now() - start, result };
};

const cold = timed(() => buildSearchIndex(makeBig()));
// A record folds once per object, so a build of records never seen before is the full cost.
const fresh = median(
  Array.from({ length: 5 }, () => {
    const sources = makeBig();
    return timed(() => buildSearchIndex(sources)).ms;
  }),
);
const sources = makeBig();
buildSearchIndex(sources);
const rebuilt = median(
  Array.from({ length: 5 }, () => timed(() => buildSearchIndex(sources)).ms),
);
const index = buildSearchIndex(sources);
const QUERIES = [
  'a',
  'dentist appointment',
  'maya okafor',
  'birthday june',
  'wedding flowers 99',
  'zzzz',
];
const queryMs = QUERIES.map((query) => ({
  query,
  ms: median(
    Array.from(
      { length: 9 },
      () => timed(() => searchEntries(index, query)).ms,
    ),
  ),
}));
const worst = Math.max(...queryMs.map((entry) => entry.ms));
const FOUR_X = 4;

console.log(
  `helm search build, first of all (a cold engine): ${cold.ms.toFixed(1)} ms`,
);
console.log(
  `helm search build, every record new: ${fresh.toFixed(1)} ms median of 5 (x4 on a phone: ${(fresh * FOUR_X).toFixed(0)} ms)`,
);
console.log(
  `helm search rebuild, records unchanged: ${rebuilt.toFixed(1)} ms median of 5 (x4: ${(rebuilt * FOUR_X).toFixed(0)} ms)`,
);
queryMs.forEach(({ query, ms }) =>
  console.log(
    `helm search "${query}": ${ms.toFixed(2)} ms (x4: ${(ms * FOUR_X).toFixed(1)} ms)`,
  ),
);
assert.ok(rebuilt <= 60, `a rebuild took ${rebuilt.toFixed(1)} ms, over 60`);
assert.ok(worst <= 10, `a query took ${worst.toFixed(2)} ms, over 10`);

console.log('helm search: ok');
