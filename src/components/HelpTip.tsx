import { useState } from 'react';
import type { ReactNode } from 'react';

import { Button, Modal, Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CircleHelp } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

interface HelpTipProps {
  title: string;
  children: ReactNode;
  /** Shows this text as an inline link that reveals the explanation in place, for use inside a drawer, modal or form. */
  linkLabel?: string;
  /** Keeps a phone from opening a modal, for a help icon that sits inside a drawer, modal or subview. */
  noModal?: boolean;
  className?: string;
}

/** A "what does this mean?" explainer: a help icon that peeks in a popover on a computer and opens a modal on a phone, or an inline link that reveals it in place. */
function HelpTip({
  title,
  children,
  linkLabel,
  noModal = false,
  className,
}: HelpTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const usesModal = isPhone && !noModal;

  const body = <div className='space-y-2 text-left text-sm'>{children}</div>;

  if (linkLabel) {
    return (
      <>
        <Button
          type='button'
          variant='link'
          size='sm'
          aria-expanded={isOpen}
          className={join('h-auto p-0 text-xs underline', className)}
          onClick={() => setIsOpen((current) => !current)}
        >
          {linkLabel}
        </Button>
        {isOpen && (
          <div className='bg-secondary/60 text-foreground mt-2 rounded-2xl p-3'>
            <p className='mb-1 text-sm font-semibold'>{title}</p>
            {body}
          </div>
        )}
      </>
    );
  }

  const renderTrigger = (onClick?: () => void) => (
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
      onClick={onClick}
    >
      <CircleHelp className='text-muted-foreground h-3.5 w-3.5' />
    </Button>
  );

  return (
    <>
      {usesModal ? (
        renderTrigger(() => setIsOpen(true))
      ) : (
        <Popover
          hoverable={!isPhone}
          placement='bottom'
          alignment='center'
          className='w-72 p-3'
          trigger={renderTrigger()}
        >
          <p className='mb-1 text-left text-sm font-semibold'>{title}</p>
          {body}
        </Popover>
      )}
      {usesModal && (
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
          <div className='space-y-4'>
            {body}
            <div className='flex justify-end'>
              <Button
                type='button'
                rounded='full'
                onClick={() => setIsOpen(false)}
              >
                Got it
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default HelpTip;
