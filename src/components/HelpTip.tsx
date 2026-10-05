import { useState } from 'react';
import type { ReactNode } from 'react';

import { Button, Modal, Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CircleHelp } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

interface HelpTipProps {
  title: string;
  children: ReactNode;
  /** Renders this text as an inline link that opens the explanation in a modal at every size, instead of the help icon. */
  linkLabel?: string;
  className?: string;
}

/** A "what does this mean?" explainer: a help icon that peeks in a popover on a computer and opens a modal on a phone, or a text link that always opens the modal. */
function HelpTip({ title, children, linkLabel, className }: HelpTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');

  const body = <div className='space-y-2 text-left text-sm'>{children}</div>;

  const modal = (
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
  );

  if (linkLabel) {
    return (
      <>
        <Button
          type='button'
          variant='link'
          size='sm'
          className={join('h-auto p-0 text-xs underline', className)}
          onClick={() => setIsOpen(true)}
        >
          {linkLabel}
        </Button>
        {modal}
      </>
    );
  }

  const icon = <CircleHelp className='text-muted-foreground h-3.5 w-3.5' />;

  if (isPhone) {
    return (
      <>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label={`About ${title}`}
          className={join('h-5 w-5', className)}
          onClick={() => setIsOpen(true)}
        >
          {icon}
        </Button>
        {modal}
      </>
    );
  }

  return (
    <Popover
      hoverable
      placement='bottom'
      alignment='center'
      className='w-72 p-3'
      trigger={
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label={`About ${title}`}
          className={join('h-5 w-5', className)}
        >
          {icon}
        </Button>
      }
    >
      <p className='mb-1 text-sm font-semibold'>{title}</p>
      {body}
    </Popover>
  );
}

export default HelpTip;
