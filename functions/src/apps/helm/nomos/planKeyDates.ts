import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  formatMoment,
  formatYearlyDate,
  type MomentPrecision,
} from '../../../vendor/yearlyDateUtils.js';
import {
  applyChanges,
  type ByWho,
  type IndexChange,
  type IndexEntry,
} from '../keyDateIndex.js';
import {
  isMomentKind,
  KEY_DATE_LABEL_CAP,
  MAX_MOMENTS_PER_WHO,
  type KeyDateCommand,
  type SetKeyDateCommand,
  type KeyDateKind,
} from './commands.js';
import {
  buildKeyDateClashQuestion,
  buildKeyDateLine,
  buildKeyDateSkipLine,
  buildMomentLine,
  buildSpokenWhichIsTrue,
  toKeyDateName,
} from './summaries.js';

/** Dates that come back, per who. */
export const MAX_YEARLY_PER_WHO = 20;
/** The person's key dates in all; the index's count stands for the yearly ones, so a margin is kept for moments. */
export const MAX_KEY_DATES_TOTAL = 20_000;
export const KEY_DATES_MARGIN = 100;

/** A date that comes back, as the index and the contact import hold it. */
export interface KeyDateParts {
  kind: 'birthday' | 'anniversary' | 'custom';
  label: string | null;
  month: number;
  day: number | null;
  year: number | null;
  captureId: string | null;
}

/** A one-time event: its year is always set, its month only when the precision reaches one, its day only when it reaches one. */
export interface MomentParts {
  kind: KeyDateKind;
  label: string | null;
  month: number | null;
  day: number | null;
  year: number;
  precision: MomentPrecision;
  captureId: string | null;
}

/** The sealed words of a key date document, whichever shape. */
export interface StoredParts {
  kind: KeyDateKind;
  label: string | null;
  month: number | null;
  day: number | null;
  year: number | null;
  precision: MomentPrecision | null;
  captureId: string | null;
}

/** A key date document as stored, its sealed words opened. */
export interface KeyDateRecord {
  whoId: string;
  shape: 'yearly' | 'moment';
  source: 'person' | 'nomos' | 'google:contacts';
  createdAt: number;
  sealed: StoredParts;
}

export type KeyDateRefusal = 'monthAlone' | 'badDay' | 'badYear' | 'needsLabel';

/** The people the turn's moment commands name: the only ones whose stored moments the turn reads. */
export function namedMomentWhoIds(input: {
  commands: KeyDateCommand[];
  whoIdOf: Map<string, string>;
  selfWhoId: string | null;
}): string[] {
  return [
    ...new Set(
      input.commands.flatMap((command) => {
        if (command.kind !== 'setKeyDate' || command.keyDateId) return [];
        const isMoment =
          isMomentKind(command.keyKind) ||
          (command.keyKind === 'custom' && command.comesBack === false);
        const whoId =
          input.whoIdOf.get(command.whoRefs[0] ?? '') ??
          (command.isAboutMe ? input.selfWhoId : null);
        return isMoment && whoId ? [whoId] : [];
      }),
    ),
  ];
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Checks a date by code: a day or a year (never a month alone), a day that exists, a year in range for the kind, a label for a custom one. */
export function checkKeyDateParts(
  parts: Omit<KeyDateParts, 'captureId'>,
  thisYear: number,
): KeyDateRefusal | null {
  const { kind, month, day, year } = parts;
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'badDay';
  if (day === null && year === null) return 'monthAlone';
  if (day !== null) {
    if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
      return 'badDay';
    }
    if (month === 2 && day === 29 && year !== null && !isLeapYear(year)) {
      return 'badDay';
    }
  }
  if (year !== null) {
    const last = kind === 'birthday' ? thisYear : thisYear + 1;
    if (!Number.isInteger(year) || year < 1900 || year > last) return 'badYear';
  }
  const label = parts.label?.trim() ?? '';
  if (
    kind === 'custom' &&
    (label === '' || label.length > KEY_DATE_LABEL_CAP)
  ) {
    return 'needsLabel';
  }
  return null;
}

