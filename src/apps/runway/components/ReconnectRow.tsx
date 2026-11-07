import { Landmark } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import ActionRow from '@/components/ActionRow';
import { LINK_WORDS } from '@apps/runway/constants';
import { useReconnectLink } from '@apps/runway/hooks/useReconnectLink';

interface ReconnectRowProps {
  linkId: string;
  bank: string;
  /** Inside a group that draws the one frame. */
  isGrouped?: boolean;
}

/** A warning-toned action row for a bank that stopped syncing: a tap signs in again at the bank and syncs it. */
function ReconnectRow({ linkId, bank, isGrouped = false }: ReconnectRowProps) {
  const { reconnect, busyId } = useReconnectLink();
  return (
    <div
      className={join(
        'overflow-hidden bg-(--runway-warning-soft)',
        !isGrouped && 'rounded-2xl border border-(--runway-warning-edge)',
      )}
    >
      <ActionRow
        isGrouped
        icon={<Landmark className='text-(--runway-warning-ink)' />}
        label={
          busyId === linkId
            ? LINK_WORDS.refreshing
            : LINK_WORDS.reconnectTitle(bank)
        }
        subtitle={LINK_WORDS.reconnectNote}
        isDisabled={busyId !== null}
        onClick={() => void reconnect(linkId, bank)}
      />
    </div>
  );
}

export default ReconnectRow;
