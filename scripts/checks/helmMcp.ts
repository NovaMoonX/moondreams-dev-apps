import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Client } from '../../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { InMemoryTransport } from '../../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';
import { McpServer } from '../../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { toJSONSchema, z } from '../../functions/node_modules/zod/index.js';

import { PINCH_SHARES } from '../../src/apps/pinch/share/manifest.ts';
import { createPinchAdapter } from '../../functions/src/apps/pinch/share/adapter.ts';
import {
  SOURCE_ADAPTERS,
  type AppActionResult,
} from '../../functions/src/connections/registry.ts';
import { buildHelmTools } from '../../functions/src/apps/helm/mcp/buildTools.ts';
import {
  offeredHelmTools,
  registerHelmTools,
} from '../../functions/src/apps/helm/mcp/server.ts';
import { helmGuideFor } from '../../functions/src/apps/helm/mcp/guide.ts';
import {
  READ_SCOPE_LABELS,
  READ_SCOPE_TOOLS,
  filterSourcesForOutside,
  sourcesBriefFor,
  toHeldBackPrompt,
} from '../../functions/src/apps/helm/mcp/sourcesBrief.ts';
import {
  TOO_LONG_NOTICE,
  TOPICS_FULL_NOTICE,
  cleanSavedLinks,
  describeSave,
  planSaveToHelm,
} from '../../functions/src/apps/helm/mcp/saveToHelm.ts';
import { sealForHelm } from '../../functions/src/apps/helm/helmKey.ts';
import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import {
  planUndo,
  type UndoTarget,
} from '../../src/apps/helm/nomos/planUndo.ts';
import type { OpenCapture, OpenExecution } from '../../src/apps/helm/types.ts';
import { readOutsideAdditions } from '../../src/apps/helm/utils/outsideTurns.ts';
import { readCapture } from '../../src/apps/helm/utils/captureReading.ts';
import {
  readDates,
  readIsUrgent,
} from '../../functions/src/apps/helm/dateReading.ts';
import {
  createAliasBook,
  createSealedAliasBook,
} from '../../functions/src/apps/helm/nomos/aliases.ts';

const PINCH_MANIFEST = PINCH_SHARES.shares[0]!;
const PINCH_ACTIONS = PINCH_MANIFEST.actions;
const PINCH_SERVER_ACTIONS = createPinchAdapter().actions!;
// Which actions read as switched on when the tools are listed; a call reads the grant again.
const offActions = new Set<string>();
const pinchApp = {
  connectorId: 'app:pinch',
  appId: 'pinch',
  about: PINCH_MANIFEST.about,
  askedAbout: PINCH_MANIFEST.askedAbout,
  tools: PINCH_MANIFEST.tools,
  get actions() {
    return PINCH_ACTIONS.map((action) => ({
      id: action.id,
      kind: action.kind,
      label: action.label,
      tool: action.tool,
      changesExisting: action.changesExisting,
      isOn: !offActions.has(action.id),
      categories: action.categories.map((id) => ({ id, label: id })),
      permission: action.permission
        ? { id: action.permission, label: action.permission }
        : null,
      action: PINCH_SERVER_ACTIONS[action.id],
    }));
  },
};
const actionCalls: string[] = [];
const readFlags: (boolean | undefined)[] = [];
let nextResult: AppActionResult = {
  status: 'ok',
  data: { days: [] },
  heldBack: [],
};
const filedChanges: { actionId: string; summary: string }[] = [];
const appActions = {
  apps: [pinchApp],
  run: async (
    _firestore: unknown,
    input: { actionId: string; canRead?: boolean },
  ) => {
    actionCalls.push(input.actionId);
    readFlags.push(input.canRead);
    return nextResult;
  },
};

// Every tool the server can offer, mail, documents and app records included.
const tools = buildHelmTools({
  appActions: appActions as never,
  canChangeApps: true,
  uid: 'u1',
  key: {} as never,
  aliases: createAliasBook('t'),
  firestore: {} as never,
  liveGrants: [
    {
      connectorId: 'google:gmail',
      accountId: 'a',
      email: 'a@example.com',
      label: null,
    },
    {
      connectorId: 'google:drive',
      accountId: 'b',
      email: 'b@example.com',
      label: null,
    },
  ],
  siteGrants: [
    { connectorId: 'app:pinch', categories: [{ id: 'x', label: 'X' }] },
  ],
  questionReask: { turnAt: 0 },
  topicRead: {
    topics: createAliasBook('tp'),
    sections: createAliasBook('s'),
    versions: new Map(),
  },
  procedureRead: {
    procedures: createAliasBook('pr'),
    steps: createAliasBook('ps'),
    versions: new Map(),
    names: new Map(),
  },
});

const AUDIENCES = ['nomos', 'external', 'both'];
const NOMOS_ONLY = [
  /mail/,
  /document/,
  /app_records/,
  /^search_synced$/,
  /^bring_back_question$/,
  /^file_results$/,
  /^hand_over$/,
];

const failures = tools.flatMap((tool) => [
  ...(AUDIENCES.includes(tool.audience as string)
    ? []
    : [`${tool.name} has no audience`]),
  ...(tool.audience !== 'nomos' && NOMOS_ONLY.some((re) => re.test(tool.name))
    ? [`${tool.name} is offered to outside assistants`]
    : []),
]);
assert.deepEqual(failures, []);

// Every tool an outside assistant gets is named here on purpose. get_calendar is the one that reads other apps'
// copies: event titles and times only, which an assistant needs to answer "what's on Friday".
// The guide is a map; detail lives in each tool, which an assistant reads only when it needs it.
const GUIDE_CHAR_CAP = 4_000;
const OUTSIDE_TOOLS = [
  'connection_status',
  'get_calendar',
  'get_topic',
  'list_connections',
  'list_topics',
  'pinch_add_to_shopping_list',
  'pinch_fill_nutrition',
  'pinch_plan_meal',
  'pinch_read',
  'pinch_save_idea',
  'pinch_save_recipe',
  'search_procedures',
  'search_tasks',
];
assert.deepEqual(
  tools
    .filter((tool) => tool.audience !== 'nomos')
    .map((tool) => tool.name)
    .sort(),
  OUTSIDE_TOOLS,
  'the tools offered to outside assistants changed: review the new one and name it in OUTSIDE_TOOLS',
);

// Nomos reads each app through the same grouped read tool; changes stay with outside assistants until Nomos gets its own ask-and-undo.
assert.deepEqual(
  tools
    .filter((tool) => tool.audience !== 'external' && tool.name.startsWith('pinch_'))
    .map((tool) => tool.name),
  ['pinch_read'],
  'Nomos gets pinch_read and none of the change tools',
);

// Mail, documents and app records reach an outside assistant only behind its own read permission, listed by name.
assert.deepEqual(READ_SCOPE_TOOLS, {
  mail: ['search_mail', 'read_mail'],
  drive: ['search_documents', 'read_document'],
  apps: ['search_synced', 'search_app_records'],
});
const nomosOnly = tools
  .filter((tool) => tool.audience === 'nomos')
  .map((tool) => tool.name);
Object.values(READ_SCOPE_TOOLS)
  .flat()
  .forEach((name) =>
    assert.ok(nomosOnly.includes(name), `${name} stays a Nomos tool`),
  );
assert.deepEqual(
  READ_SCOPE_LABELS,
  HELM_COPY.assistantReadScopeLabels,
  'the permission names on the device match the ones the assistant is told',
);

