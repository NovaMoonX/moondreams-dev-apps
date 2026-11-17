import {
  COMMON_WORDS,
  createOptionMatcher,
  toComparable,
} from '../../../../vendor/optionMatchUtils.js';
import {
  GROUPING_BACKOFF_WEEKS,
  GROUPING_LIMITS,
  isNewEvidence,
  toGroupingId,
  type GroupingEvidence,
  type GroupingMeta,
  type GroupingRecord,
} from '../../nomos/grouping.js';
import type { RelateAnswer, NormalizedRelate } from './normalizeRelate.js';
import type {
  RelateIndex,
  RelateItem,
  RelateProject,
  RelateWorld,
} from './buildRelateRequest.js';

const DAY_MS = 86_400_000;
const NEAR_DAYS = 14;
const MIN_WORD = 3;

const matcher = createOptionMatcher<string>({
  foldPlurals: true,
  typos: false,
});

export interface PlannedLink {
  collection: 'tasks' | 'notes' | 'topics';
  id: string;
  projectId: string;
  previous: string[];
}

export interface PlannedGrouping {
  id: string;
  isNew: boolean;
  meta: GroupingMeta;
  sealed: {
    proposedTitle: string | null;
    emoji: string | null;
    titles: Record<string, string>;
  };
  links: PlannedLink[];
}

export type RelateRefusal =
  | 'unknownAlias'
  | 'tooFew'
  | 'singlePlace'
  | 'alreadyGrouped'
  | 'noTitle'
  | 'unchanged'
  | 'tooMany'
  | 'full';

export interface RelatePlan {
  groupings: PlannedGrouping[];
  refused: RelateRefusal[];
}

interface PlanInput {
  uid: string;
  now: number;
  dayKey: string;
  world: RelateWorld;
  index: RelateIndex;
  answer: NormalizedRelate;
  executedIds: ReadonlySet<string>;
}

/** Each word once: the matcher picks neither of two equal options. */
const wordsOf = (title: string | null) =>
  title === null
    ? []
    : [
        ...new Set(
          toComparable(title, true)
            .split(' ')
            .filter(
              (word) => word.length >= MIN_WORD && !COMMON_WORDS.has(word),
            ),
        ),
      ];

const sharesWord = (left: string | null, right: string | null) => {
  const other = wordsOf(right);
  return wordsOf(left).some((word) => matcher.match(word, other) !== null);
};

const isNear = (left: number | null, right: number | null) =>
  left !== null &&
  right !== null &&
  Math.abs(left - right) <= NEAR_DAYS * DAY_MS;

const passesCode = (item: RelateItem, project: RelateProject) =>
  item.whoIds.some((id) => project.whoIds.includes(id)) ||
  sharesWord(item.title, project.name) ||
  isNear(item.date, project.date);

const pairs = <T>(items: T[]) =>
  items.flatMap((left, at) =>
    items.slice(at + 1).map((right) => [left, right] as const),
  );

/** What ties the things together, found by code; the model's own list is a fallback. */
const findEvidence = (items: RelateItem[]): GroupingEvidence[] => {
  const shared = (pick: (item: RelateItem) => string[]) =>
    pairs(items).some(([left, right]) =>
      pick(left).some((id) => pick(right).includes(id)),
    );
  return [
    ...(shared((item) => item.whoIds) ? (['sharedWho'] as const) : []),
    ...(shared((item) => item.projectIds) ? (['sharedProject'] as const) : []),
    ...(pairs(items).some(([left, right]) => isNear(left.date, right.date))
      ? (['datedEvent'] as const)
      : []),
    ...(pairs(items).some(([left, right]) =>
      sharesWord(left.title, right.title),
    )
      ? (['titleMatch'] as const)
      : []),
  ];
};

const isEnded = (grouping: GroupingRecord) =>
  grouping.state === 'notNow' &&
  grouping.declineCount > GROUPING_BACKOFF_WEEKS.length &&
  grouping.nextOfferAfter === null;

const toSource = (item: RelateItem) => ({
  key: item.key,
  app: item.app,
  kind: item.kind,
});

