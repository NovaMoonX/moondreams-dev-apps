import { type KinKind } from '@apps/helm/engine/kinKinds';

export type ConnectionKind = 'family' | 'couple' | 'friend' | 'work';

export const CONNECTION_KINDS: ConnectionKind[] = [
  'family',
  'couple',
  'friend',
  'work',
];

/** `refused` marks a proposal the person turned down, or later a correction; it is never drawn as a connection. */
export type ConnectionSource = 'said' | 'page' | 'confirmed' | 'refused';

export type CoupleStatus =
  'dating' | 'engaged' | 'married' | 'separated' | 'divorced' | 'widowed';

export const CONNECTION_STATUSES: CoupleStatus[] = [
  'dating',
  'engaged',
  'married',
  'separated',
  'divorced',
  'widowed',
];

export type ConnectionRelation = KinKind | 'friend' | 'coworker';

export type Gender = 'female' | 'male' | null;

/** Gender by who id; an id that is missing reads as unknown. */
export type ConnectionGenders = Record<string, Gender | undefined>;

/** The words of a connection that are sealed: what `whoIds[0]` is to `whoIds[1]` and the reverse, a couple's status and since when. */
export interface ConnectionWords {
  fromFirst: ConnectionRelation | null;
  fromSecond: ConnectionRelation | null;
  status: CoupleStatus | null;
  /** Date-only, UTC midnight. */
  since: number | null;
}

export interface ConnectionRecord extends ConnectionWords {
  /** Two who ids, sorted. */
  whoIds: [string, string];
  kind: ConnectionKind;
}

export interface ConnectionSide {
  otherId: string;
  /** What the other is to this person. */
  relation: ConnectionRelation | null;
  status: CoupleStatus | null;
  since: number | null;
  isPast: boolean;
}

/** A family word's forms: the one for a woman, for a man, and the one used when the gender is unknown (null when the list has none). */
interface Forms {
  female: KinKind | null;
  male: KinKind | null;
  neutral: KinKind | null;
}

const forms = (
  female: KinKind | null,
  male: KinKind | null,
  neutral: KinKind | null,
): Forms => ({ female, male, neutral });

const PARENT = forms('mother', 'father', 'parent');
const CHILD = forms('daughter', 'son', 'child');
const SIBLING = forms('sister', 'brother', 'sibling');
const GRANDPARENT = forms('grandmother', 'grandfather', 'grandparent');
const GRANDCHILD = forms('grandchild', 'grandchild', 'grandchild');
const AUNT_UNCLE = forms('aunt', 'uncle', null);
const NIECE_NEPHEW = forms('niece', 'nephew', null);
const COUSIN = forms('cousin', 'cousin', 'cousin');
const PARTNER = forms('partner', 'partner', 'partner');
const SPOUSE = forms('spouse', 'spouse', 'spouse');
const PARENT_IN_LAW = forms('motherInLaw', 'fatherInLaw', 'parentInLaw');
const CHILD_IN_LAW = forms('daughterInLaw', 'sonInLaw', 'childInLaw');
const SIBLING_IN_LAW = forms('sisterInLaw', 'brotherInLaw', 'siblingInLaw');
const STEPPARENT = forms('stepmother', 'stepfather', 'stepparent');
const STEPCHILD = forms('stepdaughter', 'stepson', 'stepchild');
const STEPSIBLING = forms('stepsister', 'stepbrother', 'stepsibling');

/** Each family of words and the family of the word that answers it ("my mother" is answered by "your child"). */
const PAIRS: [Forms, Forms][] = [
  [PARENT, CHILD],
  [GRANDPARENT, GRANDCHILD],
  [AUNT_UNCLE, NIECE_NEPHEW],
  [SIBLING, SIBLING],
  [COUSIN, COUSIN],
  [PARTNER, PARTNER],
  [SPOUSE, SPOUSE],
  [PARENT_IN_LAW, CHILD_IN_LAW],
  [SIBLING_IN_LAW, SIBLING_IN_LAW],
  [STEPPARENT, STEPCHILD],
  [STEPSIBLING, STEPSIBLING],
];

const ANSWERS: [Forms, Forms][] = PAIRS.flatMap(([a, b]) =>
  a === b ? [[a, b] as [Forms, Forms]] : [[a, b] as [Forms, Forms], [b, a]],
);

const toForms = (kind: KinKind) =>
  ANSWERS.find(([own]) =>
    [own.female, own.male, own.neutral].includes(kind),
  )?.[0] ?? null;

