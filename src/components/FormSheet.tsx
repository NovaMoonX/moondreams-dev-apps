import type { ReactNode } from 'react';

import { Drawer, Modal } from '@moondreamsdev/dreamer-ui/components';

import { useMediaQuery } from '@/hooks/useMediaQuery';

interface FormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** A plain noun, the same for creating and editing. */
  title: string;
  children: ReactNode;
}

/**
 * Where a form with several sections lives: a tall drawer on phones, which leaves the screen behind it in
 * view and closes with a swipe, and a modal from `sm` up. The form's `ModalFooterActions` stay pinned to
 * the bottom of the sheet while the fields scroll. A search or a sequence is a `Subview` instead, and a
 * handful of simple fields is a plain `Modal`.
 */
function FormSheet({ isOpen, onClose, title, children }: FormSheetProps) {
  const isPhone = useMediaQuery().isBelow('sm');

  if (isPhone) {
    return (
      <Drawer isOpen={isOpen} onClose={onClose} title={title} showCloseButton disableCloseOnOverlayClick>
        <div className='[&_.form-footer]:bg-background [&_.form-footer]:border-border [&_.form-footer]:sticky [&_.form-footer]:bottom-0 [&_.form-footer]:z-10 [&_.form-footer]:-mx-4 [&_.form-footer]:border-t [&_.form-footer]:px-4 [&_.form-footer]:py-3'>
          {children}
        </div>
      </Drawer>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {children}
    </Modal>
  );
}

export default FormSheet;
