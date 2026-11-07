import { Landmark } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import ActionRow from '@/components/ActionRow';
import { LINK_WORDS } from '@apps/runway/constants';

interface ReconnectRowProps {
  linkId: string;
  bank: string;
  /** `busyId` of `useReconnectLink`, which the caller owns so other controls can wait too. */
  busyId: string | null;
  onReconnect: (linkId: string, bank: string) => void;
  /** Something else on the screen is working. */
  isDisabled?: boolean;
  /** Inside a group that draws the one frame. */
  isGrouped?: boolean;
}

/** A warning-toned action row for a bank that stopped syncing: a tap signs in again at the bank and syncs it. */
function ReconnectRow({
  linkId,
  bank,
  busyId,
  onReconnect,
  isDisabled = false,
  isGrouped = false,
}: ReconnectRowProps) {
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
        isDisabled={isDisabled || busyId !== null}
        onClick={() => onReconnect(linkId, bank)}
      />
    </div>
  );
}

export default ReconnectRow;
