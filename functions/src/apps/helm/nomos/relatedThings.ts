import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  COMMON_WORDS,
  createOptionMatcher,
  toComparable,
} from '../../../vendor/optionMatchUtils.js';
import { toPrivateMark } from './contextPeople.js';
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
  proposedTitle: string | null;
  titles: Record<string, string>;
}

/** The stored groupings the turn's words touch, newest first and settled ones before proposals. */
export function matchRelatedThings(
  opened: readonly OpenedGrouping[],
  text: string,
  isMasked: boolean,
): OpenedGrouping[] {
  const turnWords = wordsOf(text);
  return opened
    .filter(
      ({ grouping }) =>
        !(isMasked && grouping.privacy === 'private') &&
        (grouping.state === 'filed' ||
          grouping.state === 'groupedByYou' ||
          grouping.state === 'proposed'),
    )
    .filter(({ proposedTitle, titles }) => {
      const words = wordsOf(
        [proposedTitle ?? '', ...Object.values(titles)].join(' '),
      );
      return turnWords.some((word) => matcher.match(word, words) !== null);
    })
    .sort(
      (left, right) =>
        Number(left.grouping.state === 'proposed') -
          Number(right.grouping.state === 'proposed') ||
        right.grouping.updatedAt - left.grouping.updatedAt ||
        left.grouping.id.localeCompare(right.grouping.id),
    );
}

/** Up to six things with a name; a masked turn sends no source title, and a source private now is left out. */
export function pickRelatedThings(
  resolved: readonly (OpenedGrouping & {
    name: string | null;
    hiddenKeys: ReadonlySet<string>;
  })[],
  isMasked: boolean,
): ContextRelatedThing[] {
  return resolved
    .filter(({ name }) => name !== null)
    .slice(0, MAX_RELATED_THINGS)
    .map(({ grouping, name, titles, hiddenKeys }) => ({
      name: name ?? '',
      state: grouping.state === 'proposed' ? 'suggested' : 'grouped',
      sources: grouping.sources
        .filter((source) => !hiddenKeys.has(source.key))
        .slice(0, MAX_SOURCES_SHOWN)
        .map((source) => ({
          app: source.app === null ? null : connectorLabel(source.app),
          kind: source.kind,
          title: isMasked ? null : (titles[source.key] ?? null),
        })),
    }));
}

const toText = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

type Snap = {
  exists: boolean;
  id: string;
  data: () => DocumentData | undefined;
};

const openParentName = (key: HelmKey, parent: Snap) => {
  const data = parent.data();
  if (!parent.exists || !data || data.privacy === 'private') return null;
  try {
    return toText(openForHelm(key, data.sealed as SealedPayload).name);
  } catch {
    return null;
  }
};

const isPrivateNow = (key: HelmKey, source: Snap) => {
  const data = source.data();
  if (!source.exists || !data) return true;
  if (data.privacy === 'private' || data.isCare === true) return true;
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    return words.isCare === true || toPrivateMark(words.privateMark) !== null;
  } catch {
    return true;
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
  const opened = snap.docs.flatMap((doc): OpenedGrouping[] => {
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
  const matched = matchRelatedThings(opened, text, isMasked).slice(
    0,
    MAX_RELATED_THINGS * 2,
  );
  if (matched.length === 0) return [];
  const parentRefs = matched.flatMap(({ grouping }) =>
    grouping.parentId === null
      ? []
      : [
          firestore.doc(
            `${base}/${grouping.parentKind === 'project' ? 'projects' : 'topics'}/${grouping.parentId}`,
          ),
        ],
  );
  const sourceKeys = [
    ...new Set(
      matched.flatMap(({ grouping }) =>
        grouping.sources
          .slice(0, MAX_SOURCES_SHOWN)
          .map((source) => source.key),
      ),
    ),
  ];
  const refs = [
    ...parentRefs,
    ...sourceKeys.map((sourceKey) => firestore.doc(`${base}/${sourceKey}`)),
  ];
  const snaps = await firestore.getAll(...refs);
  const parents = new Map(
    snaps
      .slice(0, parentRefs.length)
      .map((parent) => [parent.ref.path, parent]),
  );
  const hidden = new Set(
    snaps
      .slice(parentRefs.length)
      .flatMap((source, at) =>
        isPrivateNow(key, source) ? [sourceKeys[at]] : [],
      ),
  );
  return pickRelatedThings(
    matched.map((item) => {
      const { grouping, proposedTitle } = item;
      const parent =
        grouping.parentId === null
          ? undefined
          : parents.get(
              `${base}/${grouping.parentKind === 'project' ? 'projects' : 'topics'}/${grouping.parentId}`,
            );
      return {
        ...item,
        name: (parent ? openParentName(key, parent) : null) ?? proposedTitle,
        hiddenKeys: hidden,
      };
    }),
    isMasked,
  );
}