/** Checks a moment by code: a year in range, the parts its precision needs and no others, a day that exists, a label for a custom one. */
export function checkMomentParts(
  parts: Omit<MomentParts, 'captureId'>,
  thisYear: number,
): KeyDateRefusal | null {
  const { precision, month, day, year } = parts;
  if (!Number.isInteger(year) || year < 1900 || year > thisYear) {
    return 'badYear';
  }
  if (precision === 'decade' && year % 10 !== 0) return 'badYear';
  const hasMonth = precision === 'month' || precision === 'day';
  if (hasMonth !== (month !== null)) return 'badDay';
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return 'badDay';
  }
  if ((precision === 'day') !== (day !== null)) return 'badDay';
  if (day !== null && month !== null) {
    if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
      return 'badDay';
    }
    if (month === 2 && day === 29 && !isLeapYear(year)) return 'badDay';
  }
  const label = parts.label?.trim() ?? '';
  if (
    parts.kind === 'custom' &&
    (label === '' || label.length > KEY_DATE_LABEL_CAP)
  ) {
    return 'needsLabel';
  }
  return null;
}

export const toIndexEntry = (id: string, parts: KeyDateParts): IndexEntry => [
  id,
  parts.kind,
  parts.month,
  parts.day,
  parts.year,
  parts.kind === 'custom' ? parts.label : null,
];

export const toPartsOfEntry = (
  entry: IndexEntry,
): Omit<KeyDateParts, 'captureId'> => ({
  kind: entry[1],
  month: entry[2],
  day: entry[3],
  year: entry[4],
  label: entry[5],
});

const whenOf = (parts: Pick<KeyDateParts, 'month' | 'day' | 'year'>) =>
  formatYearlyDate(parts);

const momentWhenOf = (
  parts: Pick<MomentParts, 'precision' | 'month' | 'day' | 'year'>,
) => formatMoment(parts);

const RANK: Record<MomentPrecision, number> = {
  decade: 0,
  year: 1,
  month: 2,
  day: 3,
};

/** How a new moment relates to a kept one: the same date (or less detail), the same date with more, or a different date. A decade agrees with any year in it. */
export function compareMoments(
  kept: Pick<MomentParts, 'precision' | 'month' | 'day' | 'year'>,
  next: Pick<MomentParts, 'precision' | 'month' | 'day' | 'year'>,
): 'same' | 'fillsIn' | 'differs' {
  const shared = Math.min(RANK[kept.precision], RANK[next.precision]);
  const isAgreeing =
    shared === 0
      ? Math.floor(kept.year / 10) === Math.floor(next.year / 10)
      : kept.year === next.year &&
        (shared < 2 || kept.month === next.month) &&
        (shared < 3 || kept.day === next.day);
  if (!isAgreeing) return 'differs';
  return RANK[next.precision] > RANK[kept.precision] ? 'fillsIn' : 'same';
}

