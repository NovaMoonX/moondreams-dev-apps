import type { ElementDefinition } from 'cytoscape';

import { formatDate, formatRelativeDayUTC } from '@/utils/formatUtils';
import { daysUntil, nextYearlyOccurrence } from '@/utils/yearlyDateUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  CONNECTION_KINDS,
  isPastStatus,
  readFromSide,
  toConnectionId,
  type InferredLink,
} from '@apps/helm/engine/connections';
import type {
  ConnectionKind,
  OpenConnection,
  OpenTask,
  OpenWho,
} from '@apps/helm/types';
import {
  toBecauseLine,
  toConnectionSentence,
  toFiguredSide,
  toSideLine,
} from '@apps/helm/utils/connectionText';
import type { IndexEntry } from '@apps/helm/utils/keyDateIndex';
import { toKeyDateTitleWord } from '@apps/helm/utils/keyDateText';

export type MapFilter = 'close' | 'family' | 'everyone';

/** More people than this and the map opens on Close only. */
export const MAP_CROWDED_FROM = 30;

/** How many readable people the crowded default counts: not passing, not the owner. */
export const countMapPeople = (
  people: readonly MapWho[],
  selfId: string | null,
): number =>
  people.filter(
    (who) =>
      who.kind === 'person' &&
      !who.isUnreadable &&
      who.tier !== 'passing' &&
      !who.isSelf &&
      who.id !== selfId,
  ).length;

export const OWNER_FALLBACK_ID = 'owner';

const OWNER_LEVEL = 1_000_000;
const TIER_ORDER = { close: 0, regular: 1, passing: 2 } as const;

const ringCapacity = (ring: number) => 8 + 6 * ring;

/** Levels for the shown people, each ring on its own level below the owner: tiers close then regular, pets and organizations last, the most linked first so they sit near the middle. */
const toRingLevels = (
  people: readonly MapWho[],
  degreeOf: (id: string) => number,
): Map<string, number> =>
  new Map(
    [...people]
      .sort(
        (a, b) =>
          Number(a.kind !== 'person') - Number(b.kind !== 'person') ||
          TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
          degreeOf(b.id) - degreeOf(a.id) ||
          a.name.localeCompare(b.name),
      )
      .reduce<{ ring: number; filled: number; entries: [string, number][] }>(
        (state, who) => {
          const isFull = state.filled >= ringCapacity(state.ring);
          const ring = isFull ? state.ring + 1 : state.ring;
          return {
            ring,
            filled: isFull ? 1 : state.filled + 1,
            entries: [...state.entries, [who.id, OWNER_LEVEL - 1 - ring]],
          };
        },
        { ring: 0, filled: 0, entries: [] },
      ).entries,
  );

type MapWho = Pick<
  OpenWho,
  'id' | 'kind' | 'name' | 'tier' | 'isSelf' | 'isUnreadable' | 'photoMediaId'
>;

type MapConnection = Pick<
  OpenConnection,
  | 'whoIds'
  | 'kind'
  | 'status'
  | 'fromFirst'
  | 'fromSecond'
  | 'since'
  | 'lastEditedAt'
>;

interface MapInput {
  people: readonly MapWho[];
  /** Shown connections only: no refused proposal, none that would not open. */
  connections: readonly MapConnection[];
  /** Worked-out links under both people's ids. */
  figuredOut: ReadonlyMap<string, InferredLink[]>;
  selfId: string | null;
  /** Nobody is looking: a private person is drawn without name or photo. */
  isMasked: boolean;
  /** Who are private in effect (their own mark, a care mark or a private parent). */
  privateIds: ReadonlySet<string>;
}

interface MapLink {
  id: string;
  source: string;
  target: string;
  kind: ConnectionKind;
  isFigured: boolean;
  isPast: boolean;
}

const toLinks = (input: MapInput): MapLink[] => {
  const saved = [
    ...new Map(
      input.connections.map((connection) => {
        const id = `${connection.whoIds[0]}_${connection.whoIds[1]}_${connection.kind}`;
        return [
          id,
          {
            id,
            source: connection.whoIds[0],
            target: connection.whoIds[1],
            kind: connection.kind,
            isFigured: false,
            isPast:
              connection.kind === 'couple' && isPastStatus(connection.status),
          },
        ] as const;
      }),
    ).values(),
  ];
  const figured = [
    ...new Map(
      [...input.figuredOut.values()]
        .flat()
        .map((link) => [`${link.firstId}_${link.secondId}`, link]),
    ).values(),
  ];
  return [
    ...saved,
    ...figured.map((link) => ({
      id: `${link.firstId}_${link.secondId}_figured`,
      source: link.firstId,
      target: link.secondId,
      kind: 'family' as const,
      isFigured: true,
      isPast: false,
    })),
  ];
};

