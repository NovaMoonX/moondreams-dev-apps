import type { SealedPayload } from '../../../appKeys/seal.js';
import { isPrivateInEffect, readPrivacyFacts } from '../privacy.js';
import type { ConnectionCommand, SetKeyDateCommand } from './commands.js';
import {
  CONNECTION_KINDS,
  buildConnection,
  genderOf,
  isShownConnection,
  toConnectionId,
  type ConnectionGenders,
  type ConnectionKind,
  type ConnectionRelation,
  type ConnectionSource,
  type ConnectionWords,
  type CoupleStatus,
  type ImpliedLink,
} from './connections.js';
import { toPrivateMark } from './contextPeople.js';
import type { Effect, EffectRef } from './executeCommands.js';
import { normalizeKin } from './kin.js';
import { KIN_KINDS } from './kinKinds.js';
import { AUTOMATIC_LEVEL } from './policy.js';
import type { QuestionStateEntry } from './executeCommands.js';

const PRIVATE_PERSON_LABEL = 'a private person';

export interface PlanWho {
  kind: 'person' | 'pet' | 'organization';
  opened: Record<string, unknown>;
}

/** `words` is null when the sealed words did not open. */
export interface StoredConnection {
  whoIds: [string, string];
  kind: ConnectionKind;
  source: ConnectionSource;
  createdBy: string;
  createdAt: number;
  words: ConnectionWords | null;
}

