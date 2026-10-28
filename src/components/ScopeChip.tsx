import { useState, type ReactNode } from 'react';

import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown } from 'lucide-react';

import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface ScopeChipProps {
  /** The scope in force ("This month"). */
  label: string;
  /** Names the choice for the drawer title and the chip's accessible name ("Period"). */
  title: string;
  /** The choices; the function gets a way to close, for a pick that settles it. */
  children: (close: () => void) => ReactNode;
}

/** A quiet scope choice over a list: a thin chip with the scope's name and a small chevron, opening its choices in a drawer on a phone and a popover from `sm` up. 28px tall with a 40px hit area. */
function ScopeChip({ label, title, children }: ScopeChipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const close = () => setIsOpen(false);
  const { dialogId, onDialogClose } = useSheetHistory(isOpen && isPhone, close);

  const trigger = (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      aria-label={`${title}: ${label}`}
      aria-expanded={isOpen}
      className="relative h-7 min-h-0 max-w-full gap-1 px-3 py-0 text-sm font-medium whitespace-nowrap !transition-none after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
      onClick={() => setIsOpen((open) => !open)}
    >
      <span className='truncate'>{label}</span>
      <ChevronDown className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
    </Button>
  );

  if (isPhone) {
    return (
      <>
        {trigger}
        <Drawer
          id={dialogId}
          isOpen={isOpen}
          onClose={onDialogClose}
          title={title}
          showCloseButton
        >
          <div className='space-y-4 pb-4'>{isOpen && children(close)}</div>
        </Drawer>
      </>
    );
  }
  return (
    <Popover
      trigger={trigger}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement='bottom'
      alignment='end'
      className='w-80 p-4'
    >
      {isOpen && <div className='space-y-4'>{children(close)}</div>}
    </Popover>
  );
}

export default ScopeChip;
