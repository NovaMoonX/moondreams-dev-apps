import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  createOptionMatcher,
  toDisplayCase,
} from '../../../vendor/optionMatchUtils.js';
import {
  DEFAULT_ASSISTANT_NAME,
  MAX_EFFECTS,
  MAX_OPEN_ASKED,
  type AskCommand,
  type MentionRead,
  type NomosCommand,
  type NoteFactCommand,
  type NoteFactKind,
  type PlaceRead,
  type TaskDue,
} from './commands.js';
import {
  matchPlaces,
  matchWho,
  type KnownPlace,
  type KnownWho,
} from './matchEntities.js';
import { readWhoTier, type WhoTierValue } from './whoTier.js';
import { summarizeAnswer, type CaptureAnswer } from './answerGuards.js';
import { AUTOMATIC_LEVEL } from './policy.js';
import { shouldKeepSensitive } from './sensitive.js';
import { buildSpokenAck, toKnownZone } from './spoken.js';
import {
  buildAskedQuestion,
  buildCodeQuestion,
  buildPickQuestion,
  buildSpokenPick,
  buildSpokenQuestion,
  buildFactLine,
  buildFactSource,
  buildNotKeptLine,
  buildSpokenWhichIsTrue,
  buildWhichIsTrueQuestion,
  describeFacts,
  summarize,
  type CodeQuestionKind,
  type EffectCounts,
  type HeldLink,
  type PickCandidate,
  type PickKind,
} from './summaries.js';

export interface ExistingTask {
  status: 'open' | 'done';
  due: TaskDue | null;
  isUrgent: boolean;
  title: string;
  whoIds: string[];
  placeIds: string[];
  sealed: Record<string, unknown>;
}

/** A who the person already has, with what the tier rule reads about it. */
export interface KnownWhoState extends KnownWho {
  relation?: string | null;
  species?: string | null;
  organizationKind?: string | null;
  tier: WhoTierValue;
  tierSetBy: 'person' | 'nomos';
  mentionDayKeys: string[];
  taskLinkCount: number;
  hasRole: boolean;
}

/** The people and places a turn names, with what the person already has to match them against. */
export interface PeopleInput {
  mentions: MentionRead[];
  places: PlaceRead[];
  known: KnownWhoState[];
  knownPlaces: KnownPlace[];
  assistantName: string | null;
  /** The day the capture was made, in the person's zone. */
  dayKey: string;
  capturedAt: number;
}

/** A fact the person already has, for the repeat check: its words and subjects. */
export interface ExistingFact {
  id: string;
  status: 'confirmed' | 'inferred';
  statement: string;
  subjectIds: string[];
  kind: NoteFactKind;
  topic: string | null;
  stated: 'personSaid' | 'nomosInferred' | 'personCorrected';
  createdAt: number;
  /** The fact it is in dispute with, until the person settles which is true. */
  disputedWithId: string | null;
}

export interface EffectRef {
  op: 'create' | 'update';
  collection: 'tasks' | 'facts' | 'who' | 'places' | 'media' | 'profile';
  docId: string;
}

