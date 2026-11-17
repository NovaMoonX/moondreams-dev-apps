import type { Firestore } from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  COMMON_WORDS,
  createOptionMatcher,
  toComparable,
} from '../../../vendor/optionMatchUtils.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import { connectorLabel } from '../syncedCopies.js';
import { readGrouping, type GroupingRecord } from './grouping.js';

export const MAX_RELATED_THINGS = 6;
const MAX_SOURCES_SHOWN = 6;
const MIN_WORD = 3;

export interface ContextRelatedThing {
  name: string;
  state: 'grouped' | 'suggested';
  sources: { app: string | null; kind: string; title: string | null }[];
}

const matcher = createOptionMatcher<string>({
  foldPlurals: true,
  typos: false,
});

/** Each word once: the matcher picks neither of two equal options. */
const wordsOf = (text: string) => [
  ...new Set(
    toComparable(text, true)
      .split(' ')
      .filter((word) => word.length >= MIN_WORD && !COMMON_WORDS.has(word)),
  ),
];

interface OpenedGrouping {
  grouping: GroupingRecord;
  name: string | null;
  titles: Record<string, string>;
}

/** Up to six stored groupings the turn's words touch. */
export function pickRelatedThings(
  opened: readonly OpenedGrouping[],
  text: string,
  isMasked: boolean,
): ContextRelatedThing[] {
  const turnWords = wordsOf(text);
  return opened
    .filter(
      ({ grouping, name }) =>
        name !== null &&
        !(isMasked && grouping.privacy === 'private') &&
        (grouping.state === 'filed' ||
          grouping.state === 'groupedByYou' ||
          grouping.state === 'proposed'),
    )
    .filter(({ name, titles }) => {
      const words = wordsOf([name ?? '', ...Object.values(titles)].join(' '));
      return turnWords.some((word) => matcher.match(word, words) !== null);
    })
    .sort(
      (left, right) =>
        Number(left.grouping.state === 'proposed') -
          Number(right.grouping.state === 'proposed') ||
        right.grouping.updatedAt - left.grouping.updatedAt ||
        left.grouping.id.localeCompare(right.grouping.id),
    )
    .slice(0, MAX_RELATED_THINGS)
    .map(({ grouping, name, titles }) => ({
      name: name ?? '',
      state: grouping.state === 'proposed' ? 'suggested' : 'grouped',
      sources: grouping.sources.slice(0, MAX_SOURCES_SHOWN).map((source) => ({
        app: source.app === null ? null : connectorLabel(source.app),
        kind: source.kind,
        title: titles[source.key] ?? null,
      })),
    }));
}

const toText = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

const openParentName = (
  key: HelmKey,
  parent: { exists: boolean; get: (field: string) => unknown },
) => {
  if (!parent.exists || parent.get('privacy') === 'private') return null;
  try {
    return toText(openForHelm(key, parent.get('sealed') as SealedPayload).name);
  } catch {
    return null;
  }
};

export async function readContextRelatedThings(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  text: string,
  isMasked: boolean,
): Promise<ContextRelatedThing[]> {
  const snap = await firestore
    .collection(`${base}/groupings`)
    .where('state', 'in', ['filed', 'groupedByYou', 'proposed'])
    .limit(200)
    .get();
  const groupings = snap.docs.flatMap((doc) => {
    const grouping = readGrouping(doc.id, doc.data());
    try {
      const words = openForHelm(key, doc.get('sealed') as SealedPayload);
      const titles = (words.titles ?? {}) as Record<string, unknown>;
      return grouping
        ? [
            {
              grouping,
              proposedTitle: toText(words.proposedTitle),
              titles: Object.fromEntries(
                Object.entries(titles).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
                ),
              ),
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
  const parents = await Promise.all(
    groupings.map(({ grouping }) =>
      grouping.parentId === null
        ? null
        : firestore
            .doc(
              `${base}/${grouping.parentKind === 'project' ? 'projects' : 'topics'}/${grouping.parentId}`,
            )
            .get(),
    ),
  );
  return pickRelatedThings(
    groupings.map(({ grouping, proposedTitle, titles }, at) => {
      const parent = parents[at];
      const parentName = parent ? openParentName(key, parent) : null;
      return {
        grouping,
        name: parentName ?? proposedTitle,
        titles,
      };
    }),
    text,
    isMasked,
  );
}