// A tool in buildTools only reads; tell_helm is the one external tool that files, and lives in external.ts.
const external = readFileSync(
  new URL('../../functions/src/apps/helm/mcp/external.ts', import.meta.url),
  'utf8',
);
const registered = [...external.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map(
  (match) => match[1],
);
assert.ok(registered.includes('tell_helm'));
assert.ok(registered.includes('ask_helm'));
assert.ok(registered.includes('save_to_helm'));
const server = readFileSync(
  new URL('../../functions/src/apps/helm/mcp/server.ts', import.meta.url),
  'utf8',
);
assert.match(server, /readOnlyHint: tool\.kind !== 'change'/);
assert.match(server, /openWorldHint: false/);
assert.match(
  external,
  /'tell_helm',[\s\S]*?readOnlyHint: false,\s*destructiveHint: false,\s*openWorldHint: false/,
);
assert.match(
  external,
  /'save_to_helm',[\s\S]*?readOnlyHint: false,\s*destructiveHint: false,\s*openWorldHint: false/,
);
// Both turn-filing tools can change records, so neither is registered before the write check.
const writeCheck = external.indexOf('if (!ctx.canWrite) return server;');
assert.ok(writeCheck > 0, 'the write check guards the filing tools');
for (const name of ['tell_helm', 'ask_helm', 'save_to_helm']) {
  assert.ok(
    external.indexOf(`'${name}'`) > writeCheck,
    `${name} is registered only for an assistant that may write`,
  );
}
assert.match(external, /'helm-assistants'|GATE_ID = 'helm-assistants'/);

// The sealed alias opens only for the person and prefix it was made for, and shows no id.
const key = { keyId: 'k', keyVersion: 1, key: Buffer.alloc(32, 7) };
const book = createSealedAliasBook('tp', 'u1', key);
const alias = book.add('topicDocId123');
assert.ok(alias.startsWith('tp'));
assert.ok(!alias.includes('topicDocId123'));
assert.equal(book.idOf(alias), 'topicDocId123');
assert.equal(createSealedAliasBook('tp', 'u2', key).idOf(alias), null);
assert.equal(createSealedAliasBook('pr', 'u1', key).idOf(alias), null);
assert.equal(
  createSealedAliasBook('tp', 'u1', { ...key, key: Buffer.alloc(32, 8) }).idOf(
    alias,
  ),
  null,
);
assert.equal(book.idOf('tp'), null);
assert.equal(book.idOf('tpAAAA'), null);
assert.equal(book.idOf(`${alias.slice(0, -2)}AA`), null);

// An assistant's turn is read on the server by the vendored copy of the device's date and urgency reader.
const READ_AT = Date.UTC(2026, 10, 14, 17, 0);
const READ_OPTIONS = { now: READ_AT, timeZone: 'America/Los_Angeles' };
const PARITY_PHRASES = [
  'Remind me to call Dana on Friday',
  'call Dana on Friday',
  'venue deposit due March 3',
  'tomorrow at 3 pick up the dry cleaning',
  'urgent: renew passport',
  '! renew passport',
  'passport renewed in March 2015',
  'no date here',
];
PARITY_PHRASES.forEach((phrase) => {
  const device = readCapture(phrase, { ...READ_OPTIONS, assistantName: '' });
  assert.deepEqual(readDates(phrase, READ_OPTIONS), device.dates, phrase);
  assert.equal(readIsUrgent(phrase), device.isUrgent, phrase);
});
assert.deepEqual(
  readDates('call Dana on Friday', READ_OPTIONS).map((span) => span.due),
  [{ kind: 'day', date: Date.UTC(2026, 10, 20) }],
);
assert.equal(readDates('no date here', READ_OPTIONS).length, 0);
assert.equal(readIsUrgent('! renew passport'), true);
assert.equal(readIsUrgent('urgent: renew passport'), false);

// An outside assistant's question never reads mail, documents or app records: its answer leaves Helm.
const sortSource = readFileSync(
  new URL('../../functions/src/apps/helm/sortHelmCapture.ts', import.meta.url),
  'utf8',
);
assert.match(sortSource, /isOutside: lead\?\.medium === 'mcp'/);
assert.match(
  sortSource,
  /mode !== 'rest' &&\s*!read\.isOutside &&\s*!isScheduledCapture\(capture\) &&\s*isQuestion/,
);

// A trip's city and dates reach an outside turn's whereabouts only while its Read your apps switch is on.
assert.match(
  sortSource,
  /const placeTrips = read\.isOutside\s*\?\s*filterSourcesForOutside\(read\.outsideReadScopes, await readPlaceTrips\(\)\)/,
);
const tripCopy = { connectorId: 'app:waypoint', kind: 'trip' };
assert.deepEqual(filterSourcesForOutside([], [tripCopy]), []);
assert.deepEqual(filterSourcesForOutside(['mail', 'drive'], [tripCopy]), []);
assert.deepEqual(filterSourcesForOutside(['apps'], [tripCopy]), [tripCopy]);

// An outside assistant is never there to see: its tools and its filed turns always mask a private record.
assert.match(external, /mask: \{\s*isOn: true,/);
assert.match(sortSource, /isOn:\s*capture\.medium === 'mcp' \|\|/);

// An outside assistant hears the person's own name for their assistant, read through the shared reader, so "tell {Name}" routes here.
assert.match(
  external,
  /readAssistantName\(profile\.data\(\)\?\.assistantName\) \?\?\s+DEFAULT_ASSISTANT_NAME/,
);
// The instructions name only the tools this connection is actually offered, and a failed source read never stops the server.
assert.match(
  external,
  /readConnectedSources\(firestore, ctx\.uid\)\.catch\(\(\): ConnectedSource\[\] => \[\]\)/,
);
assert.match(
  external,
  /toolNames: offeredHelmTools\(tools, 'external', permittedTools\)\.map\(/,
);
assert.match(
  external,
  /registerHelmTools\(server, tools, 'external', permittedTools\)/,
);
const externalNames = (extra: string[]) =>
  offeredHelmTools(tools, 'external', extra).map((tool) => tool.name);
assert.ok(
  Object.values(READ_SCOPE_TOOLS)
    .flat()
    .every((tool) => !externalNames([]).includes(tool)),
  'no permission, no mail, document, synced or app-record tool',
);
const withMailNames = externalNames(READ_SCOPE_TOOLS.mail);
assert.ok(
  READ_SCOPE_TOOLS.mail.every((tool) => withMailNames.includes(tool)) &&
    ![...READ_SCOPE_TOOLS.drive, ...READ_SCOPE_TOOLS.apps].some((tool) =>
      withMailNames.includes(tool),
    ),
  'Read Gmail adds the mail tools and nothing else',
);
assert.match(external, /readScopes: ctx\.readScopes/);

// It also hears what each connected source is, in the manifest's words, and is sent back to Helm for what it can't read.
const SOURCES = [
  {
    name: 'Runway',
    about: 'Runway is the money app.',
    categories: [{ label: 'Horizon goals', meaning: 'Costs coming up.' }],
    access: 'apps' as const,
  },
  {
    name: 'Gmail',
    about: 'The mail account.',
    categories: [],
    access: 'mail' as const,
  },
  {
    name: 'Google Calendar',
    about: 'The calendar.',
    categories: [],
    access: null,
  },
];
const CONNECTED = {
  clientName: 'Claude',
  readScopes: [] as never[],
  toolNames: externalNames([]),
};
assert.equal(sourcesBriefFor('Nomos', [], CONNECTED), '');
const brief = sourcesBriefFor('Sol', SOURCES, CONNECTED);
assert.match(
  brief,
  /Runway: Runway is the money app\. It shares Horizon goals \(Costs coming up\)\./,
);
assert.match(
  brief,
  /Gmail: The mail account\. Google Calendar: The calendar\. From these/,
);
assert.match(brief, /they can ask Sol in Helm\./);
// With nothing allowed, each connected kind names the exact permission to turn on, for this client.
for (const label of Object.values(READ_SCOPE_LABELS).filter(
  (entry) => entry !== READ_SCOPE_LABELS.drive,
)) {
  assert.ok(
    brief.includes(
      `turn on the following permission for Claude in Helm (Settings, Connected assistants): ${label}.`,
    ),
    label,
  );
}
assert.ok(
  !brief.includes('Read Google Drive'),
  'no Drive connected, no Drive permission',
);
assert.ok(
  !brief.includes('search_mail') && !brief.includes('search_app_records'),
);
// With a permission on, that source is readable by name and its permission is no longer offered.
const withApps = sourcesBriefFor('Sol', SOURCES, {
  clientName: 'Claude',
  readScopes: ['apps'],
  toolNames: externalNames(READ_SCOPE_TOOLS.apps),
});
assert.match(withApps, /Runway through search_synced and search_app_records/);
assert.ok(!withApps.includes('Read your apps'));
assert.ok(
  withApps.includes(
    'for Claude in Helm (Settings, Connected assistants): Read Gmail.',
  ),
);
const withAll = sourcesBriefFor('Sol', SOURCES, {
  clientName: 'Claude',
  readScopes: ['mail', 'drive', 'apps'],
  toolNames: externalNames(Object.values(READ_SCOPE_TOOLS).flat()),
});
assert.match(withAll, /Gmail through search_mail and read_mail/);
assert.ok(!withAll.includes('turn on'));
// A permission that is on promises only the tools the server registered: no app record shared, no search_app_records; no mail account readable, no mail tools.
const onButEmpty = sourcesBriefFor('Sol', SOURCES, {
  clientName: 'Claude',
  readScopes: ['mail', 'apps'],
  toolNames: ['search_synced'],
});
assert.match(onButEmpty, /Runway through search_synced\./);
assert.ok(
  !onButEmpty.includes('search_app_records') &&
    !onButEmpty.includes('search_mail') &&
    !onButEmpty.includes('turn on'),
);
assert.match(external, /`Tells \$\{name\}/);
assert.match(
  external,
  /Text only: it can't carry a photo, file or other media/,
);
assert.match(external, /`Asks \$\{name\}/);
assert.match(external, /use save_to_helm instead/);
assert.match(external, /instructions: helmGuideFor\(\s*name,\s*ctx\.canWrite,\s*ctx\.canChangeApps,/);

// The guide an outside assistant reads on connecting: a short map, not a tool list.
const guide = (over: { canWrite?: boolean; canChangeApps?: boolean } = {}) =>
  helmGuideFor(
    'Sol',
    over.canWrite ?? true,
    over.canChangeApps ?? true,
    [],
    { clientName: 'Gemini', readScopes: ['apps'], toolNames: OUTSIDE_TOOLS },
    [pinchApp as never],
  );
const fullGuide = guide();
// Text only, and the person is sent to Helm for a photo or file.
assert.match(fullGuide, /This connection takes text only: it can't receive photos, files/);
assert.match(fullGuide, /they can add it in Helm itself/);
// It tells an outside assistant to check Helm on its own, and to use only what the tools return.
assert.match(fullGuide, /check Helm on your own, without waiting to be told/);
assert.match(
  fullGuide,
  /list_topics, get_topic, search_procedures\), tasks \(search_tasks\), calendar \(get_calendar\)/,
);
assert.match(fullGuide, /Use only what the tools return/);
assert.match(fullGuide, /call its tools directly, never ask_helm/);
assert.match(fullGuide, /a result with status switchedOff names the switch that is off/);
// Each connected app is named with its tool prefix and the words people use for it, never its tool list.
assert.match(fullGuide, /Pinch, through its pinch_ tools, when they talk about meals, meal plan/);
for (const name of OUTSIDE_TOOLS.filter((tool) => tool.startsWith('pinch_'))) {
  assert.ok(!fullGuide.includes(name), `the guide never lists ${name}`);
}
assert.ok(
  fullGuide.length <= GUIDE_CHAR_CAP,
  `the guide is ${fullGuide.length} characters; keep it under ${GUIDE_CHAR_CAP} by moving detail into the tools`,
);
// What is off is said with its switch and where it is.
offActions.add('plan_meal');
assert.match(guide(), /Switched off: "planMeals" \(Helm > Connected apps > Pinch\)\./);
PINCH_ACTIONS.filter((action) => action.kind === 'change').forEach((action) =>
  offActions.add(action.id),
);
assert.match(guide(), /It can't be changed here: every kind of change is switched off \(Helm > Connected apps > Pinch\)\./);
assert.ok(!guide().includes('Helm can also change'), 'no change promise when none is on');
offActions.clear();
assert.match(
  guide({ canChangeApps: false }),
  /It can't be changed here: "Change things in your apps" is off for this assistant \(Helm > Settings > Connected assistants\)\./,
);
assert.match(fullGuide, /Helm can also change what the person allowed in their apps, never delete/);
assert.match(fullGuide, /appears the next time you connect/);

// save_to_helm writes one note, filed under a topic, a new topic or none, with no model call.
const seal = (fields: Record<string, unknown>) => fields as never;
let counter = 0;
const plan = (over: Partial<Parameters<typeof planSaveToHelm>[0]> = {}) =>
  planSaveToHelm({
    title: 'Timing belt schedule',
    learned: '## Interval\n\nEvery 105,000 miles.\n\n## Cost\n\nAbout $900.',
    about: 'my 2019 Subaru Outback',
    sources: [],
    topic: null,
    newTopic: null,
    noteCount: 3,
    topicCount: 2,
    via: 'Gemini',
    captureId: 'cap1',
    executionId: 'ex1',
    now: 1000,
    newId: () => `id${++counter}`,
    seal,
    ...over,
  });
const saved = (over?: Parameters<typeof plan>[0]) => {
  const made = plan(over);
  assert.equal(made.kind, 'saved');
  return made as Extract<typeof made, { kind: 'saved' }>;
};
const cars = {
  id: 'topicCars',
  state: {
    name: 'Cars',
    path: 'Cars',
    docState: 'current',
    pendingNoteIds: ['n0'],
  },
};
const onTopic = saved({ topic: cars, newTopic: 'Ignored' });
assert.equal(onTopic.where, 'topic');
assert.equal(onTopic.topic, null);
assert.deepEqual(onTopic.filing, {
  id: 'topicCars',
  docState: 'behind',
  addPendingId: onTopic.noteId,
});
assert.equal(onTopic.noteData.source, 'outside');
assert.equal(onTopic.noteData.createdBy, 'nomos');
assert.equal(onTopic.noteData.sourceCaptureId, 'cap1');
assert.deepEqual(onTopic.noteData.topicIds, ['topicCars']);
assert.deepEqual(onTopic.noteData.sealed, {
  title: 'Timing belt schedule',
  body: 'About: my 2019 Subaru Outback\n\n## Interval\n\nEvery 105,000 miles.\n\n## Cost\n\nAbout $900.',
  via: 'Gemini',
  links: [],
});
assert.equal(onTopic.summary, 'Saved Timing belt schedule to Cars');
assert.deepEqual(
  onTopic.effectRefs.map(({ op, collection }) => `${op}:${collection}`),
  ['create:notes', 'update:topics'],
);
assert.deepEqual(onTopic.effects[1].previous, {
  docState: 'current',
  pendingNoteIds: ['n0'],
});
const fresh = saved({ newTopic: '  Car batteries ' });
assert.equal(fresh.where, 'newTopic');
assert.equal(fresh.filing, null);
assert.equal(fresh.topic?.data.version, 1);
assert.equal(fresh.topic?.data.docState, 'current');
assert.equal(fresh.topic?.version.reason, 'imported');
assert.deepEqual(fresh.noteData.topicIds, [fresh.topic?.id]);
assert.equal(fresh.summary, 'Started a topic, Car batteries, from Gemini');
const freshSections = (
  fresh.topic?.data.sealed as {
    sections: { sources: unknown[]; writtenBy: string }[];
  }
).sections;
assert.equal(freshSections.length, 2);
assert.ok(freshSections.every((section) => section.writtenBy === 'nomos'));
assert.deepEqual(freshSections[0].sources, [
  { kind: 'message', captureId: 'cap1', at: 1000, noteId: fresh.noteId },
]);
assert.deepEqual(
  fresh.effectRefs.map(({ op, collection }) => `${op}:${collection}`),
  ['create:notes', 'create:topics'],
);
assert.equal(fresh.effects[1].written.importedVersion, 1);
const plain = saved({
  learned: 'Replace it every 105,000 miles.',
  newTopic: 'Cars',
});
assert.deepEqual(
  (
    plain.topic?.data.sealed as { sections: { heading: string | null }[] }
  ).sections.map((section) => section.heading),
  ['Timing belt schedule'],
);
const loose = saved();
assert.equal(loose.where, 'loose');
assert.deepEqual(
  [loose.topic, loose.filing, loose.noteData.topicIds],
  [null, null, []],
);
assert.equal(loose.summary, 'Saved Timing belt schedule as a note');
assert.equal(loose.effectRefs.length, 1);

// Only https links are kept, at most five.
assert.deepEqual(
  cleanSavedLinks([
    { title: 'Manual', url: 'https://example.com/a' },
    { title: 'Plain', url: 'http://example.com/b' },
    { title: 'Script', url: 'javascript:alert(1)' },
    { title: 'Broken', url: 'not a link' },
    { title: '', url: 'https://example.org/c' },
  ]),
  [
    { title: 'Manual', url: 'https://example.com/a' },
    { title: 'example.org', url: 'https://example.org/c' },
  ],
);
assert.equal(
  cleanSavedLinks(
    Array.from({ length: 9 }, (_, index) => ({
      title: `Page ${index}`,
      url: `https://example.com/${index}`,
    })),
  ).length,
  5,
);
assert.deepEqual(
  (
    saved({ sources: [{ title: 'Web', url: 'http://x.example' }] }).noteData
      .sealed as { links: unknown[] }
  ).links,
  [],
);

// Limits: a full notes list writes nothing; full topics or too many parts leave a loose note that says so.
assert.equal(plan({ noteCount: 1_000 }).kind, 'full');
const topicsFull = saved({ newTopic: 'Cars', topicCount: 100 });
assert.equal(topicsFull.where, 'loose');
assert.equal(topicsFull.notice, TOPICS_FULL_NOTICE);
const tooMany = saved({
  newTopic: 'Cars',
  learned: Array.from(
    { length: 61 },
    (_, index) => `## Part ${index}\n\nText`,
  ).join('\n\n'),
});
assert.equal(tooMany.where, 'loose');
assert.equal(tooMany.notice, TOO_LONG_NOTICE);
const spoken = describeSave(onTopic, 'Sol');
assert.match(spoken, /under the topic Cars/);
assert.match(spoken, /next time the topic is opened/);
assert.match(spoken, /"Timing belt schedule"/);
assert.match(spoken, /listed in that topic now/);
assert.match(spoken, /undo it, in Helm under From your assistants/);
assert.ok(!/\bI\b|Nomos/.test(spoken));

// Undo in Helm takes back each of the three things save_to_helm can write.
const asExecution = (made: ReturnType<typeof saved>): OpenExecution => ({
  id: 'ex1',
  captureId: 'cap1',
  actor: 'nomos',
  via: 'Gemini',
  category: 'organize',
  autonomyLevel: 3 as never,
  state: 'succeeded',
  effectRefs: made.effectRefs as OpenExecution['effectRefs'],
  linkedWhoIds: [],
  linkedPlaceIds: [],
  privacy: null,
  undoesExecutionId: null,
  undoneByExecutionId: null,
  undoneDocIds: [],
  partUndoIds: [],
  undoReason: null,
  heldSpoken: null,
  questionRef: null,
  errorCode: null,
  createdAt: 1000,
  decidedAt: 1000,
  finishedAt: 1000,
  summary: made.summary,
  said: null,
  effects: made.effects,
  undoReport: null,
  spoken: null,
  goneIds: null,
  lines: [],
  abilityOffer: null,
  awayZoneOffer: null,
  isUnreadable: false,
});
const undoOf = (made: ReturnType<typeof saved>, targets: UndoTarget[]) =>
  planUndo({
    original: asExecution(made),
    targets: new Map(targets.map((target) => [target.docId, target])),
    undoExecutionId: 'u1',
    now: 2000,
    usedIds: new Set(),
  });
const savedNote = (made: ReturnType<typeof saved>): UndoTarget => ({
  docId: made.noteId,
  data: { lastEditedAt: null, topicIds: made.noteData.topicIds },
  opened: {
    title: 'Timing belt schedule',
    body: 'x',
    via: 'Gemini',
    links: [],
    privateMark: null,
    isPrivacyCleared: false,
    quietMark: null,
    quietUntil: null,
    isQuietCleared: false,
  },
});
const undoFiled = undoOf(onTopic, [
  savedNote(onTopic),
  {
    docId: 'topicCars',
    data: {
      docState: 'behind',
      pendingNoteIds: ['n0', onTopic.noteId],
      lastEditedAt: null,
    },
    opened: null,
  },
]);
assert.equal(undoFiled.kind, 'write');
if (undoFiled.kind === 'write') {
  assert.deepEqual(
    undoFiled.deletes.map((entry) => entry.docId),
    [onTopic.noteId],
  );
  assert.deepEqual(
    undoFiled.updates.find((update) => update.docId === 'topicCars')?.fields
      .pendingNoteIds,
    ['n0'],
  );
}
const freshTopicId = fresh.topic?.id ?? '';
const undoFresh = undoOf(fresh, [
  savedNote(fresh),
  {
    docId: freshTopicId,
    data: {
      version: 1,
      docState: 'current',
      pendingNoteIds: [],
      lastEditedAt: null,
    },
    opened: null,
  },
]);
assert.equal(undoFresh.kind, 'write');
if (undoFresh.kind === 'write') {
  assert.deepEqual(
    undoFresh.deletes.map((entry) => entry.docId).sort(),
    [fresh.noteId, freshTopicId].sort(),
  );
}
const undoLoose = undoOf(loose, [savedNote(loose)]);
assert.equal(undoLoose.kind, 'write');
if (undoLoose.kind === 'write') {
  assert.deepEqual(
    undoLoose.deletes.map((entry) => entry.docId),
    [loose.noteId],
  );
}
assert.deepEqual(
  cleanSavedLinks([
    { title: 'A', url: 'https://example.com/a' },
    { title: 'A again', url: 'https://example.com/a' },
  ]).map((link) => link.title),
  ['A'],
);

// Home's outside row counts records made or changed, never an answer, a failed or undone turn, or an execution not loaded.
const turnWith = (id: string, executionIds: string[]) =>
  ({
    id,
    medium: 'mcp',
    via: 'Gemini',
    status: 'sorted',
    dismissedAt: null,
    createdAt: 5000,
    executionIds,
  }) as unknown as OpenCapture;
const executionOf = (
  id: string,
  over: Partial<OpenExecution>,
): [string, OpenExecution] => [id, { ...asExecution(onTopic), id, ...over }];
const executions = new Map<string, OpenExecution>([
  executionOf('saved', {}),
  executionOf('started', {
    effectRefs: fresh.effectRefs as OpenExecution['effectRefs'],
  }),
  executionOf('answer', { category: 'answer', effectRefs: [] }),
  executionOf('failed', { state: 'failed' }),
  executionOf('undone', { undoneByExecutionId: 'u9' }),
]);
const additions = readOutsideAdditions(
  [
    turnWith('t1', ['saved']),
    turnWith('t2', ['answer']),
    turnWith('t3', ['failed']),
    turnWith('t4', ['undone']),
    turnWith('t5', ['not-loaded']),
  ],
  1000,
  executions,
  () => 'Timing belt schedule',
);
assert.equal(additions.count, 1);
assert.equal(additions.isAllNew, true);
assert.equal(additions.title, 'Timing belt schedule');
assert.equal(
  readOutsideAdditions(
    [turnWith('t6', ['started'])],
    1000,
    executions,
    () => 'Car batteries note',
  ).title,
  'Car batteries note',
);
assert.equal(
  readOutsideAdditions(
    [turnWith('t2', ['answer'])],
    1000,
    executions,
    () => null,
  ).count,
  0,
);
assert.equal(
  HELM_COPY.homeOutsideAdded(['Gemini', 'Claude'], 3, true, null),
  'Gemini and Claude added 3 things',
);
assert.equal(
  HELM_COPY.homeOutsideAdded(['Gemini'], 2, false, null),
  'Gemini changed 2 things',
);

// An outside turn reads stored records only through its own switches.
const stored = [
  'google:calendar',
  'google:contacts',
  'app:a-list',
  'app:going-once',
  'google:gmail',
  'google:drive',
].map((connectorId) => ({ connectorId }));
const idsFor = (scopes: ('mail' | 'drive' | 'apps')[]) =>
  filterSourcesForOutside(scopes, stored).map((record) => record.connectorId);
assert.deepEqual(idsFor([]), ['google:calendar', 'google:contacts']);
assert.deepEqual(idsFor(['apps']), [
  'google:calendar',
  'google:contacts',
  'app:a-list',
  'app:going-once',
]);
assert.deepEqual(idsFor(['mail', 'drive']), [
  'google:calendar',
  'google:contacts',
  'google:gmail',
  'google:drive',
]);
assert.equal(idsFor(['mail', 'drive', 'apps']).length, stored.length);
const held = toHeldBackPrompt('Sol', ['mail'], ['A-List']);
assert.match(held, /"Read your apps"/);
assert.match(held, /"Read Google Drive"/);
assert.doesNotMatch(held, /"Read Gmail"/);
assert.match(held, /A-List/);
assert.equal(toHeldBackPrompt('Sol', ['mail', 'drive', 'apps'], []), '');

// bring_back_question: scores the person's words, leaves out what is closed, and never returns a private prompt unless the turn is known to be unmasked.
const reaskKey = { keyId: 'k', keyVersion: 1, key: Buffer.alloc(32, 9) };
type FakeCapture = {
  id: string;
  privacy: string;
  createdAt: number;
  questionState: Record<string, Record<string, unknown>>;
  prompts: Record<string, string>;
};
const reaskCaptures: FakeCapture[] = [
  {
    id: 'recent',
    privacy: 'ordinary',
    createdAt: 300,
    questionState: { q1: { kind: 'which', answeredAt: null } },
    prompts: { q1: 'Which dentist for the cleaning?' },
  },
  {
    id: 'moving',
    privacy: 'ordinary',
    createdAt: 200,
    questionState: { q1: { kind: 'which', answeredAt: null } },
    prompts: { q1: 'When are you moving the couch?' },
  },
  {
    id: 'closed',
    privacy: 'ordinary',
    createdAt: 100,
    questionState: {
      q1: { kind: 'which', answeredAt: 150, dismissedAt: null },
      q2: { kind: 'which', answeredAt: 150, dismissedAt: 150 },
      q3: { kind: 'couldNotRead', answeredAt: null },
    },
    prompts: {
      q1: 'Moving answered?',
      q2: 'Moving dismissed?',
      q3: 'Moving unreadable?',
    },
  },
  {
    id: 'secret',
    privacy: 'private',
    createdAt: 400,
    questionState: { q1: { kind: 'which', answeredAt: null } },
    prompts: { q1: 'Which gift for the surprise?' },
  },
];
const runReask = async (
  about: string,
  mask: { isOn: boolean } | undefined,
  options: { isFailing?: boolean } = {},
) => {
  const updates: Record<string, unknown>[] = [];
  const reaskTools = buildHelmTools({
    uid: 'u1',
    key: reaskKey,
    aliases: createAliasBook('t'),
    firestore: {
      collection: () => ({
        orderBy: () => ({
          limit: () => ({
            get: async () => ({
              docs: reaskCaptures.map((capture) => ({
                data: () => ({
                  privacy: capture.privacy,
                  createdAt: capture.createdAt,
                  questionState: capture.questionState,
                  sealed: sealForHelm(reaskKey, {
                    text: '',
                    questions: Object.fromEntries(
                      Object.entries(capture.prompts).map(([id, prompt]) => [
                        id,
                        { prompt },
                      ]),
                    ),
                  }),
                }),
                ref: {
                  update: async (fields: Record<string, unknown>) => {
                    if (options.isFailing) throw new Error('offline');
                    updates.push({ id: capture.id, ...fields });
                  },
                },
              })),
            }),
          }),
        }),
      }),
    } as never,
    liveGrants: [],
    siteGrants: [],
    questionReask: { turnAt: 1000 },
    ...(mask && { mask: { ...mask, names: [], timeZone: 'UTC' } }),
  });
  const tool = reaskTools.find(
    (entry) => entry.name === 'bring_back_question',
  )!;
  const result = (await tool.run({ about } as never)) as Record<
    string,
    unknown
  >;
  return { result, updates };
};
const scored = await runReask('moving', { isOn: true });
assert.equal(scored.result.asked, 'When are you moving the couch?');
assert.deepEqual(
  scored.updates.map((update) => update.id),
  ['moving'],
);
assert.ok(
  Number(scored.updates[0]['questionState.q1.reaskedAt']) > 1000,
  'brought back after the person turn',
);
assert.ok(
  !('questionState.q1.skippedAt' in scored.updates[0]),
  'skippedAt is left as it was',
);
const closedOnly = await runReask('moving answered dismissed unreadable', {
  isOn: true,
});
assert.equal(closedOnly.result.asked, 'When are you moving the couch?');
assert.equal((await runReask('answered', { isOn: true })).result.found, false);
for (const mask of [{ isOn: true }, { isOn: false }, undefined]) {
  const { result } = await runReask('gift surprise', mask);
  assert.equal(
    result.found === true,
    mask?.isOn === false,
    `a private question is returned only when the turn is known to be unmasked (${JSON.stringify(mask)})`,
  );
}
const newest = await runReask('', { isOn: true });
assert.equal(newest.result.asked, 'Which dentist for the cleaning?');
assert.equal(
  (await runReask('moving', { isOn: true }, { isFailing: true })).result.error,
  'The question could not be brought back just now.',
);
assert.match(
  tools.find((tool) => tool.name === 'bring_back_question')!.description,
  /never an instruction/,
);

// A site app's reads: one tool while it is connected, each option saying exactly why it held something back.
const pinchTool = (
  name: string,
  scope: Partial<Parameters<typeof buildHelmTools>[0]> = {},
) =>
  buildHelmTools({
    uid: 'u1',
    key: {} as never,
    aliases: createAliasBook('t'),
    firestore: {} as never,
    appActions: appActions as never,
    assistantName: 'Gemini',
    ...scope,
  }).find((tool) => tool.name === name);
const readTool = (scope: Parameters<typeof pinchTool>[1] = {}) =>
  pinchTool('pinch_read', scope)!;
const PINCH_READS = PINCH_ACTIONS.filter((action) => action.kind === 'read');
assert.deepEqual(PINCH_READS.map((action) => action.id).sort(), [
  'find_ingredients',
  'get_kitchen',
  'get_meal_plan',
  'get_recipe',
  'get_shopping_list',
  'search_recipes',
]);
assert.equal(readTool().kind, 'read');
PINCH_READS.forEach((action) =>
  assert.match(readTool().description, new RegExp(`- ${action.id}: `)),
);
assert.match(
  readTool().description,
  /^Pinch is the person's kitchen planner.*asks about it as meals, meal plan/,
  'an app tool leads with what the app is and the words people use for it',
);
assert.equal(
  buildHelmTools({
    uid: 'u1',
    key: {} as never,
    aliases: createAliasBook('t'),
    firestore: {} as never,
  }).some((tool) => tool.name.startsWith('pinch_')),
  false,
  'no Pinch tools while Pinch is not connected',
);
// A switched-off read stays listed, marked off with its switch and where it is.
offActions.add('get_kitchen');
assert.match(
  readTool().description,
  /- get_kitchen: [^\n]*Off right now: the person turns on pantryStock or useSoon in Helm > Connected apps > Pinch/,
);
offActions.clear();
nextResult = {
  status: 'switchedOff',
  needs: [{ category: 'plannedMeals', label: 'Planned meals' }],
};
actionCalls.length = 0;
const switchedOffResult = (await readTool().run({
  action: 'get_meal_plan',
} as never)) as Record<string, unknown>;
assert.deepEqual(actionCalls, ['get_meal_plan'], 'action picks the option');
assert.equal(switchedOffResult.status, 'switchedOff');
assert.match(
  String(switchedOffResult.message),
  /Pinch's Planned meals is switched off.*Helm > Connected apps > Pinch/,
);
actionCalls.length = 0;
const cannotReadResult = (await readTool({
  outsideReadScopes: ['mail'],
}).run({ action: 'get_meal_plan' } as never)) as Record<string, unknown>;
assert.equal(cannotReadResult.status, 'assistantCannotRead');
assert.match(
  String(cannotReadResult.message),
  /"Read your apps" for Gemini in Helm > Settings > Connected assistants/,
);
assert.deepEqual(actionCalls, [], 'a closed Read your apps never reaches the app');
// An option's own fields are checked when it runs, and a miss names what it takes.
actionCalls.length = 0;
const missingField = (await readTool().run({
  action: 'get_recipe',
} as never)) as Record<string, unknown>;
assert.equal(missingField.status, 'refused');
assert.match(
  String(missingField.message),
  /Nothing was run\. get_recipe takes recipeId \(required\)/,
);
assert.deepEqual(actionCalls, [], 'a call missing its fields never reaches the app');
nextResult = {
  status: 'ok',
  data: { name: 'Soup' },
  heldBack: [{ category: 'fullRecipes', label: 'Full recipes' }],
};
const heldOut = (await readTool({
  outsideReadScopes: ['apps'],
}).run({ action: 'get_recipe', recipeId: 'r1' } as never)) as Record<
  string,
  unknown
>;
assert.equal(heldOut.status, 'ok');
assert.match(
  String((heldOut.heldBack as string[])[0]),
  /Full recipes is switched off.*Helm > Connected apps > Pinch/,
);
nextResult = { status: 'notFound', message: 'No recipe has that id.' };
assert.equal(
  (
    (await readTool().run({
      action: 'get_recipe',
      recipeId: 'x',
    } as never)) as Record<string, unknown>
  ).status,
  'notFound',
);

// A site app's changes: grouped tools offered only while the assistant may change apps and a kind is on, named switches, and a filed record per change.
const changeTool = (
  name: string,
  scope: Partial<Parameters<typeof buildHelmTools>[0]> = {},
) =>
  pinchTool(name, {
    canChangeApps: true,
    onAppChange: async (change) => {
      filedChanges.push({
        actionId: change.actionId,
        summary: change.summary,
      });
    },
    ...scope,
  });
const saveRecipe = (scope: Parameters<typeof changeTool>[1] = {}) =>
  changeTool('pinch_save_recipe', scope)!;
const EDIT = { action: 'update_recipe', recipeId: 'r1', servings: 6 };
const PINCH_CHANGES = PINCH_ACTIONS.filter(
  (action) => action.kind === 'change',
);
assert.deepEqual(PINCH_CHANGES.map((action) => action.id).sort(), [
  'add_recipe',
  'add_to_shopping_list',
  'fill_nutrition',
  'plan_meal',
  'save_idea',
  'update_recipe',
]);
[...new Set(PINCH_CHANGES.map((action) => action.tool))].forEach((id) => {
  const tool = changeTool(`pinch_${id}`)!;
  assert.equal(tool.kind, 'change');
  assert.equal(
    tool.audience,
    'external',
    'Nomos is not given change tools yet',
  );
  assert.match(tool.description, /confirm with the person/);
});
assert.equal(saveRecipe().isAdditive, false, 'an edit is not only additive');
assert.equal(changeTool('pinch_plan_meal')!.isAdditive, true);
assert.equal(
  offeredHelmTools(
    buildHelmTools({
      uid: 'u1',
      key: {} as never,
      aliases: createAliasBook('t'),
      firestore: {} as never,
      appActions: appActions as never,
      canChangeApps: true,
    }),
    'nomos',
  ).some((tool) => tool.name === 'pinch_save_recipe'),
  false,
);
// Without the assistant's own switch, or with every kind of change off, no change tool is offered at all.
for (const scope of [
  { canChangeApps: false },
  { canChangeApps: undefined },
  { outsideReadScopes: null, canChangeApps: false },
]) {
  assert.equal(
    changeTool('pinch_save_recipe', scope),
    undefined,
    'an assistant without "Change things in your apps" sees no change tools',
  );
}
PINCH_CHANGES.forEach((action) => offActions.add(action.id));
assert.equal(
  changeTool('pinch_plan_meal'),
  undefined,
  'a change whose switch is off is not offered',
);
offActions.clear();
offActions.add('update_recipe');
assert.match(
  saveRecipe().description,
  /- update_recipe: [^\n]*Off right now: the person turns on "editRecipes" in Helm > Connected apps > Pinch/,
  'a grouped option that is off stays listed and names its switch',
);
offActions.clear();
nextResult = {
  status: 'switchedOff',
  needs: [{ category: 'editRecipes', label: 'Edit recipes' }],
};
const changeOff = (await saveRecipe({
  outsideReadScopes: ['apps'],
}).run(EDIT as never)) as Record<string, unknown>;
assert.equal(changeOff.status, 'switchedOff');
assert.deepEqual(changeOff.needs, ['Edit recipes']);
assert.match(
  String(changeOff.message),
  /"Edit recipes" is switched off, so nothing was changed.*Helm > Connected apps > Pinch/,
);
assert.deepEqual(filedChanges, [], 'a change that did not happen is not filed');
// A change from an assistant that may not read apps is told to quote nothing stored.
nextResult = {
  status: 'ok',
  data: {
    summary: 'Nothing needed changing',
    lines: [],
    reply: { summary: 'Nothing needed changing', lines: [] },
    changes: [],
  },
  heldBack: [],
};
for (const [scopes, expected] of [
  [['apps'], true],
  [['mail'], false],
] as const) {
  readFlags.length = 0;
  await saveRecipe({ outsideReadScopes: [...scopes] }).run(EDIT as never);
  assert.deepEqual(readFlags, [expected]);
}
nextResult = {
  status: 'ok',
  data: {
    summary: 'Changed Chicken soup',
    lines: ['Servings 4 to 6'],
    reply: { summary: 'Changed the recipe', lines: ['Serves 6'] },
    changes: [{ id: 'c1', title: 'Chicken soup', lines: ['Servings 4 to 6'] }],
    recipeId: 'r1',
  },
  heldBack: [],
};
const changeOk = (await saveRecipe({ outsideReadScopes: ['apps'] }).run(
  EDIT as never,
)) as Record<string, unknown>;
assert.deepEqual(
  changeOk,
  {
    status: 'ok',
    summary: 'Changed the recipe',
    lines: ['Serves 6'],
    recipeId: 'r1',
  },
  'the assistant is told the reply, never the stored lines',
);
assert.match(
  saveRecipe().description,
  /refused.*notFound/,
  'every status a change can return is listed',
);
assert.deepEqual(filedChanges, [
  { actionId: 'update_recipe', summary: 'Changed Chicken soup' },
]);
// A filing that fails is logged, and the reply says the change is in the app but not in Helm's list.
{
  const filedBefore = filedChanges.length;
  const failing = (await saveRecipe({
    outsideReadScopes: ['apps'],
    onAppChange: async () => {
      throw new Error('boom');
    },
  }).run(EDIT as never)) as Record<string, unknown>;
  assert.equal(failing.status, 'ok');
  assert.match(
    String(failing.note),
    /made and can be undone in Pinch.*not be added.*Helm.*can't be undone from there/,
  );
  assert.equal(filedChanges.length, filedBefore);
  assert.equal(
    'note' in changeOk,
    false,
    'a filed change makes no claim about Helm',
  );
}
// A change that changed nothing files nothing.
{
  const filedBefore = filedChanges.length;
  nextResult = {
    status: 'ok',
    data: {
      summary: 'Nothing needed changing',
      lines: [],
      reply: { summary: 'Nothing needed changing', lines: [] },
      changes: [],
      recipeId: 'r1',
    },
    heldBack: [],
  };
  await saveRecipe({ outsideReadScopes: ['apps'] }).run(EDIT as never);
  assert.equal(filedChanges.length, filedBefore);
}
nextResult = { status: 'refused', message: 'That recipe has too many notes.' };
assert.equal(
  (
    (await saveRecipe({ outsideReadScopes: ['apps'] }).run(
      EDIT as never,
    )) as Record<string, unknown>
  ).status,
  'refused',
);
assert.equal(filedChanges.length, 1, 'a refused change is not filed');

// The real adapter holds the steps and description back from get_recipe while Full recipes is off.
const snapshotOf = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: data !== null,
  get: (field: string) => data?.[field],
});
const kitchen: Record<string, Record<string, unknown>> = {
  'apps/pinch/kitchens/u1/recipes/r1': {
    title: 'Chicken soup',
    description: 'Cosy.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 30,
    steps: ['Boil.', 'Serve.'],
    stepSections: [],
    ingredients: [
      {
        id: 'l1',
        ingredientId: 'cat-chicken-breast',
        freeText: null,
        amount: 2,
        unit: 'EACH',
        group: 'For the soup',
      },
      {
        id: 'l2',
        ingredientId: null,
        freeText: 'Salt to taste',
        amount: null,
        unit: 'EACH',
        group: null,
      },
    ],
    categories: ['SOUP_SALAD'],
    isFavorite: true,
    isArchived: false,
  },
};
const fakeFirestore = {
  doc: (path: string) => ({
    path,
    get: async () => snapshotOf(path.split('/').pop()!, kitchen[path] ?? null),
  }),
  getAll: async (...refs: { path: string }[]) =>
    refs
      .filter((ref) => ref.path)
      .map((ref) => snapshotOf(ref.path.split('/').pop()!, null)),
};
const pinch = createPinchAdapter({
  firestore: () => fakeFirestore as never,
  canOpen: async () => true,
  now: () => Date.UTC(2026, 10, 25),
});
const recipeCtx = (categories: string[]) => ({
  uid: 'u1',
  grant: {} as never,
  allowedCategories: new Set(categories),
  actor: { kind: 'outside' as const, name: 'Gemini' },
  now: Date.UTC(2026, 10, 25),
  timeZone: 'UTC',
});
const getRecipeAction = pinch.actions!.get_recipe;
const closedRecipe = (await getRecipeAction.run(
  recipeCtx(['recipes', 'recipeIngredients']),
  { recipeId: 'r1' },
)) as Extract<AppActionResult, { status: 'ok' }>;
assert.equal(closedRecipe.status, 'ok');
assert.ok(
  !('steps' in (closedRecipe.data as object)) &&
    !('description' in (closedRecipe.data as object)),
  'fullRecipes off holds the steps back',
);
assert.deepEqual(
  closedRecipe.heldBack.map((heldOut) => heldOut.category),
  ['fullRecipes'],
);
assert.deepEqual((closedRecipe.data as { ingredients: unknown }).ingredients, [
  { group: null, lines: ['Salt to taste'] },
  { group: 'For the soup', lines: ['2 Chicken breast'] },
]);
const openRecipe = (await getRecipeAction.run(
  recipeCtx(['recipes', 'recipeIngredients', 'fullRecipes']),
  { recipeId: 'r1' },
)) as Extract<AppActionResult, { status: 'ok' }>;
assert.deepEqual((openRecipe.data as { steps: string[] }).steps, [
  'Boil.',
  'Serve.',
]);
assert.deepEqual(openRecipe.heldBack, []);
assert.equal(
  (await getRecipeAction.run(recipeCtx(['fullRecipes']), { recipeId: 'r1' }))
    .status,
  'switchedOff',
  'recipes is needed to find a recipe',
);
assert.equal(
  (await getRecipeAction.run(recipeCtx(['recipes']), { recipeId: 'nope' }))
    .status,
  'notFound',
);
assert.equal(
  (await pinch.actions!.get_shopping_list.run(recipeCtx(['recipes']), {}))
    .status,
  'switchedOff',
);

// How every app offers assistant tools (docs/conventions/connections.md "An app offers an assistant a handful of tools").
const MAX_TOOLS_PER_APP = 6;
const MAX_OUTSIDE_TOOLS = 40;
const MIN_OPTION_DESCRIPTION = 60;
const TOOL_ID = /^[a-z][a-z0-9_]*$/;
const unwrapOptional = (schema: z.ZodType): z.ZodType => {
  const def = (schema as unknown as { _zod: { def: { type: string; innerType?: z.ZodType } } })._zod.def;
  return ['optional', 'default'].includes(def.type) && def.innerType ? unwrapOptional(def.innerType) : schema;
};
const withoutWords = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(withoutWords)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => !['description', 'default', '$schema'].includes(key))
            .map(([key, inner]) => [key, withoutWords(inner)]),
        )
      : value;
// The client validates a grouped tool against the first option's copy of a shared field, so every copy must accept exactly the same values.
const schemaOf = (schema: z.ZodType): string =>
  JSON.stringify(withoutWords(toJSONSchema(unwrapOptional(schema))));
assert.equal(
  schemaOf(z.string().max(100).describe('For search_recipes, words.')),
  schemaOf(z.string().max(100).optional().describe('For find_ingredients, a name.')),
);
assert.notEqual(schemaOf(z.enum(['a', 'b'])), schemaOf(z.enum(['a', 'c'])));
assert.notEqual(schemaOf(z.string().max(100)), schemaOf(z.string().max(200)));
assert.notEqual(schemaOf(z.string()), schemaOf(z.string().nullable()));
const toolFailures = Object.entries(SOURCE_ADAPTERS).flatMap(
  ([connectorId, adapter]) => {
    const { manifest } = adapter;
    const appId = connectorId.replace(/^app:/, '');
    const declared = manifest.tools.map((tool) => tool.id);
    if (manifest.actions.length === 0) {
      return manifest.tools.length === 0 && manifest.askedAbout.length === 0
        ? []
        : [`${connectorId} declares tools or words but no actions`];
    }
    const byTool = (id: string) =>
      manifest.actions.filter((action) => action.tool === id);
    const readTools = declared.filter((id) =>
      byTool(id).some((action) => action.kind === 'read'),
    );
    const names = declared.map((id) => `${appId}_${id}`);
    const mentioned = manifest.actions.flatMap((action) => {
      const server = adapter.actions?.[action.id];
      const texts = server
        ? [
            server.description,
            ...Object.values(server.shape).map(
              (field) => (field as z.ZodType).description ?? '',
            ),
          ]
        : [];
      return texts.flatMap((text) =>
        [...text.matchAll(new RegExp(`\\b${appId}_[a-z_]+`, 'g'))].map(
          (match) => ({ action: action.id, name: match[0] }),
        ),
      );
    });
    return [
      ...(connectorId.startsWith('app:') ? [] : [`${connectorId} offers actions but is not a site app`]),
      ...(manifest.askedAbout.length < 3
        ? [`${connectorId} needs at least three everyday words in askedAbout`]
        : []),
      ...(declared.length > MAX_TOOLS_PER_APP
        ? [`${connectorId} offers ${declared.length} tools; group actions whose fields agree to stay at ${MAX_TOOLS_PER_APP} or fewer`]
        : []),
      ...(readTools.length > 1
        ? [`${connectorId} spreads its reads over ${readTools.join(', ')}: one read tool per app`]
        : []),
      ...manifest.tools.flatMap((tool) => [
        ...(TOOL_ID.test(tool.id) && `${appId}_${tool.id}`.length <= 64
          ? []
          : [`${connectorId} tool ${tool.id} is not a short snake_case id`]),
        ...(tool.title.trim().length < 4 ? [`${connectorId} tool ${tool.id} needs a title`] : []),
        ...(byTool(tool.id).length === 0 ? [`${connectorId} tool ${tool.id} has no actions`] : []),
        ...(new Set(byTool(tool.id).map((action) => action.kind)).size > 1
          ? [`${connectorId} tool ${tool.id} mixes reads and changes`]
          : []),
      ]),
      ...manifest.actions.flatMap((action) => {
        const server = adapter.actions?.[action.id];
        return [
          ...(declared.includes(action.tool) ? [] : [`${connectorId} ${action.id} names undeclared tool ${action.tool}`]),
          ...(server ? [] : [`${connectorId} ${action.id} has no server action`]),
          ...(server && server.description.length < MIN_OPTION_DESCRIPTION
            ? [`${connectorId} ${action.id}'s description is too short to choose by`]
            : []),
          ...(action.kind === 'read' && action.changesExisting ? [`${connectorId} ${action.id} is a read that changes`] : []),
          ...(action.kind === 'change' && !manifest.changes.some((change) => change.id === action.permission)
            ? [`${connectorId} ${action.id} names no declared switch`]
            : []),
          ...(action.kind === 'read' && action.categories.length === 0 ? [`${connectorId} ${action.id} names no category`] : []),
        ];
      }),
      // Options grouped under one tool share one input, so a field they share must be the same kind of value.
      ...declared.flatMap((id) => {
        const shapes = byTool(id).flatMap((action) => {
          const server = adapter.actions?.[action.id];
          return server ? [server.shape] : [];
        });
        const keys = [...new Set(shapes.flatMap((shape) => Object.keys(shape)))];
        return [
          ...(keys.includes('action') && shapes.length > 1 ? [`${connectorId} tool ${id} has a field named action, which picks the option`] : []),
          ...keys.flatMap((key) => {
            const schemas = new Set(
              shapes.filter((shape) => key in shape).map((shape) => schemaOf(shape[key] as z.ZodType)),
            );
            return schemas.size > 1 ? [`${connectorId} tool ${id}: ${key} accepts different values across its options (${[...schemas].join(' vs ')})`] : [];
          }),
        ];
      }),
      ...mentioned
        .filter(({ name }) => !names.includes(name))
        .map(({ action, name }) => `${connectorId} ${action} mentions ${name}, which is not a tool`),
    ];
  },
);
assert.deepEqual(toolFailures, []);
assert.ok(
  OUTSIDE_TOOLS.length <= MAX_OUTSIDE_TOOLS,
  `outside assistants are offered ${OUTSIDE_TOOLS.length} tools with every app connected; keep it at ${MAX_OUTSIDE_TOOLS} or fewer`,
);
console.log(`Outside tools with Pinch connected and every switch on: ${OUTSIDE_TOOLS.length}; guide ${fullGuide.length} characters.`);

// Registered tools carry a title, honest hints, and a refusal comes back as a tool error.
{
  const mcp = new McpServer({ name: 'helm-check', version: '1.0.0' });
  registerHelmTools(mcp, tools, 'external');
  const client = new Client({ name: 'helm-check-client', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([mcp.connect(serverSide), client.connect(clientSide)]);
  const listed = (await client.listTools()).tools;
  assert.deepEqual(listed.map((tool) => tool.name).sort(), OUTSIDE_TOOLS);
  listed.forEach((tool) => {
    assert.ok(tool.title && tool.title.length >= 4, `${tool.name} has a title`);
    assert.equal(tool.annotations?.openWorldHint, false, `${tool.name} stays in the person's own records`);
    assert.ok((tool.description ?? '').length >= MIN_OPTION_DESCRIPTION, `${tool.name} says enough to choose by`);
  });
  const hintsOf = (name: string) => listed.find((tool) => tool.name === name)!.annotations!;
  assert.equal(hintsOf('pinch_read').readOnlyHint, true);
  assert.equal(hintsOf('pinch_save_recipe').destructiveHint, true, 'an edit can replace what is there');
  assert.equal(hintsOf('pinch_plan_meal').readOnlyHint, false);
  assert.equal(hintsOf('pinch_plan_meal').destructiveHint, false, 'a change that only adds is not destructive');
  const readSchema = listed.find((tool) => tool.name === 'pinch_read')!.inputSchema as {
    properties: Record<string, { enum?: string[] }>;
    required?: string[];
  };
  assert.deepEqual(readSchema.properties.action.enum?.sort(), PINCH_READS.map((action) => action.id).sort());
  assert.deepEqual(readSchema.required, ['action'], 'only action is required; each option checks its own fields');
  nextResult = { status: 'switchedOff', needs: [{ category: 'plannedMeals', label: 'Planned meals' }] };
  const refused = await client.callTool({ name: 'pinch_read', arguments: { action: 'get_meal_plan' } });
  assert.equal(refused.isError, true, 'a switched-off read is a tool error');
  nextResult = { status: 'ok', data: { days: [] }, heldBack: [] };
  const answered = await client.callTool({ name: 'pinch_read', arguments: { action: 'get_meal_plan' } });
  assert.equal(answered.isError ?? false, false);
  await Promise.all([client.close(), mcp.close()]);
}

console.log('check:helm-mcp passed');
