import { toComparable } from '@/utils/optionMatchUtils';
import { formatYearlyDate } from '@/utils/yearlyDateUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type {
  KeyDateKind,
  MediaAttachment,
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
} from '@apps/helm/types';
import type { ByWho } from '@apps/helm/utils/keyDateIndex';
import {
  describeKeyDate,
  describeMoment,
  describeMomentWhen,
  toKeyDateWord,
} from '@apps/helm/utils/keyDateText';
import type { WhoMoment } from '@apps/helm/utils/moments';
import { formatTaskDue } from '@apps/helm/utils/taskDue';
import { pathOf } from '@apps/helm/utils/topicTree';
import { getWhoLine } from '@apps/helm/utils/whoGroups';

/** The zone and moment an open task's day is read against. */
export interface SearchWhen {
  timeZone: string;
  now: number;
}

/** Every date row in one style: "Nov 13", "Nov 17, 2015", "Jun 2020", "2015". */
const formatShortDate = (
  month: number | null,
  day: number | null,
  year: number | null,
) => {
  const name =
    month === null
      ? ''
      : new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString('en-US', {
          timeZone: 'UTC',
          month: 'short',
        });
  const monthDay = day === null ? name : `${name} ${day}`;
  if (year === null) return monthDay;
  if (monthDay === '') return String(year);
  return day === null ? `${monthDay} ${year}` : `${monthDay}, ${year}`;
};

export const SEARCH_GROUPS = [
  'people',
  'tasks',
  'dates',
  'facts',
  'notes',
  'topics',
  'projects',
  'procedures',
  'places',
  'media',
  'synced',
] as const;

export type SearchGroup = (typeof SEARCH_GROUPS)[number];

/** Rows a group shows before "Show all". */
export const SEARCH_PREVIEW = 3;

/** Rows an opened group draws at most, so a one-letter query never builds thousands. */
export const SEARCH_EXPANDED_MAX = 200;

export type SearchTarget =
  | {
      kind: 'view';
      view: 'who' | 'place' | 'project' | 'topic' | 'procedure';
      id: string;
    }
  | { kind: 'seesYou' }
  | { kind: 'task'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'synced'; id: string }
  | { kind: 'media'; id: string };

export type SearchMark =
  | { kind: 'who'; who: OpenWho }
  | { kind: 'done'; completedAt: number | null }
  | { kind: 'synced'; record: SyncedRecord }
  | null;

export interface SearchRow {
  title: string;
  line: string | null;
}

export interface SearchEntry {
  /** The record's id, unique within its group. */
  id: string;
  /** The row's words, made only for the rows drawn. */
  describe: (when?: SearchWhen) => SearchRow;
  /** What a typed word is matched against first, comparable. */
  titleText: string;
  bodyText: string;
  target: SearchTarget;
  mark: SearchMark;
  /** Lower first. */
  tier: number;
  /** Higher first within a tier; 0 where A to Z decides. */
  recency: number;
}

export type SearchIndex = Record<SearchGroup, SearchEntry[]>;

export interface SearchSources {
  who: OpenWho[];
  places: OpenPlace[];
  /** Open and done, merged by id. */
  tasks: OpenTask[];
  facts: OpenFact[];
  byWho: ByWho;
  moments: WhoMoment[];
  notes: OpenNote[];
  topics: OpenTopic[];
  projects: OpenProject[];
  procedures: OpenProcedure[];
  media: OpenMedia[];
  synced: SyncedRecord[];
}

/** Tasks by id, the later lists winning, so a task the live store still holds is never shown from an older read. */
export const mergeTasks = (...lists: OpenTask[][]): OpenTask[] => [
  ...new Map(lists.flat().map((task) => [task.id, task])).values(),
];

const toText = (...parts: Parts) =>
  toComparable(parts.filter(Boolean).join(' '));

type Parts = (string | null | undefined)[];

const TEXTS = new WeakMap<object, { titleText: string; bodyText: string }>();

/** A record's comparable words, folded once per record object, so a rebuild after one change only folds the record that changed. */
const textsOf = (source: object, read: () => { title: Parts; body: Parts }) => {
  const known = TEXTS.get(source);
  if (known) return known;
  const { title, body } = read();
  const texts = { titleText: toText(...title), bodyText: toText(...body) };
  TEXTS.set(source, texts);
  return texts;
};

const byRecency = (a: SearchEntry, b: SearchEntry) => b.recency - a.recency;

const byOrder = (a: SearchEntry, b: SearchEntry) =>
  a.tier - b.tier ||
  b.recency - a.recency ||
  (a.titleText < b.titleText ? -1 : a.titleText > b.titleText ? 1 : 0);

const SEES_YOU: SearchTarget = { kind: 'seesYou' };

