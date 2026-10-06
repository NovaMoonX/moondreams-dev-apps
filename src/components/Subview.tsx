import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft } from 'lucide-react';

import { SubviewTitleContext } from '@/contexts/SubviewTitleContext';
import { useSubviewHistory } from '@/hooks/useSubviewHistory';

interface SubviewHeaderProps {
  title: string;
  onBack: () => void;
  className?: string;
}

/** The round back button and large title that open every subview; the larger type sets it apart from section subheaders. */
export function SubviewHeader({ title, onBack, className = 'mb-3' }: SubviewHeaderProps) {
  return (
    <div className={join('flex items-center gap-2', className)}>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={title}
        onClick={onBack}
      >
        <ChevronLeft className='h-5 w-5' />
      </Button>
      <h1 className='min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight'>
        {title}
      </h1>
    </div>
  );
}

interface SubviewProps {
  children: ReactNode;
  /** Leaves the subview; also what the browser's back gesture calls. */
  onClose: () => void;
  /** Omit when the content draws its own `SubviewHeader` because its back step changes. */
  title?: string;
  className?: string;
  /**
   * Render as a full-screen layer on top of the page instead of in its place, for a subview opened
   * from deep inside a screen (a form from a card's Edit button) where the parent can't swap its own
   * content out. The screens underneath stay mounted, and a form's `FormFooterActions` pin to the bottom.
   */
  overlay?: boolean;
}

/**
 * A nested page that takes over a mini-app: it opens at the top, brings its own way back, and
 * closes on the browser's back gesture rather than leaving the page beneath it.
 */
function Subview({
  children,
  onClose,
  title,
  className,
  overlay = false,
}: SubviewProps) {
  useSubviewHistory(onClose);

  useEffect(() => {
    if (overlay) {
      return;
    }
    window.scrollTo({ top: 0 });
  }, [overlay]);

  useEffect(() => {
    if (!overlay) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      const hasDialogOnTop = Array.from(
        document.querySelectorAll(
          '[role="dialog"]:not([inert]):not([aria-hidden="true"]), [role="alertdialog"]:not([inert]):not([aria-hidden="true"])',
        ),
      ).some((dialog) => !dialog.hasAttribute('data-subview-overlay'));
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !hasDialogOnTop
      ) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [overlay, onClose]);

  if (overlay) {
    return createPortal(
      <div
        role='dialog'
        data-subview-overlay=''
        aria-label={title}
        className='bg-background fixed inset-0 z-40 overflow-y-auto overscroll-contain'
      >
        <div
          className={join(
            'mx-auto flex min-h-full max-w-2xl flex-col px-4 pt-6 pb-4 *:last:flex *:last:flex-1 *:last:flex-col has-[.form-footer]:pb-0',
            '[&_.form-footer]:bg-background/95 [&_.form-footer]:border-border [&_.form-footer]:sticky [&_.form-footer]:bottom-0 [&_.form-footer]:z-10 [&_.form-footer]:-mx-4 [&_.form-footer]:mt-auto! [&_.form-footer]:border-t [&_.form-footer]:px-4 [&_.form-footer]:py-3 [&_.form-footer]:backdrop-blur',
            className,
          )}
        >
          {title !== undefined && (
            <SubviewHeader
              title={title}
              onBack={onClose}
              className='bg-background sticky top-0 z-20 -mx-4 -mt-6 px-4 pt-6 pb-3'
            />
          )}
          <SubviewTitleContext.Provider value={title ?? null}>
            {children}
          </SubviewTitleContext.Provider>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className='page'>
      <div className={join('mx-auto max-w-2xl py-6', className)}>
        {title !== undefined && (
          <SubviewHeader title={title} onBack={onClose} />
        )}
        <SubviewTitleContext.Provider value={title ?? null}>
          {children}
        </SubviewTitleContext.Provider>
      </div>
    </div>
  );
}

export default Subview;
