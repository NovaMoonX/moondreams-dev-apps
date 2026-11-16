import { WHY_SUMMARY_CAP, WHY_TAGS_CAP } from '../goalWhy.js';
import { OBSERVATION_TAGS, type ObservationTag } from '../nomos/said.js';

export const REFLECT_LINKS = [
  'shift',
  'busyDay',
  'lateDay',
  'weekday',
  'other',
] as const;
export const REFLECT_SUGGESTIONS = [
  'differentTime',
  'smaller',
  'somethingNew',
  'none',
] as const;
export const OBSERVATION_KINDS = [
  'feeling',
  'reason',
  'outcome',
  'answer',
] as const;

export type ReflectLink = (typeof REFLECT_LINKS)[number];
export type ReflectSuggestion = (typeof REFLECT_SUGGESTIONS)[number];
export type ReflectKind = (typeof OBSERVATION_KINDS)[number];

export const MAX_CANDIDATES = 5;
export const MAX_CITED = 12;
export const MAX_WHY_REFRESHES = 5;
export const MAX_NOTE_OBSERVATIONS = 10;
export const MAX_TAGS = 3;
export const QUOTE_CAP = 200;
const WHY_TAG_CAP = 24;

export interface ReflectCandidate {
  subject: string;
  observations: string[];
  tags: ObservationTag[];
  linkedTo: ReflectLink | null;
  suggestion: ReflectSuggestion;
}

export interface ReflectWhyRefresh {
  goal: string;
  summary: string;
  tags: string[];
  basedOn: string;
}

export interface ReflectNoteObservation {
  about: string;
  dayKey: string;
  kind: ReflectKind;
  tags: ObservationTag[];
  quote: string | null;
}

export interface NormalizedReflection {
  candidates: ReflectCandidate[];
  whyRefresh: ReflectWhyRefresh[];
  noteObservations: ReflectNoteObservation[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const isOneOf = <Item extends string>(
  list: readonly Item[],
  value: unknown,
): value is Item => list.some((item) => item === value);

const toTags = (value: unknown): ObservationTag[] =>
  [
    ...new Set(toList(value).filter((tag) => isOneOf(OBSERVATION_TAGS, tag))),
  ].slice(0, MAX_TAGS) as ObservationTag[];

const toAliases = (value: unknown, max: number) =>
  [...new Set(toList(value).map(toText).filter(Boolean))].slice(0, max);

const toCandidate = (value: unknown): ReflectCandidate[] => {
  if (!isRecord(value)) return [];
  const subject = toText(value.subject);
  const tags = toTags(value.tags);
  const observations = toAliases(value.observations, MAX_CITED);
  if (!subject || tags.length === 0 || observations.length === 0) return [];
  return [
    {
      subject,
      observations,
      tags,
      linkedTo: isOneOf(REFLECT_LINKS, value.linkedTo) ? value.linkedTo : null,
      suggestion: isOneOf(REFLECT_SUGGESTIONS, value.suggestion)
        ? value.suggestion
        : 'none',
    },
  ];
};

const toWhyRefresh = (value: unknown): ReflectWhyRefresh[] => {
  if (!isRecord(value)) return [];
  const goal = toText(value.goal);
  const summary = toText(value.summary).slice(0, WHY_SUMMARY_CAP);
  const basedOn = toText(value.basedOn);
  if (!goal || !summary || !basedOn) return [];
  return [
    {
      goal,
      summary,
      basedOn,
      tags: [
        ...new Set(
          toList(value.tags)
            .map(toText)
            .filter(Boolean)
            .map((tag) => tag.slice(0, WHY_TAG_CAP)),
        ),
      ].slice(0, WHY_TAGS_CAP),
    },
  ];
};

const toNoteObservation = (value: unknown): ReflectNoteObservation[] => {
  if (!isRecord(value)) return [];
  const about = toText(value.about);
  const dayKey = toText(value.day);
  const tags = toTags(value.tags);
  if (
    !about ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) ||
    tags.length === 0 ||
    !isOneOf(OBSERVATION_KINDS, value.kind)
  )
    return [];
  return [
    {
      about,
      dayKey,
      kind: value.kind,
      tags,
      quote: toText(value.quote).slice(0, QUOTE_CAP) || null,
    },
  ];
};

/** What the model's answer holds after shape and caps are checked: anything malformed is left out, never repaired. Whether it fits the person's records is the writer's to decide. */
export function normalizeReflection(value: unknown): NormalizedReflection {
  const body = isRecord(value) ? value : {};
  return {
    candidates: toList(body.candidates)
      .flatMap(toCandidate)
      .slice(0, MAX_CANDIDATES),
    whyRefresh: toList(body.whyRefresh)
      .flatMap(toWhyRefresh)
      .slice(0, MAX_WHY_REFRESHES),
    noteObservations: toList(body.noteObservations)
      .flatMap(toNoteObservation)
      .slice(0, MAX_NOTE_OBSERVATIONS),
  };
}