const SIDES = ['female', 'male'] as const;

/** The id of a connection: its two who ids in order, then its kind, so the same pair and kind is one document whichever way round it was written. */
export const toConnectionId = (a: string, b: string, kind: ConnectionKind) =>
  `${[a, b].sort().join('_')}_${kind}`;

/** What the other is to you when you are `kinKind` to them (Maya, a sister, to Eli gives brother, or sibling when his gender is unknown); null when the list has no such word. */
export const reverseRelation = (
  kinKind: KinKind,
  otherGender: Gender,
): KinKind | null => {
  const own = toForms(kinKind);
  const answer = ANSWERS.find(([from]) => from === own)?.[1];
  if (!answer) return null;
  return answer[otherGender ?? 'neutral'];
};

/** From their own family word only, never guessed from a name. */
export const genderOf = (who: { kin: { kind: KinKind } | null }): Gender => {
  const kind = who.kin?.kind;
  if (!kind) return null;
  const own = toForms(kind);
  if (!own) return null;
  if (own.female === own.male) return null;
  return SIDES.find((side) => own[side] === kind) ?? null;
};

export const isPastStatus = (status: CoupleStatus | null) =>
  status === 'separated' || status === 'divorced' || status === 'widowed';

const forwardRelation = (
  kind: ConnectionKind,
  relation: ConnectionRelation | null,
): ConnectionRelation | null => {
  if (kind === 'friend') return 'friend';
  if (kind === 'work') return 'coworker';
  if (kind === 'couple') return 'partner';
  return relation;
};

const backwardRelation = (
  kind: ConnectionKind,
  forward: ConnectionRelation | null,
  secondGender: Gender,
): ConnectionRelation | null => {
  if (kind !== 'family') return forward;
  if (forward === null || forward === 'friend' || forward === 'coworker')
    return null;
  return reverseRelation(forward, secondGender);
};

/** Both sides, sorted; the other side is worked out from the gender of the one it describes. */
export const buildConnection = (
  firstId: string,
  secondId: string,
  kind: ConnectionKind,
  relationOfFirstToSecond: ConnectionRelation | null,
  status: CoupleStatus | null,
  since: number | null,
  genders: ConnectionGenders,
): ConnectionRecord => {
  const forward = forwardRelation(kind, relationOfFirstToSecond);
  const backward = backwardRelation(kind, forward, genders[secondId] ?? null);
  const isInOrder = firstId <= secondId;
  return {
    whoIds: isInOrder ? [firstId, secondId] : [secondId, firstId],
    kind,
    fromFirst: isInOrder ? forward : backward,
    fromSecond: isInOrder ? backward : forward,
    status: kind === 'couple' ? status : null,
    since,
  };
};

/** The other person and what they are to `whoId`; null when `whoId` is neither. */
export const readFromSide = (
  connection: ConnectionRecord,
  whoId: string,
): ConnectionSide | null => {
  const [first, second] = connection.whoIds;
  if (whoId !== first && whoId !== second) return null;
  const isFirst = whoId === first;
  return {
    otherId: isFirst ? second : first,
    relation: isFirst ? connection.fromSecond : connection.fromFirst,
    status: connection.status,
    since: connection.since,
    isPast: connection.kind === 'couple' && isPastStatus(connection.status),
  };
};

/** A refused connection is only a memory that it was turned down. */
export const isShownConnection = (connection: { source: ConnectionSource }) =>
  connection.source !== 'refused';

/** A private one, a pet or an organization is never part of an inference. */
export interface InferPerson {
  id: string;
  /** What this person is to the owner. */
  kin: { kind: KinKind; order?: unknown } | null;
  isPrivate: boolean;
  isPerson: boolean;
}

/** A refusal is kept so it is never asked or worked out again. */
export interface InferConnectionState {
  whoIds: [string, string];
  kind: ConnectionKind;
  source: ConnectionSource;
  fromFirst: ConnectionRelation | null;
  fromSecond: ConnectionRelation | null;
  status: CoupleStatus | null;
  /** Its sealed words could not be opened. */
  isUnreadable: boolean;
}

/** `fromId` is `relation` to `toId`. */
export interface ChainStep {
  fromId: string;
  toId: string;
  relation: KinKind;
}