/** The groupings a night writes, held to the bar; a proposal writes no link. Pure. */
export function planRelate(input: PlanInput): RelatePlan {
  const { uid, now, dayKey, world, index, answer, executedIds } = input;
  const byKey = new Map(world.items.map((item) => [item.key, item]));
  const answered = new Set(
    world.groupings
      .filter(
        (grouping) =>
          grouping.state === 'filed' || grouping.state === 'groupedByYou',
      )
      .flatMap((grouping) => grouping.sourceKeys),
  );
  const planOne = (
    entry: RelateAnswer,
    taken: ReadonlySet<string>,
    count: number,
  ): PlannedGrouping | RelateRefusal => {
    const resolved = entry.sources.map((alias) => index.sources.get(alias));
    if (resolved.some((key) => key === undefined || key === null))
      return 'unknownAlias';
    const parentAlias = entry.parent;
    const parentFound =
      parentAlias === null
        ? null
        : parentAlias.startsWith('p')
          ? { kind: 'project' as const, id: index.projects.get(parentAlias) }
          : { kind: 'topic' as const, id: index.topics.get(parentAlias) };
    if (parentFound && !parentFound.id) return 'unknownAlias';
    const parentKey =
      parentFound?.kind === 'topic' ? `topics/${parentFound.id}` : null;
    if (parentKey !== null && !byKey.has(parentKey)) return 'unknownAlias';
    if (
      parentFound?.kind === 'project' &&
      !world.projects.has(parentFound.id ?? '')
    )
      return 'unknownAlias';
    const keys = [...new Set(resolved as string[])]
      .filter((key) => key !== parentKey)
      .sort();
    const items = keys.flatMap((key) => byKey.get(key) ?? []);
    if (items.length !== keys.length) return 'unknownAlias';
    if (keys.length < GROUPING_LIMITS.minSources) return 'tooFew';
    if (new Set(items.map((item) => item.app ?? 'helm')).size < 2)
      return 'singlePlace';
    if (keys.some((key) => answered.has(key) || taken.has(key)))
      return 'alreadyGrouped';

    const hasTask = items.some((item) => item.collection === 'tasks');
    const parentKind =
      parentFound?.kind === 'project' || hasTask
        ? 'project'
        : parentFound
          ? 'topic'
          : entry.parentKind;
    const parentId =
      parentFound && parentFound.kind === parentKind
        ? (parentFound.id ?? null)
        : null;
    const title = entry.proposedTitle;
    if (parentId === null && title === null) return 'noTitle';

    const overlapping = world.groupings
      .filter((grouping) =>
        grouping.sourceKeys.some((key) => keys.includes(key)),
      )
      .sort(
        (left, right) =>
          right.sourceKeys.filter((key) => keys.includes(key)).length -
            left.sourceKeys.filter((key) => keys.includes(key)).length ||
          left.id.localeCompare(right.id),
      )[0];
    if (overlapping && !isNewEvidence(overlapping, keys)) return 'unchanged';
    const allKeys = [
      ...new Set([...(overlapping?.sourceKeys ?? []), ...keys]),
    ].sort();
    if (allKeys.length > GROUPING_LIMITS.maxSources) return 'tooMany';
    if (!overlapping && count >= GROUPING_LIMITS.records) return 'full';
    if (
      allKeys.some(
        (key) =>
          !byKey.has(key) &&
          !overlapping?.sources.some((source) => source.key === key),
      )
    )
      return 'unknownAlias';

    const id = overlapping?.id ?? toGroupingId(uid, allKeys);
    const project =
      parentKind === 'project' && parentId !== null
        ? world.projects.get(parentId)
        : undefined;
    const needsLink = items.filter((item) =>
      item.collection === 'synced'
        ? true
        : !item.projectIds.includes(project?.id ?? ''),
    );
    const isPrivate =
      items.some((item) => item.isPrivate) || project?.isPrivate === true;
    const isQuiet =
      entry.confidence === 'certain' &&
      project !== undefined &&
      !isPrivate &&
      (overlapping === undefined || overlapping.state === 'proposed') &&
      !executedIds.has(id) &&
      needsLink.length > 0 &&
      needsLink.every(
        (item) =>
          passesCode(item, project) &&
          (item.collection === 'synced' || item.projectIds.length === 0),
      );
    const reopened =
      overlapping !== undefined &&
      (overlapping.state === 'notRelated' || isEnded(overlapping));
    const holds =
      overlapping !== undefined && overlapping.state === 'notNow' && !reopened;
    const state = isQuiet ? 'filed' : holds ? 'notNow' : 'proposed';
    const fresh = overlapping === undefined || reopened;
    const evidence = findEvidence(items);
    const previous = world.groupingWords.get(id);
    const words = Object.fromEntries([
      ...Object.entries(previous?.titles ?? {}).filter(([key]) =>
        allKeys.includes(key),
      ),
      ...items.flatMap((item): [string, string][] =>
        item.title === null ? [] : [[item.key, item.title]],
      ),
    ]);
    const links = isQuiet
      ? needsLink.flatMap((item): PlannedLink[] =>
          item.collection === 'synced' || !project
            ? []
            : [
                {
                  collection: item.collection,
                  id: item.id,
                  projectId: project.id,
                  previous: [],
                },
              ],
        )
      : [];
    return {
      id,
      isNew: overlapping === undefined,
      links,
      sealed: {
        proposedTitle: parentId === null ? title : null,
        emoji: previous?.emoji ?? null,
        titles: words,
      },
      meta: {
        parentKind,
        parentId,
        sourceKeys: allKeys,
        sources: allKeys.flatMap((key) => {
          const item = byKey.get(key);
          const kept = overlapping?.sources.find(
            (source) => source.key === key,
          );
          return item ? [toSource(item)] : kept ? [kept] : [];
        }),
        linkedKeys: isQuiet ? needsLink.map((item) => item.key) : [],
        state,
        confidence: isQuiet
          ? 'certain'
          : entry.confidence === 'certain'
            ? 'likely'
            : entry.confidence,
        evidence: evidence.length > 0 ? evidence : entry.evidence,
        declineCount: holds ? (overlapping?.declineCount ?? 0) : 0,
        nextOfferAfter: holds ? (overlapping?.nextOfferAfter ?? null) : null,
        answeredAt: holds ? (overlapping?.answeredAt ?? null) : null,
        toldAt: null,
        executionId: isQuiet
          ? `relate-${id}`
          : (overlapping?.executionId ?? null),
        dayKey,
        proposedAt: fresh ? now : (overlapping?.proposedAt ?? now),
        updatedAt: now,
        privacy: isPrivate ? 'private' : 'ordinary',
        createdBy: 'nomos',
      },
    };
  };
  return answer.groupings.reduce<{
    plan: RelatePlan;
    taken: ReadonlySet<string>;
  }>(
    ({ plan, taken }, entry) => {
      const planned = planOne(
        entry,
        taken,
        world.groupings.length + plan.groupings.filter((g) => g.isNew).length,
      );
      return typeof planned === 'string'
        ? { plan: { ...plan, refused: [...plan.refused, planned] }, taken }
        : {
            plan: { ...plan, groupings: [...plan.groupings, planned] },
            taken: new Set([...taken, ...planned.meta.sourceKeys]),
          };
    },
    { plan: { groupings: [], refused: [] }, taken: new Set() },
  ).plan;
}
