// Import-free: the server keeps an exact copy (`npm run connections:vendor`), so the prompt and the app read one table.

export const HELM_HOMES = [
  'captures',
  'tasks',
  'facts',
  'planDays',
  'who',
  'places',
  'keyDates',
  'meta',
  'projects',
  'notes',
  'topics',
  'procedures',
  'procedureRuns',
  'media',
  'style',
  'executions',
  'synced',
  'profile',
  'live',
  'connections',
] as const;

export type HelmHome = (typeof HELM_HOMES)[number];

export interface WhereRow {
  /** The words the prompt uses. */
  thing: string;
  home: HelmHome;
  classes: ('sealed' | 'readable')[];
  readers: ('device' | 'server' | 'turn' | 'quick' | 'night')[];
  /** The block of the turn's context that holds it, such as `<open_tasks>`. */
  contextBlock: string | null;
  /** The tools that read it. */
  tools: string[];
  /** The model's write path: command kinds, and terminal tools that end a turn. */
  commands: string[];
  /** `actions/<file>` (a device action module), `server/<file>` (a Cloud Function file) or `platform/<file>` (the connections platform); every command and tap goes through it. */
  writer: string;
  /** The device actions a tap calls, each an export of the writer. */
  taps: string[];
  /** Fields a server job owns. */
  jobFields: { field: string; job: string }[];
  grant: { source: string; category: string } | null;
  /** Night jobs allowed to read it. */
  batchJobs: string[];
  /** The homes it cites. */
  derivedFrom: HelmHome[];
  /** The field that holds the keys of what it cites; required when `derivedFrom` is set. */
  sourceKeys: string | null;
  /** The homes a delete of this one takes with it. */
  deleteTakes: HelmHome[];
  /** A learned result must sync ("Nothing learned lives on one device"); only what is read live is not stored. */
  isSynced: boolean;
}

/** The blocks that carry the turn itself, not a kind of record. */
export const TURN_BLOCKS = [
  '<capture>',
  '<messages>',
  '<reading>',
  '<context>',
  '<screen>',
  '<files>',
  '<already_made>',
] as const;

const row = (
  fields: Pick<WhereRow, 'thing' | 'home' | 'writer'> & Partial<WhereRow>,
): WhereRow => ({
  classes: ['sealed'],
  readers: ['device', 'turn', 'quick'],
  contextBlock: null,
  tools: [],
  commands: [],
  taps: [],
  jobFields: [],
  grant: null,
  batchJobs: [],
  derivedFrom: [],
  sourceKeys: null,
  deleteTakes: [],
  isSynced: true,
  ...fields,
});

const connected = (
  source: string,
  category: string,
  thing: string,
  fields: Partial<WhereRow> = {},
): WhereRow =>
  row({
    thing,
    home: 'live',
    writer: 'platform/sink',
    readers: ['device', 'turn', 'quick'],
    grant: { source, category },
    isSynced: false,
    ...fields,
  });

const syncedApp = (source: string, category: string, thing: string) =>
  connected(source, category, thing, {
    home: 'synced',
    contextBlock: '<synced_records>',
    tools: ['search_synced'],
    isSynced: true,
  });

const liveApp = (source: string, category: string, thing: string) =>
  connected(source, category, thing, { tools: ['search_app_records'] });

