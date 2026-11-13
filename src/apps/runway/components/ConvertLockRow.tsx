import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { Lock } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { CONVERT_WORDS } from '@apps/runway/constants';

interface ConvertLockRowProps {
  label: string;
  reason: string;
  /** A way to fix what the reason names, offered under it. */
  door?: { label: string; onOpen: () => void };
}

/** A convert row that cannot open yet: the same anatomy as its open twin, with the reason as its subtitle and a tap that opens the reason and, when there is one, its door. */
function ConvertLockRow({ label, reason, door }: ConvertLockRowProps) {
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
        onClick={() => setIsOpen(true)}
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
            {door !== undefined && (
              <Button
                variant='secondary'
                onClick={() => {
                  onDialogClose();
                  door.onOpen();
                }}
              >
                {door.label}
              </Button>
            )}
            <Button onClick={onDialogClose}>Got it</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default ConvertLockRow;
