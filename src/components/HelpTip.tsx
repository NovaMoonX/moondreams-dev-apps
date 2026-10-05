import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Button, Modal, Tooltip } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CircleHelp } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

interface HelpTipProps {
  title: string;
  children: ReactNode;
  /** Shows this text as an inline link that opens the explanation in a modal at every size, instead of the help icon. */
  linkLabel?: string;
  /** Keeps a phone from opening a modal, for a help icon that sits inside a drawer, modal or subview. */
  noModal?: boolean;
  className?: string;
}

/** A "what does this mean?" explainer: a help icon with a hover tooltip on a computer and a modal on a phone, or an inline link that opens the modal at every size. */
function HelpTip({
  title,
  children,
  linkLabel,
  noModal = false,
  className,
}: HelpTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const usesModal = Boolean(linkLabel) || (isPhone && !noModal);

  // The modal can sit over a drawer, and both close on one Escape: capture it here so only the modal does.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  const body = <div className='space-y-2 text-left text-sm'>{children}</div>;

  const modal = (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
      <div className='space-y-4'>
        {body}
        <div className='flex justify-end'>
          <Button type='button' rounded='full' onClick={() => setIsOpen(false)}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (linkLabel) {
    return (
      <>
        <Button
          type='button'
          variant='link'
          size='sm'
          className={join(
            'inline! h-auto! min-h-0! p-0! align-baseline text-xs underline',
            className,
          )}
          onClick={() => setIsOpen(true)}
        >
          {linkLabel}
        </Button>
        {modal}
      </>
    );
  }

  const trigger = (
    <Button
      type='button'
      variant='tertiary'
      size='icon'
      rounded='full'
      aria-label={`Help: ${title}`}
      className={join(
        "relative -my-1 h-5 w-5 after:absolute after:-inset-2.5 after:content-['']",
        className,
      )}
      onClick={usesModal ? () => setIsOpen(true) : undefined}
    >
      <CircleHelp className='text-muted-foreground h-3.5 w-3.5' />
    </Button>
  );

  return (
    <>
      {usesModal ? (
        trigger
      ) : (
        <Tooltip
          placement='bottom'
          showArrow
          className='w-64 text-left'
          message={
            <div className='space-y-1'>
              <p className='text-sm font-semibold'>{title}</p>
              {body}
            </div>
          }
        >
          {trigger}
        </Tooltip>
      )}
      {usesModal && modal}
    </>
  );
}

export default HelpTip;
