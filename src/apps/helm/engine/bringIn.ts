import { createOptionMatcher } from '@/utils/optionMatchUtils';
import { isPrivateRead } from '@apps/helm/utils/privacy';
import { toContactKey } from '@apps/helm/engine/contactPoints';
import type { OpenWho, SyncedRecord, WhoKind } from '@apps/helm/types';

/** What an app's shared category becomes in the circle: people, pets, or businesses (organizations). */
export interface BringInSource {
  appId: string;
  categoryId: string;
  circleKind: WhoKind;
  /** The word the offer counts it by, singular and plural. */
  noun: { one: string; many: string };
  species: string | null;
  organizationKind: string | null;
  /** What the person is to them, in the who's `relation`, when the category says it. */
  relation: string | null;
}

export const BRING_IN_SOURCES: BringInSource[] = [
  {
    appId: 'nine-lives',
    categoryId: 'cats',
    circleKind: 'pet',
    noun: { one: 'pet', many: 'pets' },
    species: 'Cat',
    organizationKind: null,
    relation: null,
  },
  {
    appId: 'nine-lives',
    categoryId: 'clinics',
    circleKind: 'organization',
    noun: { one: 'clinic', many: 'clinics' },
    species: null,
    organizationKind: 'Vet clinic',
    relation: null,
  },
  {
    appId: 'nine-lives',
    categoryId: 'vets',
    circleKind: 'person',
    noun: { one: 'vet', many: 'vets' },
    species: null,
    organizationKind: null,
    relation: 'vet',
  },
  {
    appId: 'waypoint',
    categoryId: 'travelers',
    circleKind: 'person',
    noun: { one: 'person you travel with', many: 'people you travel with' },
    species: null,
    organizationKind: null,
    relation: null,
  },
  {
    appId: 'going-once',
    categoryId: 'people',
    circleKind: 'person',
    noun: { one: 'buyer or co-seller', many: 'buyers and co-sellers' },
    species: null,
    organizationKind: null,
    relation: null,
  },
];

export const findBringInSource = (appId: string, categoryId: string) =>
  BRING_IN_SOURCES.find(
    (source) => source.appId === appId && source.categoryId === categoryId,
  ) ?? null;

export const toSourceKey = (connectorId: string, sourceRef: string) =>
  `${connectorId}|${sourceRef}`;

/** One person, pet or business a connected app holds, read from its synced copy. */
export interface BringInCandidate {
  key: string;
  appId: string;
  connectorId: string;
  /** Every source ref this name came from (a buyer asking in two sales is one candidate). */
  sourceRefs: string[];
  source: BringInSource;
  name: string;
  /** What the app says about them, already clipped and safe to show. */
  detail: string | null;
  phone: string | null;
  /** The app's own word for the role ("Buyer", "Co-seller"), or null. */
  role: string | null;
}

export type BringInPlan =
  | { kind: 'new'; candidate: BringInCandidate }
  | {
      kind: 'same';
      candidate: BringInCandidate;
      who: OpenWho;
      /** What merging adds, in the person's words, for the review row. */
      adds: string[];
    }
  | {
      kind: 'maybe';
      candidate: BringInCandidate;
      who: OpenWho;
      adds: string[];
    };

const TITLES = new Set(['dr', 'doctor', 'mr', 'mrs', 'ms', 'miss', 'mx']);
const BUSINESS_WORDS = new Set([
  ...TITLES,
  'vet',
  'vets',
  'veterinary',
  'veterinarian',
  'animal',
  'pet',
  'hospital',
  'clinic',
  'the',
]);

const namesOf = (who: OpenWho) => [who.name, ...who.aliases];

const sure = {
  people: createOptionMatcher<OpenWho>({
    names: namesOf,
    ignoreWords: TITLES,
    typos: false,
  }),
  business: createOptionMatcher<OpenWho>({
    names: namesOf,
    ignoreWords: BUSINESS_WORDS,
    typos: false,
  }),
};

