import type { ReactNode } from 'react';

import { Drawer, Modal } from '@moondreamsdev/dreamer-ui/components';

import { useMediaQuery } from '@/hooks/useMediaQuery';

interface DetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Read-only detail of unpredictable length (notes, a breakdown): a drawer on phones, which scrolls
 * and closes with a swipe, and a modal from `sm` up. Short, fixed-size content is a plain `Modal`.
 */
function DetailSheet({ isOpen, onClose, title, children }: DetailSheetProps) {
  const isPhone = useMediaQuery().isBelow('sm');

  if (isPhone) {
    return (
      <Drawer isOpen={isOpen} onClose={onClose} title={title} showCloseButton>
        <div className='pb-4'>{children}</div>
      </Drawer>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {children}
    </Modal>
  );
}

export default DetailSheet;