const isFamilyLink = (link: MapLink) =>
  link.kind === 'family' || link.kind === 'couple';

const readOwnerId = (input: MapInput) =>
  input.people.find((who) => !who.isUnreadable && who.isSelf)?.id ??
  input.selfId ??
  OWNER_FALLBACK_ID;

const hidesName = (input: MapInput, id: string, ownerId: string) =>
  input.isMasked && id !== ownerId && input.privateIds.has(id);

const initialOf = (name: string) =>
  Array.from(name.trim())[0]?.toUpperCase() ?? '';

/** The circle as network elements; a private person's name, initial and photo stay out while `isMasked`. */
export const toCircleElements = (
  input: MapInput & {
    filter: MapFilter;
    /** Opened photo URLs by media id. */
    photoUrls: Readonly<Record<string, string>>;
  },
): ElementDefinition[] => {
  const { filter, photoUrls } = input;
  const ownerId = readOwnerId(input);
  const links = toLinks(input);
  const familyIds = new Set(
    links.filter(isFamilyLink).flatMap((link) => [link.source, link.target]),
  );
  const readable = input.people.filter((who) => !who.isUnreadable);
  const isChosen = (who: MapWho) =>
    who.kind === 'person' &&
    who.id !== ownerId &&
    who.tier !== 'passing' &&
    (filter === 'everyone' ||
      (filter === 'close' ? who.tier === 'close' : familyIds.has(who.id)));
  const chosenIds = new Set([
    ownerId,
    ...readable.filter(isChosen).map((who) => who.id),
  ]);
  const isAllowed = (link: MapLink) =>
    filter !== 'family' || isFamilyLink(link);
  const linked = readable.filter(
    (who) =>
      who.kind !== 'person' &&
      links.some(
        (link) =>
          isAllowed(link) &&
          ((link.source === who.id && chosenIds.has(link.target)) ||
            (link.target === who.id && chosenIds.has(link.source))),
      ),
  );
  const shownIds = new Set([...chosenIds, ...linked.map((who) => who.id)]);
  const owner = readable.find((who) => who.id === ownerId);

  const toNode = (who: MapWho, level: number): ElementDefinition => {
    const isOwner = who.id === ownerId;
    const isHidden = hidesName(input, who.id, ownerId);
    return {
      group: 'nodes',
      data: {
        id: who.id,
        label: isOwner
          ? HELM_COPY.mapYou
          : isHidden
            ? HELM_COPY.mapPrivateName
            : who.name,
        initial: isHidden ? '' : initialOf(who.name),
        isOwner,
        isPrivate: isHidden,
        level: isOwner ? OWNER_LEVEL : level,
        photo:
          isHidden || who.photoMediaId === null
            ? null
            : (photoUrls[who.photoMediaId] ?? null),
      },
    };
  };

  const edges = links
    .filter(
      (link) =>
        isAllowed(link) &&
        shownIds.has(link.source) &&
        shownIds.has(link.target),
    )
    .map((link): ElementDefinition => ({
      group: 'edges',
      data: {
        id: link.id,
        source: link.source,
        target: link.target,
        kind: link.kind,
        isFigured: link.isFigured,
        isPast: link.isPast,
      },
    }));
  const degrees = edges.flatMap((edge) => [
    String(edge.data.source),
    String(edge.data.target),
  ]);
  const levels = toRingLevels(
    readable.filter((who) => who.id !== ownerId && shownIds.has(who.id)),
    (id) => degrees.filter((end) => end === id).length,
  );
  const nodes = [
    owner
      ? toNode(owner, OWNER_LEVEL)
      : {
          group: 'nodes' as const,
          data: {
            id: ownerId,
            label: HELM_COPY.mapYou,
            initial: initialOf(HELM_COPY.mapYou),
            isOwner: true,
            isPrivate: false,
            level: OWNER_LEVEL,
            photo: null,
          },
        },
    ...readable
      .filter((who) => who.id !== ownerId && shownIds.has(who.id))
      .map((who) => toNode(who, levels.get(who.id) ?? OWNER_LEVEL - 1)),
  ];
  return [...nodes, ...edges];
};