const loose = {
  people: createOptionMatcher<OpenWho>({
    names: namesOf,
    ignoreWords: TITLES,
    typos: 'loose',
  }),
  business: createOptionMatcher<OpenWho>({
    names: namesOf,
    ignoreWords: BUSINESS_WORDS,
    typos: 'loose',
  }),
};

const matchersFor = (kind: WhoKind) =>
  kind === 'organization'
    ? { sure: sure.business, loose: loose.business }
    : { sure: sure.people, loose: loose.people };

export const toSourceRefs = (who: OpenWho) =>
  new Set(
    who.appSources.map((entry) =>
      toSourceKey(entry.connectorId, entry.sourceRef),
    ),
  );

const isRefused = (candidate: BringInCandidate, who: OpenWho) => {
  const { sure: matcher } = matchersFor(candidate.source.circleKind);
  const refused = who.refusedAliases ?? [];
  return (
    refused.length > 0 &&
    refused.some(
      (name) =>
        matcher.comparable(name) !== '' &&
        matcher.comparable(name) === matcher.comparable(candidate.name),
    )
  );
};

const hasPhone = (who: OpenWho, phone: string | null) => {
  const key = phone === null ? null : toContactKey('phone', phone);
  return (
    key !== null &&
    who.phones.some((point) => toContactKey('phone', point.value) === key)
  );
};

const words = (text: string) => text.split(' ').filter(Boolean);

/** A one-word name inside a longer one ("Sam" in "Sam Lee", "Patel" in "Anita Patel"), whichever side is the short one. */
const isPartOf = (candidate: BringInCandidate, who: OpenWho) => {
  const { loose: matcher } = matchersFor(candidate.source.circleKind);
  const mine = words(matcher.comparable(candidate.name));
  return namesOf(who).some((name) => {
    const theirs = words(matcher.comparable(name));
    const [short, long] =
      mine.length <= theirs.length ? [mine, theirs] : [theirs, mine];
    return (
      short.length === 1 && long.length > 1 && long.includes(short[0] ?? '')
    );
  });
};

/** What merging a candidate into a who adds, one short phrase each; empty when the who already holds it all. */
export const toMergeAdds = (candidate: BringInCandidate, who: OpenWho) => {
  const { sure: matcher } = matchersFor(candidate.source.circleKind);
  const known = namesOf(who).map((name) => matcher.comparable(name));
  const isKnownName = known.includes(matcher.comparable(candidate.name));
  const notes = (who.notes ?? '').toLowerCase();
  return [
    ...(isKnownName ? [] : [`Also called ${candidate.name}`]),
    ...(candidate.phone !== null && !hasPhone(who, candidate.phone)
      ? ['A phone number']
      : []),
    ...(candidate.detail !== null &&
    !notes.includes(candidate.detail.toLowerCase())
      ? [candidate.detail]
      : []),
  ];
};

const planOne = (
  candidate: BringInCandidate,
  circle: OpenWho[],
): BringInPlan => {
  const sameKind = circle.filter(
    (who) =>
      !who.isUnreadable &&
      who.kind === candidate.source.circleKind &&
      !isRefused(candidate, who),
  );
  const matchers = matchersFor(candidate.source.circleKind);
  const named = matchers.sure.match(candidate.name, sameKind);
  if (named)
    return {
      kind: 'same',
      candidate,
      who: named,
      adds: toMergeAdds(candidate, named),
    };
  const near = matchers.loose.match(candidate.name, sameKind);
  const parts = sameKind.filter((who) => isPartOf(candidate, who));
  const related = near ?? (parts.length === 1 ? (parts[0] ?? null) : null);
  // A shared phone makes related names sure, but never decides alone: a clinic's number is every vet's at it.
  if (related && hasPhone(related, candidate.phone))
    return {
      kind: 'same',
      candidate,
      who: related,
      adds: toMergeAdds(candidate, related),
    };
  const maybe =
    related ?? sameKind.find((who) => hasPhone(who, candidate.phone)) ?? null;
  return maybe
    ? {
        kind: 'maybe',
        candidate,
        who: maybe,
        adds: toMergeAdds(candidate, maybe),
      }
    : { kind: 'new', candidate };
};

