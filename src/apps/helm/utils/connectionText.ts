import { formatDateUTC } from '@/utils/formatUtils';
import { HELM_COPY, KIN_KINDS } from '@apps/helm/constants';
import {
  CONNECTION_STATUSES,
  type ConnectionSide,
} from '@apps/helm/engine/connections';
import type { ConnectionKind, ConnectionRelation } from '@apps/helm/types';

/** The word for what the other is to someone: a family word as written, friend, coworker, or partner for a couple. Null when none is known. */
export const toRelationWord = (relation: ConnectionRelation | null) => {
  if (relation === null) return null;
  if (relation === 'friend') return 'friend';
  if (relation === 'coworker') return 'coworker';
  return KIN_KINDS.find((entry) => entry.kind === relation)?.written ?? null;
};

/** The short tail of a row: "brother", "married", "friend". */
export const toRowTail = (kind: ConnectionKind, side: ConnectionSide) => {
  if (kind === 'couple')
    return side.status === null
      ? HELM_COPY.connectionPartner
      : HELM_COPY.connectionStatuses[side.status].toLowerCase();
  return toRelationWord(side.relation) ?? HELM_COPY.connectionFamilyFallback;
};

/** The connection in a sentence from one person's side, with a couple's since appended. */
export const toConnectionSentence = (
  kind: ConnectionKind,
  side: ConnectionSide,
  other: string,
  name: string,
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

/** A couple's statuses as pills. */
export const STATUS_OPTIONS = CONNECTION_STATUSES.map((status) => ({
  value: status,
  label: HELM_COPY.connectionStatuses[status],
}));