/** Which nodes (with their tier level) and edges are drawn, so a tier change counts as a different set. */
export const toElementSignature = (
  elements: readonly ElementDefinition[],
): string =>
  elements
    .map((element) =>
      element.group === 'nodes'
        ? `${String(element.data.id)}:${String(element.data.level)}`
        : String(element.data.id),
    )
    .sort()
    .join('|');

/** True while the canvas must be covered: nobody is looking and a private person is on it. */
export const isMapCovered = (input: {
  isMasked: boolean;
  privateIds: ReadonlySet<string>;
  elements: readonly ElementDefinition[];
}): boolean =>
  input.isMasked &&
  input.elements.some(
    (element) =>
      element.group === 'nodes' &&
      input.privateIds.has(String(element.data.id)),
  );

export interface MapCard {
  title: string;
  isOwner: boolean;
  /** What they are to the owner; empty when there is no link or the name is hidden. */
  line: string;
  /** How many saved connections they have; null when hidden. */
  count: number | null;
}

/** The small card a tapped person opens: name, what they are to the owner and how many connections. A private person's stays neutral while `isMasked`. */
export const toCircleCard = (input: MapInput & { id: string }): MapCard => {
  const ownerId = readOwnerId(input);
  const who = input.people.find((entry) => entry.id === input.id);
  const isOwner = input.id === ownerId;
  if (hidesName(input, input.id, ownerId)) {
    return {
      title: HELM_COPY.mapPrivateName,
      isOwner: false,
      line: '',
      count: null,
    };
  }
  const own = input.connections
    .filter(
      (connection) =>
        connection.whoIds.includes(input.id) &&
        connection.whoIds.includes(ownerId),
    )
    .sort(
      (a, b) =>
        CONNECTION_KINDS.indexOf(a.kind) - CONNECTION_KINDS.indexOf(b.kind),
    )[0];
  const side = own && readFromSide(own, ownerId);
  const figured = (input.figuredOut.get(input.id) ?? []).find(
    (link) => link.firstId === ownerId || link.secondId === ownerId,
  );
  const line =
    isOwner || !who
      ? ''
      : own && side
        ? toSideLine(own.kind, side, null)
        : figured
          ? `${toSideLine('family', toFiguredSide(figured, ownerId), null)} ${HELM_COPY.figuredSuffix}`
          : '';
  return {
    title: isOwner ? HELM_COPY.mapYou : (who?.name ?? ''),
    isOwner,
    line,
    count: input.connections.filter((connection) =>
      connection.whoIds.includes(input.id),
    ).length,
  };
};

export interface MapLine {
  /** What the line means, in words. */
  sentence: string;
  /** The date or reason that goes with it; null when it has none. */
  note: string | null;
  isGuess: boolean;
  /** The saved connection's id; null for a worked-out line. */
  connectionId: string | null;
  /** Who the line joins, in the order of the edge. */
  whoIds: [string, string];
}

/** What a line on the map says: "Dana is Sam's mother." (a couple's since is inside it) and, for a past couple, when it was last changed; a worked-out line says it is a guess and why. Null when the line is not on the map. */
export const toCircleLine = (
  input: MapInput & { id: string },
): MapLine | null => {
  const ownerId = readOwnerId(input);
  const nameOf = (id: string) =>
    hidesName(input, id, ownerId)
      ? HELM_COPY.mapPrivateName
      : (input.people.find((who) => who.id === id)?.name ?? '');
  const toPair = (firstId: string, secondId: string) =>
    secondId === ownerId
      ? { subjectId: secondId, otherId: firstId }
      : { subjectId: firstId, otherId: secondId };
  const saved = input.connections.find(
    (connection) =>
      toConnectionId(
        connection.whoIds[0],
        connection.whoIds[1],
        connection.kind,
      ) === input.id,
  );
  if (saved) {
    const { subjectId, otherId } = toPair(saved.whoIds[0], saved.whoIds[1]);
    const side = readFromSide(saved, subjectId);
    if (!side) return null;
    const isPast = saved.kind === 'couple' && isPastStatus(saved.status);
    return {
      sentence: toConnectionSentence(
        saved.kind,
        side,
        nameOf(otherId),
        subjectId === ownerId ? null : nameOf(subjectId),
      ),
      note:
        isPast && saved.lastEditedAt
          ? HELM_COPY.mapLineUpdated(formatDate(saved.lastEditedAt))
          : null,
      isGuess: false,
      connectionId: input.id,
      whoIds: saved.whoIds,
    };
  }
  const figured = [...input.figuredOut.values()]
    .flat()
    .find((link) => `${link.firstId}_${link.secondId}_figured` === input.id);
  if (!figured) return null;
  const { subjectId, otherId } = toPair(figured.firstId, figured.secondId);
  return {
    sentence: `${toConnectionSentence(
      'family',
      toFiguredSide(figured, subjectId),
      nameOf(otherId),
      subjectId === ownerId ? null : nameOf(subjectId),
    )} ${HELM_COPY.mapLineGuess}`,
    note: toBecauseLine(figured, ownerId, nameOf),
    isGuess: true,
    connectionId: null,
    whoIds: [figured.firstId, figured.secondId],
  };
};