export interface ConnectionPlan {
  creates: { id: string; data: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  deletes: string[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  linkedWhoIds: string[];
  isPrivate: boolean;
  /** The pairs this turn wrote, in their state after the turn, by connection id. */
  settled: Map<string, StoredConnection | null>;
  /** The moment dates a couple's new engaged or married status also writes: one command per person. */
  keyDates: SetKeyDateCommand[];
  /** The who ids the keyDates commands name by a `$conn:` ref. */
  keyDateRefs: Map<string, string>;
  touchedWhoIds: string[];
}

export const CONNECTION_REF_PREFIX = '$conn:';

const words = (relation: ConnectionRelation | null) =>
  relation === null || relation === 'friend' || relation === 'coworker'
    ? null
    : (KIN_KINDS.find((entry) => entry.kind === relation)?.written ?? null);

/** "Joan is Dana’s mother", "Dana and Sam are married". */
export const buildConnectionLine = (input: {
  first: string;
  second: string;
  kind: ConnectionKind;
  relationOfFirst: ConnectionRelation | null;
  status: CoupleStatus | null;
}) => {
  const { first, second } = input;
  if (input.kind === 'friend') return `${first} and ${second} are friends`;
  if (input.kind === 'work') return `${first} and ${second} work together`;
  if (input.kind === 'couple')
    return input.status === null
      ? `${first} and ${second} are a couple`
      : `${first} and ${second} are ${
          {
            dating: 'dating',
            engaged: 'engaged',
            married: 'married',
            separated: 'separated',
            divorced: 'divorced',
            widowed: 'widowed',
          }[input.status]
        }`;
  const word = words(input.relationOfFirst);
  return word
    ? `${first} is ${second}’s ${word}`
    : `${first} and ${second} are family`;
};

const toWords = (stored: StoredConnection | null): ConnectionWords | null =>
  stored?.words ?? null;

const labelOf = (first: string, second: string) => `${first} and ${second}`;

const toSealed = (value: ConnectionWords) => ({
  fromFirst: value.fromFirst,
  fromSecond: value.fromSecond,
  status: value.status,
  since: value.since,
});

const wordPaths = (value: ConnectionWords) => ({
  'sealed.fromFirst': value.fromFirst,
  'sealed.fromSecond': value.fromSecond,
  'sealed.status': value.status,
  'sealed.since': value.since,
});

const isSame = (a: ConnectionWords, b: ConnectionWords) =>
  a.fromFirst === b.fromFirst &&
  a.fromSecond === b.fromSecond &&
  a.status === b.status &&
  a.since === b.since;

interface Acc extends ConnectionPlan {
  stored: Map<string, StoredConnection | null>;
}

/** Plans each said link as an undoable write of the connection document; a shown pair is updated, never duplicated, and both ends must be people. */
export function planConnections(input: {
  commands: ConnectionCommand[];
  selfWhoId: string | null;
  whos: Map<string, PlanWho | null>;
  existing: Map<string, StoredConnection | null>;
  todayDay: number;
  now: number;
  executionId: string;
  isUnattended: boolean;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  room: number;
}): ConnectionPlan {
  const shownName = (id: string) => {
    const who = input.whos.get(id);
    if (!who || typeof who.opened.name !== 'string') return '';
    const isPrivate = isPrivateInEffect(
      readPrivacyFacts({
        privateMark: toPrivateMark(who.opened.privateMark),
        isPrivacyCleared: who.opened.isPrivacyCleared === true,
      }),
    );
    return input.isUnattended && isPrivate
      ? PRIVATE_PERSON_LABEL
      : who.opened.name;
  };
  const isPrivateWho = (id: string) => {
    const opened = input.whos.get(id)?.opened;
    return opened
      ? isPrivateInEffect(
          readPrivacyFacts({
            privateMark: toPrivateMark(opened.privateMark),
            isPrivacyCleared: opened.isPrivacyCleared === true,
          }),
        )
      : false;
  };
  const gendersOf = (ids: string[]): ConnectionGenders =>
    Object.fromEntries(
      ids.map((id) => [
        id,
        genderOf({ kin: normalizeKin(input.whos.get(id)?.opened.kin) }),
      ]),
    );
  const start: Acc = {
    creates: [],
    updates: [],
    deletes: [],
    effectRefs: [],
    effects: [],
    lines: [],
    notKept: [],
    linkedWhoIds: [],
    isPrivate: false,
    settled: new Map(),
    keyDates: [],
    keyDateRefs: new Map(),
    touchedWhoIds: [],
    stored: new Map(input.existing),
  };
  const skip = (acc: Acc, line: string): Acc => ({
    ...acc,
    notKept: [...acc.notKept, line],
  });
  const shownOf = (acc: Acc, a: string, b: string, kinds: ConnectionKind[]) =>
    kinds.flatMap((kind) => {
      const id = toConnectionId(a, b, kind);
      const stored = acc.stored.get(id) ?? null;
      return stored && isShownConnection({ source: stored.source })
        ? [{ id, kind, stored }]
        : [];
    });
  const withMoment = (
    acc: Acc,
    a: string,
    b: string,
    before: CoupleStatus | null,
    words: ConnectionWords,
  ): Acc => {
    const status = words.status;
    if ((status !== 'engaged' && status !== 'married') || before === status)
      return acc;
    const day = new Date(words.since ?? input.todayDay);
    const keyDates = [a, b].map((id): SetKeyDateCommand => ({
      kind: 'setKeyDate',
      whoRefs: id === input.selfWhoId ? [] : [`${CONNECTION_REF_PREFIX}${id}`],
      isAboutMe: id === input.selfWhoId,
      keyDateId: null,
      keyKind: 'custom',
      label: status === 'engaged' ? 'Got engaged' : 'Got married',
      date: {
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        year: day.getUTCFullYear(),
      },
      precision: 'day',
      comesBack: false,
      quote: null,
    }));
    return {
      ...acc,
      keyDates: [...acc.keyDates, ...keyDates],
      keyDateRefs: new Map([
        ...acc.keyDateRefs,
        ...[a, b].flatMap((id): [string, string][] =>
          id === input.selfWhoId ? [] : [[`${CONNECTION_REF_PREFIX}${id}`, id]],
        ),
      ]),
    };
  };
  const touch = (acc: Acc, a: string, b: string): Acc => ({
    ...acc,
    linkedWhoIds: [...new Set([...acc.linkedWhoIds, a, b])],
    touchedWhoIds: [...new Set([...acc.touchedWhoIds, a, b])],
    isPrivate: acc.isPrivate || isPrivateWho(a) || isPrivateWho(b),
  });
  const planOne = (acc: Acc, command: ConnectionCommand): Acc => {
    const a = command.firstWhoId ?? input.selfWhoId;
    const b = command.secondWhoId ?? input.selfWhoId;
    if (!a || !b || a === b) return skip(acc, 'Couldn’t tell who to link');
    const whoA = input.whos.get(a);
    const whoB = input.whos.get(b);
    if (!whoA || !whoB || shownName(a) === '' || shownName(b) === '')
      return skip(acc, 'Couldn’t find one of those people');
    const first = a === input.selfWhoId ? 'You' : shownName(a);
    const second = b === input.selfWhoId ? 'you' : shownName(b);
    const pairLabel = labelOf(first, second);
    if (whoA.kind !== 'person' || whoB.kind !== 'person')
      return skip(
        acc,
        'Connections are for people, so a pet or an organization can’t be linked',
      );
    if (input.room - acc.effects.length < 1)
      return skip(acc, 'Not kept · too much to save in one go');
    const genders = gendersOf([a, b]);
    if (command.kind === 'connect') {
      const record = buildConnection(
        a,
        b,
        command.connectionKind,
        command.relation,
        command.status,
        command.since,
        genders,
      );
      const id = toConnectionId(a, b, command.connectionKind);
      const stored = acc.stored.get(id) ?? null;
      const isShown =
        stored !== null && isShownConnection({ source: stored.source });
      const current = isShown ? toWords(stored) : null;
      const next: ConnectionWords = {
        fromFirst: record.fromFirst,
        fromSecond: record.fromSecond,
        status: record.status ?? current?.status ?? null,
        since: record.since ?? current?.since ?? null,
      };
      if (isShown && !current) return skip(acc, `Couldn’t change ${pairLabel}`);
      if (current && isSame(current, next))
        return skip(acc, `${pairLabel} are already linked that way`);
      const relationOfFirst =
        record.whoIds[0] === a ? record.fromFirst : record.fromSecond;
      const line = buildConnectionLine({
        first,
        second,
        kind: command.connectionKind,
        relationOfFirst,
        status: next.status,
      });
      const after: StoredConnection = {
        whoIds: record.whoIds,
        kind: command.connectionKind,
        source: 'said',
        createdBy: stored?.createdBy ?? 'nomos',
        createdAt: stored?.createdAt ?? input.now,
        words: next,
      };
      const base = {
        ...acc,
        lines: [...acc.lines, line],
        settled: new Map(acc.settled).set(id, after),
        stored: new Map(acc.stored).set(id, after),
      };
      const written = stored
        ? {
            ...base,
            updates: [
              ...base.updates,
              {
                id,
                data: {
                  source: 'said',
                  sealed: input.seal(toSealed(next)),
                  lastEditedAt: input.now,
                },
              },
            ],
            effectRefs: [
              ...base.effectRefs,
              {
                op: 'update' as const,
                collection: 'connections' as const,
                docId: id,
              },
            ],
            effects: [
              ...base.effects,
              {
                written: {
                  'sealed.title': pairLabel,
                  source: 'said',
                  ...wordPaths(next),
                },
                previous: {
                  'sealed.title': pairLabel,
                  source: stored.source,
                  ...wordPaths(
                    stored.words ?? {
                      fromFirst: null,
                      fromSecond: null,
                      status: null,
                      since: null,
                    },
                  ),
                },
              },
            ],
          }
        : {
            ...base,
            creates: [
              ...base.creates,
              {
                id,
                data: {
                  whoIds: record.whoIds,
                  kind: command.connectionKind,
                  source: 'said',
                  createdBy: 'nomos',
                  executionId: input.executionId,
                  createdAt: input.now,
                  lastEditedAt: null,
                  sealed: input.seal(toSealed(next)),
                },
              },
            ],
            effectRefs: [
              ...base.effectRefs,
              {
                op: 'create' as const,
                collection: 'connections' as const,
                docId: id,
              },
            ],
            effects: [
              ...base.effects,
              {
                written: {
                  'sealed.title': pairLabel,
                  whoIds: record.whoIds,
                  kind: command.connectionKind,
                  source: 'said',
                },
                previous: null,
              },
            ],
          };
      return withMoment(
        touch(written, a, b),
        a,
        b,
        current?.status ?? null,
        next,
      );
    }
    const wanted =
      command.connectionKind !== null
        ? [command.connectionKind]
        : command.kind === 'updateConnection'
          ? CONNECTION_KINDS.filter((kind) =>
              command.relation !== null ? kind === 'family' : kind === 'couple',
            )
          : CONNECTION_KINDS;
    const found = shownOf(acc, a, b, wanted);
    if (found.length !== 1)
      return skip(
        acc,
        found.length === 0
          ? `${pairLabel} aren’t linked`
          : `${pairLabel} are linked more than one way, so say which`,
      );
    const [{ id, kind, stored }] = found;
    const current = toWords(stored);
    if (!current) return skip(acc, `Couldn’t change ${pairLabel}`);
    if (command.kind === 'disconnect') {
      const after = new Map(acc.settled).set(id, null);
      return touch(
        {
          ...acc,
          deletes: [...acc.deletes, id],
          effectRefs: [
            ...acc.effectRefs,
            { op: 'delete', collection: 'connections', docId: id },
          ],
          effects: [
            ...acc.effects,
            {
              written: { 'sealed.title': pairLabel },
              previous: {
                whoIds: stored.whoIds,
                kind: stored.kind,
                source: stored.source,
                createdBy: stored.createdBy,
                createdAt: stored.createdAt,
                ...wordPaths(current),
              },
            },
          ],
          lines: [...acc.lines, `Removed the link between ${pairLabel}`],
          settled: after,
          stored: new Map(acc.stored).set(id, null),
        },
        a,
        b,
      );
    }
    const rebuilt = buildConnection(
      a,
      b,
      kind,
      command.relation,
      command.status ?? current.status,
      command.since ?? current.since,
      genders,
    );
    const next: ConnectionWords = {
      fromFirst: command.relation ? rebuilt.fromFirst : current.fromFirst,
      fromSecond: command.relation ? rebuilt.fromSecond : current.fromSecond,
      status: kind === 'couple' ? rebuilt.status : null,
      since: kind === 'couple' ? rebuilt.since : null,
    };
    if (isSame(current, next))
      return skip(acc, `${pairLabel} are already like that`);
    const relationOfFirst =
      stored.whoIds[0] === a ? next.fromFirst : next.fromSecond;
    const after: StoredConnection = { ...stored, source: 'said', words: next };
    return withMoment(
      touch(
        {
          ...acc,
          updates: [
            ...acc.updates,
            {
              id,
              data: {
                sealed: input.seal(toSealed(next)),
                lastEditedAt: input.now,
              },
            },
          ],
          effectRefs: [
            ...acc.effectRefs,
            { op: 'update', collection: 'connections', docId: id },
          ],
          effects: [
            ...acc.effects,
            {
              written: { 'sealed.title': pairLabel, ...wordPaths(next) },
              previous: { 'sealed.title': pairLabel, ...wordPaths(current) },
            },
          ],
          lines: [
            ...acc.lines,
            buildConnectionLine({
              first,
              second,
              kind,
              relationOfFirst,
              status: next.status,
            }),
          ],
          settled: new Map(acc.settled).set(id, after),
          stored: new Map(acc.stored).set(id, after),
        },
        a,
        b,
      ),
      a,
      b,
      current.status,
      next,
    );
  };
  const done = input.commands.reduce(planOne, start);
  return {
    creates: done.creates,
    updates: done.updates,
    deletes: done.deletes,
    effectRefs: done.effectRefs,
    effects: done.effects,
    lines: done.lines,
    notKept: done.notKept,
    linkedWhoIds: done.linkedWhoIds,
    isPrivate: done.isPrivate,
    settled: done.settled,
    keyDates: done.keyDates,
    keyDateRefs: done.keyDateRefs,
    touchedWhoIds: done.touchedWhoIds,
  };
}

const toImpliedPrompt = (
  link: ImpliedLink,
  names: { first: string; second: string; isSecondSelf: boolean },
  word: string,
) => {
  if (names.isSecondSelf) return `Is ${names.first} your ${word}?`;
  if (link.because === 'siblings')
    return `Are ${names.first} and ${names.second} siblings?`;
  return `Is ${names.first} ${names.second}'s ${word}?`;
};

/** Held with the pair it would write. */
export const buildImpliedQuestion = (
  link: ImpliedLink,
  names: { first: string; second: string; isSecondSelf: boolean },
) => {
  const word = words(link.relationOfFirstToSecond) ?? 'family';
  return {
    builtBy: 'code' as const,
    allowsSomethingElse: false,
    noneOption: false,
    recordKinds: [],
    dateMode: null,
    number: null,
    aboutRef: null,
    answer: null,
    kind: 'isConnection' as const,
    shape: 'yesNo' as const,
    prompt: toImpliedPrompt(link, names, word),
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    heldCommands: [
      {
        kind: 'askConnection',
        firstId: link.firstId,
        secondId: link.secondId,
        connectionKind: link.kind,
        relation: link.relationOfFirstToSecond,
      },
    ],
  };
};

/** Yes confirms the link; No writes a refusal that keeps the pair and relation so it is never asked again. */
export const planConnectionAnswer = (input: {
  held: Record<string, unknown>;
  optionId: string;
  whos: Map<string, PlanWho | null>;
  existing: StoredConnection | null;
  executionId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): {
  id: string;
  doc: { op: 'create' | 'update'; data: Record<string, unknown> };
  effectRef: EffectRef;
  effect: Effect;
  line: string;
  whoIds: [string, string];
  isPrivate: boolean;
} | null => {
  const { held } = input;
  const firstId = typeof held.firstId === 'string' ? held.firstId : null;
  const secondId = typeof held.secondId === 'string' ? held.secondId : null;
  const kind = CONNECTION_KINDS.find((entry) => entry === held.connectionKind);
  const relation =
    typeof held.relation === 'string'
      ? (held.relation as ConnectionRelation)
      : null;
  if (!firstId || !secondId || !kind || !relation) return null;
  if (input.optionId !== 'yes' && input.optionId !== 'no') return null;
  const whoA = input.whos.get(firstId);
  const whoB = input.whos.get(secondId);
  if (!whoA || !whoB || whoA.kind !== 'person' || whoB.kind !== 'person')
    return null;
  if (input.existing && isShownConnection({ source: input.existing.source }))
    return null;
  const isYes = input.optionId === 'yes';
  const isPrivate = [whoA, whoB].some((who) =>
    isPrivateInEffect(
      readPrivacyFacts({
        privateMark: toPrivateMark(who.opened.privateMark),
        isPrivacyCleared: who.opened.isPrivacyCleared === true,
      }),
    ),
  );
  const genders: ConnectionGenders = Object.fromEntries(
    [firstId, secondId].map((id) => [
      id,
      genderOf({ kin: normalizeKin(input.whos.get(id)?.opened.kin) }),
    ]),
  );
  const record = buildConnection(
    firstId,
    secondId,
    kind,
    relation,
    null,
    null,
    genders,
  );
  const sealedWords: ConnectionWords = {
    fromFirst: record.fromFirst,
    fromSecond: record.fromSecond,
    status: null,
    since: null,
  };
  const id = toConnectionId(firstId, secondId, kind);
  const source = isYes ? 'confirmed' : 'refused';
  const title = labelOf(
    String(whoA.opened.name ?? ''),
    String(whoB.opened.name ?? ''),
  );
  const line = isYes
    ? buildConnectionLine({
        first: String(whoA.opened.name ?? ''),
        second: String(whoB.opened.name ?? ''),
        kind,
        relationOfFirst: relation,
        status: null,
      })
    : '';
  if (input.existing) {
    return {
      id,
      doc: {
        op: 'update',
        data: {
          source,
          sealed: input.seal(toSealed(sealedWords)),
          lastEditedAt: input.now,
        },
      },
      effectRef: { op: 'update', collection: 'connections', docId: id },
      effect: {
        written: { 'sealed.title': title, source, ...wordPaths(sealedWords) },
        previous: {
          'sealed.title': title,
          source: input.existing.source,
          ...wordPaths(
            input.existing.words ?? {
              fromFirst: null,
              fromSecond: null,
              status: null,
              since: null,
            },
          ),
        },
      },
      line,
      whoIds: record.whoIds,
      isPrivate,
    };
  }
  return {
    id,
    doc: {
      op: 'create',
      data: {
        whoIds: record.whoIds,
        kind,
        source,
        createdBy: 'nomos',
        executionId: input.executionId,
        createdAt: input.now,
        lastEditedAt: null,
        sealed: input.seal(toSealed(sealedWords)),
      },
    },
    effectRef: { op: 'create', collection: 'connections', docId: id },
    effect: {
      written: { 'sealed.title': title, whoIds: record.whoIds, kind, source },
      previous: null,
    },
    line,
    whoIds: record.whoIds,
    isPrivate,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const YES_WORDS = /^(?:yes|yeah|yep|yup|sure|ok|okay|correct|right)\W*$/i;
const NO_WORDS = /^(?:no|nope|nah)\W*$/i;

export const isConnectionQuestion = (
  asked: { opened: Record<string, unknown> } | null,
  questionId: string,
) => {
  const questions = asked?.opened.questions;
  return (
    isRecord(questions) &&
    isRecord(questions[questionId]) &&
    questions[questionId].kind === 'isConnection'
  );
};

/** The held link and Yes or No from a tapped option or a plain yes or no in words; null for anything else, so the question stays open. */
export const readConnectionAnswer = (
  asked: { opened: Record<string, unknown> } | null,
  questionId: string,
  value: unknown,
  words: string,
): { held: Record<string, unknown>; optionId: 'yes' | 'no' } | null => {
  const questions = asked?.opened.questions;
  const question =
    isRecord(questions) && isRecord(questions[questionId])
      ? questions[questionId]
      : null;
  const held =
    question?.kind === 'isConnection' && Array.isArray(question.heldCommands)
      ? question.heldCommands.find(isRecord)
      : null;
  if (!held) return null;
  const picked = isRecord(value) ? value.optionId : null;
  const text = words.trim();
  const optionId =
    picked === 'yes' || picked === 'no'
      ? picked
      : YES_WORDS.test(text)
        ? 'yes'
        : NO_WORDS.test(text)
          ? 'no'
          : null;
  return optionId ? { held, optionId } : null;
};

export const withConnectionAnswer = (
  plan: ConnectionPlan,
  write: NonNullable<ReturnType<typeof planConnectionAnswer>>,
): ConnectionPlan => ({
  ...plan,
  creates:
    write.doc.op === 'create'
      ? [...plan.creates, { id: write.id, data: write.doc.data }]
      : plan.creates,
  updates:
    write.doc.op === 'update'
      ? [...plan.updates, { id: write.id, data: write.doc.data }]
      : plan.updates,
  effectRefs: [...plan.effectRefs, write.effectRef],
  effects: [...plan.effects, write.effect],
  lines: [...plan.lines, write.line || 'Noted'],
  linkedWhoIds: [...new Set([...plan.linkedWhoIds, ...write.whoIds])],
  isPrivate: plan.isPrivate || write.isPrivate,
});

export type ConnectionResolveRefusal = 'answered' | 'unknown' | 'gone';

/** Yes writes the link as confirmed, No a refusal, and the question closes either way; a pair that already has a shown link writes nothing. */
export function planResolveConnection(input: {
  captureId: string;
  questionId: string;
  optionId: string;
  by: 'tap' | 'voice';
  now: number;
  executionId: string;
  capture: {
    status: string;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
  whos: Map<string, PlanWho | null>;
  existing: StoredConnection | null;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}):
  | { refused: ConnectionResolveRefusal }
  | {
      refused: null;
      write: ReturnType<typeof planConnectionAnswer>;
      execution: Record<string, unknown> | null;
      capture: Record<string, unknown>;
    } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const oldQuestions = isRecord(input.opened.questions)
    ? input.opened.questions
    : {};
  const question = oldQuestions[questionId];
  if (!state || !isRecord(question)) return { refused: 'unknown' };
  if (state.answeredAt !== null) return { refused: 'answered' };
  if ((state.leftAt ?? null) !== null) return { refused: 'gone' };
  const held = Array.isArray(question.heldCommands)
    ? question.heldCommands.find(isRecord)
    : null;
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord).map((option) => option.id)
    : [];
  if (!held || !options.includes(optionId)) return { refused: 'unknown' };
  const write = planConnectionAnswer({
    held,
    optionId,
    whos: input.whos,
    existing: input.existing,
    executionId: input.executionId,
    now,
    seal: input.seal,
  });
  const execution = write
    ? {
        captureId: input.captureId,
        actor: 'nomos',
        privacy: write.isPrivate ? 'private' : 'ordinary',
        category: 'organize',
        autonomyLevel: AUTOMATIC_LEVEL,
        state: 'succeeded',
        effectRefs: [write.effectRef],
        linkedWhoIds: write.whoIds,
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        questionRef: { captureId: input.captureId, questionId },
        errorCode: null,
        createdAt: now,
        decidedAt: now,
        finishedAt: now,
        sealed: input.seal({
          summary: write.line || 'Noted',
          commands: [],
          effects: [write.effect],
          notDone: [],
          abilityOffer: null,
          awayZoneOffer: null,
          undoReport: null,
          goneIds: null,
          said: null,
          lines: null,
          spoken: null,
        }),
      }
    : null;
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    refused: null,
    write,
    execution,
    capture: {
      questionState,
      sealed: {
        ...input.opened,
        questions: {
          ...oldQuestions,
          [questionId]: {
            ...question,
            answer: {
              by: input.by,
              at: now,
              turnCaptureId: null,
              shape: 'yesNo',
              optionId,
              otherText: null,
            },
          },
        },
      },
      status:
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
      executionIds: execution
        ? [...capture.executionIds, input.executionId]
        : capture.executionIds,
    },
  };
}