export interface KeyDatePlan {
  creates: { id: string; data: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  deletes: string[];
  effects: {
    ref: {
      op: 'create' | 'update' | 'delete';
      collection: 'keyDates';
      docId: string;
    };
    effect: {
      written: Record<string, unknown>;
      previous: Record<string, unknown> | null;
    };
  }[];
  changes: IndexChange[];
  /** Per who: how many dates that come back it gained (negative: lost). */
  deltas: Map<string, number>;
  /** Per who: how many moments it gained. */
  momentDeltas: Map<string, number>;
  /** A "which is true now?" question for each date the turn did not write because it clashes with one kept. */
  questions: { id: string; sealed: Record<string, unknown>; spoken: string }[];
  /** The key dates a question of this turn asks about, so the same clash is asked once. */
  askedKeyDateIds: string[];
  /** The moments this turn made, by who and kind (and what it was), so one said twice is made once. */
  made: Map<string, { id: string; parts: MomentParts }>;
  /** One line for each date the turn did not write. */
  notKept: string[];
  linkedWhoIds: string[];
  byWho: ByWho;
  entryCount: number;
}

interface PlanInput {
  commands: KeyDateCommand[];
  whoIdOf: Map<string, string>;
  selfWhoId: string | null;
  nameOf: Map<string, string>;
  /** Each who's `yearlyDateCount` now; a who made in this turn is 0. */
  whoCounts: Map<string, number>;
  /** Each who's `momentCount` now; a who made in this turn is 0. */
  momentCounts: Map<string, number>;
  existing: Map<string, KeyDateRecord>;
  /** The birthday or passed-away date a who keeps now, by `whoId:kind`. */
  kept: Map<string, { id: string; record: KeyDateRecord }>;
  /** The moments each named who keeps. */
  moments?: Map<string, { id: string; record: KeyDateRecord }[]>;
  /** The key dates an open "which is true now?" question already asks about. */
  openClashIds?: Set<string>;
  timeZone: string;
  /** How many more questions the turn can ask. */
  questionRoom: number;
  index: ByWho;
  entryCount: number;
  isIndexUnreadable?: boolean;
  captureId: string;
  executionId: string;
  now: number;
  thisYear: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  newId: () => string;
  /** How many more effects the turn can hold. */
  room: number;
}

const empty = (input: PlanInput): KeyDatePlan => ({
  creates: [],
  updates: [],
  deletes: [],
  effects: [],
  changes: [],
  deltas: new Map(),
  momentDeltas: new Map(),
  questions: [],
  askedKeyDateIds: [],
  made: new Map(),
  notKept: [],
  linkedWhoIds: [],
  byWho: input.index,
  entryCount: input.entryCount,
});

export const partsPaths = (
  parts: Omit<StoredParts, 'precision'> & {
    precision?: MomentPrecision | null;
  },
) => ({
  'sealed.kind': parts.kind,
  'sealed.label': parts.label,
  'sealed.month': parts.month,
  'sealed.day': parts.day,
  'sealed.year': parts.year,
  'sealed.precision': parts.precision ?? null,
  'sealed.captureId': parts.captureId,
});

/** Turns settled key date commands into documents, index changes and effects; a command the code refuses is a skipped line, never a guess. */
export function planKeyDates(input: PlanInput): KeyDatePlan {
  const ownerOf = (whoId: string) =>
    whoId === input.selfWhoId ? null : (input.nameOf.get(whoId) ?? null);
  const sealParts = (parts: KeyDateParts) =>
    input.seal({ ...parts, precision: null });
  const toYearly = (parts: StoredParts): KeyDateParts => ({
    ...parts,
    kind:
      parts.kind === 'anniversary' || parts.kind === 'custom'
        ? parts.kind
        : 'birthday',
    month: parts.month ?? 1,
  });
  const skipWith = (plan: KeyDatePlan, reason: string): KeyDatePlan => ({
    ...plan,
    notKept: [...plan.notKept, buildKeyDateSkipLine(reason)],
  });
  const dayOf = (at: number) =>
    new Date(at).toLocaleDateString('en-US', {
      timeZone: input.timeZone,
      month: 'short',
      day: 'numeric',
    });
  const sourceOf = (record: KeyDateRecord | undefined) =>
    !record
      ? ''
      : record.source === 'nomos'
        ? `You said · ${dayOf(record.createdAt)}`
        : record.source === 'google:contacts'
          ? `From Google Contacts, ${dayOf(record.createdAt)}`
          : 'You added this';
  const nounOf = (
    owner: string | null,
    kind: KeyDateKind,
    label: string | null,
  ) => `${owner ? `${owner}'s` : 'your'} ${toKeyDateName(kind, label)}`;
  /** A different date for one kept writes nothing and asks which is true; past the turn's question room it is reported as skipped. */
  const askWhich = (
    plan: KeyDatePlan,
    clash: {
      whoId: string;
      owner: string | null;
      kind: KeyDateKind;
      label: string | null;
      keyDateId: string;
      kept: { when: string; record: KeyDateRecord | undefined };
      next: { when: string };
      parts: {
        month: number | null;
        day: number | null;
        year: number | null;
        precision: MomentPrecision | null;
      };
      keptParts: {
        month: number | null;
        day: number | null;
        year: number | null;
        precision: MomentPrecision | null;
      };
    },
  ): KeyDatePlan => {
    const noun = nounOf(clash.owner, clash.kind, clash.label);
    if (
      plan.askedKeyDateIds.includes(clash.keyDateId) ||
      input.openClashIds?.has(clash.keyDateId)
    ) {
      return plan;
    }
    if (plan.questions.length >= input.questionRoom) {
      return skipWith(plan, `${noun} is already ${clash.kept.when}`);
    }
    const heading = `${clash.owner ? `${clash.owner}'s` : 'Your'} ${toKeyDateName(clash.kind, clash.label)}`;
    const sealed = buildKeyDateClashQuestion({
      whoId: clash.whoId,
      keyDateId: clash.keyDateId,
      kept: {
        label: `${heading} · ${clash.kept.when}`,
        detail: sourceOf(clash.kept.record),
      },
      next: {
        label: `${heading} · ${clash.next.when}`,
        detail: `You said · ${dayOf(input.now)}`,
      },
      parts: clash.parts,
      keptParts: clash.keptParts,
    });
    return {
      ...plan,
      askedKeyDateIds: [...plan.askedKeyDateIds, clash.keyDateId],
      questions: [
        ...plan.questions,
        {
          id: input.newId(),
          sealed,
          spoken: buildSpokenWhichIsTrue(
            `${heading} ${clash.kept.when}`,
            clash.next.when,
          ),
        },
      ],
      linkedWhoIds: [...new Set([...plan.linkedWhoIds, clash.whoId])],
    };
  };
  const stepMoment = (
    plan: KeyDatePlan,
    command: SetKeyDateCommand,
    whoId: string,
    owner: string | null,
    date: NonNullable<SetKeyDateCommand['date']>,
  ): KeyDatePlan => {
    const skip = (reason: string) => skipWith(plan, reason);
    const label =
      command.keyKind === 'custom' ? (command.label?.trim() ?? null) : null;
    const noun = nounOf(owner, command.keyKind, label);
    if (command.keyDateId) return skip("that date wasn't there");
    if (command.precision === null || date.year === null) {
      return skip(`${noun} needs a year`);
    }
    const parts: MomentParts = {
      kind: command.keyKind,
      label,
      month:
        command.precision === 'year' || command.precision === 'decade'
          ? null
          : date.month,
      day: command.precision === 'day' ? date.day : null,
      year: date.year,
      precision: command.precision,
      captureId: input.captureId,
    };
    const refusal = checkMomentParts(parts, input.thisYear);
    if (refusal === 'needsLabel') return skip(`${noun} needs a name`);
    if (refusal) return skip(`${noun} isn't a date I can keep`);
    const when = momentWhenOf(parts);
    const title = () =>
      buildMomentLine({ owner, kind: parts.kind, label, when });
    const key =
      parts.kind === 'passedAway'
        ? `${whoId}:passedAway`
        : `${whoId}:${parts.kind}:${(label ?? '').toLowerCase()}:${when}`;
    const madeBefore = plan.made.get(key);
    if (madeBefore) {
      return parts.kind === 'passedAway' &&
        compareMoments(madeBefore.parts, parts) === 'differs'
        ? skip(`${noun} is already ${momentWhenOf(madeBefore.parts)}`)
        : plan;
    }
    const isStored = (input.moments?.get(whoId) ?? []).some(
      ({ record }) =>
        record.sealed.kind === parts.kind &&
        (record.sealed.label ?? '').toLowerCase() ===
          (label ?? '').toLowerCase() &&
        record.sealed.precision === parts.precision &&
        record.sealed.year === parts.year &&
        record.sealed.month === parts.month &&
        record.sealed.day === parts.day,
    );
    if (isStored) return plan;
    const keptRecord =
      parts.kind === 'passedAway'
        ? input.kept.get(`${whoId}:passedAway`)
        : undefined;
    if (keptRecord && keptRecord.record.sealed.year !== null) {
      const before: MomentParts = {
        ...keptRecord.record.sealed,
        year: keptRecord.record.sealed.year,
        precision: keptRecord.record.sealed.precision ?? 'year',
      };
      const relation = compareMoments(before, parts);
      if (relation === 'same') return plan;
      if (relation === 'differs') {
        return askWhich(plan, {
          whoId,
          owner,
          kind: parts.kind,
          label,
          keyDateId: keptRecord.id,
          kept: { when: momentWhenOf(before), record: keptRecord.record },
          next: { when },
          parts,
          keptParts: before,
        });
      }
      const next = { ...parts, captureId: before.captureId };
      return {
        ...plan,
        linkedWhoIds: [...new Set([...plan.linkedWhoIds, whoId])],
        updates: [
          ...plan.updates,
          {
            id: keptRecord.id,
            data: { sealed: input.seal({ ...next }), lastEditedAt: input.now },
          },
        ],
        effects: [
          ...plan.effects,
          {
            ref: { op: 'update', collection: 'keyDates', docId: keptRecord.id },
            effect: {
              written: { 'sealed.title': title(), ...partsPaths(next) },
              previous: {
                'sealed.title': title(),
                ...partsPaths(before),
              },
            },
          },
        ],
        made: new Map(plan.made).set(key, { id: keptRecord.id, parts: next }),
      };
    }
    const base = input.momentCounts.get(whoId) ?? 0;
    if (base + (plan.momentDeltas.get(whoId) ?? 0) >= MAX_MOMENTS_PER_WHO) {
      return skip(`${noun} would be one moment too many for them`);
    }
    const id = input.newId();
    return {
      ...plan,
      linkedWhoIds: [...new Set([...plan.linkedWhoIds, whoId])],
      momentDeltas: new Map(plan.momentDeltas).set(
        whoId,
        (plan.momentDeltas.get(whoId) ?? 0) + 1,
      ),
      made: new Map(plan.made).set(key, { id, parts }),
      creates: [
        ...plan.creates,
        {
          id,
          data: {
            whoId,
            shape: 'moment',
            source: 'nomos',
            createdBy: 'nomos',
            executionId: input.executionId,
            createdAt: input.now,
            lastEditedAt: null,
            sealed: input.seal({ ...parts }),
          },
        },
      ],
      effects: [
        ...plan.effects,
        {
          ref: { op: 'create', collection: 'keyDates', docId: id },
          effect: {
            written: {
              'sealed.title': title(),
              whoId,
              shape: 'moment',
              ...partsPaths(parts),
            },
            previous: null,
          },
        },
      ],
    };
  };
  const step = (plan: KeyDatePlan, command: KeyDateCommand): KeyDatePlan => {
    if (plan.effects.length >= input.room) return plan;
    const skip = (reason: string): KeyDatePlan => ({
      ...plan,
      notKept: [...plan.notKept, buildKeyDateSkipLine(reason)],
    });
    if (input.isIndexUnreadable) {
      return skip("Couldn't open your dates just now");
    }
    const apply = (
      base: KeyDatePlan,
      change: IndexChange,
      whoId: string,
      delta: number,
    ): KeyDatePlan => {
      const next = applyChanges(base.byWho, [change]);
      return {
        ...base,
        changes: [...base.changes, change],
        byWho: next.byWho,
        entryCount: next.entryCount,
        deltas: new Map(base.deltas).set(
          whoId,
          (base.deltas.get(whoId) ?? 0) + delta,
        ),
        linkedWhoIds: [...new Set([...base.linkedWhoIds, whoId])],
      };
    };
    if (command.kind === 'removeKeyDate') {
      const record = input.existing.get(command.keyDateId);
      if (!record || record.shape !== 'yearly') {
        return skip("that date wasn't there");
      }
      const parts = toYearly(record.sealed);
      const title = buildKeyDateLine({
        verb: 'Removed',
        owner: ownerOf(record.whoId),
        kind: parts.kind,
        label: parts.label,
        when: whenOf(parts),
      });
      const removed = apply(
        plan,
        { op: 'remove', whoId: record.whoId, keyDateId: command.keyDateId },
        record.whoId,
        -1,
      );
      return {
        ...removed,
        deletes: [...removed.deletes, command.keyDateId],
        effects: [
          ...removed.effects,
          {
            ref: {
              op: 'delete',
              collection: 'keyDates',
              docId: command.keyDateId,
            },
            effect: {
              written: { 'sealed.title': title },
              previous: {
                'sealed.title': title,
                whoId: record.whoId,
                shape: 'yearly',
                source: record.source,
                createdAt: record.createdAt,
                ...partsPaths(parts),
              },
            },
          },
        ],
      };
    }

    const existing = command.keyDateId
      ? input.existing.get(command.keyDateId)
      : undefined;
    const whoId =
      existing?.whoId ??
      input.whoIdOf.get(command.whoRefs[0] ?? '') ??
      (command.isAboutMe ? input.selfWhoId : null);
    if (!whoId) return skip("Couldn't tell whose it is");
    const owner = ownerOf(whoId);
    const date = command.date;
    if (!date) return skip("Couldn't tell the date");
    const isMoment =
      isMomentKind(command.keyKind) ||
      (command.keyKind === 'custom' && command.comesBack === false);
    if (isMoment) return stepMoment(plan, command, whoId, owner, date);
    if (
      command.keyKind !== 'birthday' &&
      command.keyKind !== 'anniversary' &&
      command.keyKind !== 'custom'
    ) {
      return skip("Couldn't tell the date");
    }
    if (command.keyKind === 'custom' && command.comesBack !== true) {
      return skip("Couldn't tell if it comes back each year");
    }
    if (date.month === null) return skip("Couldn't tell the date");
    const parts: KeyDateParts = {
      kind: command.keyKind,
      label:
        command.keyKind === 'custom' ? (command.label?.trim() ?? null) : null,
      month: date.month,
      day: date.day,
      year: date.year,
      captureId: input.captureId,
    };
    const refusal = checkKeyDateParts(parts, input.thisYear);
    const noun = buildKeyDateLine({
      verb: 'Added',
      owner,
      kind: parts.kind,
      label: parts.label,
      when: null,
    }).replace(/^Added /, '');
    if (refusal === 'needsLabel') return skip(`${noun} needs a name`);
    if (refusal) return skip(`${noun} isn't a date I can keep`);

    if (existing) {
      if (existing.shape !== 'yearly') return skip("that date wasn't there");
      const before = existing.sealed;
      const next = { ...parts, label: parts.label ?? before.label };
      const title = buildKeyDateLine({
        verb: 'Changed',
        owner,
        kind: next.kind,
        label: next.label,
        when: whenOf(next),
      });
      const changed = apply(
        plan,
        {
          op: 'upsert',
          whoId,
          entry: toIndexEntry(command.keyDateId ?? '', next),
        },
        whoId,
        0,
      );
      return {
        ...changed,
        updates: [
          ...changed.updates,
          {
            id: command.keyDateId ?? '',
            data: { sealed: sealParts(next), lastEditedAt: input.now },
          },
        ],
        effects: [
          ...changed.effects,
          {
            ref: {
              op: 'update',
              collection: 'keyDates',
              docId: command.keyDateId ?? '',
            },
            effect: {
              written: { 'sealed.title': title, ...partsPaths(next) },
              previous: { 'sealed.title': title, ...partsPaths(before) },
            },
          },
        ],
      };
    }

    const held = plan.byWho[whoId] ?? [];
    const sameThing = held.filter(
      (entry) =>
        entry[1] === parts.kind &&
        (parts.kind !== 'custom' ||
          (entry[5] ?? '').toLowerCase() === (parts.label ?? '').toLowerCase()),
    );
    if (parts.kind === 'birthday' && sameThing.length > 0) {
      const [id, , month, day, year] = sameThing[0];
      const isSameDay = month === parts.month && day === parts.day;
      if (
        !isSameDay ||
        (year !== null && parts.year !== null && year !== parts.year)
      ) {
        return askWhich(plan, {
          whoId,
          owner,
          kind: 'birthday',
          label: null,
          keyDateId: id,
          kept: {
            when: whenOf(toPartsOfEntry(sameThing[0])),
            record: input.existing.get(id),
          },
          next: { when: whenOf(parts) },
          parts: { ...parts, precision: null },
          keptParts: { month, day, year, precision: null },
        });
      }
      if (year !== null || parts.year === null) return plan;
      const next = { ...parts, label: null };
      const title = buildKeyDateLine({
        verb: 'Changed',
        owner,
        kind: next.kind,
        label: null,
        when: whenOf(next),
      });
      const filled = apply(
        plan,
        { op: 'upsert', whoId, entry: toIndexEntry(id, next) },
        whoId,
        0,
      );
      return {
        ...filled,
        updates: [
          ...filled.updates,
          { id, data: { sealed: sealParts(next), lastEditedAt: input.now } },
        ],
        effects: [
          ...filled.effects,
          {
            ref: { op: 'update', collection: 'keyDates', docId: id },
            effect: {
              written: { 'sealed.title': title, 'sealed.year': parts.year },
              previous: { 'sealed.title': title, 'sealed.year': null },
            },
          },
        ],
      };
    }
    if (
      sameThing.some(
        (entry) => entry[3] === parts.day && entry[2] === parts.month,
      )
    ) {
      return plan;
    }
    const base = input.whoCounts.get(whoId) ?? 0;
    if (base + (plan.deltas.get(whoId) ?? 0) >= MAX_YEARLY_PER_WHO) {
      return skip(`${noun} would be one date too many for them`);
    }
    if (plan.entryCount >= MAX_KEY_DATES_TOTAL - KEY_DATES_MARGIN) {
      return skip('there are too many dates kept already');
    }
    const id = input.newId();
    const title = buildKeyDateLine({
      verb: 'Added',
      owner,
      kind: parts.kind,
      label: parts.label,
      when: whenOf(parts),
    });
    const added = apply(
      plan,
      { op: 'upsert', whoId, entry: toIndexEntry(id, parts) },
      whoId,
      1,
    );
    return {
      ...added,
      creates: [
        ...added.creates,
        {
          id,
          data: {
            whoId,
            shape: 'yearly',
            source: 'nomos',
            createdBy: 'nomos',
            executionId: input.executionId,
            createdAt: input.now,
            lastEditedAt: null,
            sealed: sealParts(parts),
          },
        },
      ],
      effects: [
        ...added.effects,
        {
          ref: { op: 'create', collection: 'keyDates', docId: id },
          effect: {
            written: {
              'sealed.title': title,
              whoId,
              shape: 'yearly',
              ...partsPaths(parts),
            },
            previous: null,
          },
        },
      ],
    };
  };
  return input.commands.reduce(step, empty(input));
}
