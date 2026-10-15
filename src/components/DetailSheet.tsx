import type { ReactNode } from 'react';

import { Drawer, Modal } from '@moondreamsdev/dreamer-ui/components';

import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface DetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Read-only detail of unpredictable length (notes, a breakdown): a drawer on phones, which scrolls
 * and closes with a swipe, and a modal from `sm` up; the back gesture closes either. Short,
 * fixed-size content is a plain `Modal`.
 */
function DetailSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: DetailSheetProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, onClose);

  if (isPhone) {
    return (
      <Drawer
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={title}
        showCloseButton
        footer={footer}
      >
        <div className='pb-4'>{children}</div>
      </Drawer>
    );
  }

  return (
    <Modal id={dialogId} isOpen={isOpen} onClose={onDialogClose} title={title}>
      <div className='max-h-[calc(100dvh-16rem)] overflow-y-auto'>
        {children}
      </div>
      {footer && <div className='mt-4 [&>div]:p-0'>{footer}</div>}
    </Modal>
  );
}

export default DetailSheet;
