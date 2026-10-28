import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft } from 'lucide-react';

import { SubviewTitleContext } from '@/contexts/SubviewTitleContext';
import { useSubviewHistory } from '@/hooks/useSubviewHistory';
import { hasDialogOnTop } from '@/utils/dialogUtils';

const OPEN_POPUP_SELECTOR =
  '[aria-haspopup][aria-expanded="true"], [role="listbox"], [role="menu"]';

const openSubviews = { count: 0 };
const escapeOrder: object[] = [];

function useSubviewOpenMarker() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    openSubviews.count += 1;
    root.dataset.subviewOpen = '';
    return () => {
      openSubviews.count -= 1;
      if (openSubviews.count === 0) {
        delete root.dataset.subviewOpen;
      }
    };
  }, []);
}

interface SubviewHeaderProps {
  title: string;
  onBack: () => void;
  className?: string;
  /** The end of the title row: a screen-wide switch (a microphone) or, where the row has the room, the screen's own action cluster. */
  action?: ReactNode;
  /** Wraps a long title onto a second line instead of cutting it short. */
  isTitleWrapped?: boolean;
}

/** The round back button and large title that open every subview; the larger type sets it apart from section subheaders. */
export function SubviewHeader({
  title,
  onBack,
  className = 'mb-3',
  action,
  isTitleWrapped = false,
}: SubviewHeaderProps) {
  return (
    <div className={join('flex items-center gap-2', className)}>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label='Back'
        className="relative before:absolute before:-inset-1.5 before:content-['']"
        onClick={onBack}
      >
        <ChevronLeft className='h-5 w-5' />
      </Button>
      <h1
        className={join(
          'min-w-0 flex-1 text-2xl font-semibold tracking-tight',
          isTitleWrapped
            ? 'line-clamp-2 wrap-break-word [@media(max-height:700px)]:line-clamp-1'
            : 'truncate',
        )}
      >
        {title}
      </h1>
      {action}
    </div>
  );
}

interface SubviewProps {
  children: ReactNode;
  /** Leaves the subview; what the back gesture and Escape call when there is no `onBack`. */
  onClose: () => void;
  /** Omit when the content draws its own `SubviewHeader` because its back step changes. */
  title?: string;
  /** The end of the title row: a screen-wide switch (a microphone) or, where the row has the room, the screen's own action cluster. Its buttons bring their own 40px hit areas. */
  headerAction?: ReactNode;
  /** What the header's back button, the browser's back gesture and Escape do when they step back inside the subview (or confirm leaving it) instead of leaving at once. */
  onBack?: () => void;
  className?: string;
  /**
   * Render as a full-screen layer on top of the page instead of in its place, for a subview opened
   * from deep inside a screen (a form from a card's Edit button) where the parent can't swap its own
   * content out. The screens underneath stay mounted, and a form's `FormFooterActions` pin to the bottom.
   */
  overlay?: boolean;
  isTitleWrapped?: boolean;
}

/**
 * A nested page that takes over a mini-app: it opens at the top, brings its own way back, and
 * closes on the browser's back gesture rather than leaving the page beneath it. It floats as a card on
 * a tint of the app's colour and hides the site header; the card's look is the `--subview-*` tokens, and its
 * unlayered CSS beats any Tailwind surface class in `className` (use it for width only).
 */
function Subview({
  children,
  onClose,
  title,
  headerAction,
  onBack,
  className,
  overlay = false,
  isTitleWrapped = false,
}: SubviewProps) {
  const goBack = onBack ?? onClose;
  useSubviewHistory(onClose, onBack);
  useSubviewOpenMarker();

  const [escapeToken] = useState<object>(() => ({}));
  useEffect(() => {
    escapeOrder.push(escapeToken);
    return () => {
      escapeOrder.splice(escapeOrder.indexOf(escapeToken), 1);
    };
  }, [escapeToken]);

  useEffect(() => {
    if (overlay) {
      return;
    }
    window.scrollTo({ top: 0 });
  }, [overlay]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (overlay) {
      document.body.style.overflow = 'hidden';
    }
    // Capture, so a dialog on top is still there to be seen before it closes itself on this keydown; an open
    // dropdown is found by where focus is and a tooltip by being on screen, as neither has handled it yet.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        hasDialogOnTop() ||
        escapeOrder[escapeOrder.length - 1] !== escapeToken
      ) {
        return;
      }
      const isPopupOpen =
        (event.target instanceof Element &&
          event.target.closest(OPEN_POPUP_SELECTOR) !== null) ||
        document.querySelector('[role="tooltip"]') !== null;
      if (!isPopupOpen) {
        goBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      if (overlay) {
        document.body.style.overflow = previousOverflow;
      }
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [overlay, goBack, escapeToken]);

  if (overlay) {
    return createPortal(
      <div className='subview-backdrop' data-subview-scroller=''>
        <div
          role='dialog'
          data-subview-overlay=''
          aria-label={title}
          className={join(
            'subview-card flex max-w-2xl flex-col',
            className,
          )}
        >
          <div className='flex flex-1 flex-col px-(--subview-pad) pb-(--subview-pad) *:last:flex *:last:flex-1 *:last:flex-col has-[.form-footer]:pb-0 [&_.form-footer]:bg-background [&_.form-footer]:border-border [&_.form-footer]:sticky [&_.form-footer]:bottom-0 [&_.form-footer]:z-10 [&_.form-footer]:-mx-(--subview-pad) [&_.form-footer]:mt-auto! [&_.form-footer]:border-t [&_.form-footer]:px-(--subview-pad) [&_.form-footer]:pt-3 [&_.form-footer]:pb-[calc(0.75rem+env(safe-area-inset-bottom))]'>
            {title !== undefined && (
              <div className='bg-background sticky top-0 z-20 -mx-(--subview-pad) px-(--subview-pad) pt-3 pb-3 [@media(max-height:499px)]:pt-1'>
                <SubviewHeader
                  title={title}
                  onBack={goBack}
                  action={headerAction}
                  isTitleWrapped={isTitleWrapped}
                  className=''
                />
              </div>
            )}
            <SubviewTitleContext.Provider value={title ?? null}>
              {children}
            </SubviewTitleContext.Provider>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className='subview-page'>
      <div
        className={join(
          'subview-card mx-auto w-full max-w-2xl px-(--subview-pad) pt-3 pb-6 [@media(max-height:499px)]:pt-1 [@media(max-height:499px)]:pb-3',
          className,
        )}
      >
        {title !== undefined && (
          <SubviewHeader
            title={title}
            onBack={goBack}
            action={headerAction}
            isTitleWrapped={isTitleWrapped}
            className='sticky-app-bar bg-background -mx-(--subview-pad) mb-3 min-h-14 px-(--subview-pad) py-2.5 [@media(max-height:499px)]:min-h-12 [@media(max-height:499px)]:py-1'
          />
        )}
        <SubviewTitleContext.Provider value={title ?? null}>
          {children}
        </SubviewTitleContext.Provider>
      </div>
    </div>
  );
}

export default Subview;
