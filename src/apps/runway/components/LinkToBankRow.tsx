import { useState } from 'react';
import { Landmark, RefreshCw } from 'lucide-react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import { LINK_WORDS } from '@apps/runway/constants';
import { useCanLinkBank } from '@apps/runway/hooks/useCanLinkBank';
import { syncLinks } from '@apps/runway/store/actions/linkActions';

interface LinkToBankRowProps {
  /** The card's or account's `linkId`; null while it is typed by hand. */
  linkId: string | null;
  onOpen: () => void;
}

/** A sheet's door to linking this card or account, or once linked to asking the bank for what is new (the sheet's balance line says when it last answered). Nothing while the switch is off or the plan is at Plan. */
function LinkToBankRow({ linkId, onOpen }: LinkToBankRowProps) {
  const { addToast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const canLink = useCanLinkBank();
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

  const refresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const results = await syncLinks();
      const mine = results.find((entry) => entry.linkId === linkId);
      addToast(
        mine?.state === 'needsAttention'
          ? { title: LINK_WORDS.needsAttention, type: 'warning' }
          : mine?.state === 'failed'
            ? { title: LINK_WORDS.refreshFailed, type: 'error' }
            : { title: LINK_WORDS.refreshed, type: 'success' },
      );
    } catch {
      addToast({ title: LINK_WORDS.refreshFailed, type: 'error' });
    }
    setIsRefreshing(false);
  };

  return (
    <ActionRow
      isGrouped
      icon={<RefreshCw />}
      label={isRefreshing ? LINK_WORDS.refreshing : LINK_WORDS.refresh}
      subtitle={LINK_WORDS.refreshHelp}
      onClick={() => void refresh()}
    />
  );
}

export default LinkToBankRow;