export type InferredBecause =
  | 'siblings'
  | 'sameParent'
  | 'auntUncle'
  | 'cousin'
  | 'grandparent'
  | 'siblingsPartner'
  | 'parentsPartner';

export interface InferredLink {
  firstId: string;
  secondId: string;
  /** Null when the list has no word for it (an aunt or uncle of unknown gender), shown as "family". */
  relationOfFirstToSecond: KinKind | null;
  /** The stored facts it was worked out from, one to three. */
  chain: ChainStep[];
  because: InferredBecause;
}

type Role = 'parent' | 'child' | 'sibling' | 'auntUncle' | 'nibling' | 'spouse';

const ROLE_OF = new Map<KinKind, Role>([
  ...(['mother', 'father', 'parent'] as const).map(
    (kind) => [kind, 'parent'] as const,
  ),
  ...(['son', 'daughter', 'child'] as const).map(
    (kind) => [kind, 'child'] as const,
  ),
  ...(['sister', 'brother', 'sibling'] as const).map(
    (kind) => [kind, 'sibling'] as const,
  ),
  ['aunt', 'auntUncle'],
  ['uncle', 'auntUncle'],
  ['niece', 'nibling'],
  ['nephew', 'nibling'],
  ['spouse', 'spouse'],
  ['partner', 'spouse'],
]);

type Index = Map<string, Map<string, ChainStep>>;

const toIndex = (entries: [string, string, ChainStep][]): Index =>
  entries.reduce(
    (index, [key, other, step]) =>
      index.get(key)?.has(other)
        ? index
        : index.set(key, (index.get(key) ?? new Map()).set(other, step)),
    new Map<string, Map<string, ChainStep>>(),
  );

const pairKey = (a: string, b: string) => [a, b].sort().join('_');

const isKinRelation = (
  relation: ConnectionRelation | null,
): relation is KinKind =>
  relation !== null && relation !== 'friend' && relation !== 'coworker';

/** A couple that is past, dating or engaged says nothing about the family around it. */
const isSettledCouple = (connection: InferConnectionState) =>
  connection.kind === 'couple' &&
  connection.source !== 'refused' &&
  !connection.isUnreadable &&
  (connection.status === 'married' || connection.status === null);

const toStoredFacts = (connection: InferConnectionState): ChainStep[] => {
  const [first, second] = connection.whoIds;
  if (connection.source === 'refused' || connection.isUnreadable) return [];
  if (connection.kind === 'family')
    return [
      { fromId: first, toId: second, relation: connection.fromFirst },
      { fromId: second, toId: first, relation: connection.fromSecond },
    ].flatMap((step) =>
      isKinRelation(step.relation)
        ? [{ ...step, relation: step.relation }]
        : [],
    );
  if (!isSettledCouple(connection)) return [];
  const relation: KinKind = connection.status === null ? 'partner' : 'spouse';
  return [
    { fromId: first, toId: second, relation },
    { fromId: second, toId: first, relation },
  ];
};

/**
 * The family links the stored ones make likely, each with the facts it came from: the owner's siblings are siblings of each other, as are two children of one parent; a parent's sibling is an aunt or uncle and their child a cousin; a parent's parent is a grandparent; a sibling's spouse a sibling-in-law; a parent's spouse who is not a parent a stepparent.
 * A gendered word comes from the person's own family word, or the gendered word a stored link says they are (a sister is a woman).
 * Never for a pair with a family or couple document (a refusal included), a private person, a pet or an organization, or the owner and someone who already has a family word; nothing for friends or work.
 */
