import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';

import { X } from 'lucide-react';

import { Button, Modal, Panel } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import Drawer from '@/components/Drawer';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const SHORT_SCREEN_MAX_HEIGHT = 599;

// A title that is an element loses the dialog's label (it points at a heading that is never drawn),
// so the heading names the dialog itself.
const labelDialog = (heading: HTMLHeadingElement | null) => {
  heading
    ?.closest('[role="dialog"]')
    ?.setAttribute('aria-labelledby', heading.id);
};

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
  /** Icon buttons on the title's line (40×40, each with an `aria-label`), such as the eye that shows or hides private figures. */
  actions?: ReactNode;
  /** Names the view the body shows when the form swaps its body in place (the view opens with a `BackLink`, so the phone's Back returns one view): a new view starts at the top and coming back to one returns to where it was left. Absent, the sheet is one view. */
  viewKey?: string;
}

const findScroller = (node: HTMLElement | null): HTMLElement | null => {
  const parent = node?.parentElement ?? null;
  if (!parent) return null;
  const { overflowY } = getComputedStyle(parent);
  return overflowY === 'auto' || overflowY === 'scroll'
    ? parent
    : findScroller(parent);
};

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
  actions,
  viewKey,
}: FormSheetProps) {
  const { isBelow } = useMediaQuery();
  const isShort = useIsShortScreen(SHORT_SCREEN_MAX_HEIGHT);
  const isPhone =
    isBelow('sm') || (isDrawerWhenShort && isShort && isBelow('lg'));
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, onClose);
  const bodyNode = useRef<HTMLDivElement | null>(null);
  const scrollTops = useRef(new Map<string, number>());
  const shownKey = useRef(viewKey);
  const hasViews = viewKey !== undefined;

  const attachBody = useCallback(
    (node: HTMLDivElement | null) => {
      bodyNode.current = node;
      const scroller = hasViews ? findScroller(node) : null;
      if (!scroller) return;
      const record = () => {
        if (shownKey.current !== undefined) {
          scrollTops.current.set(shownKey.current, scroller.scrollTop);
        }
      };
      scroller.addEventListener('scroll', record, { passive: true });
      return () => scroller.removeEventListener('scroll', record);
    },
    [hasViews],
  );

  useLayoutEffect(() => {
    if (viewKey === undefined || shownKey.current === viewKey) return;
    shownKey.current = viewKey;
    const scroller = findScroller(bodyNode.current);
    if (scroller) scroller.scrollTop = scrollTops.current.get(viewKey) ?? 0;
  });

  const heading = actions ? (
    <div
      className={join('flex items-start gap-2', isPhone && !isShort && 'pt-2')}
    >
      <h2
        ref={labelDialog}
        id={`${dialogId}-title`}
        className={join(
          'min-w-0 flex-1 font-semibold wrap-break-word',
          isPhone && !isShort ? 'text-2xl' : 'text-xl',
        )}
      >
        {title}
      </h2>
      <div
        className={join(
          'relative z-10 -mr-2 flex shrink-0 items-center gap-1',
          isPhone && !isShort ? 'h-8' : 'h-7',
        )}
      >
        {actions}
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label='Close'
          onClick={onDialogClose}
          className={join(
            'text-foreground! ml-2 size-10 min-w-10 shrink-0 p-0',
            isPhone && '[@media(pointer:coarse)]:hidden!',
          )}
        >
          <X className='h-5 w-5' aria-hidden='true' />
        </Button>
      </div>
    </div>
  ) : null;

  if (isPhone) {
    return (
      <Drawer
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={
          heading ??
          (isShort ? (
            <h2
              ref={labelDialog}
              id={`${dialogId}-title`}
              className='text-xl font-semibold'
            >
              {title}
            </h2>
          ) : (
            title
          ))
        }
        showCloseButton={actions === undefined}
        disableCloseOnOverlayClick
        className='max-h-[92dvh] [&>div]:max-h-[92dvh]'
      >
        <div
          ref={attachBody}
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
        title={heading ?? title}
      >
        <div
          ref={attachBody}
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
    <Modal
      id={dialogId}
      isOpen={isOpen}
      onClose={onDialogClose}
      title={heading ?? title}
      hideCloseButton={actions !== undefined}
    >
      <div
        ref={attachBody}
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