const toFactTarget = (
  fact: OpenFact,
  whoIds: ReadonlySet<string>,
  placeIds: ReadonlySet<string>,
  projectIds: ReadonlySet<string>,
): SearchTarget => {
  const whoId = fact.whoIds.find((id) => whoIds.has(id));
  if (whoId) return { kind: 'view', view: 'who', id: whoId };
  const placeId = fact.placeIds.find((id) => placeIds.has(id));
  if (placeId) return { kind: 'view', view: 'place', id: placeId };
  const projectId = fact.projectIds.find((id) => projectIds.has(id));
  return projectId
    ? { kind: 'view', view: 'project', id: projectId }
    : SEES_YOU;
};

/** Everything findable, as comparable entries in the order each group lists them. Built once per change of the sources; `searchEntries` then only filters. */
export function buildSearchIndex(sources: SearchSources): SearchIndex {
  const who = sources.who.filter((entry) => !entry.isUnreadable);
  const whoById = new Map(who.map((entry) => [entry.id, entry]));
  const whoTexts = who.map((entry) =>
    textsOf(entry, () => ({
      title: [entry.name],
      body: [
        ...entry.aliases,
        entry.relation,
        entry.species,
        entry.organizationKind,
      ],
    })),
  );
  const placeIds = new Set(
    sources.places.filter((entry) => !entry.isUnreadable).map((p) => p.id),
  );
  const projectIds = new Set(
    sources.projects.filter((entry) => !entry.isUnreadable).map((p) => p.id),
  );
  const whoIds = new Set(whoById.keys());
  const tasks = sources.tasks.filter((task) => !task.isUnreadable);
  const taskIds = new Set(tasks.map((task) => task.id));
  const notes = sources.notes.filter((note) => !note.isUnreadable);
  const noteIds = new Set(notes.map((note) => note.id));
  const topics = sources.topics.filter((topic) => !topic.isUnreadable);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const factById = new Map(sources.facts.map((fact) => [fact.id, fact]));

  const people = who.map<SearchEntry>((entry, index) => ({
    id: entry.id,
    describe: () => ({
      title: entry.name,
      line:
        getWhoLine(entry, {
          you: HELM_COPY.youLabel,
          pet: HELM_COPY.petKindFallback,
          organization: HELM_COPY.organizationKindFallback,
        }) || HELM_COPY.whoKindPerson,
    }),
    ...whoTexts[index],
    target: { kind: 'view', view: 'who', id: entry.id },
    mark: { kind: 'who', who: entry },
    tier: 0,
    recency: 0,
  }));

  const projectNames = new Map(
    sources.projects
      .filter((project) => !project.isUnreadable)
      .map((project) => [project.id, project.name]),
  );
  const taskEntries = tasks.map<SearchEntry>((task) => {
    const isDone = task.status === 'done';
    return {
      id: task.id,
      describe: (when = { timeZone: 'UTC', now: Date.now() }) => ({
        title: task.title,
        line: isDone
          ? null
          : [
              task.due
                ? formatTaskDue(task.due, when.timeZone, when.now)
                : HELM_COPY.noDay,
              task.projectId ? projectNames.get(task.projectId) : null,
            ]
              .filter(Boolean)
              .join(' · '),
      }),
      ...textsOf(task, () => ({
        title: [task.title],
        body: [
          task.notes,
          ...Object.values(task.steps).map((step) => step.text),
        ],
      })),
      target: { kind: 'task', id: task.id },
      mark: isDone ? { kind: 'done', completedAt: task.completedAt } : null,
      tier: isDone ? 1 : 0,
      recency: isDone ? (task.completedAt ?? task.createdAt) : task.createdAt,
    };
  });

  const sorted = (entries: SearchEntry[]) => [...entries].sort(byOrder);

  const dateTexts = new Map<string, string[]>();
  const toDateText = (
    kind: KeyDateKind,
    label: string | null,
    month: number | null,
  ) => {
    const key = label === null ? kind : `${kind}|${label}`;
    const months = dateTexts.get(key) ?? [];
    dateTexts.set(key, months);
    const slot = month ?? 0;
    const known = months[slot];
    if (known !== undefined) return known;
    const text = toText(
      toKeyDateWord(kind, label),
      label,
      month === null
        ? null
        : formatYearlyDate({ month, day: null, year: null }),
    );
    months[slot] = text;
    return text;
  };

  const owners = new Map(
    who.map((entry, index) => [
      entry.id,
      {
        who: entry,
        text: whoTexts[index].titleText,
        target: { kind: 'view', view: 'who', id: entry.id } as const,
      },
    ]),
  );

  const peopleInOrder = sorted(people);
  const yearly = peopleInOrder.flatMap((person) => {
    const owner = owners.get(person.id);
    if (!owner) return [];
    return (sources.byWho[person.id] ?? []).map<SearchEntry>(
      ([id, kind, month, day, year, label]) => ({
        id,
        describe: () => ({
          title: describeKeyDate({
            kind,
            label,
            whoName: owner.who.name,
            whoKind: owner.who.kind,
            isSelf: owner.who.isSelf,
          }),
          line: formatShortDate(month, day, year),
        }),
        titleText: `${owner.text} ${toDateText(kind, label, month)}`,
        bodyText: year === null ? '' : String(year),
        target: owner.target,
        mark: null,
        tier: 0,
        recency: 0,
      }),
    );
  });

  const moments = sources.moments
    .map<SearchEntry | null>((moment) => {
      const owner = owners.get(moment.whoId);
      return owner
        ? {
            id: moment.id,
            describe: () => ({
              title: describeMoment({
                kind: moment.kind,
                label: moment.label,
                whoName: owner.who.name,
                isSelf: owner.who.isSelf,
              }),
              line:
                moment.precision === 'decade'
                  ? describeMomentWhen(moment)
                  : formatShortDate(
                      moment.precision === 'year' ? null : moment.month,
                      moment.precision === 'day' ? moment.day : null,
                      moment.year,
                    ),
            }),
            titleText: `${owner.text} ${toDateText(moment.kind, moment.label, moment.month)}`,
            bodyText: String(moment.year),
            target: owner.target,
            mark: null,
            tier: 1,
            recency: moment.year,
          }
        : null;
    })
    .filter((entry): entry is SearchEntry => entry !== null);

  const facts = sources.facts
    .filter((fact) => fact.status !== 'superseded')
    .map<SearchEntry>((fact) => ({
      id: fact.id,
      describe: () => ({
        title: fact.statement,
        line: [fact.topic, fact.value].filter(Boolean).join(' · ') || null,
      }),
      ...textsOf(fact, () => ({
        title: [fact.statement],
        body: [fact.value, fact.topic],
      })),
      target: toFactTarget(fact, whoIds, placeIds, projectIds),
      mark: null,
      tier: 0,
      recency: fact.lastEditedAt ?? fact.createdAt,
    }));

  const noteEntries = notes.map<SearchEntry>((note) => {
    const topic = topicById.get(
      note.topicIds.find((id) => topicById.has(id)) ?? '',
    );
    const names = note.topicIds.flatMap((id) => topicById.get(id)?.name ?? []);
    const texts = textsOf(note, () => ({
      title: [note.title],
      body: [note.body],
    }));
    return {
      id: note.id,
      describe: () => ({
        title: note.title || HELM_COPY.noteUntitled,
        line: topic
          ? `${topic.emoji ? `${topic.emoji} ` : ''}${topic.name}`
          : HELM_COPY.searchLooseNote,
      }),
      titleText: texts.titleText,
      bodyText: `${toText(...names)} ${texts.bodyText}`,
      target: { kind: 'note', id: note.id },
      mark: null,
      tier: 0,
      recency: note.lastEditedAt ?? note.createdAt,
    };
  });

  const topicEntries = topics.map<SearchEntry>((topic) => ({
    id: topic.id,
    describe: () => ({
      title: `${topic.emoji ? `${topic.emoji} ` : ''}${topic.name}`,
      line: pathOf(topic.id, topics).slice(0, -1).join(' › ') || null,
    }),
    ...textsOf(topic, () => ({
      title: [topic.name],
      body: [
        topic.overview,
        ...topic.sections.flatMap((section) => [
          section.heading,
          section.markdown,
        ]),
      ],
    })),
    target: { kind: 'view', view: 'topic', id: topic.id },
    mark: null,
    tier: 0,
    recency: 0,
  }));

  const projectEntries = sources.projects
    .filter((project) => !project.isUnreadable)
    .map<SearchEntry>((project) => ({
      id: project.id,
      describe: () => ({
        title: `${project.emoji ? `${project.emoji} ` : ''}${project.name}`,
        line: null,
      }),
      titleText: toText(project.name),
      bodyText: toText(
        project.objective,
        ...Object.values(project.milestones).map(
          (milestone) => milestone.title,
        ),
      ),
      target: { kind: 'view', view: 'project', id: project.id },
      mark: null,
      tier: project.status === 'finished' ? 1 : 0,
      recency: 0,
    }));

  const procedureEntries = sources.procedures.map<SearchEntry>((procedure) => ({
    id: procedure.id,
    describe: () => ({ title: procedure.title, line: null }),
    titleText: toText(procedure.title),
    bodyText: toText(
      ...Object.values(procedure.steps).flatMap((step) => [
        step.text,
        step.detail,
      ]),
    ),
    target: { kind: 'view', view: 'procedure', id: procedure.id },
    mark: null,
    tier: 0,
    recency: 0,
  }));

  const placeEntries = sources.places
    .filter((place) => !place.isUnreadable)
    .map<SearchEntry>((place) => ({
      id: place.id,
      describe: () => ({ title: place.name, line: place.address }),
      titleText: toText(place.name),
      bodyText: toText(...place.aliases, place.address, place.notes),
      target: { kind: 'view', view: 'place', id: place.id },
      mark: null,
      tier: 0,
      recency: 0,
    }));

  const toMediaTarget = (
    media: OpenMedia,
    attached: MediaAttachment | undefined,
  ): SearchTarget => {
    const viewer: SearchTarget = { kind: 'media', id: media.id };
    if (!attached) return viewer;
    if (attached.kind === 'who') {
      return whoIds.has(attached.id)
        ? { kind: 'view', view: 'who', id: attached.id }
        : viewer;
    }
    if (attached.kind === 'place') {
      return placeIds.has(attached.id)
        ? { kind: 'view', view: 'place', id: attached.id }
        : viewer;
    }
    if (attached.kind === 'task') {
      return taskIds.has(attached.id)
        ? { kind: 'task', id: attached.id }
        : viewer;
    }
    if (attached.kind === 'note') {
      return noteIds.has(attached.id)
        ? { kind: 'note', id: attached.id }
        : viewer;
    }
    const fact = factById.get(attached.id);
    if (!fact) return viewer;
    const target = toFactTarget(fact, whoIds, placeIds, projectIds);
    return target.kind === 'seesYou' ? viewer : target;
  };

  const mediaEntries = sources.media
    .filter(
      (media) =>
        media.status === 'kept' &&
        !media.isUnreadable &&
        Boolean(media.caption),
    )
    .map<SearchEntry>((media) => ({
      id: media.id,
      describe: () => ({
        title: media.caption ?? '',
        line: HELM_COPY.mediaNoun(media.kind, media.fileName),
      }),
      ...textsOf(media, () => ({ title: [media.caption], body: [] })),
      target: toMediaTarget(media, media.attachedTo[0]),
      mark: null,
      tier: 0,
      recency: media.createdAt,
    }));

  const syncedEntries = sources.synced.map<SearchEntry>((record) => ({
    id: record.id,
    describe: () => ({ title: record.sealed.title, line: null }),
    ...textsOf(record, () => ({
      title: [record.sealed.title],
      body: [
        record.sealed.subtitle,
        record.sealed.detail,
        record.sealed.placeLabel,
      ],
    })),
    target: { kind: 'synced', id: record.id },
    mark: { kind: 'synced', record },
    tier: 0,
    recency: record.startAt ?? 0,
  }));

  return {
    people: peopleInOrder,
    tasks: sorted(taskEntries),
    dates: [...yearly, ...moments.sort(byRecency)],
    facts: sorted(facts),
    notes: sorted(noteEntries),
    topics: sorted(topicEntries),
    projects: sorted(projectEntries),
    procedures: sorted(procedureEntries),
    places: sorted(placeEntries),
    media: sorted(mediaEntries),
    synced: sorted(syncedEntries),
  };
}

