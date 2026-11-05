import { Landmark } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { LINK_WORDS } from '@apps/runway/constants';
import { useCanLinkBank } from '@apps/runway/hooks/useCanLinkBank';

interface LinkToBankRowProps {
  /** The card's or account's `linkId`; null while it is typed by hand. */
  linkId: string | null;
  onOpen: () => void;
}

/** A sheet's door to linking this card or account. Nothing is drawn once it is linked (the sheet's balance line says when the bank last updated it), while the switch is off or while the plan is at Plan. */
function LinkToBankRow({ linkId, onOpen }: LinkToBankRowProps) {
  const canLink = useCanLinkBank();
  if (!canLink || linkId !== null) return null;
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

export default LinkToBankRow;