export const WHERE_THINGS_LIVE: WhereRow[] = [
  row({
    thing: 'Tasks',
    home: 'tasks',
    contextBlock: '<open_tasks>',
    tools: ['search_tasks'],
    commands: ['createTask', 'updateTask', 'completeTask'],
    writer: 'actions/taskActions',
    taps: ['createTask', 'updateTaskFields', 'completeTask', 'deleteTask'],
  }),
  row({
    thing: 'Goals and projects, with their milestones',
    home: 'projects',
    contextBlock: '<open_projects>',
    commands: ['createProject', 'setProjectRole', 'addMilestone'],
    writer: 'actions/projectActions',
    taps: ['createProject', 'changeProjectRole', 'addMilestone'],
  }),
  row({
    thing: 'What the person says about themselves',
    home: 'facts',
    contextBlock: '<about_you>',
    commands: ['noteFact', 'remember'],
    writer: 'actions/memoryActions',
    taps: ['addFact', 'correctFact', 'forgetFact'],
    derivedFrom: ['captures'],
    sourceKeys: 'sourceCaptureId',
  }),
  row({
    thing: 'What is known about the people and places named',
    home: 'facts',
    contextBlock: '<known_facts>',
    commands: ['noteFact', 'remember'],
    writer: 'actions/memoryActions',
    taps: ['addFact', 'correctFact', 'forgetFact'],
    derivedFrom: ['captures'],
    sourceKeys: 'sourceCaptureId',
  }),
  row({
    thing: 'People and pets',
    home: 'who',
    contextBlock: '<people>',
    writer: 'actions/whoActions',
    taps: ['updateWho', 'forgetWho', 'setWhoSoundsLike'],
    deleteTakes: ['keyDates', 'facts'],
  }),
  row({
    thing: 'Places',
    home: 'places',
    contextBlock: '<known_facts>',
    writer: 'actions/placeActions',
    taps: ['updatePlace', 'forgetPlace'],
  }),
  row({
    thing: 'Key dates',
    home: 'keyDates',
    contextBlock: '<key_dates>',
    commands: ['setKeyDate', 'removeKeyDate'],
    writer: 'actions/keyDateActions',
    taps: ['addKeyDate', 'editKeyDate', 'removeKeyDate'],
  }),
  row({
    thing: 'The next dates coming up',
    home: 'meta',
    contextBlock: '<upcoming_dates>',
    writer: 'actions/keyDateActions',
    taps: ['rebuildKeyDateIndex'],
    derivedFrom: ['keyDates'],
    sourceKeys: 'byWho',
  }),
  row({
    thing: 'Notes',
    home: 'notes',
    contextBlock: '<related_notes>',
    commands: ['createNote'],
    writer: 'actions/noteActions',
    taps: ['createNote', 'editNote', 'deleteNote'],
  }),
  row({
    thing: 'Topics',
    home: 'topics',
    contextBlock: '<your_topics>',
    commands: ['moveTopic', 'createParentTopic'],
    writer: 'actions/topicActions',
    taps: ['createTopic', 'moveTopic', 'deleteTopic'],
  }),
  row({
    thing: "A topic's document",
    home: 'topics',
    contextBlock: '<topic_document>',
    tools: ['get_topic'],
    commands: ['addToTopic', 'reviseTopic'],
    writer: 'actions/topicActions',
    taps: ['saveTopicSection', 'removeTopicSection'],
    derivedFrom: ['notes'],
    sourceKeys: 'sources',
  }),
  row({
    thing: 'Procedures',
    home: 'procedures',
    contextBlock: '<your_procedures>',
    tools: ['search_procedures'],
    commands: ['createProcedure', 'reviseProcedure'],
    writer: 'actions/procedureActions',
    taps: ['createProcedure', 'saveProcedure', 'deleteProcedure'],
    deleteTakes: ['procedureRuns'],
  }),
  row({
    thing: 'The procedure that is open',
    home: 'procedures',
    contextBlock: '<procedure_open>',
    tools: ['search_procedures'],
    commands: ['reviseProcedure'],
    writer: 'actions/procedureActions',
    taps: ['saveProcedure'],
  }),
  row({
    thing: 'Runs of a procedure',
    home: 'procedureRuns',
    contextBlock: '<open_runs>',
    commands: ['startRun', 'tickRun'],
    writer: 'actions/runActions',
    taps: ['startRun', 'tickRunSteps', 'finishRun'],
  }),
  row({
    thing: 'Whether a thing is private',
    home: 'tasks',
    classes: ['readable', 'sealed'],
    commands: ['setPrivate'],
    writer: 'actions/privacyActions',
    taps: ['setPrivate', 'keepInheritedPrivate'],
  }),
  row({
    thing: 'Whether a turn touched a private thing',
    home: 'captures',
    classes: ['readable'],
    writer: 'server/sortHelmCapture',
    jobFields: [{ field: 'touchesPrivate', job: 'sortHelmCapture' }],
  }),
  row({
    thing: 'Photos and files kept with a record',
    home: 'media',
    contextBlock: '<attachments>',
    writer: 'actions/mediaActions',
    taps: ['addPhoto', 'removePhoto', 'attachToTurn'],
  }),
  row({
    thing: 'How the person writes',
    home: 'style',
    contextBlock: '<your_style>',
    readers: ['device', 'turn', 'quick'],
    writer: 'server/learnHelmStyle',
    classes: ['sealed'],
  }),
  row({
    thing: "Helm's plan for a day",
    home: 'planDays',
    tools: ['get_calendar'],
    writer: 'actions/planActions',
    taps: ['generatePlan', 'keepSlot', 'skipSlot', 'moveSlot'],
  }),
  row({
    thing: 'Where the person is right now',
    home: 'profile',
    classes: ['readable'],
    commands: ['setCurrentPlace', 'planDay'],
    writer: 'actions/planActions',
    taps: ['setCurrentPlace', 'generatePlan'],
  }),
  row({
    thing: 'Where someone lives',
    home: 'who',
    writer: 'actions/whoActions',
    taps: ['updateWho'],
  }),
  row({
    thing: 'Where someone will be away',
    home: 'who',
    writer: 'actions/whoActions',
    taps: ['updateWho'],
  }),
  row({
    thing: "The phone's last city, and its point at Precise",
    home: 'who',
    writer: 'actions/whoActions',
    taps: ['updateWho'],
  }),
  row({
    thing: 'The time zone a stretch of days follows',
    home: 'profile',
    classes: ['readable'],
    writer: 'actions/settingsActions',
  }),
  row({
    thing: 'Phone location and the offers put off',
    home: 'profile',
    classes: ['readable'],
    writer: 'actions/settingsActions',
  }),
  row({
    thing: 'Settings, the name and the way Helm talks',
    home: 'profile',
    classes: ['readable'],
    writer: 'actions/settingsActions',
    taps: ['setAssistantNameAndTone', 'setVoiceMode', 'setDayWindow'],
  }),
  row({
    thing: 'Earlier turns of the conversation',
    home: 'captures',
    contextBlock: '<earlier_turns>',
    writer: 'actions/captureActions',
    taps: ['sendCapture', 'deleteCapture'],
  }),
  row({
    thing: 'Names the microphone heard and what they matched',
    home: 'captures',
    contextBlock: '<heard_names>',
    writer: 'actions/captureActions',
    taps: ['sendCapture'],
  }),
  row({
    thing: 'A question Helm asked and the answer',
    home: 'captures',
    contextBlock: '<answered_question>',
    writer: 'actions/questionActions',
    taps: ['sendQuestionAnswer'],
  }),
  row({
    thing: 'Ending the conversation',
    home: 'captures',
    commands: ['closeConversation'],
    writer: 'actions/captureActions',
    taps: ['closeQuestions', 'skipQuestion'],
  }),
  row({
    thing: 'What the assistant did',
    home: 'executions',
    writer: 'server/executeCommands',
  }),
  row({
    thing: 'Calendar events',
    home: 'synced',
    contextBlock: '<synced_records>',
    tools: ['get_calendar', 'search_synced'],
    writer: 'platform/sink',
  }),
  row({
    thing: "Another app's synced things",
    home: 'synced',
    contextBlock: '<synced_records>',
    tools: ['search_synced'],
    writer: 'platform/sink',
  }),
  row({
    thing: 'Connections and what each one shares',
    home: 'connections',
    tools: ['list_connections', 'connection_status'],
    writer: 'platform/callables',
    classes: ['readable'],
  }),
  connected('google:calendar', 'events', 'Google Calendar events', {
    home: 'synced',
    contextBlock: '<synced_records>',
    tools: ['get_calendar', 'search_synced'],
    isSynced: true,
  }),
  connected('google:gmail', 'mail', 'Mail', {
    tools: ['search_mail', 'read_mail'],
  }),
  connected('google:drive', 'documents', 'Drive documents', {
    tools: ['search_documents', 'read_document'],
  }),
  connected('google:contacts', 'contacts', 'Contacts', {
    home: 'who',
    writer: 'server/importHelmContacts',
    isSynced: true,
  }),
  syncedApp('app:a-list', 'plannedShowings', 'Planned showings'),
  syncedApp('app:a-list', 'savedTheaters', 'Saved theaters'),
  syncedApp('app:a-list', 'seenMovies', 'Movies the person has seen'),
  syncedApp('app:going-once', 'pickups', 'Pickups'),
  syncedApp('app:going-once', 'sales', 'Sales'),
  syncedApp('app:nine-lives', 'cats', 'Cats'),
  syncedApp('app:nine-lives', 'vetVisits', 'Vet visits'),
  syncedApp('app:nine-lives', 'dueCare', 'Vaccines and preventives due'),
  syncedApp('app:nine-lives', 'clinics', 'Vet clinics'),
  syncedApp('app:nine-lives', 'conditions', 'Health conditions'),
  syncedApp('app:pinch', 'plannedMeals', 'Planned meals'),
  syncedApp('app:pinch', 'shoppingList', 'The shopping list'),
  syncedApp('app:pinch', 'useSoon', 'Food to use soon'),
  syncedApp('app:runway', 'moneySummary', 'Free to Spend'),
  syncedApp('app:runway', 'upcomingBills', 'Bills coming up'),
  syncedApp('app:runway', 'horizon', 'Horizon goals'),
  liveApp('app:runway', 'transactions', 'Transactions'),
  syncedApp('app:waypoint', 'trips', 'Trips'),
  syncedApp('app:waypoint', 'itinerary', 'Trip plans'),
  syncedApp('app:waypoint', 'myTasks', 'Trip to-dos'),
  syncedApp('app:waypoint', 'tripBalances', 'What is owed on trips'),
  syncedApp('app:worth-the-wait', 'boxCounts', 'Box counts'),
];

