// Generated from src/apps/helm/utils/topicTree.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import {
  SUBTOPICS_MAX,
  TOPIC_DEPTH_MAX,
  TOPICS_LIMIT,
} from './topicLimits.js';

export interface TreeTopic {
  id: string;
  parentId: string | null;
  depth: number;
}

export interface TopicNode<T extends TreeTopic> {
  topic: T;
  children: TopicNode<T>[];
}

export type MoveRefusal =
  'missing' | 'unchanged' | 'self' | 'descendant' | 'tooDeep' | 'tooMany';

export type CreateRefusal = 'missing' | 'full' | 'tooDeep' | 'tooMany';

export interface TopicPlacement {
  id: string;
  parentId: string | null;
  depth: number;
}

const byName = (left: { name: string }, right: { name: string }) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });

const childrenOf = <T extends TreeTopic>(topics: readonly T[], id: string) =>
  topics.filter((topic) => topic.parentId === id);

/** The topic tree, each level A to Z. A topic whose parent is not in the list (one that could not be opened) stands at the top. */
export function buildTopicTree<T extends TreeTopic & { name: string }>(
  topics: readonly T[],
): TopicNode<T>[] {
  const ids = new Set(topics.map((topic) => topic.id));
  const build = (topic: T, seen: ReadonlySet<string>): TopicNode<T> => ({
    topic,
    children: childrenOf(topics, topic.id)
      .filter((child) => !seen.has(child.id))
      .sort(byName)
      .map((child) => build(child, new Set([...seen, child.id]))),
  });
  return topics
    .filter((topic) => topic.parentId === null || !ids.has(topic.parentId))
    .sort(byName)
    .map((topic) => build(topic, new Set([topic.id])));
}

/** The topic and everything under it, the topic first, parents before children. */
export function subtreeOf<T extends TreeTopic>(
  topicId: string,
  topics: readonly T[],
): T[] {
  const root = topics.find((topic) => topic.id === topicId);
  if (!root) return [];
  const walk = (level: T[], seen: ReadonlySet<string>): T[] =>
    level.length === 0
      ? []
      : [
          ...level,
          ...walk(
            level
              .flatMap((topic) => childrenOf(topics, topic.id))
              .filter((child) => !seen.has(child.id)),
            new Set([...seen, ...level.map((topic) => topic.id)]),
          ),
        ];
  return walk([root], new Set([root.id]));
}

/** How many levels the topic and what is under it span: 1 for a topic with no subtopics. */
export function subtreeHeight<T extends TreeTopic>(
  topicId: string,
  topics: readonly T[],
): number {
  const levels = (ids: string[], seen: ReadonlySet<string>): number => {
    const next = ids
      .flatMap((id) => childrenOf(topics, id).map((child) => child.id))
      .filter((id) => !seen.has(id));
    return next.length === 0
      ? 1
      : 1 + levels(next, new Set([...seen, ...next]));
  };
  return levels([topicId], new Set([topicId]));
}

/** The depth of every topic in the subtree if its root went under `parentId` (null for the top level), counted from the tree's shape below it and the new parent's stored depth. */
export function depthAfterMove<T extends TreeTopic>(
  topicId: string,
  parentId: string | null,
  topics: readonly T[],
): TopicPlacement[] {
  const parent =
    parentId === null ? null : topics.find((t) => t.id === parentId);
  const rootDepth = (parent?.depth ?? 0) + 1;
  const place = (
    level: T[],
    depth: number,
    seen: ReadonlySet<string>,
  ): TopicPlacement[] =>
    level.length === 0
      ? []
      : [
          ...level.map((topic) => ({
            id: topic.id,
            parentId: topic.id === topicId ? parentId : topic.parentId,
            depth,
          })),
          ...place(
            level
              .flatMap((topic) => childrenOf(topics, topic.id))
              .filter((child) => !seen.has(child.id)),
            depth + 1,
            new Set([...seen, ...level.map((topic) => topic.id)]),
          ),
        ];
  const root = topics.find((topic) => topic.id === topicId);
  return root ? place([root], rootDepth, new Set([topicId])) : [];
}

/** Why a topic may not go under `parentId` (null for the top level), or null when it may. */
export function moveRefusal<T extends TreeTopic>(
  topicId: string,
  parentId: string | null,
  topics: readonly T[],
): MoveRefusal | null {
  const topic = topics.find((entry) => entry.id === topicId);
  if (!topic) return 'missing';
  if (topic.parentId === parentId) return 'unchanged';
  if (parentId === null) return null;
  const parent = topics.find((entry) => entry.id === parentId);
  if (!parent) return 'missing';
  if (parentId === topicId) return 'self';
  const subtree = subtreeOf(topicId, topics);
  if (subtree.some((entry) => entry.id === parentId)) return 'descendant';
  if (parent.depth + subtreeHeight(topicId, topics) > TOPIC_DEPTH_MAX) {
    return 'tooDeep';
  }
  if (childrenOf(topics, parentId).length >= SUBTOPICS_MAX) return 'tooMany';
  return null;
}

/** The topics this one may be moved under; the top level is checked on its own. */
export function legalParents<T extends TreeTopic>(
  topicId: string,
  topics: readonly T[],
): T[] {
  return topics.filter(
    (entry) => moveRefusal(topicId, entry.id, topics) === null,
  );
}

/** Why a topic may not be made under `parentId` (null for the top level), or null when it may. */
export function createRefusal<T extends TreeTopic>(
  parentId: string | null,
  topics: readonly T[],
): CreateRefusal | null {
  if (topics.length >= TOPICS_LIMIT) return 'full';
  if (parentId === null) return null;
  const parent = topics.find((entry) => entry.id === parentId);
  if (!parent) return 'missing';
  if (parent.depth >= TOPIC_DEPTH_MAX) return 'tooDeep';
  if (childrenOf(topics, parentId).length >= SUBTOPICS_MAX) return 'tooMany';
  return null;
}

/** What deleting a topic does to what is under it: each child takes the deleted topic's parent, and every descendant is one level shallower. */
export function liftChildren<T extends TreeTopic>(
  topicId: string,
  topics: readonly T[],
): TopicPlacement[] {
  const topic = topics.find((entry) => entry.id === topicId);
  if (!topic) return [];
  return subtreeOf(topicId, topics)
    .filter((entry) => entry.id !== topicId)
    .map((entry) => ({
      id: entry.id,
      parentId: entry.parentId === topicId ? topic.parentId : entry.parentId,
      depth: entry.depth - 1,
    }));
}

/** The names from the top down to the topic: ["Car care", "Washing"]. */
export function pathOf<T extends TreeTopic & { name: string }>(
  topicId: string,
  topics: readonly T[],
): string[] {
  const walk = (id: string | null, seen: ReadonlySet<string>): string[] => {
    const topic = id === null ? undefined : topics.find((t) => t.id === id);
    return !topic || seen.has(topic.id)
      ? []
      : [...walk(topic.parentId, new Set([...seen, topic.id])), topic.name];
  };
  return walk(topicId, new Set());
}
