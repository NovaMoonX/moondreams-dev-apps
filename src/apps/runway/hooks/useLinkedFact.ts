import { useNow } from '@/hooks/useNow';
import { formatTimeAgo } from '@/utils/formatUtils';
import { useAppSelector } from '@/store';
import { LINK_WORDS } from '@apps/runway/constants';

/** "Linked · updated 1 minute ago" for a sheet's balance caption; null while the card or account is not linked. */
export function useLinkedFact(linkId: string | null) {
  const now = useNow(60_000);
  const link = useAppSelector((state) =>
    linkId === null
      ? null
      : (state.runway.links.find((entry) => entry.id === linkId) ?? null),
  );
  if (linkId === null) return null;
  if (link?.status === 'revoked') return LINK_WORDS.unlinkedFact;
  const at = link ? (link.lastSyncAt ?? link.createdAt) : null;
  return at === null
    ? LINK_WORDS.done
    : LINK_WORDS.rowLinked(
        formatTimeAgo(at, now, true).replace(/ /g, '\u00a0'),
      );
}
