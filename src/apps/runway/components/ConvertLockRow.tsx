import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { Lock } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { CONVERT_WORDS } from '@apps/runway/constants';

interface ConvertLockRowProps {
  label: string;
  reason: string;
  /** A way to fix what the reason names: a tap goes straight to it, since the subtitle already said why. */
  onFix?: () => void;
}

/** A convert row that cannot open yet: the same anatomy as its open twin, with the reason as its subtitle and a tap that opens its fix, or the reason when nothing here can fix it. */
function ConvertLockRow({ label, reason, onFix }: ConvertLockRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, () =>
    setIsOpen(false),
  );

  return (
    <>
      <ActionRow
        isGrouped
        icon={<Lock />}
        label={label}
        subtitle={reason}
        hasChevron={onFix !== undefined}
        onClick={onFix ?? (() => setIsOpen(true))}
      />
      <Modal
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={CONVERT_WORDS.lockedTitle}
      >
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>{reason}</p>
          <div className='flex justify-end gap-2'>
            <Button onClick={onDialogClose}>Got it</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default ConvertLockRow;