export interface Effect {
  written: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

export interface WritePlan {
  creates: { id: string; data: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  whoCreates: { id: string; data: Record<string, unknown> }[];
  whoUpdates: { id: string; data: Record<string, unknown> }[];
  placeCreates: { id: string; data: Record<string, unknown> }[];
  factCreates: { id: string; data: Record<string, unknown> }[];
  factConfirms: { id: string; data: Record<string, unknown> }[];
  /** Each kept fact a new one disagrees with, marked as in dispute with it. */
  factDisputes: { id: string; data: Record<string, unknown> }[];
  /** One line for each private detail the turn did not keep. */
  notKept: string[];
  /** Every person, pet or organization and place the turn linked, matched or made. */
  linkedWhoIds: string[];
  linkedPlaceIds: string[];
  effectRefs: EffectRef[];
  effects: Effect[];
  counts: EffectCounts;
  /** One "which one?" question for each unsure name a filed task points at, at most MAX_PICK_QUESTIONS. */
  questions: PlannedQuestion[];
}

export interface PlannedQuestion {
  id: string;
  state: QuestionStateEntry;
  sealed: Record<string, unknown>;
  spoken: string;
}

export const MAX_PICK_QUESTIONS = 3;

interface PlanInput {
  commands: NomosCommand[];
  existing: Map<string, ExistingTask>;
  captureId: string;
  executionId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  newId: () => string;
  people?: PeopleInput;
  noteFacts?: NoteFactCommand[];
  /** The words of the turn, which a fact's quote must come from. */
  captureText?: string;
  existingFacts?: ExistingFact[];
  /** The person's own who record, which a fact about them is filed under. */
  selfWhoId?: string | null;
  timeZone?: string;
}

interface Draft {
  id: string;
  title: string;
  whoIds: string[];
  placeIds: string[];
  due: TaskDue | null;
  isUrgent: boolean;
  status: 'open' | 'done';
}

const union = (left: string[], right: string[]) => [
  ...new Set([...left, ...right]),
];

const NAME_CASE = {
  style: 'title',
  keepAcronyms: true,
  keepMixedCase: true,
} as const;

/** The document a new person, pet or organization is made as, whether a turn or an answered question makes it. */
export const buildWhoDoc = (input: {
  mention: MentionRead;
  name: string;
  tier: WhoTierValue;
  executionId: string;
  lastMentionedAt: number;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): Record<string, unknown> => ({
  kind: input.mention.kind,
  tier: input.tier,
  tierSetBy: 'nomos',
  isSelf: false,
  placeIds: [],
  photoMediaId: null,
  mediaIds: [],
  importedFrom: null,
  importedFields: {},
  lastMentionedAt: input.lastMentionedAt,
  yearlyDateCount: 0,
  momentCount: 0,
  createdBy: 'nomos',
  executionId: input.executionId,
  createdAt: input.now,
  lastEditedAt: null,
  sealed: input.seal({
    name: input.name,
    aliases: [],
    relation: input.mention.relation,
    phone: null,
    email: null,
    notes: null,
    species: input.mention.species
      ? toDisplayCase(input.mention.species)
      : null,
    organizationKind: input.mention.organizationKind
      ? toDisplayCase(input.mention.organizationKind)
      : null,
  }),
});

/** The document a new place is made as. */
export const buildPlaceDoc = (input: {
  name: string;
  executionId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): Record<string, unknown> => ({
  isHome: false,
  photoMediaIds: [],
  createdBy: 'nomos',
  executionId: input.executionId,
  createdAt: input.now,
  lastEditedAt: null,
  sealed: input.seal({
    name: input.name,
    aliases: [],
    address: null,
    notes: null,
  }),
});

/** A new name as the person would write it. */
export const toNameCase = (name: string) => toDisplayCase(name, NAME_CASE);

function settleEntities(input: PlanInput) {
  const people = input.people;
  const empty = {
    whoIdOf: new Map<string, string>(),
    placeIdOf: new Map<string, string>(),
    newWho: [] as { id: string; mention: MentionRead }[],
    newPlaces: [] as { id: string; place: PlaceRead }[],
    unsureWho: new Map<
      string,
      { mention: MentionRead; candidateIds: string[] }
    >(),
    unsurePlaces: new Map<
      string,
      { place: PlaceRead; candidateIds: string[] }
    >(),
  };
  if (!people) return empty;
  const whoMatches = matchWho({
    mentions: people.mentions,
    known: people.known,
    assistantName: people.assistantName,
  });
  const placeMatches = matchPlaces({
    names: people.places.map((place) => place.name),
    known: people.knownPlaces,
    assistantName: people.assistantName,
  });
  const whoSettled = people.mentions.flatMap((mention, index) => {
    const match = whoMatches[index];
    return match.kind === 'match'
      ? [{ mention, id: match.id, isNew: false }]
      : match.kind === 'new'
        ? [{ mention, id: input.newId(), isNew: true }]
        : [];
  });
  const placeSettled = people.places.flatMap((place, index) => {
    const match = placeMatches[index];
    return match.kind === 'match'
      ? [{ place, id: match.id, isNew: false }]
      : match.kind === 'new'
        ? [{ place, id: input.newId(), isNew: true }]
        : [];
  });
  const unsure = <T extends { ref: string }>(
    items: T[],
    matches: { kind: string; candidateIds?: string[] }[],
  ) =>
    items.flatMap((item, index): [string, T, string[]][] => {
      const ids = matches[index].candidateIds;
      return ids && ids.length > 0 ? [[item.ref, item, ids]] : [];
    });
  return {
    unsureWho: new Map(
      unsure(people.mentions, whoMatches).map(
        ([ref, mention, candidateIds]) => [ref, { mention, candidateIds }],
      ),
    ),
    unsurePlaces: new Map(
      unsure(people.places, placeMatches).map(([ref, place, candidateIds]) => [
        ref,
        { place, candidateIds },
      ]),
    ),
    whoIdOf: new Map(whoSettled.map((entry) => [entry.mention.ref, entry.id])),
    placeIdOf: new Map(
      placeSettled.map((entry) => [entry.place.ref, entry.id]),
    ),
    newWho: whoSettled
      .filter((entry) => entry.isNew)
      .map(({ id, mention }) => ({ id, mention })),
    newPlaces: placeSettled
      .filter((entry) => entry.isNew)
      .map(({ id, place }) => ({ id, place })),
  };
}

const idsOf = (refs: string[], idOf: Map<string, string>) => [
  ...new Set(refs.flatMap((ref) => idOf.get(ref) ?? [])),
];

const toLooseText = (text: string) =>
  text.replace(/\s+/g, ' ').trim().toLowerCase();

const toSubjectKey = (ids: string[]) => [...ids].sort().join('|');

const topicMatcher = createOptionMatcher({ foldPlurals: true });

/** A topic files under one the person's facts of that kind already use ("gas stations" under "gas station"); a new one is written in lowercase like the rest. */
const settleTopic = (
  topic: string | null,
  kind: NoteFactKind,
  existing: ExistingFact[],
) => {
  if (!topic) return null;
  const used = [
    ...new Set(
      existing.flatMap((fact) =>
        fact.kind === kind && fact.topic ? [fact.topic] : [],
      ),
    ),
  ];
  return topicMatcher.match(topic, used) ?? topic.trim().toLowerCase();
};

const isOpinion = (kind: NoteFactKind) =>
  kind === 'preference' || kind === 'favorite';

const isSameDue = (a: TaskDue | null, b: TaskDue | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Turns settled commands into the documents to write and the Execution's record of each change; an update to a task made in the same reply folds into that task's create. */
export function planWrites(input: PlanInput): WritePlan {
  const { existing, now, seal } = input;
  const drafts = new Map<string, Draft>();
  const working = new Map<string, ExistingTask>(existing);
  const patches = new Map<string, Record<string, unknown>>();
  const effectRefs: EffectRef[] = [];
  const effects: Effect[] = [];
  const counts: EffectCounts = { made: 0, updated: 0, completed: 0 };

  const entities = settleEntities(input);
  const unsureTasks = new Map<string, string[]>();
  const noteUnsure = (taskId: string, refs: string[]) =>
    refs
      .filter(
        (ref) => entities.unsureWho.has(ref) || entities.unsurePlaces.has(ref),
      )
      .forEach((ref) =>
        unsureTasks.set(ref, union(unsureTasks.get(ref) ?? [], [taskId])),
      );

  const record = (
    docId: string,
    op: EffectRef['op'],
    written: Record<string, unknown>,
    previous: Record<string, unknown> | null,
    collection: EffectRef['collection'] = 'tasks',
  ) => {
    effectRefs.push({ op, collection, docId });
    effects.push({ written, previous });
  };

  const patch = (id: string, data: Record<string, unknown>) =>
    patches.set(id, { ...patches.get(id), ...data });

  input.commands.forEach((command) => {
    if (effects.length + drafts.size >= MAX_EFFECTS) return;
    if (command.kind === 'createTask') {
      const id = input.newId();
      noteUnsure(id, [...command.whoRefs, ...command.placeRefs]);
      drafts.set(command.ref, {
        id,
        title: command.title,
        whoIds: idsOf(command.whoRefs, entities.whoIdOf),
        placeIds: idsOf(command.placeRefs, entities.placeIdOf),
        due: command.due,
        isUrgent: command.isUrgent,
        status: 'open',
      });
      return;
    }
    const draft = drafts.get(command.taskId);
    if (draft) {
      if (command.kind === 'completeTask') draft.status = 'done';
      else {
        noteUnsure(draft.id, [...command.whoRefs, ...command.placeRefs]);
        draft.title = command.title ?? draft.title;
        if (command.hasDue) draft.due = command.due;
        draft.isUrgent = command.isUrgent ?? draft.isUrgent;
        draft.whoIds = union(
          draft.whoIds,
          idsOf(command.whoRefs, entities.whoIdOf),
        );
        draft.placeIds = union(
          draft.placeIds,
          idsOf(command.placeRefs, entities.placeIdOf),
        );
      }
      return;
    }
    const current = working.get(command.taskId);
    if (!current) return;
    const id = command.taskId;
    if (command.kind === 'updateTask') {
      noteUnsure(id, [...command.whoRefs, ...command.placeRefs]);
    }

    if (command.kind === 'completeTask') {
      if (current.status === 'done') return;
      record(
        id,
        'update',
        { 'sealed.title': current.title, status: 'done', completedAt: now },
        { 'sealed.title': current.title, status: 'open', completedAt: null },
      );
      patch(id, { status: 'done', completedAt: now, lastEditedAt: now });
      working.set(id, { ...current, status: 'done' });
      counts.completed += 1;
      return;
    }

    const title =
      command.title && command.title !== current.title ? command.title : null;
    const due =
      command.hasDue && !isSameDue(command.due, current.due)
        ? command.due
        : undefined;
    const isUrgent =
      command.isUrgent !== null && command.isUrgent !== current.isUrgent
        ? command.isUrgent
        : null;
    const whoIds = union(
      current.whoIds,
      idsOf(command.whoRefs, entities.whoIdOf),
    );
    const placeIds = union(
      current.placeIds,
      idsOf(command.placeRefs, entities.placeIdOf),
    );
    const hasNewWho = whoIds.length > current.whoIds.length;
    const hasNewPlace = placeIds.length > current.placeIds.length;
    if (
      title === null &&
      due === undefined &&
      isUrgent === null &&
      !hasNewWho &&
      !hasNewPlace
    ) {
      return;
    }
    const written: Record<string, unknown> = {
      'sealed.title': title ?? current.title,
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
      ...(hasNewWho && { whoIds }),
      ...(hasNewPlace && { placeIds }),
    };
    const previous: Record<string, unknown> = {
      'sealed.title': current.title,
      ...(due !== undefined && { due: current.due }),
      ...(isUrgent !== null && { isUrgent: current.isUrgent }),
      ...(hasNewWho && { whoIds: current.whoIds }),
      ...(hasNewPlace && { placeIds: current.placeIds }),
    };
    record(id, 'update', written, previous);
    patch(id, {
      ...(title !== null && {
        sealed: seal({ ...current.sealed, title }),
      }),
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
      ...(hasNewWho && { whoIds }),
      ...(hasNewPlace && { placeIds }),
      lastEditedAt: now,
    });
    working.set(id, {
      ...current,
      whoIds,
      placeIds,
      title: title ?? current.title,
      due: due === undefined ? current.due : due,
      isUrgent: isUrgent ?? current.isUrgent,
    });
    counts.updated += 1;
  });

  const nameOf = new Map<string, string>([
    ...(input.people?.known ?? []).map((who): [string, string] => [
      who.id,
      who.name,
    ]),
    ...(input.people?.knownPlaces ?? []).map((place): [string, string] => [
      place.id,
      place.name,
    ]),
    ...entities.newWho.map(({ id, mention }): [string, string] => [
      id,
      toNameCase(mention.name),
    ]),
    ...entities.newPlaces.map(({ id, place }): [string, string] => [
      id,
      toNameCase(place.name),
    ]),
  ]);
  const keyOf = (
    statement: string,
    subjectIds: string[],
    kind: NoteFactKind,
    topic: string | null,
  ) =>
    `${toLooseText(statement)}#${toSubjectKey(subjectIds)}#${kind}#${toLooseText(topic ?? '')}`;
  const existingByKey = new Map(
    (input.existingFacts ?? []).map((fact) => [
      keyOf(fact.statement, fact.subjectIds, fact.kind, fact.topic),
      fact,
    ]),
  );
  const selfWhoId = input.selfWhoId ?? null;
  const captureWords = toLooseText(input.captureText ?? '');
  const capturedAt = input.people?.capturedAt ?? now;
  const assistantName = input.people?.assistantName ?? DEFAULT_ASSISTANT_NAME;
  const zone = toKnownZone(input.timeZone ?? 'UTC');
  const findContradicted = (
    fact: NoteFactCommand,
    subjectIds: string[],
    kind: NoteFactKind,
    topic: string | null,
    taken: string[],
  ) => {
    const candidates = (input.existingFacts ?? []).filter(
      (other) =>
        other.disputedWithId === null &&
        !taken.includes(other.id) &&
        other.subjectIds.some((id) => subjectIds.includes(id)) &&
        toLooseText(other.statement) !== toLooseText(fact.statement),
    );
    return (
      candidates.find((other) => other.id === fact.contradicts) ??
      candidates.find(
        (other) =>
          isOpinion(kind) &&
          other.kind === kind &&
          topic !== null &&
          toLooseText(other.topic ?? '') === toLooseText(topic) &&
          toSubjectKey(other.subjectIds) === toSubjectKey(subjectIds),
      ) ??
      null
    );
  };
  const factSteps = (input.noteFacts ?? []).reduce<{
    seen: string[];
    creates: { id: string; data: Record<string, unknown> }[];
    confirms: { id: string; data: Record<string, unknown> }[];
    disputes: {
      older: ExistingFact;
      newerId: string;
      statement: string;
      isSaid: boolean;
    }[];
    notKept: string[];
  }>(
    (acc, fact) => {
      const reserved =
        effects.length +
        drafts.size +
        entities.newWho.length +
        entities.newPlaces.length;
      if (reserved >= MAX_EFFECTS) return acc;
      const isSure =
        fact.whoRefs.every((ref) => entities.whoIdOf.has(ref)) &&
        fact.placeRefs.every((ref) => entities.placeIdOf.has(ref));
      const isAboutSelf = fact.isAboutMe;
      if (isAboutSelf && !selfWhoId) return acc;
      const whoIds = union(
        idsOf(fact.whoRefs, entities.whoIdOf),
        isAboutSelf && selfWhoId ? [selfWhoId] : [],
      );
      const placeIds = idsOf(fact.placeRefs, entities.placeIdOf);
      const subjectIds = union(whoIds, placeIds);
      const quoted = toLooseText(fact.quote ?? '');
      const isQuestion =
        (fact.quote?.trim().endsWith('?') ?? false) ||
        (quoted !== '' &&
          (input.captureText ?? '')
            .split(/(?<=[.!?])\s+/)
            .some(
              (sentence) =>
                toLooseText(sentence).includes(quoted) &&
                sentence.trim().endsWith('?'),
            ));
      if (!isSure || subjectIds.length === 0 || isQuestion) return acc;
      const topic = settleTopic(
        fact.topic,
        fact.kind,
        input.existingFacts ?? [],
      );
      const repeatKey = keyOf(fact.statement, subjectIds, fact.kind, topic);
      if (acc.seen.includes(repeatKey)) return acc;
      const seen = [...acc.seen, repeatKey];
      const quote =
        fact.quote !== null &&
        toLooseText(fact.quote) !== '' &&
        captureWords.includes(toLooseText(fact.quote))
          ? fact.quote
          : null;
      // A word or two lifted from the capture is too thin to stand for something said outright.
      const isSaid =
        fact.isStated &&
        quote !== null &&
        toLooseText(quote).split(' ').length >= 2 &&
        toLooseText(quote).length >= 8;
      if (
        !shouldKeepSensitive({
          isSensitive: fact.isSensitive,
          provenance: isSaid ? 'personSaid' : 'nomosInferred',
          subjectWhoIds: subjectIds,
          selfWhoId,
        })
      ) {
        return {
          ...acc,
          seen,
          notKept: [
            ...acc.notKept,
            buildNotKeptLine({
              isAboutSelf:
                subjectIds.length === 1 && subjectIds[0] === selfWhoId,
              assistantName,
            }),
          ],
        };
      }
      const existing = existingByKey.get(repeatKey);
      const contradicted =
        existing || acc.disputes.length >= MAX_PICK_QUESTIONS
          ? null
          : findContradicted(
              fact,
              subjectIds,
              fact.kind,
              topic,
              acc.disputes.map((dispute) => dispute.older.id),
            );
      const line = buildFactLine({
        subjects: subjectIds.map((subjectId) =>
          subjectId === selfWhoId ? 'You' : (nameOf.get(subjectId) ?? ''),
        ),
        isSaid,
        assistantName,
        isDisputed: contradicted !== null,
      });
      // Saying outright what was only a guess confirms the guess instead of filing it twice.
      if (existing) {
        if (existing.status !== 'inferred' || !isSaid) return { ...acc, seen };
        record(
          existing.id,
          'update',
          {
            status: 'confirmed',
            confirmedAt: capturedAt,
            'sealed.title': line,
            'sealed.statement': existing.statement,
          },
          {
            status: 'inferred',
            confirmedAt: null,
            'sealed.title': line,
            'sealed.statement': existing.statement,
          },
          'facts',
        );
        return {
          ...acc,
          seen,
          confirms: [
            ...acc.confirms,
            {
              id: existing.id,
              data: {
                status: 'confirmed',
                confirmedAt: capturedAt,
                lastEditedAt: now,
              },
            },
          ],
        };
      }
      const id = input.newId();
      const status = isSaid ? 'confirmed' : 'inferred';
      const stated = isSaid ? 'personSaid' : 'nomosInferred';
      record(
        id,
        'create',
        {
          status,
          stated,
          'sealed.title': line,
          'sealed.statement': fact.statement,
        },
        null,
        'facts',
      );
      if (contradicted) {
        const olderLine = buildFactLine({
          subjects: contradicted.subjectIds.map((subjectId) =>
            subjectId === selfWhoId ? 'You' : (nameOf.get(subjectId) ?? ''),
          ),
          isSaid: contradicted.stated !== 'nomosInferred',
          assistantName,
          isDisputed: true,
        });
        record(
          contradicted.id,
          'update',
          {
            disputedWithId: id,
            'sealed.title': olderLine,
            'sealed.statement': contradicted.statement,
          },
          {
            disputedWithId: null,
            'sealed.title': olderLine,
            'sealed.statement': contradicted.statement,
          },
          'facts',
        );
      }
      return {
        ...acc,
        seen,
        disputes: contradicted
          ? [
              ...acc.disputes,
              {
                older: contradicted,
                newerId: id,
                statement: fact.statement,
                isSaid,
              },
            ]
          : acc.disputes,
        creates: [
          ...acc.creates,
          {
            id,
            data: {
              status,
              stated,
              kind: fact.kind,
              occurredOn: null,
              sourceCaptureId: input.captureId,
              sourceExecutionId: input.executionId,
              sourceConnection: null,
              aboutField: null,
              whoIds,
              placeIds,
              projectIds: [],
              syncedIds: [],
              subjectIds,
              keptOverSource: null,
              supersedesId: null,
              supersededById: null,
              supersededAt: null,
              disputedWithId: contradicted?.id ?? null,
              createdAt: capturedAt,
              confirmedAt: isSaid ? capturedAt : null,
              lastEditedAt: null,
              sealed: seal({
                statement: fact.statement,
                quote,
                topic,
                value: fact.value,
              }),
            },
          },
        ],
      };
    },
    { seen: [], creates: [], confirms: [], disputes: [], notKept: [] },
  );
  const factCreates = factSteps.creates;
  const factConfirms = factSteps.confirms;
  const factDisputes = factSteps.disputes.map(({ older, newerId }) => ({
    id: older.id,
    data: { disputedWithId: newerId },
  }));
  const notKept = [...new Set(factSteps.notKept)];

  const creates = [...drafts.values()].map((draft) => {
    const isDone = draft.status === 'done';
    record(
      draft.id,
      'create',
      {
        'sealed.title': draft.title,
        due: draft.due,
        isUrgent: draft.isUrgent,
        status: draft.status,
        ...(isDone && { completedAt: now }),
      },
      null,
    );
    counts.made += 1;
    return {
      id: draft.id,
      data: {
        status: draft.status,
        importance: null,
        isUrgent: draft.isUrgent,
        due: draft.due,
        durationMinutes: null,
        energy: null,
        context: null,
        projectId: null,
        milestoneId: null,
        whoIds: draft.whoIds,
        placeIds: draft.placeIds,
        notUntil: null,
        waitsOnTaskIds: [],
        waitsOnWhoId: null,
        stepState: {},
        mediaIds: [],
        createdBy: 'nomos',
        sourceCaptureId: input.captureId,
        executionId: input.executionId,
        createdAt: now,
        lastEditedAt: null,
        completedAt: isDone ? now : null,
        sealed: seal({ title: draft.title, notes: null, steps: {} }),
      },
    };
  });

  const isFiling = effects.length > 0;
  const people = input.people;
  const links = (field: 'whoIds' | 'placeIds') =>
    [
      ...creates.map(({ data }) => data[field] as string[]),
      ...[...patches.values()].flatMap((data) => {
        const ids = data[field];
        return Array.isArray(ids) ? [ids as string[]] : [];
      }),
    ].flat();
  const taskLinks = links('whoIds').reduce(
    (counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1),
    new Map<string, number>(),
  );
  const newWhoIds = new Set(entities.newWho.map((entry) => entry.id));
  const whoCreates = !isFiling
    ? []
    : entities.newWho.map(({ id, mention }) => {
        const name = toNameCase(mention.name);
        const tier = readWhoTier({
          tier: 'passing',
          tierSetBy: 'nomos',
          mentionDayKeys: [people?.dayKey ?? ''],
          taskLinkCount: taskLinks.get(id) ?? 0,
          hasRole: false,
        });
        record(
          id,
          'create',
          { 'sealed.name': name, kind: mention.kind, tier },
          null,
          'who',
        );
        return {
          id,
          data: buildWhoDoc({
            mention,
            name,
            tier,
            executionId: input.executionId,
            lastMentionedAt: people?.capturedAt ?? now,
            now,
            seal,
          }),
        };
      });
  const placeCreates = !isFiling
    ? []
    : entities.newPlaces.map(({ id, place }) => {
        const name = toNameCase(place.name);
        record(id, 'create', { 'sealed.name': name }, null, 'places');
        return {
          id,
          data: buildPlaceDoc({
            name,
            executionId: input.executionId,
            now,
            seal,
          }),
        };
      });
  const whoUpdates = !isFiling
    ? []
    : [...entities.whoIdOf.values()]
        .filter((id) => !newWhoIds.has(id))
        .flatMap((id) => {
          const state = people?.known.find((entry) => entry.id === id);
          if (!state || !people) return [];
          const tier = readWhoTier({
            tier: state.tier,
            tierSetBy: state.tierSetBy,
            mentionDayKeys: [...state.mentionDayKeys, people.dayKey],
            taskLinkCount: state.taskLinkCount + (taskLinks.get(id) ?? 0),
            hasRole: state.hasRole,
          });
          return [
            {
              id,
              data: {
                lastMentionedAt: people.capturedAt,
                ...(tier !== state.tier && { tier }),
              },
            },
          ];
        });

  const disputeQuestions = !isFiling
    ? []
    : factSteps.disputes.map(
        ({ older, newerId, statement, isSaid }): PlannedQuestion => {
          const newer = {
            id: newerId,
            statement,
            detail: buildFactSource({
              stated: isSaid ? 'personSaid' : 'nomosInferred',
              isConfirmed: isSaid,
              assistantName,
              at: capturedAt,
              timeZone: zone,
            }),
          };
          const before = {
            id: older.id,
            statement: older.statement,
            detail: buildFactSource({
              stated: older.stated,
              isConfirmed: older.status === 'confirmed',
              assistantName,
              at: older.createdAt,
              timeZone: zone,
            }),
          };
          return {
            id: input.newId(),
            state: {
              kind: 'whichIsTrue',
              shape: 'pickOne',
              askedAt: now,
              answeredAt: null,
              skippedAt: null,
            },
            sealed: buildWhichIsTrueQuestion({ older: before, newer }),
            spoken: buildSpokenWhichIsTrue(before.statement, newer.statement),
          };
        },
      );
  const questions = !isFiling
    ? []
    : [
        ...disputeQuestions,
        ...buildPickQuestions({
          entities,
          unsureTasks,
          people,
          newId: input.newId,
          now,
          room: MAX_PICK_QUESTIONS - disputeQuestions.length,
        }),
      ];

  return {
    creates,
    updates: [...patches.entries()].map(([id, data]) => ({ id, data })),
    whoCreates,
    whoUpdates,
    placeCreates,
    factCreates,
    factConfirms,
    factDisputes,
    notKept,
    linkedWhoIds: isFiling ? union([], [...entities.whoIdOf.values()]) : [],
    linkedPlaceIds: isFiling ? union([], [...entities.placeIdOf.values()]) : [],
    effectRefs,
    effects,
    counts,
    questions,
  };
}

const KIND_WORDS: Record<string, string> = {
  person: 'Person',
  pet: 'Pet',
  organization: 'Organization',
};

/** What tells a candidate apart: its relation, a pet's species, an organization's kind, else its kind word when the candidates differ in kind. */
const detailOfWho = (state: KnownWhoState, isMixed: boolean): string | null => {
  if (state.relation) return toDisplayCase(state.relation);
  if (state.kind === 'pet' && state.species) {
    return toDisplayCase(state.species);
  }
  if (state.kind === 'organization' && state.organizationKind) {
    return toDisplayCase(state.organizationKind);
  }
  return isMixed ? (KIND_WORDS[state.kind] ?? null) : null;
};

function buildPickQuestions(input: {
  entities: ReturnType<typeof settleEntities>;
  unsureTasks: Map<string, string[]>;
  people: PeopleInput | undefined;
  newId: () => string;
  now: number;
  room: number;
}): PlannedQuestion[] {
  const { entities, unsureTasks, people, now } = input;
  if (!people) return [];
  const comparable = (name: string) => name.trim().toLowerCase();
  const distinct = <T extends { name: string }>(
    entries: {
      ref: string;
      item: T;
      kindKey: string;
      candidateIds: string[];
    }[],
  ) =>
    entries.filter(
      (entry, index) =>
        unsureTasks.has(entry.ref) &&
        entries.findIndex(
          (other) =>
            unsureTasks.has(other.ref) &&
            other.kindKey + comparable(other.item.name) ===
              entry.kindKey + comparable(entry.item.name),
        ) === index,
    );
  const taskIdsFor = (
    entries: { ref: string; item: { name: string }; kindKey: string }[],
    entry: { item: { name: string }; kindKey: string },
  ) =>
    union(
      [],
      entries
        .filter(
          (other) =>
            other.kindKey + comparable(other.item.name) ===
            entry.kindKey + comparable(entry.item.name),
        )
        .flatMap((other) => unsureTasks.get(other.ref) ?? []),
    );
  const whoEntries = [...entities.unsureWho.entries()].map(
    ([ref, { mention, candidateIds }]) => ({
      ref,
      item: mention,
      kindKey: mention.kind,
      candidateIds,
    }),
  );
  const placeEntries = [...entities.unsurePlaces.entries()].map(
    ([ref, { place, candidateIds }]) => ({
      ref,
      item: place,
      kindKey: 'place',
      candidateIds,
    }),
  );
  const whoQuestions = distinct(whoEntries).flatMap((entry) => {
    const states = entry.candidateIds.flatMap(
      (id) => people.known.find((who) => who.id === id) ?? [],
    );
    const isMixed = new Set(states.map((who) => who.kind)).size > 1;
    const candidates: PickCandidate[] = states.map((who) => ({
      id: who.id,
      label: who.name,
      detail: detailOfWho(who, isMixed),
    }));
    const { name, kind, relation, species, organizationKind } = entry.item;
    return [
      {
        kind: 'whichPerson' as PickKind,
        name,
        candidates,
        held: {
          kind: 'linkWho',
          taskIds: taskIdsFor(whoEntries, entry),
          mention: { name, kind, relation, species, organizationKind },
        } as HeldLink,
      },
    ];
  });
  const placeQuestions = distinct(placeEntries).flatMap((entry) => {
    const candidates: PickCandidate[] = entry.candidateIds.flatMap((id) => {
      const place = people.knownPlaces.find((known) => known.id === id);
      return place
        ? [{ id, label: place.name, detail: place.address ?? null }]
        : [];
    });
    return [
      {
        kind: 'whichPlace' as PickKind,
        name: entry.item.name,
        candidates,
        held: {
          kind: 'linkPlace',
          taskIds: taskIdsFor(placeEntries, entry),
          place: { name: entry.item.name },
        } as HeldLink,
      },
    ];
  });
  return [...whoQuestions, ...placeQuestions]
    .filter((question) => question.candidates.length > 0)
    .slice(0, input.room)
    .map((question) => ({
      id: input.newId(),
      state: {
        kind: question.kind,
        shape: 'pickOne',
        askedAt: now,
        answeredAt: null,
        skippedAt: null,
      },
      sealed: buildPickQuestion(question),
      spoken: buildSpokenPick(
        question.name,
        question.candidates.map((candidate) => candidate.label),
        question.kind === 'whichPlace' ? 'a new place' : 'someone new',
      ),
    }));
}

/** How many model-written questions the person still has open across their waiting turns, a skipped one included. */
export const countOpenAsked = (
  states: (Record<string, QuestionStateEntry> | undefined)[],
) =>
  states
    .flatMap((state) => Object.values(state ?? {}))
    .filter((entry) => entry.kind === 'asked' && entry.answeredAt === null)
    .length;

/** Files each model-written question as an open one, up to the room left under the person's cap; `isDeferred` says some were left out for the cap. */
export function planAsks(input: {
  asks: AskCommand[];
  openAsked: number;
  now: number;
  newId: () => string;
}): { questions: PlannedQuestion[]; isDeferred: boolean } {
  const room = Math.max(0, MAX_OPEN_ASKED - input.openAsked);
  const kept = input.asks.slice(0, room);
  return {
    isDeferred: kept.length < input.asks.length,
    questions: kept.map((ask) => {
      const sealed = buildAskedQuestion(ask);
      return {
        id: input.newId(),
        state: {
          kind: 'asked',
          shape: ask.shape,
          askedAt: input.now,
          answeredAt: null,
          skippedAt: null,
        },
        sealed,
        spoken: buildSpokenQuestion(sealed),
      };
    }),
  };
}

export function buildExecution(
  plan: WritePlan,
  input: Pick<PlanInput, 'captureId' | 'now' | 'seal'> & {
    /** The line saying the person is home, added to the summary and the spoken reply. */
    homeLine?: string | null;
    questionRef?: { captureId: string; questionId: string } | null;
    commands: NomosCommand[];
    messageCount?: number;
    inputMode?: string;
    timeZone?: string;
  },
): Record<string, unknown> {
  const created = plan.effectRefs.flatMap((ref, index) => {
    const { written } = plan.effects[index];
    return ref.op === 'create' && ref.collection === 'tasks'
      ? [
          {
            title: String(written['sealed.title'] ?? ''),
            due: (written.due ?? null) as TaskDue | null,
          },
        ]
      : [];
  });
  const { homeLine = null } = input;
  const ack = buildSpokenAck({
    inputMode: input.inputMode,
    counts: plan.counts,
    messageCount: input.messageCount ?? 1,
    created,
    timeZone: input.timeZone ?? 'UTC',
    now: input.now,
  });
  const spokenHome =
    homeLine && input.inputMode === 'voice' ? `${homeLine}.` : null;
  return {
    captureId: input.captureId,
    actor: 'nomos',
    category:
      plan.factCreates.length + plan.factConfirms.length > 0 &&
      plan.counts.made + plan.counts.updated + plan.counts.completed === 0
        ? 'remember'
        : 'organize',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: plan.effectRefs,
    linkedWhoIds: plan.linkedWhoIds,
    linkedPlaceIds: plan.linkedPlaceIds,
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: input.questionRef ?? null,
    errorCode: null,
    createdAt: input.now,
    decidedAt: input.now,
    finishedAt: input.now,
    sealed: input.seal({
      summary: [
        summarize(plan.counts, input.messageCount),
        describeFacts(plan.factCreates.length + plan.factConfirms.length),
        ...plan.notKept,
        homeLine,
      ]
        .filter(Boolean)
        .join('. '),
      commands: input.commands,
      effects: plan.effects,
      undoReport: null,
      goneIds: null,
      spoken: withQuestion(
        [ack, spokenHome].filter(Boolean).join(' ') || null,
        plan.questions[0]?.spoken ?? null,
      ),
    }),
  };
}

const withQuestion = (ack: string | null, question: string | null) =>
  ack && question ? `${ack} ${question}` : ack;

/** An answer writes only the capture's sealed answer, so it has no effects and nothing to undo, unless it noted one fact: then that fact is its one effect and Undo deletes it. A refused fact is recorded as not done. */
export function buildAnswerExecution(input: {
  captureId: string;
  answer: CaptureAnswer;
  spoken: string | null;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  fact?: { effectRef: EffectRef; effect: Effect; note: string } | null;
  notDone?: string[];
}): Record<string, unknown> {
  return {
    captureId: input.captureId,
    actor: 'nomos',
    category: 'answer',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: input.fact ? [input.fact.effectRef] : [],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: input.now,
    decidedAt: input.now,
    finishedAt: input.now,
    sealed: input.seal({
      summary: input.fact
        ? `${summarizeAnswer(input.answer)} ${input.fact.note}`
        : summarizeAnswer(input.answer),
      commands: [],
      effects: input.fact ? [input.fact.effect] : [],
      notDone: input.notDone ?? [],
      undoReport: null,
      goneIds: null,
      spoken: input.spoken,
    }),
  };
}

export interface QuestionStateEntry {
  kind: string;
  shape: string;
  askedAt: number;
  answeredAt: number | null;
  skippedAt: number | null;
}

interface SettleInput {
  mode: 'full' | 'rest';
  filed: number;
  hasPlanDay?: boolean;
  /** The turn said the person is home, whether or not a home place exists to file it on. */
  hasHome?: boolean;
  hasFacts?: boolean;
  hasMore: boolean;
  executionId: string | null;
  answer?: {
    executionId: string;
    sealed: CaptureAnswer;
    spoken: { text: string; priority: 'reply'; builtBy: 'code' } | null;
  } | null;
  now: number;
  newId: () => string;
  opened: Record<string, unknown>;
  questionState: Record<string, QuestionStateEntry>;
  executionIds: string[];
  questions?: PlannedQuestion[];
  /** The reply asked questions, even ones the cap left out: not "couldn't read". */
  hadAsks?: boolean;
  /** An answer turn that files nothing is a turn well taken, not an unread one. */
  isAnswerTurn?: boolean;
  /** A line to say back when the turn made no answer of its own: the first open question, or why nothing more was asked. */
  line?: string | null;
}

const isPickKind = (kind: string) =>
  kind === 'whichPerson' ||
  kind === 'whichPlace' ||
  kind === 'whichIsTrue' ||
  kind === 'asked';

const isOpenMore = ([, entry]: [string, QuestionStateEntry]) =>
  entry.kind === 'moreToSort' && entry.answeredAt === null;

/** Whether the capture still waits on a "Sort the rest" answer. */
export const hasOpenMoreToSort = (
  questionState: Record<string, QuestionStateEntry> | undefined,
): boolean => Object.entries(questionState ?? {}).some(isOpenMore);

const asked = (kind: CodeQuestionKind, id: string, now: number) => ({
  state: {
    [id]: {
      kind,
      shape: 'pickOne',
      askedAt: now,
      answeredAt: null,
      skippedAt: null,
    },
  },
  sealed: { [id]: buildCodeQuestion(kind) },
});

/** Where a capture lands once a reading is filed: sorted, still more to sort, or nothing could be made of it. The opened payload is spread so its text and reading are never dropped. */
export function settleCapture(input: SettleInput) {
  const { now, mode, opened } = input;
  const oldQuestions = (opened.questions ?? {}) as Record<string, unknown>;
  const closing = Object.entries(input.questionState).filter(isOpenMore);
  const closedState = Object.fromEntries(
    closing.map(([id, entry]) => [id, { ...entry, answeredAt: now }]),
  );
  const closedQuestions = Object.fromEntries(
    closing.map(([id]) => [
      id,
      {
        ...(oldQuestions[id] as Record<string, unknown>),
        answer: {
          by: 'tap',
          at: now,
          turnCaptureId: null,
          shape: 'pickOne',
          optionId: 'sortRest',
          otherText: null,
        },
      },
    ]),
  );
  const isUnread =
    mode === 'full' &&
    input.filed === 0 &&
    !input.hasMore &&
    !input.answer &&
    !input.hasPlanDay &&
    !input.hasHome &&
    !input.hasFacts &&
    !input.hadAsks &&
    !input.isAnswerTurn;
  const next = isUnread
    ? asked('couldNotRead', input.newId(), now)
    : input.hasMore
      ? asked('moreToSort', input.newId(), now)
      : null;
  const pickState = Object.fromEntries(
    (input.questions ?? []).map((question) => [question.id, question.state]),
  );
  const pickSealed = Object.fromEntries(
    (input.questions ?? []).map((question) => [question.id, question.sealed]),
  );
  const isPickOpen = Object.values({
    ...input.questionState,
    ...pickState,
  }).some((entry) => isPickKind(entry.kind) && entry.answeredAt === null);
  const previous =
    typeof opened.sortedThrough === 'number' ? opened.sortedThrough : 0;
  return {
    status: next || isPickOpen ? ('needsYou' as const) : ('sorted' as const),
    questionState: {
      ...input.questionState,
      ...closedState,
      ...pickState,
      ...next?.state,
    },
    sealed: {
      ...opened,
      questions: {
        ...oldQuestions,
        ...closedQuestions,
        ...pickSealed,
        ...next?.sealed,
      },
      sortedThrough: input.hasMore
        ? previous + input.filed
        : (opened.sortedThrough ?? null),
      ...(input.answer
        ? { answer: input.answer.sealed, spoken: input.answer.spoken }
        : input.line
          ? {
              spoken: {
                text: input.line,
                priority: 'reply',
                builtBy: 'code',
              },
            }
          : {}),
    },
    executionIds: [
      ...input.executionIds,
      ...(input.executionId ? [input.executionId] : []),
      ...(input.answer ? [input.answer.executionId] : []),
    ],
  };
}
