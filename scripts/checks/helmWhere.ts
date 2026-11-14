// Fails when a thing Helm keeps or reads has no row in WHERE_THINGS_LIVE, or a row names something that does not exist.
// `--write` rewrites the snapshot of the generated prompt block.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { GOOGLE_CALENDAR_MANIFEST } from '../../src/lib/connections/google/calendarManifest.ts';
import { GOOGLE_CONTACTS_MANIFEST } from '../../src/lib/connections/google/contactsManifest.ts';
import { GOOGLE_DRIVE_MANIFEST } from '../../src/lib/connections/google/driveManifest.ts';
import { GOOGLE_GMAIL_MANIFEST } from '../../src/lib/connections/google/gmailManifest.ts';
import { SOURCE_SHARES } from '../../src/lib/connections/sources.ts';
import {
  CLOSE_CONVERSATION_TOOL,
  COMMAND_KINDS,
  DELETING_COMMANDS,
  PROCEDURE_COMMAND_KINDS,
  RUN_COMMAND_KINDS,
  TOPIC_COMMAND_KINDS,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  COMMAND_WRITERS,
  DERIVED_FROM,
  HELM_HOMES,
  TURN_BLOCKS,
  WHERE_THINGS_LIVE,
  renderWhereBlock,
  type WhereRow,
} from '../../src/apps/helm/whereThingsLive.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const SNAPSHOT = join(ROOT, 'scripts/checks/fixtures/helmWhere.snapshot.txt');
const VIRTUAL_HOMES = ['profile', 'live', 'connections'];

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const findFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? findFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );

const matches = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].map((found) => found[1]);

const helmRules = read('firestore.rules')
  .split('// --- App: ')
  .filter((section) => section.startsWith('helm ---'))
  .join('');
const types = read('src/apps/helm/types.ts');
const serverFiles = findFiles('functions/src/apps/helm');

const manifests = [
  GOOGLE_CALENDAR_MANIFEST,
  GOOGLE_GMAIL_MANIFEST,
  GOOGLE_DRIVE_MANIFEST,
  GOOGLE_CONTACTS_MANIFEST,
  ...SOURCE_SHARES.flatMap((source) => source.shares),
];

interface World {
  tools: string[];
  commands: string[];
  collections: string[];
  blocks: string[];
  categories: string[];
  batchJobs: string[];
  writerExists: (writer: string) => boolean;
  exportsOf: (writer: string) => string[];
  isTypeField: (field: string) => boolean;
}

const writerPath = (writer: string) => {
  const [kind, file] = writer.split('/');
  if (kind === 'actions') return [`src/apps/helm/store/actions/${file}.ts`];
  if (kind === 'platform') return [`functions/src/connections/${file}.ts`];
  return serverFiles.filter((path) => path.endsWith(`/${file}.ts`));
};

