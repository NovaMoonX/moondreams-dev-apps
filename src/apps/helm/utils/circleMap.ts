import type { ElementDefinition } from 'cytoscape';

import { HELM_COPY } from '@apps/helm/constants';
import {
  CONNECTION_KINDS,
  isPastStatus,
  readFromSide,
  type InferredLink,
} from '@apps/helm/engine/connections';
import type { ConnectionKind, OpenConnection, OpenWho } from '@apps/helm/types';
import { toFiguredSide, toSideLine } from '@apps/helm/utils/connectionText';

export type MapFilter = 'close' | 'family' | 'everyone';

/** More people than this and the map opens on Close only. */
export const MAP_CROWDED_FROM = 30;

export const OWNER_FALLBACK_ID = 'owner';

const OWNER_LEVEL = 10;
const TIER_LEVEL = { close: 3, regular: 2, passing: 1 } as const;

type MapWho = Pick<
  OpenWho,
  'id' | 'kind' | 'name' | 'tier' | 'isSelf' | 'isUnreadable' | 'photoMediaId'
>;

type MapConnection = Pick<
  OpenConnection,
  'whoIds' | 'kind' | 'status' | 'fromFirst' | 'fromSecond' | 'since'
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
  const figured = [
    ...new Map(
      [...input.figuredOut.values()]
        .flat()
        .map((link) => [`${link.firstId}_${link.secondId}`, link]),
    ).values(),
  ];
  return [
    ...input.connections.map((connection) => ({
      id: `${connection.whoIds[0]}_${connection.whoIds[1]}_${connection.kind}`,
      source: connection.whoIds[0],
      target: connection.whoIds[1],
      kind: connection.kind,
      isFigured: false,
      isPast: connection.kind === 'couple' && isPastStatus(connection.status),
    })),
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

/**
 * The circle as network elements: the owner in the middle, people by closeness, pets and organizations only when linked to someone shown, passing people never.
 * A private person's name, initial and photo stay out while `isMasked`.
 */
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

  const toNode = (who: MapWho): ElementDefinition => {
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
        level: isOwner ? OWNER_LEVEL : TIER_LEVEL[who.tier],
        photo:
          isHidden || who.photoMediaId === null
            ? null
            : (photoUrls[who.photoMediaId] ?? null),
      },
    };
  };

  const nodes = [
    owner
      ? toNode(owner)
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
      .map(toNode),
  ];
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
  return [...nodes, ...edges];
};

export interface MapCard {
  title: string;
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
    return { title: HELM_COPY.mapPrivateName, line: '', count: null };
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
    line,
    count: input.connections.filter((connection) =>
      connection.whoIds.includes(input.id),
    ).length,
  };
};