const EMPTY_INDEX: SearchIndex = {
  people: [],
  tasks: [],
  dates: [],
  facts: [],
  notes: [],
  topics: [],
  projects: [],
  procedures: [],
  places: [],
  media: [],
  synced: [],
};

/** Each group's entries that hold every typed word (any order, accents and case ignored): ones with the words in their title first, the rest after, each keeping the group's own order. */
export function searchEntries(index: SearchIndex, query: string): SearchIndex {
  const words = [...new Set(toComparable(query).split(' ').filter(Boolean))];
  if (words.length === 0) return EMPTY_INDEX;
  const inTitle = (entry: SearchEntry) =>
    words.every((word) => entry.titleText.includes(word));
  const matches = (entry: SearchEntry) =>
    words.every(
      (word) => entry.titleText.includes(word) || entry.bodyText.includes(word),
    );
  const pick = (entries: SearchEntry[]) => {
    const hits = entries.filter(matches);
    return [...hits.filter(inTitle), ...hits.filter((hit) => !inTitle(hit))];
  };
  return Object.fromEntries(
    SEARCH_GROUPS.map((group) => [group, pick(index[group])]),
  ) as SearchIndex;
}

/** The rows a group draws: three, or up to 200 once opened; `hidden` is what "Show all" would add. */
export function toGroupRows(entries: SearchEntry[], isExpanded: boolean) {
  const rows = entries.slice(
    0,
    isExpanded ? SEARCH_EXPANDED_MAX : SEARCH_PREVIEW,
  );
  return { rows, hidden: entries.length - rows.length };
}