const world: World = {
  tools: [
    ...matches(
      read('functions/src/apps/helm/mcp/buildTools.ts'),
      /^ {4}name: '([a-z_]+)',/gm,
    ),
  ],
  commands: [
    ...COMMAND_KINDS,
    ...TOPIC_COMMAND_KINDS,
    ...PROCEDURE_COMMAND_KINDS,
    ...RUN_COMMAND_KINDS,
    CLOSE_CONVERSATION_TOOL.name,
  ],
  collections: [
    ...matches(helmRules, /collection in \[([^\]]*)\]/g).flatMap((list) =>
      matches(list, /'(\w+)'/g),
    ),
    ...matches(
      helmRules,
      /match \/apps\/helm\/users\/\{uid\}\/(\w+)\/\{[^}]+\} \{/g,
    ),
    ...matches(types, /apps\/helm\/users\/\{uid\}\/(\w+)\/\{/g),
  ].filter((name, index, all) => all.indexOf(name) === index),
  blocks: matches(
    read('functions/src/apps/helm/nomos/buildContext.ts'),
    /(<[a-z_]+>)\$\{/g,
  ),
  categories: manifests.flatMap((manifest) =>
    manifest.categories.map((category) => `${manifest.id}/${category.id}`),
  ),
  batchJobs: serverFiles.some((path) => /\bBATCH_JOBS\b/.test(read(path)))
    ? ['BATCH_JOBS exists: teach check:helm-where to read it']
    : [],
  writerExists: (writer) =>
    writer === 'none' ||
    writerPath(writer).some((path) => existsSync(join(ROOT, path))),
  exportsOf: (writer) =>
    writerPath(writer)
      .filter((path) => existsSync(join(ROOT, path)))
      .flatMap((path) =>
        matches(read(path), /^export (?:async )?(?:function|const) (\w+)/gm),
      ),
  isTypeField: (field) => new RegExp(`\\b${field}\\b`).test(types),
};

const toSet = (items: string[]) => new Set(items);

function findProblems(rows: WhereRow[], known: World) {
  const rowHomes = toSet(rows.map((entry) => entry.home));
  const rowTools = toSet(rows.flatMap((entry) => entry.tools));
  const rowCommands = toSet(rows.flatMap((entry) => entry.commands));
  const rowBlocks = toSet(
    rows.flatMap((entry) => (entry.contextBlock ? [entry.contextBlock] : [])),
  );
  const rowCategories = toSet(
    rows.flatMap((entry) =>
      entry.grant ? [`${entry.grant.source}/${entry.grant.category}`] : [],
    ),
  );
  const homes: string[] = [...HELM_HOMES];
  const missing = (kind: string, wanted: string[], have: Set<string>) =>
    wanted
      .filter((name) => !have.has(name))
      .map((name) => `${kind} ${name} has no row`);
  const unknown = (kind: string, named: string[], real: string[]) =>
    named
      .filter((name) => !real.includes(name))
      .map((name) => `a row names ${kind} ${name}, which does not exist`);
  return [
    ...missing('tool', known.tools, rowTools),
    ...missing('command', known.commands, rowCommands),
    ...missing('collection', known.collections, rowHomes),
    ...missing(
      'context block',
      known.blocks.filter(
        (block) => !(TURN_BLOCKS as readonly string[]).includes(block),
      ),
      rowBlocks,
    ),
    ...missing('connected category', known.categories, rowCategories),
    ...known.batchJobs.map((job) => `batch job ${job} has no row`),
    ...unknown('tool', [...rowTools], known.tools),
    ...unknown('command', [...rowCommands], known.commands),
    ...unknown('context block', [...rowBlocks], [...known.blocks]),
    ...unknown('connected category', [...rowCategories], known.categories),
    ...unknown(
      'collection',
      [...rowHomes].filter((home) => !VIRTUAL_HOMES.includes(home)),
      known.collections,
    ),
    ...unknown(
      'home',
      rows.flatMap((entry) => [...entry.derivedFrom, ...entry.deleteTakes]),
      homes,
    ),
    ...rows.flatMap((entry) => [
      ...(known.writerExists(entry.writer)
        ? []
        : [`${entry.thing}: writer ${entry.writer} does not exist`]),
      ...entry.taps
        .filter((tap) => !known.exportsOf(entry.writer).includes(tap))
        .map(
          (tap) =>
            `${entry.thing}: tap ${tap} is not an export of ${entry.writer}`,
        ),
      ...(entry.derivedFrom.length > 0 && entry.sourceKeys === null
        ? [`${entry.thing}: a derived home needs sourceKeys`]
        : []),
      ...(entry.sourceKeys !== null && !known.isTypeField(entry.sourceKeys)
        ? [
            `${entry.thing}: sourceKeys ${entry.sourceKeys} is no field in types.ts`,
          ]
        : []),
      ...(entry.home !== 'live' && !entry.isSynced
        ? [`${entry.thing}: a stored result must sync`]
        : []),
      ...(entry.batchJobs.length > 0
        ? [`${entry.thing}: names a batch job that does not exist`]
        : []),
    ]),
  ];
}

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const everySource = WHERE_THINGS_LIVE.flatMap((entry) =>
  entry.grant ? [entry.grant.source] : [],
);
const block = renderWhereBlock(everySource);

const rowFor = (thing: string) => {
  const found = WHERE_THINGS_LIVE.find((entry) => entry.thing === thing);
  assert.ok(found, `no row for ${thing}`);
  return found;
};

test('the map matches the code: nothing missing, nothing invented', () => {
  assert.deepEqual(findProblems(WHERE_THINGS_LIVE, world), []);
});

test('the prompt block is the one generated from the rows and matches its snapshot', () => {
  if (process.argv.includes('--write')) writeFileSync(SNAPSHOT, `${block}\n`);
  assert.equal(`${block}\n`, readFileSync(SNAPSHOT, 'utf8'));
});

test('the turn reads the generated block', () => {
  assert.ok(
    /renderWhereBlock\(/.test(
      read('functions/src/apps/helm/sortHelmCapture.ts'),
    ),
  );
});

test('a live read is listed only with its grant; a synced copy always is', () => {
  const base = renderWhereBlock([]);
  assert.ok(!base.includes('search_mail'));
  assert.ok(!base.includes('search_app_records'));
  assert.ok(renderWhereBlock(['google:gmail']).includes('search_mail'));
  assert.ok(
    renderWhereBlock(['app:runway/transactions']).includes(
      'search_app_records',
    ),
  );
  assert.ok(
    !renderWhereBlock(['app:runway/other']).includes('search_app_records'),
  );
  assert.ok(base.includes('search_tasks'));
  WHERE_THINGS_LIVE.filter(
    (entry) => entry.grant !== null && entry.home === 'synced',
  ).forEach((entry) =>
    assert.ok(base.includes(`- ${entry.thing}:`), entry.thing),
  );
});

test('the turn passes each site grant as its source and category', () => {
  assert.ok(
    /grant\.categories\.map\(\(\{ id \}\) => `\$\{grant\.connectorId\}\/\$\{id\}`\)/.test(
      read('functions/src/apps/helm/sortHelmCapture.ts'),
    ),
  );
});

const QUESTIONS: [string, string, string][] = [
  ["what's on my list", 'Tasks', '<open_tasks>'],
  ['did I finish the thing for Dana', 'Tasks', 'search_tasks'],
  [
    'how is the wedding going',
    'Goals and projects, with their milestones',
    '<open_projects>',
  ],
  [
    'what do I usually order',
    'What the person says about themselves',
    '<about_you>',
  ],
  [
    'what do I know about Dana',
    'What is known about the people and places named',
    '<known_facts>',
  ],
  ["when is Dana's birthday", 'Key dates', '<key_dates>'],
  ["what's coming up", 'The next dates coming up', '<upcoming_dates>'],
  ['what did I note about cakes', 'Notes', '<related_notes>'],
  ['what is in my packing topic', "A topic's document", 'get_topic'],
  ['what are the steps to close the shop', 'Procedures', 'search_procedures'],
  ['where am I on the packing run', 'Runs of a procedure', '<open_runs>'],
  ["what's on my calendar tomorrow", 'Calendar events', 'get_calendar'],
  [
    "what's on the shopping list",
    "Another app's synced things",
    'search_synced',
  ],
  ['what did I spend at the bakery', 'Transactions', 'search_app_records'],
  ['what did the venue email say', 'Mail', 'search_mail'],
  ['what does the contract say', 'Drive documents', 'read_document'],
];

test('a question about each kind of thing is answered from its block or tool', () => {
  QUESTIONS.forEach(([, thing, where]) => {
    const entry = rowFor(thing);
    const reads = [
      ...entry.tools,
      ...(entry.contextBlock ? [entry.contextBlock] : []),
    ];
    assert.ok(reads.includes(where), `${thing} is not read through ${where}`);
    assert.ok(
      block.includes(where),
      `${where} is missing from the prompt block`,
    );
  });
});

const SAME_CHANGE: [string, string, string][] = [
  ['createTask', 'taskActions', 'createTask'],
  ['completeTask', 'taskActions', 'completeTask'],
  ['createProject', 'projectActions', 'createProject'],
  ['addMilestone', 'projectActions', 'addMilestone'],
  ['noteFact', 'memoryActions', 'addFact'],
  ['setKeyDate', 'keyDateActions', 'addKeyDate'],
  ['removeKeyDate', 'keyDateActions', 'removeKeyDate'],
  ['createNote', 'noteActions', 'createNote'],
  ['createProcedure', 'procedureActions', 'createProcedure'],
  ['startRun', 'runActions', 'startRun'],
  ['tickRun', 'runActions', 'tickRunSteps'],
  ['setCurrentPlace', 'planActions', 'setCurrentPlace'],
  ['closeConversation', 'captureActions', 'closeQuestions'],
];

test('a sentence and a tap make the same change through one writer', () => {
  SAME_CHANGE.forEach(([command, file, tap]) => {
    assert.equal(COMMAND_WRITERS[command], `actions/${file}`, command);
    const owner = WHERE_THINGS_LIVE.find((entry) =>
      entry.commands.includes(command),
    );
    assert.ok(
      owner?.taps.includes(tap),
      `${tap} is not a tap of ${command}'s row`,
    );
  });
});

test('every command has one writer and the deleting ones are commands', () => {
  world.commands.forEach((command) =>
    assert.ok(COMMAND_WRITERS[command], command),
  );
  DELETING_COMMANDS.forEach((command) =>
    assert.ok(world.commands.includes(command)),
  );
});

test('what cites another home is listed for the delete cascade', () => {
  assert.deepEqual(DERIVED_FROM.meta, ['keyDates']);
  assert.deepEqual(DERIVED_FROM.topics, ['notes']);
});

const first = WHERE_THINGS_LIVE[0];
const without = (predicate: (entry: WhereRow) => boolean) =>
  WHERE_THINGS_LIVE.filter((entry) => !predicate(entry));

test('a missing row is caught for each kind of thing', () => {
  const cases: [string, WhereRow[]][] = [
    ['tool', without((entry) => entry.tools.includes('search_tasks'))],
    [
      'command',
      without((entry) => entry.commands.includes('closeConversation')),
    ],
    ['collection', without((entry) => entry.home === 'places')],
    [
      'context block',
      without((entry) => entry.contextBlock === '<your_style>'),
    ],
    [
      'connected category',
      without((entry) => entry.grant?.category === 'transactions'),
    ],
  ];
  cases.forEach(([kind, rows]) => {
    assert.ok(
      findProblems(rows, world).some(
        (line) => line.startsWith(kind) || line.includes(` ${kind} `),
      ),
      kind,
    );
  });
});

test('a batch job with no row is caught', () => {
  const problems = findProblems(WHERE_THINGS_LIVE, {
    ...world,
    batchJobs: ['relate'],
  });
  assert.ok(problems.includes('batch job relate has no row'));
});

test('a row naming something that does not exist is caught', () => {
  const invented: WhereRow[] = [
    { ...first, tools: ['search_nothing'] },
    { ...first, commands: ['makeNothing'] },
    { ...first, contextBlock: '<nothing>' },
    { ...first, writer: 'actions/nothingActions' },
    { ...first, taps: ['nothing'] },
    { ...first, grant: { source: 'app:nothing', category: 'nothing' } },
  ];
  invented.forEach((entry) => {
    assert.ok(findProblems([...WHERE_THINGS_LIVE, entry], world).length > 0);
  });
});

test('a derived home without sourceKeys is caught', () => {
  const rows = [
    { ...first, derivedFrom: ['notes' as const], sourceKeys: null },
  ];
  assert.ok(
    findProblems(rows, world).some((line) => line.includes('needs sourceKeys')),
  );
});

const failures: string[] = [];
tests.forEach(([name, run]) => {
  try {
    run();
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}\n`, error);
  }
});
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
