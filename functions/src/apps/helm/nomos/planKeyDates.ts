import type { SealedPayload } from '../../../appKeys/seal.js';
import { formatYearlyDate } from '../../../vendor/yearlyDateUtils.js';
import {
  applyChanges,
  type ByWho,
  type IndexChange,
  type IndexEntry,
} from '../keyDateIndex.js';
import {
  KEY_DATE_LABEL_CAP,
  type KeyDateCommand,
  type KeyDateKind,
} from './commands.js';
import { buildKeyDateLine, buildKeyDateSkipLine } from './summaries.js';

/** Dates that come back, per who. */
export const MAX_YEARLY_PER_WHO = 20;
/** The person's key dates in all; the index's count stands for the yearly ones, so a margin is kept for moments. */
export const MAX_KEY_DATES_TOTAL = 20_000;
export const KEY_DATES_MARGIN = 100;

export interface KeyDateParts {
  kind: KeyDateKind;
  label: string | null;
  month: number;
  day: number | null;
  year: number | null;
  captureId: string | null;
}

/** A key date document as stored, its sealed words opened. */
export interface KeyDateRecord {
  whoId: string;
  shape: 'yearly' | 'moment';
  source: 'person' | 'nomos' | 'google:contacts';
  createdAt: number;
  sealed: KeyDateParts;
}

export type KeyDateRefusal = 'monthAlone' | 'badDay' | 'badYear' | 'needsLabel';

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
  existing: Map<string, KeyDateRecord>;
  index: ByWho;
  entryCount: number;
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
  notKept: [],
  linkedWhoIds: [],
  byWho: input.index,
  entryCount: input.entryCount,
});

export const partsPaths = (parts: KeyDateParts) => ({
  'sealed.kind': parts.kind,
  'sealed.label': parts.label,
  'sealed.month': parts.month,
  'sealed.day': parts.day,
  'sealed.year': parts.year,
  'sealed.captureId': parts.captureId,
});

/** Turns settled key date commands into documents, index changes and effects; a command the code refuses is a skipped line, never a guess. */
export function planKeyDates(input: PlanInput): KeyDatePlan {
  const ownerOf = (whoId: string) =>
    whoId === input.selfWhoId ? null : (input.nameOf.get(whoId) ?? null);
  const sealParts = (parts: KeyDateParts) => input.seal({ ...parts });
  const step = (plan: KeyDatePlan, command: KeyDateCommand): KeyDatePlan => {
    if (plan.effects.length >= input.room) return plan;
    const skip = (reason: string): KeyDatePlan => ({
      ...plan,
      notKept: [...plan.notKept, buildKeyDateSkipLine(reason)],
    });
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
      const parts = record.sealed;
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
      (command.isAboutMe
        ? input.selfWhoId
        : (input.whoIdOf.get(command.whoRefs[0] ?? '') ?? null));
    if (!whoId) return skip("I couldn't tell whose it is");
    const owner = ownerOf(whoId);
    const date = command.date;
    if (!date) return skip("I couldn't tell the date");
    if (command.keyKind === 'custom' && command.comesBack !== true) {
      return skip("it doesn't come back each year");
    }
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
        return skip(
          `${noun} is already ${whenOf(toPartsOfEntry(sameThing[0]))}`,
        );
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