/** Command or terminal-tool kind to the writer that makes the change, for a sentence and a tap alike. */
export const COMMAND_WRITERS: Record<string, string> = Object.fromEntries(
  WHERE_THINGS_LIVE.flatMap((entry) =>
    entry.commands.map((command) => [command, entry.writer]),
  ),
);

/** Each home to the homes it cites, which a delete cascade reads. */
export const DERIVED_FROM: Partial<Record<HelmHome, HelmHome[]>> =
  Object.fromEntries(
    WHERE_THINGS_LIVE.filter((entry) => entry.derivedFrom.length > 0).map(
      (entry) => [entry.home, entry.derivedFrom],
    ),
  );

const toList = (items: string[]) =>
  items.length < 3
    ? items.join(' or ')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;

const toLine = (entry: WhereRow) => {
  const readPaths = [
    ...(entry.contextBlock === null ? [] : [`look in ${entry.contextBlock}`]),
    ...(entry.tools.length > 0 ? [`call ${toList(entry.tools)}`] : []),
  ];
  if (readPaths.length === 0 && entry.commands.length === 0) return null;
  const read = readPaths.length > 0 ? readPaths.join(', then ') : null;
  const write =
    entry.commands.length > 0
      ? `change it with ${toList(entry.commands)}`
      : 'you cannot change it';
  return `- ${entry.thing}: ${read === null ? '' : `${read}; `}${write}.`;
};

/** Whether a row's source is readable this turn: its source (`google:gmail`, or a source with synced copies) or its `source/category` pair is in `granted`. */
export const isRowGranted = (entry: WhereRow, granted: readonly string[]) =>
  entry.grant === null ||
  granted.includes(entry.grant.source) ||
  granted.includes(`${entry.grant.source}/${entry.grant.category}`);

/** The prompt's map of where each thing lives; a live-read row is listed only when `isRowGranted` holds. */
export const renderWhereBlock = (
  granted: readonly string[] = [],
  rows: readonly WhereRow[] = WHERE_THINGS_LIVE,
) =>
  [
    '<where_things_live>',
    'To answer about a thing, look in its block, then call its tool; never guess where it lives. To change it, use only the commands listed for it; a thing with no command is changed by the person.',
    ...rows
      .filter((entry) => isRowGranted(entry, granted))
      .flatMap((entry) => toLine(entry) ?? []),
    '</where_things_live>',
  ].join('\n');
