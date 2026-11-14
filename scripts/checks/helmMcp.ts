import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildHelmTools } from '../../functions/src/apps/helm/mcp/buildTools.ts';
import {
  READ_SCOPE_LABELS,
  READ_SCOPE_TOOLS,
  sourcesBriefFor,
} from '../../functions/src/apps/helm/mcp/sourcesBrief.ts';
import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import { readCapture } from '../../src/apps/helm/utils/captureReading.ts';
import {
  readDates,
  readIsUrgent,
} from '../../functions/src/apps/helm/dateReading.ts';
import {
  createAliasBook,
  createSealedAliasBook,
} from '../../functions/src/apps/helm/nomos/aliases.ts';

// Every tool the server can offer, mail, documents and app records included.
const tools = buildHelmTools({
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
const OUTSIDE_TOOLS = [
  'connection_status',
  'get_calendar',
  'get_topic',
  'list_connections',
  'list_topics',
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
const server = readFileSync(
  new URL('../../functions/src/apps/helm/mcp/server.ts', import.meta.url),
  'utf8',
);
assert.match(server, /readOnlyHint: true/);
assert.match(server, /openWorldHint: false/);
assert.match(
  external,
  /'tell_helm',[\s\S]*?readOnlyHint: false,\s*destructiveHint: false,\s*openWorldHint: false/,
);
// Both turn-filing tools can change records, so neither is registered before the write check.
const writeCheck = external.indexOf('if (!ctx.canWrite) return server;');
assert.ok(writeCheck > 0, 'the write check guards the filing tools');
for (const name of ['tell_helm', 'ask_helm']) {
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
assert.match(sortSource, /mode !== 'rest' && !read\.isOutside && isQuestion/);

// An outside assistant hears the person's own name for their assistant, read through the shared reader, so "tell {Name}" routes here.
assert.match(
  external,
  /readAssistantName\(profile\.data\(\)\?\.assistantName\) \?\?\s+DEFAULT_ASSISTANT_NAME/,
);
assert.match(
  external,
  /instructions: instructionsFor\(\s*name,\s*ctx\.canWrite,\s*await readConnectedSources\(firestore, ctx\.uid\),\s*\{ clientName: ctx\.clientName, readScopes: ctx\.readScopes \},?\s*\)/,
);

assert.match(
  external,
  /registerHelmTools\(\s*server,\s*tools,\s*'external',\s*ctx\.readScopes\.flatMap\(\(scope\) => READ_SCOPE_TOOLS\[scope\]\),?\s*\)/,
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
const CONNECTED = { clientName: 'Claude', readScopes: [] as never[] };
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
});
assert.match(withAll, /Gmail through search_mail and read_mail/);
assert.ok(!withAll.includes('turn on'));
assert.match(external, /`Tells \$\{name\}/);
assert.match(external, /`Asks \$\{name\}/);

console.log('check:helm-mcp passed');
