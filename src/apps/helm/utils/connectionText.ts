import { formatDateUTC } from '@/utils/formatUtils';
import { HELM_COPY, KIN_KINDS } from '@apps/helm/constants';
import {
  CONNECTION_STATUSES,
  type ConnectionSide,
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