export const inferFamilyLinks = (input: {
  selfId: string | null;
  people: InferPerson[];
  connections: InferConnectionState[];
}): InferredLink[] => {
  const { selfId } = input;
  const person = new Map(input.people.map((entry) => [entry.id, entry]));
  const isOpen = (id: string) =>
    person.get(id)?.isPerson === true && person.get(id)?.isPrivate === false;
  const facts = [
    ...input.people.flatMap((entry): ChainStep[] =>
      selfId !== null && entry.kin && entry.id !== selfId
        ? [{ fromId: entry.id, toId: selfId, relation: entry.kin.kind }]
        : [],
    ),
    ...input.connections.flatMap(toStoredFacts),
  ].filter((step) => isOpen(step.fromId) && isOpen(step.toId));
  const statedGender = new Map(
    [...facts].reverse().flatMap((step): [string, Gender][] => {
      const gender = genderOf({ kin: { kind: step.relation } });
      return gender ? [[step.fromId, gender]] : [];
    }),
  );
  const formFor = (forms: Forms, id: string) =>
    forms[
      genderOf({ kin: person.get(id)?.kin ?? null }) ??
        statedGender.get(id) ??
        'neutral'
    ];
  const withRole = (roles: Role[]) =>
    facts.flatMap((step) => {
      const role = ROLE_OF.get(step.relation);
      return role && roles.includes(role) ? [{ step, role }] : [];
    });
  const parentsOf = toIndex(
    withRole(['parent', 'child']).map(({ step, role }) =>
      role === 'parent'
        ? [step.toId, step.fromId, step]
        : [step.fromId, step.toId, step],
    ),
  );
  const childrenOf = toIndex(
    withRole(['parent', 'child']).map(({ step, role }) =>
      role === 'parent'
        ? [step.fromId, step.toId, step]
        : [step.toId, step.fromId, step],
    ),
  );
  const siblingsOf = toIndex(
    withRole(['sibling']).map(({ step }) => [step.toId, step.fromId, step]),
  );
  const auntsOf = toIndex(
    withRole(['auntUncle', 'nibling']).map(({ step, role }) =>
      role === 'auntUncle'
        ? [step.toId, step.fromId, step]
        : [step.fromId, step.toId, step],
    ),
  );
  const spousesOf = toIndex(
    withRole(['spouse']).map(({ step }) => [step.toId, step.fromId, step]),
  );
  const decided = new Set(
    input.connections
      .filter(
        (connection) =>
          connection.kind === 'family' || connection.kind === 'couple',
      )
      .map((connection) => pairKey(...connection.whoIds)),
  );
  const isAllowed = (link: InferredLink) =>
    link.firstId !== link.secondId &&
    isOpen(link.firstId) &&
    isOpen(link.secondId) &&
    !decided.has(pairKey(link.firstId, link.secondId)) &&
    !(
      selfId !== null &&
      [link.firstId, link.secondId].includes(selfId) &&
      person.get(link.firstId === selfId ? link.secondId : link.firstId)?.kin
    );
  const dedupe = (links: InferredLink[]) => [
    ...links
      .filter(isAllowed)
      .reduce(
        (byPair, link) =>
          byPair.has(pairKey(link.firstId, link.secondId))
            ? byPair
            : byPair.set(pairKey(link.firstId, link.secondId), link),
        new Map<string, InferredLink>(),
      )
      .values(),
  ];
  const entriesOf = (index: Index, id: string) => [
    ...(index.get(id) ?? new Map<string, ChainStep>()),
  ];
  const pairsOf = <T>(items: T[]) =>
    items.flatMap((first, at) =>
      items.slice(at + 1).map((second): [T, T] => [first, second]),
    );
  const siblings = pairsOf(
    selfId === null ? [] : entriesOf(siblingsOf, selfId),
  ).map(([[a, aStep], [b, bStep]]): InferredLink => ({
    firstId: a,
    secondId: b,
    relationOfFirstToSecond: formFor(SIBLING, a),
    chain: [aStep, bStep],
    because: 'siblings',
  }));
  const sameParent = [...childrenOf.keys()].flatMap((parent) =>
    pairsOf(entriesOf(childrenOf, parent)).map(
      ([[a, aStep], [b, bStep]]): InferredLink => ({
        firstId: a,
        secondId: b,
        relationOfFirstToSecond: formFor(SIBLING, a),
        chain: [aStep, bStep],
        because: 'sameParent',
      }),
    ),
  );
  const auntsAndUncles = dedupe([
    ...siblings,
    ...sameParent,
    ...[...childrenOf.keys()].flatMap((parent) =>
      entriesOf(childrenOf, parent).flatMap(([child, childStep]) =>
        entriesOf(siblingsOf, parent)
          .filter(
            ([relative]) =>
              relative !== child && !parentsOf.get(child)?.has(relative),
          )
          .map(([relative, relativeStep]): InferredLink => ({
            firstId: relative,
            secondId: child,
            relationOfFirstToSecond: formFor(AUNT_UNCLE, relative),
            chain: [childStep, relativeStep],
            because: 'auntUncle',
          })),
      ),
    ),
  ]);
  const knownAunts = [
    ...[...auntsOf.keys()].flatMap((nibling) =>
      entriesOf(auntsOf, nibling).map(([aunt, step]) => ({
        aunt,
        nibling,
        chain: [step],
      })),
    ),
    ...auntsAndUncles
      .filter((link) => link.because === 'auntUncle')
      .map((link) => ({
        aunt: link.firstId,
        nibling: link.secondId,
        chain: link.chain,
      })),
  ];
  const cousins = knownAunts.flatMap(({ aunt, nibling, chain }) =>
    entriesOf(childrenOf, aunt)
      .filter(([kid]) => kid !== nibling && !siblingsOf.get(nibling)?.has(kid))
      .map(([kid, kidStep]): InferredLink => ({
        firstId: kid,
        secondId: nibling,
        relationOfFirstToSecond: 'cousin',
        chain: [...chain, kidStep],
        because: 'cousin',
      })),
  );
  const grandparents = [...parentsOf.keys()].flatMap((child) =>
    entriesOf(parentsOf, child).flatMap(([parent, parentStep]) =>
      entriesOf(parentsOf, parent).map(
        ([grandparent, grandStep]): InferredLink => ({
          firstId: grandparent,
          secondId: child,
          relationOfFirstToSecond: formFor(GRANDPARENT, grandparent),
          chain: [parentStep, grandStep],
          because: 'grandparent',
        }),
      ),
    ),
  );
  const inLaws = [...siblingsOf.keys()].flatMap((owner) =>
    entriesOf(siblingsOf, owner).flatMap(([sibling, siblingStep]) =>
      entriesOf(spousesOf, sibling)
        .filter(
          ([spouse]) => spouse !== owner && !siblingsOf.get(owner)?.has(spouse),
        )
        .map(([spouse, spouseStep]): InferredLink => ({
          firstId: spouse,
          secondId: owner,
          relationOfFirstToSecond: formFor(SIBLING_IN_LAW, spouse),
          chain: [siblingStep, spouseStep],
          because: 'siblingsPartner',
        })),
    ),
  );
  const stepparents = [...parentsOf.keys()].flatMap((child) =>
    entriesOf(parentsOf, child).flatMap(([parent, parentStep]) =>
      entriesOf(spousesOf, parent)
        .filter(
          ([spouse]) =>
            spouse !== child &&
            !parentsOf.get(child)?.has(spouse) &&
            !siblingsOf.get(child)?.has(spouse),
        )
        .map(([spouse, spouseStep]): InferredLink => ({
          firstId: spouse,
          secondId: child,
          relationOfFirstToSecond: formFor(STEPPARENT, spouse),
          chain: [parentStep, spouseStep],
          because: 'parentsPartner',
        })),
    ),
  );
  return dedupe([
    ...auntsAndUncles,
    ...cousins,
    ...grandparents,
    ...inLaws,
    ...stepparents,
  ]);
};

