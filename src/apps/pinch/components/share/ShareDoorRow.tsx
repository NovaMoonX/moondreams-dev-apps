import { Share2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { selectShareBySource } from '@apps/pinch/store/selectors';
import type { ShareKind } from '@apps/pinch/types';

interface ShareDoorRowProps {
  kind: ShareKind;
  sourceId: string;
  onClick: () => void;
}

function ShareDoorRow({ kind, sourceId, onClick }: ShareDoorRowProps) {
  const share = useAppSelector(selectShareBySource(kind, sourceId));
  const getSubtitle = () => {
    if (share === null) return 'A link anyone can open, no account needed';
    const verb = share.updatedAt > share.createdAt ? 'Updated' : 'Shared';
    return `${verb} ${formatDateShort(share.updatedAt)}`;
  };

  return (
    <ActionRow
      isGrouped
      isRoomy
      hasChevron
      icon={<Share2 />}
      label='Share'
      subtitle={getSubtitle()}
      onClick={onClick}
    />
  );
}

export default ShareDoorRow;