/** Two candidates with the same name and kind are one (a buyer asking in two sales): the first keeps every source ref. */
const joinSameNames = (candidates: BringInCandidate[]) =>
  candidates.reduce<BringInCandidate[]>((kept, candidate) => {
    const { sure: matcher } = matchersFor(candidate.source.circleKind);
    const twin = kept.find(
      (one) =>
        one.source.circleKind === candidate.source.circleKind &&
        matcher.comparable(one.name) === matcher.comparable(candidate.name) &&
        matcher.comparable(one.name) !== '',
    );
    return twin
      ? kept.map((one) =>
          one === twin
            ? {
                ...one,
                sourceRefs: [...one.sourceRefs, ...candidate.sourceRefs],
              }
            : one,
        )
      : [...kept, candidate];
  }, []);

/** Sorts what a connection returns against the circle: new, the same as someone (said), or maybe someone (asked). What a who already took from the same source ref is left out, a who is surely matched by at most one candidate per batch (the next is asked as a maybe, and the merge folds them together), and while the page is masked a candidate that matches a private who is held out, so no private name is shown or counted. */
export const planBringIn = (
  candidates: BringInCandidate[],
  circle: OpenWho[],
  options: { isMasked?: boolean } = {},
): BringInPlan[] => {
  const brought = new Set(
    circle.flatMap((who) => Array.from(toSourceRefs(who))),
  );
  const fresh = candidates.flatMap((candidate) => {
    const refs = candidate.sourceRefs.filter(
      (ref) => !brought.has(toSourceKey(candidate.connectorId, ref)),
    );
    return refs.length === 0 ? [] : [{ ...candidate, sourceRefs: refs }];
  });
  const taken = new Set<string>();
  return joinSameNames(fresh).flatMap((candidate): BringInPlan[] => {
    const plan = planOne(candidate, circle);
    if (plan.kind === 'new') return [plan];
    if (options.isMasked && isPrivateRead(plan.who)) return [];
    if (plan.kind !== 'same') return [plan];
    if (taken.has(plan.who.id)) return [{ ...plan, kind: 'maybe' }];
    taken.add(plan.who.id);
    return [plan];
  });
};

const readText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** The candidates a connection's synced copies hold, for the categories the person has on. */
export const toCandidates = (
  records: SyncedRecord[],
  input: {
    connectorId: string;
    appId: string;
    isOn: (category: string) => boolean;
  },
): BringInCandidate[] =>
  records.flatMap((record) => {
    const source = findBringInSource(input.appId, record.category);
    const name = readText(record.sealed.title);
    if (
      !source ||
      name === null ||
      record.connectorId !== input.connectorId ||
      record.connectionEndedAt !== null ||
      !input.isOn(record.category)
    )
      return [];
    return [
      {
        key: toSourceKey(record.connectorId, record.sourceRef),
        appId: input.appId,
        connectorId: record.connectorId,
        sourceRefs: [record.sourceRef],
        source,
        name,
        detail: readText(record.sealed.detail),
        phone: readText(record.sealed.extra.phone),
        role: readText(record.sealed.subtitle),
      },
    ];
  });

export const countBySource = (plans: BringInPlan[]) =>
  BRING_IN_SOURCES.flatMap((source) => {
    const count = plans.filter(
      (plan) => plan.candidate.source === source,
    ).length;
    return count === 0 ? [] : [{ source, count }];
  });

/** "3 pets, a clinic and 2 vets": each part is `[count, noun]`. */
export const toCountPhrase = (
  parts: { count: number; one: string; many: string }[],
) => {
  const said = parts.map((part) =>
    part.count === 1
      ? `${/^[aeiou]/i.test(part.one) ? 'an' : 'a'} ${part.one}`
      : `${part.count} ${part.many}`,
  );
  if (said.length <= 1) return said.join('');
  return `${said.slice(0, -1).join(', ')} and ${said.at(-1)}`;
};
