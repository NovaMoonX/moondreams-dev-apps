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

/** A relation word: a family word from the fixed list, or `friend` / `coworker`. */
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

/** A connection as one person's page reads it. */
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

/** What the other is to you, when you are `kinKind` to them: Maya (sister) to Eli gives brother when Eli is male, sibling when it is unknown. Null only when the list has no word for an unknown gender (niece or nephew, aunt or uncle). */
export const reverseRelation = (
  kinKind: KinKind,
  otherGender: Gender,
): KinKind | null => {
  const own = toForms(kinKind);
  const answer = ANSWERS.find(([from]) => from === own)?.[1];
  if (!answer) return null;
  return answer[otherGender ?? 'neutral'];
};

/** A who's gender from their own family word, the only source there is: sister, mother and the like are female, brother, father and the like male, everything else unknown. Never guessed from a name. */
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

/** Both sides of a connection, sorted. `relationOfFirstToSecond` is what `firstId` is to `secondId` (a friend or coworker, partner for a couple); the other side is worked out from the gender of the one it describes. Only a couple keeps a status. */
export const buildConnection = (
  firstId: string,
  secondId: string,
  kind: ConnectionKind,
  relationOfFirstToSecond: ConnectionRelation | null,
  status: CoupleStatus | null,
  since: number | null,
  genders: ConnectionGenders,
): ConnectionRecord => {
  const forward = ((): ConnectionRelation | null => {
    if (kind === 'friend') return 'friend';
    if (kind === 'work') return 'coworker';
    if (kind === 'couple') return 'partner';
    return relationOfFirstToSecond;
  })();
  const backward = ((): ConnectionRelation | null => {
    if (kind === 'family')
      return forward === null || forward === 'friend' || forward === 'coworker'
        ? null
        : reverseRelation(forward, genders[secondId] ?? null);
    return forward;
  })();
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

/** The connection as `whoId`'s page reads it: the other person and what they are to this one; null when `whoId` is neither of the two. */
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

/** A who as the inference reads them: their family word to the owner, whether they are private and whether they are a person (a private one, a pet or an organization is never part of a proposal). */
export interface ImpliedPerson {
  id: string;
  kin: { kind: KinKind } | null;
  isPrivate: boolean;
  isPerson: boolean;
}

/** One link a turn makes likely: who is what to whom, ready for `buildConnection`. */
export interface ImpliedLink {
  firstId: string;
  secondId: string;
  kind: ConnectionKind;
  relationOfFirstToSecond: ConnectionRelation;
  because: 'siblings' | 'parentsPartner' | 'siblingsPartner';
}

const PARENT_KINDS: KinKind[] = ['mother', 'father', 'parent'];
const SIBLING_KINDS: KinKind[] = ['sister', 'brother', 'sibling'];

const isPartnerLink = (connection: ImpliedConnectionState) =>
  connection.kind === 'couple' && connection.source !== 'refused';

/** A stored connection as the inference needs it: the pair and kind, whether it is a refusal, and for a couple whether it is over. */
export interface ImpliedConnectionState {
  whoIds: [string, string];
  kind: ConnectionKind;
  source: ConnectionSource;
  status: CoupleStatus | null;
}

/**
 * The family links a turn makes likely, from the owner's family words and the couples already stored: two of the owner's siblings are siblings of each other, a parent's partner who is not a parent is a stepparent, and a sibling's partner is a sibling-in-law. Only links that touch someone in `touchedIds`, only between people who are not private, and never one the pair already has or has refused (a refusal of the pair and kind is final). A past couple implies nothing. Pure: the turn asks about each once, and the device can reuse it.
 */
export const impliedConnections = (input: {
  selfId: string | null;
  people: ImpliedPerson[];
  connections: ImpliedConnectionState[];
  touchedIds: string[];
}): ImpliedLink[] => {
  const { selfId, connections } = input;
  const touched = new Set(input.touchedIds);
  const person = new Map(input.people.map((entry) => [entry.id, entry]));
  const kinOf = (id: string) => person.get(id)?.kin?.kind ?? null;
  const isOpen = (id: string) =>
    person.get(id)?.isPerson === true && person.get(id)?.isPrivate === false;
  const genderById = (id: string) =>
    genderOf({ kin: person.get(id)?.kin ?? null });
  const isDecided = (a: string, b: string, kind: ConnectionKind) =>
    connections.some(
      (connection) =>
        connection.whoIds.includes(a) &&
        connection.whoIds.includes(b) &&
        connection.kind === kind,
    );
  const partnersOf = (id: string) =>
    connections.flatMap((connection) =>
      isPartnerLink(connection) &&
      !isPastStatus(connection.status) &&
      connection.whoIds.includes(id)
        ? [
            connection.whoIds[0] === id
              ? connection.whoIds[1]
              : connection.whoIds[0],
          ]
        : [],
    );
  const siblings = input.people.filter(
    (entry) => entry.kin && SIBLING_KINDS.includes(entry.kin.kind),
  );
  const siblingPairs = siblings.flatMap((first, index) =>
    siblings.slice(index + 1).map((second): ImpliedLink => ({
      firstId: first.id,
      secondId: second.id,
      kind: 'family',
      relationOfFirstToSecond:
        SIBLING[genderById(first.id) ?? 'neutral'] ?? 'sibling',
      because: 'siblings',
    })),
  );
  const partnerLinks = (
    kinds: KinKind[],
    forms: Forms,
    because: ImpliedLink['because'],
  ): ImpliedLink[] =>
    selfId === null
      ? []
      : input.people
          .filter((entry) => entry.kin && kinds.includes(entry.kin.kind))
          .flatMap((relative) =>
            partnersOf(relative.id).flatMap((partnerId): ImpliedLink[] => {
              const partnerKin = kinOf(partnerId);
              const isAlready =
                partnerId === selfId ||
                (partnerKin !== null &&
                  [...PARENT_KINDS, ...SIBLING_KINDS].includes(partnerKin));
              return isAlready
                ? []
                : [
                    {
                      firstId: partnerId,
                      secondId: selfId,
                      kind: 'family',
                      relationOfFirstToSecond:
                        forms[genderById(partnerId) ?? 'neutral'] ??
                        forms.neutral ??
                        'sibling',
                      because,
                    },
                  ];
            }),
          );
  const candidates = [
    ...siblingPairs,
    ...partnerLinks(PARENT_KINDS, STEPPARENT, 'parentsPartner'),
    ...partnerLinks(SIBLING_KINDS, SIBLING_IN_LAW, 'siblingsPartner'),
  ];
  const links = candidates.filter(
    (link) =>
      isOpen(link.firstId) &&
      isOpen(link.secondId) &&
      (touched.has(link.firstId) || touched.has(link.secondId)) &&
      !isDecided(link.firstId, link.secondId, link.kind),
  );
  return [
    ...new Map(
      links.map((link) => [
        toConnectionId(link.firstId, link.secondId, link.kind),
        link,
      ]),
    ).values(),
  ];
};
