import {
  isPrivateInEffect,
  readEffectivePrivacy,
  readPrivacyFacts,
  type PrivacyClass,
  type PrivacyFacts,
  type PrivateParent,
} from '@apps/helm/utils/privacy';

export type PrivateKind =
  | 'task'
  | 'project'
  | 'who'
  | 'place'
  | 'note'
  | 'topic'
  | 'fact'
  | 'procedure';

export type ParentKind = 'project' | 'who' | 'place';

export const PRIVATE_COLLECTIONS: Record<PrivateKind, string> = {
  task: 'tasks',
  project: 'projects',
  who: 'who',
  place: 'places',
  note: 'notes',
  topic: 'topics',
  fact: 'facts',
  procedure: 'procedures',
};

export interface PrivacyRecord extends Partial<PrivacyFacts> {
  id: string;
  privacy?: PrivacyClass | null;
  projectId?: string | null;
  projectIds?: string[];
  whoIds?: string[];
  placeIds?: string[];
  subjectIds?: string[];
}

export type ParentIndex = Record<ParentKind, Map<string, PrivateParent>>;

interface Named extends Partial<PrivacyFacts> {
  id: string;
  name: string;
}

const toMap = (items: readonly Named[]) =>
  new Map(
    items.map((item) => [
      item.id,
      { id: item.id, name: item.name, facts: readPrivacyFacts(item) },
    ]),
  );

export const buildParentIndex = (
  projects: readonly Named[],
  who: readonly Named[],
  places: readonly Named[],
): ParentIndex => ({
  project: toMap(projects),
  who: toMap(who),
  place: toMap(places),
});

const linksOf = (
  kind: PrivateKind,
  record: PrivacyRecord,
): [ParentKind, string[]][] => {
  if (kind === 'task')
    return [
      ['project', record.projectId ? [record.projectId] : []],
      ['who', record.whoIds ?? []],
      ['place', record.placeIds ?? []],
    ];
  if (kind === 'fact')
    return [
      ['project', record.projectIds ?? []],
      ['who', [...(record.whoIds ?? []), ...(record.subjectIds ?? [])]],
      ['place', record.placeIds ?? []],
    ];
  if (kind === 'note' || kind === 'topic')
    return [['project', record.projectIds ?? []]];
  return [];
};

/** The records a thing is filed under or about, which are still there. */
export const parentsOf = (
  kind: PrivateKind,
  record: PrivacyRecord,
  index: ParentIndex,
): PrivateParent[] =>
  linksOf(kind, record).flatMap(([parentKind, ids]) =>
    ids.flatMap((id) => index[parentKind].get(id) ?? []),
  );

/** The class a record is in right now, worked out from the store so a child whose rewrite has not landed still reads as private. */
export const readRecordPrivacy = (
  kind: PrivateKind,
  record: PrivacyRecord,
  index: ParentIndex,
): PrivacyClass =>
  record.privacy === 'private'
    ? 'private'
    : readEffectivePrivacy(
        readPrivacyFacts(record),
        parentsOf(kind, record, index).map((parent) => parent.facts),
      );

export interface Child {
  kind: PrivateKind;
  record: PrivacyRecord;
}

/** Children whose stored class differs from the one their own mark and parents give. */
export const planCascade = (children: readonly Child[], index: ParentIndex) =>
  children.flatMap(({ kind, record }) => {
    const next = readEffectivePrivacy(
      readPrivacyFacts(record),
      parentsOf(kind, record, index).map((parent) => parent.facts),
    );
    return next === (record.privacy ?? 'ordinary')
      ? []
      : [{ kind, id: record.id, privacy: next }];
  });

/** The children that are private only through one parent about to go: each is given its own mark, so deleting the parent never makes a private thing ordinary. */
export const planKeepOnLeaving = (
  parentKind: ParentKind,
  parentId: string,
  children: readonly Child[],
  index: ParentIndex,
) =>
  children.flatMap(({ kind, record }) => {
    const isLinked = linksOf(kind, record).some(
      ([linkKind, ids]) => linkKind === parentKind && ids.includes(parentId),
    );
    const others = parentsOf(kind, record, index)
      .filter((parent) => parent !== index[parentKind].get(parentId))
      .map((parent) => parent.facts);
    const facts = readPrivacyFacts(record);
    const isOnlyThrough =
      isLinked &&
      !isPrivateInEffect(facts, others) &&
      isPrivateInEffect(facts, [
        index[parentKind].get(parentId)?.facts ?? facts,
      ]);
    return isOnlyThrough ? [{ kind, id: record.id }] : [];
  });