export type ImpliedPerson = InferPerson;

export interface ImpliedLink {
  firstId: string;
  secondId: string;
  kind: ConnectionKind;
  relationOfFirstToSecond: ConnectionRelation;
  because: 'siblings' | 'parentsPartner' | 'siblingsPartner';
}

/** What a turn's own words make likely, so it is asked: the owner's siblings, a parent's spouse, a sibling's spouse. Only for `touchedIds`. */
export interface ImpliedConnectionState {
  whoIds: [string, string];
  kind: ConnectionKind;
  source: ConnectionSource;
  status: CoupleStatus | null;
  isUnreadable: boolean;
}

const ASKED_BECAUSE: InferredBecause[] = [
  'siblings',
  'parentsPartner',
  'siblingsPartner',
];

export const impliedConnections = (input: {
  selfId: string | null;
  people: ImpliedPerson[];
  connections: ImpliedConnectionState[];
  touchedIds: string[];
}): ImpliedLink[] => {
  const touched = new Set(input.touchedIds);
  return inferFamilyLinks({
    selfId: input.selfId,
    people: input.people,
    connections: input.connections.map((connection) => ({
      ...connection,
      fromFirst: null,
      fromSecond: null,
    })),
  }).flatMap((link): ImpliedLink[] =>
    link.relationOfFirstToSecond !== null &&
    (ASKED_BECAUSE as string[]).includes(link.because) &&
    (touched.has(link.firstId) || touched.has(link.secondId))
      ? [
          {
            firstId: link.firstId,
            secondId: link.secondId,
            kind: 'family',
            relationOfFirstToSecond: link.relationOfFirstToSecond,
            because: link.because as ImpliedLink['because'],
          },
        ]
      : [],
  );
};
