import type { ReactNode } from 'react';

import { Drawer, Modal, Panel } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useSheetHistory } from '@/hooks/useBackHistory';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const SHORT_SCREEN_MAX_HEIGHT = 599;

interface FormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** A plain noun, the same for creating and editing. */
  title: string;
  children: ReactNode;
  /** What a wide screen gets: a centered modal, or a panel sliding in from the right. */
  wide?: 'modal' | 'panel';
  /** A short landscape screen (under 600px tall, below 1024px wide) gets the drawer too, for a sheet of rows rather than fields. */
  isDrawerWhenShort?: boolean;
}

const STICKY_FOOTER =
  '[&_.form-footer]:bg-popover [&_.form-footer]:border-border [&_.form-footer]:sticky [&_.form-footer]:z-10 [&_.form-footer]:-mx-6 [&_.form-footer]:border-t [&_.form-footer]:px-6 [&_.form-footer]:pt-3';

/**
 * Where a form with several sections lives: a tall drawer on phones, capped so a strip of the screen
 * behind stays in view and it closes with a swipe, and a modal from `sm` up. The form's
 * `ModalFooterActions` stay pinned to the bottom edge while the fields scroll under them. A search or a
 * sequence is a `Subview` instead, and a handful of simple fields is a plain `Modal`.
 */
function FormSheet({
  isOpen,
  onClose,
  title,
  children,
  wide = 'modal',
  isDrawerWhenShort = false,
}: FormSheetProps) {
  const { isBelow } = useMediaQuery();
  const isShort = useIsShortScreen(SHORT_SCREEN_MAX_HEIGHT);
  const isPhone =
    isBelow('sm') || (isDrawerWhenShort && isShort && isBelow('lg'));
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, onClose);

  if (isPhone) {
    return (
      <Drawer
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={title}
        showCloseButton
        disableCloseOnOverlayClick
        className='max-h-[92dvh] [&>div]:max-h-[92dvh]'
      >
        <div
          className={join(
            STICKY_FOOTER,
            '[&_.form-footer]:bottom-[-1.5rem] [&_.form-footer]:-mb-6 [&_.form-footer]:pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
            '[@media(max-height:599px)]:-mt-3',
          )}
        >
          {children}
        </div>
      </Drawer>
    );
  }

  if (wide === 'panel') {
    return (
      <Panel
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={title}
      >
        <div
          className={join(
            STICKY_FOOTER,
            '[&_.form-footer]:bottom-0 [&_.form-footer]:pb-3',
          )}
        >
          {children}
        </div>
      </Panel>
    );
  }

  return (
    <Modal id={dialogId} isOpen={isOpen} onClose={onDialogClose} title={title}>
      <div
        className={join(
          STICKY_FOOTER,
          '[&_.form-footer]:bottom-0 [&_.form-footer]:pb-3',
        )}
      >
        {children}
      </div>
    </Modal>
  );
}

export default FormSheet;
