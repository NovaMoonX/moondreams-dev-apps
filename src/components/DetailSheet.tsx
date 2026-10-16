import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';

import { Drawer, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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
  actions,
  viewKey,
}: DetailSheetProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, onClose);
  const contentNode = useRef<HTMLDivElement | null>(null);
  const scrollTops = useRef(new Map<string, number>());
  const shownKey = useRef(viewKey);
  const hasViews = viewKey !== undefined;

  const attachContent = useCallback(
    (node: HTMLDivElement | null) => {
      contentNode.current = node;
      const scroller = node && (isPhone ? node.parentElement : node);
      if (!hasViews || !node || !scroller) return;
      const record = () => {
        if (shownKey.current !== undefined) {
          scrollTops.current.set(shownKey.current, scroller.scrollTop);
        }
      };
      // A shorter view keeps the sheet at the tallest height it has had, so switching never makes it jump.
      const { paddingTop, paddingBottom } = getComputedStyle(scroller);
      const padding =
        scroller === node
          ? 0
          : parseFloat(paddingTop) + parseFloat(paddingBottom);
      const holdHeight = new ResizeObserver(() => {
        const height = scroller.clientHeight - padding;
        if (height > parseFloat(node.style.minHeight || '0')) {
          node.style.minHeight = `${height}px`;
        }
      });
      scroller.addEventListener('scroll', record, { passive: true });
      holdHeight.observe(scroller);
      return () => {
        scroller.removeEventListener('scroll', record);
        holdHeight.disconnect();
      };
    },
    [isPhone, hasViews],
  );

  useLayoutEffect(() => {
    if (viewKey === undefined || shownKey.current === viewKey) return;
    shownKey.current = viewKey;
    const node = contentNode.current;
    const scroller = node && (isPhone ? node.parentElement : node);
    if (scroller) scroller.scrollTop = scrollTops.current.get(viewKey) ?? 0;
  });

  const heading = actions ? (
    <div className='flex items-start gap-2'>
      <h2
        ref={labelDialog}
        id={`${dialogId}-title`}
        className={join(
          'min-w-0 flex-1 font-semibold wrap-break-word',
          isPhone ? 'text-2xl' : 'text-xl',
        )}
      >
        {title}
      </h2>
      <div className='-my-1 -mr-2 flex shrink-0 items-center gap-1'>
        {actions}
      </div>
    </div>
  ) : (
    title
  );

  if (isPhone) {
    return (
      <Drawer
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title={heading}
        showCloseButton
        footer={footer}
      >
        <div ref={attachContent} className='pb-4'>
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
