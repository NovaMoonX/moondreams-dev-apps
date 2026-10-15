import { useState, type ReactNode } from 'react';

import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Eye } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface ViewOptionSwitchProps {
  label: string;
  /** One quiet line under the label, for what the switch leaves out or why it can't be used. */
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  isDisabled?: boolean;
}

/** One show/hide row of a `ViewOptions` panel: the label and its switch, which takes effect at once. */
export function ViewOptionSwitch({
  label,
  description,
  checked,
  onCheckedChange,
  isDisabled = false,
}: ViewOptionSwitchProps) {
  return (
    <label
      className={join(
        'flex items-start justify-between gap-4 py-3',
        isDisabled && 'opacity-60',
      )}
    >
      <span className='min-w-0'>
        <span className='block text-sm font-medium'>{label}</span>
        {description && (
          <span className='text-muted-foreground block text-xs'>
            {description}
          </span>
        )}
      </span>
      <AppToggle
        aria-label={label}
        checked={checked}
        disabled={isDisabled}
        onCheckedChange={onCheckedChange}
        className='mt-0.5 shrink-0'
      />
    </label>
  );
}

interface ViewOptionsProps {
  /** Names the button and the sheet it opens. */
  label?: string;
  /** Options that differ from their defaults: tints the button and offers "Reset". */
  customizedCount?: number;
  onReset?: () => void;
  className?: string;
  /** The options: `ViewOptionSwitch` rows and the like. */
  children: ReactNode;
}

/** An icon button beside a list's search field that opens how the list's rows look: a drawer on phones, a popover from `sm` up. */
function ViewOptions({
  label = 'View options',
  customizedCount = 0,
  onReset,
  className,
  children,
}: ViewOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const isCustomized = customizedCount > 0;
  const { dialogId, onDialogClose } = useSheetHistory(isOpen && isPhone, () =>
    setIsOpen(false),
  );

  const trigger = (
    <Button
      type='button'
      variant='secondary'
      rounded='full'
      aria-label={label}
      aria-expanded={isOpen}
      className={join(
        'h-12 w-12 shrink-0 p-0',
        isCustomized && 'bg-accent!',
        className,
      )}
      onClick={() => setIsOpen((open) => !open)}
    >
      <Eye className='h-5 w-5' aria-hidden='true' />
    </Button>
  );

  const resetButton = isCustomized && onReset && (
    <Button
      type='button'
      variant='secondary'
      className='h-11'
      onClick={onReset}
    >
      Reset
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
          title={label}
          showCloseButton
          footer={
            <div className='flex items-center gap-2 px-4 pb-4'>
              {resetButton}
              <Button
                type='button'
                className='h-11 min-w-0 flex-1'
                onClick={() => setIsOpen(false)}
              >
                Done
              </Button>
            </div>
          }
        >
          <div className='space-y-4 pb-4'>{children}</div>
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
      {isOpen && (
        <div className='space-y-4'>
          {children}
          {resetButton && (
            <div className='border-border border-t pt-3'>{resetButton}</div>
          )}
        </div>
      )}
    </Popover>
  );
}

export default ViewOptions;
