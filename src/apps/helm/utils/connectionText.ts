import { formatDateUTC } from '@/utils/formatUtils';
import { HELM_COPY, KIN_KINDS } from '@apps/helm/constants';
import {
  CONNECTION_STATUSES,
  reverseRelation,
  type ConnectionSide,
  type Gender,
  type InferredLink,
} from '@apps/helm/engine/connections';
import type { ConnectionKind, ConnectionRelation } from '@apps/helm/types';

/** A family word as written, friend, coworker, or partner for a couple; null when none is known. */
export const toRelationWord = (relation: ConnectionRelation | null) => {
  if (relation === null) return null;
  if (relation === 'friend') return 'friend';
  if (relation === 'coworker') return 'coworker';
  return KIN_KINDS.find((entry) => entry.kind === relation)?.written ?? null;
};

/** What the other person is, from `name`'s side: "Dana's mother", "Married to Dana · since June 20, 2019"; a null name is the person themself ("Your mother"). */
export const toSideLine = (
  kind: ConnectionKind,
  side: ConnectionSide,
  name: string | null,
) => {
  const line =
    kind === 'family'
      ? HELM_COPY.connectionSideLine.family(name, toRelationWord(side.relation))
      : kind === 'friend'
        ? HELM_COPY.connectionSideLine.friend(name)
        : kind === 'work'
          ? HELM_COPY.connectionSideLine.work(name)
          : HELM_COPY.connectionSideLine.couple[side.status ?? 'partner'](name);
  return kind === 'couple' && side.since !== null
    ? `${line}\u00A0· ${HELM_COPY.connectionSinceInline(formatDateUTC(side.since))}`
    : line;
};

/** A couple's since is appended. */
export const toConnectionSentence = (
  kind: ConnectionKind,
  side: ConnectionSide,
  other: string,
  name: string | null,
) => {
  const line =
    kind === 'family'
      ? HELM_COPY.connectionLine.family(
          other,
          name,
          toRelationWord(side.relation),
        )
      : kind === 'couple'
        ? HELM_COPY.connectionLine.couple(
            other,
            name,
            side.status === null
              ? null
              : HELM_COPY.connectionStatuses[side.status].toLowerCase(),
          )
        : kind === 'friend'
          ? HELM_COPY.connectionLine.friend(other, name)
          : HELM_COPY.connectionLine.work(other, name);
  return kind === 'couple' && side.since !== null
    ? `${line} ${HELM_COPY.connectionSince(formatDateUTC(side.since))}.`
    : line;
};

export const STATUS_OPTIONS = CONNECTION_STATUSES.map((status) => ({
  value: status,
  label: HELM_COPY.connectionStatuses[status],
}));

/** What the other person is to `whoId` in a figured-out link; `otherGender` words the answer when `whoId` is the first of the pair. */
export const toFiguredSide = (
  link: InferredLink,
  whoId: string,
  otherGender: Gender,
): ConnectionSide => {
  const isFirst = link.firstId === whoId;
  const relation = isFirst
    ? link.relationOfFirstToSecond === null
      ? null
      : reverseRelation(link.relationOfFirstToSecond, otherGender)
    : link.relationOfFirstToSecond;
  return {
    otherId: isFirst ? link.secondId : link.firstId,
    relation,
    status: null,
    since: null,
    isPast: false,
  };
};

/** "Because Joan is your mother and Ruth is Joan's sister": the owner reads as "you". */
export const toBecauseLine = (
  link: InferredLink,
  selfId: string | null,
  nameOf: (id: string) => string,
) => {
  const display = (id: string) => (id === selfId ? 'you' : nameOf(id));
  const [first, second] = link.chain;
  const parent = [first.fromId, first.toId].find(
    (id) => id === second?.fromId || id === second?.toId,
  );
  if (link.because === 'siblings')
    return HELM_COPY.figuredBecause.siblings(
      display(link.firstId),
      display(link.secondId),
    );
  if (link.because === 'sameParent' && parent)
    return HELM_COPY.figuredBecause.sameParent(
      display(parent),
      display(link.firstId),
      display(link.secondId),
    );
  return HELM_COPY.figuredBecause.steps(
    link.chain.map((step) =>
      HELM_COPY.figuredBecause.step(
        display(step.fromId),
        step.fromId === selfId,
        step.toId === selfId ? null : nameOf(step.toId),
        toRelationWord(step.relation),
      ),
    ),
  );
};

export const NOT_SURE = 'none';

export const FAMILY_OPTIONS = [
  { value: NOT_SURE, text: HELM_COPY.connectionFamilyNotSure },
  ...KIN_KINDS.map((entry) => ({
    value: entry.kind,
    text: entry.written.charAt(0).toUpperCase() + entry.written.slice(1),
  })),
];
