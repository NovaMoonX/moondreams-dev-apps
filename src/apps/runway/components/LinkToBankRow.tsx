import { Landmark } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { LINK_WORDS } from '@apps/runway/constants';
import { useCanLinkBank } from '@apps/runway/hooks/useCanLinkBank';
import { formatUpdatedAgo } from '@apps/runway/utils/linkText';

interface LinkToBankRowProps {
  /** The card's or account's `linkId`; null while it is typed by hand. */
  linkId: string | null;
  onOpen: () => void;
}

/** A sheet's door to linking this card or account; once linked it only says when the bank last updated it. Nothing is drawn while the switch is off or the plan is at Plan. */
function LinkToBankRow({ linkId, onOpen }: LinkToBankRowProps) {
  const canLink = useCanLinkBank();
  const now = useNow(60_000);
  const link = useAppSelector((state) =>
    linkId === null
      ? null
      : (state.runway.links.find((entry) => entry.id === linkId) ?? null),
  );
  if (!canLink) return null;

  if (linkId === null) {
    return (
      <ActionRow
        isGrouped
        hasChevron
        icon={<Landmark />}
        label={LINK_WORDS.rowLabel}
        subtitle={LINK_WORDS.rowHelp}
        onClick={onOpen}
      />
    );
  }
  const at = link ? (link.lastSyncAt ?? link.createdAt) : null;
  return (
    <p className='text-muted-foreground flex items-center gap-2.5 px-3 py-2.5 text-[15px]'>
      <Landmark className='size-4 shrink-0' aria-hidden='true' />
      {at === null
        ? LINK_WORDS.done
        : LINK_WORDS.rowLinked(formatUpdatedAgo(at, now))}
    </p>
  );
}

export default LinkToBankRow;
