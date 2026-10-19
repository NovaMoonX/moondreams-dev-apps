import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';

import { Button, Drawer, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { X } from 'lucide-react';

import { useSheetHistory } from '@/hooks/useBackHistory';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const SHORT_SCREEN_MAX_HEIGHT = 599;

interface DetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Icon buttons on the title's line (40×40, each with an `aria-label`), for what opens in place inside the sheet. */
  actions?: ReactNode;
  /** Names the view the content shows: a new view starts at the top, coming back to one returns to where it was left, and the sheet never shrinks between views. */
  viewKey?: string;
}

// A title that is an element loses the dialog's label (it points at a heading that is never drawn),
// so the heading names the dialog itself.
const labelDialog = (heading: HTMLHeadingElement | null) => {
  heading
    ?.closest('[role="dialog"]')
    ?.setAttribute('aria-labelledby', heading.id);
};

/**
 * Read-only detail of unpredictable length (notes, a breakdown): a drawer on phones and on short
 * screens (a landscape phone), which scrolls and closes with a swipe, and a modal from `sm` up; the
 * back gesture closes either. Short, fixed-size content is a plain `Modal`.
 */
function DetailSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  actions,
  viewKey,
}: DetailSheetProps) {
  const { isBelow } = useMediaQuery();
  const isShort = useIsShortScreen(SHORT_SCREEN_MAX_HEIGHT);
  const isDrawer = isBelow('sm') || (isShort && isBelow('lg'));
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, onClose);
  const contentNode = useRef<HTMLDivElement | null>(null);
  const scrollTops = useRef(new Map<string, number>());
  const shownKey = useRef(viewKey);
  const hasViews = viewKey !== undefined;

  const attachContent = useCallback(
    (node: HTMLDivElement | null) => {
      contentNode.current = node;
      const scroller = node && (isDrawer ? node.parentElement : node);
      if (!hasViews || !node || !scroller) return;
      const record = () => {
        if (shownKey.current !== undefined) {
          scrollTops.current.set(shownKey.current, scroller.scrollTop);
        }
      };
      const { paddingTop, paddingBottom } = getComputedStyle(scroller);
      const padding =
        scroller === node
          ? 0
          : parseFloat(paddingTop) + parseFloat(paddingBottom);
      const held = { total: 0 };
      const holdHeight = new ResizeObserver(() => {
        const footerHeight =
          scroller.nextElementSibling?.getBoundingClientRect().height ?? 0;
        held.total = Math.max(held.total, scroller.clientHeight + footerHeight);
        node.style.minHeight = `${held.total - footerHeight - padding}px`;
      });
      scroller.addEventListener('scroll', record, { passive: true });
      holdHeight.observe(scroller);
      if (scroller.parentElement) holdHeight.observe(scroller.parentElement);
      return () => {
        scroller.removeEventListener('scroll', record);
        holdHeight.disconnect();
      };
    },
    [isDrawer, hasViews],
  );

  useLayoutEffect(() => {
    if (viewKey === undefined || shownKey.current === viewKey) return;
    shownKey.current = viewKey;
    const node = contentNode.current;
    const scroller = node && (isDrawer ? node.parentElement : node);
    if (scroller) scroller.scrollTop = scrollTops.current.get(viewKey) ?? 0;
  });

  const isCompact = isDrawer && isShort;
  const heading =
    actions || isCompact ? (
      <div
        className={join(
          'flex items-start gap-2',
          isDrawer && !isCompact && 'pt-2',
        )}
      >
        <h2
          ref={labelDialog}
          id={`${dialogId}-title`}
          className={join(
            'min-w-0 flex-1 font-semibold wrap-break-word',
            isDrawer && !isCompact ? 'text-2xl' : 'text-xl',
          )}
        >
          {title}
        </h2>
        {actions && (
          <div className='-my-1 -mr-2 flex shrink-0 items-center gap-1'>
            {actions}
            {!isDrawer && (
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label='Close'
                onClick={onDialogClose}
                className='text-foreground! ml-2 size-10 min-w-10 shrink-0 p-0'
              >
                <X className='h-5 w-5' aria-hidden='true' />
              </Button>
            )}
          </div>
        )}
      </div>
    ) : (
      title
    );

  if (isDrawer) {
    return (
      <Drawer
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={heading}
        showCloseButton
        footer={
          isCompact && footer ? (
            <div className='py-2! [&>div]:px-0! [&>div]:pb-0!'>{footer}</div>
          ) : (
            footer
          )
        }
      >
        <div ref={attachContent} className={join('pb-4', isCompact && '-mt-3')}>
          {children}
        </div>
      </Drawer>
    );
  }

  return (
    <Modal
      id={dialogId}
      isOpen={isOpen}
      onClose={onDialogClose}
      title={heading}
      hideCloseButton={actions !== undefined}
    >
      <div
        ref={attachContent}
        className='max-h-[calc(100dvh-16rem)] overflow-y-auto'
      >
        {children}
      </div>
      {footer && <div className='mt-4 [&>div]:p-0'>{footer}</div>}
    </Modal>
  );
}

export default DetailSheet;
