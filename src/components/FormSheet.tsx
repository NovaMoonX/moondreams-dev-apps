import type { ReactNode } from 'react';

import { Drawer, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useMediaQuery } from '@/hooks/useMediaQuery';

interface FormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** A plain noun, the same for creating and editing. */
  title: string;
  children: ReactNode;
}

const STICKY_FOOTER =
  '[&_.form-footer]:bg-popover [&_.form-footer]:border-border [&_.form-footer]:sticky [&_.form-footer]:z-10 [&_.form-footer]:-mx-6 [&_.form-footer]:border-t [&_.form-footer]:px-6 [&_.form-footer]:pt-3';

/**
 * Where a form with several sections lives: a tall drawer on phones, capped so a strip of the screen
 * behind stays in view and it closes with a swipe, and a modal from `sm` up. The form's
 * `ModalFooterActions` stay pinned to the bottom edge while the fields scroll under them. A search or a
 * sequence is a `Subview` instead, and a handful of simple fields is a plain `Modal`.
 */
function FormSheet({ isOpen, onClose, title, children }: FormSheetProps) {
  const isPhone = useMediaQuery().isBelow('sm');

  if (isPhone) {
    return (
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        showCloseButton
        disableCloseOnOverlayClick
        className='max-h-[92dvh] [&>div]:max-h-[92dvh]'
      >
        <div className={join(STICKY_FOOTER, '[&_.form-footer]:bottom-[-1.5rem] [&_.form-footer]:-mb-6 [&_.form-footer]:pb-9')}>{children}</div>
      </Drawer>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className={join(STICKY_FOOTER, '[&_.form-footer]:bottom-0 [&_.form-footer]:pb-3')}>{children}</div>
    </Modal>
  );
}

export default FormSheet;