const SUMMARY_NAMES = 3;
const KEY_DATE_NEAR_DAYS = 30;

/** The lines a tapped person's card adds under what they are: who they are linked to here, the next dated task with them or when they last came up, and a key date within a month. Nothing for the owner or a hidden private person. */
export const toCircleSummary = (
  input: MapInput & {
    id: string;
    /** `isPrivate` is the task's own class in effect, so a private task's title stays off the card while nobody is looking. */
    tasks: readonly (Pick<
      OpenTask,
      'title' | 'whoIds' | 'due' | 'status' | 'isUnreadable'
    > & { isPrivate: boolean })[];
    keyDates: readonly IndexEntry[];
    todayKey: string;
    lastMentionedAt: number | null;
  },
): string[] => {
  const ownerId = readOwnerId(input);
  if (input.id === ownerId || hidesName(input, input.id, ownerId)) return [];
  const otherNames = [
    ...new Set(
      input.connections
        .filter((connection) => connection.whoIds.includes(input.id))
        .map((connection) => connection.whoIds.find((id) => id !== input.id)),
    ),
  ].flatMap((id) => {
    const other = input.people.find((who) => who.id === id);
    return id === undefined || id === ownerId || !other || other.isUnreadable
      ? []
      : [hidesName(input, id, ownerId) ? HELM_COPY.mapPrivateName : other.name];
  });
  const linked =
    otherNames.length === 0
      ? []
      : [
          HELM_COPY.mapCardLinked(
            otherNames.slice(0, SUMMARY_NAMES),
            otherNames.length - SUMMARY_NAMES,
          ),
        ];

  const todayAt = Date.parse(input.todayKey);
  const toDueAt = (due: NonNullable<OpenTask['due']>) =>
    due.kind === 'day' ? due.date : due.at;
  const next = input.tasks
    .flatMap((task) =>
      task.status === 'open' &&
      !task.isUnreadable &&
      !(input.isMasked && task.isPrivate) &&
      task.due !== null &&
      task.whoIds.includes(input.id)
        ? [{ title: task.title, due: task.due }]
        : [],
    )
    .sort((a, b) => toDueAt(a.due) - toDueAt(b.due))[0];
  const nextLine = next
    ? [
        HELM_COPY.mapCardNext(
          next.title,
          next.due.kind === 'day'
            ? formatRelativeDayUTC(next.due.date, todayAt)
            : formatDate(next.due.at),
        ),
      ]
    : input.lastMentionedAt !== null
      ? [HELM_COPY.mapCardLastCameUp(formatDate(input.lastMentionedAt))]
      : [];

  const nearest = input.keyDates
    .flatMap(([, kind, month, day, , label]) =>
      day === null
        ? []
        : [
            {
              word: toKeyDateTitleWord(kind, label),
              days: daysUntil(
                input.todayKey,
                nextYearlyOccurrence({ month, day }, input.todayKey),
              ),
            },
          ],
    )
    .filter((entry) => entry.days <= KEY_DATE_NEAR_DAYS)
    .sort((a, b) => a.days - b.days)[0];
  const dateLine = nearest
    ? [HELM_COPY.mapCardDate(nearest.word, nearest.days)]
    : [];
  return [...linked, ...nextLine, ...dateLine];
};
