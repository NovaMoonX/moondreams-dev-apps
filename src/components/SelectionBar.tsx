import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export interface SelectionBarAction {
  key: string;
  label: string;
  /** A shorter word below `sm`, where the full label would not fit beside the others. */
  shortLabel?: string;
  /** Shown from `sm` up; a phone's bar is words only so three actions share one line at 320px. */
  icon?: ReactNode;
  onClick: () => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  /** Red text and edge, for the one action that throws something away. */
  isDestructive?: boolean;
}

interface SelectionBarProps {
  /** The quiet actions, left to right. */
  actions: SelectionBarAction[];
  /** The one filled action, which takes the leftover width on a phone. */
  primary: SelectionBarAction;
  /** Why the actions are off, kept in the bar beside them. */
  note?: string | null;
}

/** The footer of a pick-several screen, pinned to the bottom of the screen whatever the list's length: quiet actions on the left, the one primary widest on the right. A spacer keeps the list's last row clear of it. */
function SelectionBar({ actions, primary, note }: SelectionBarProps) {
  const { isBelow } = useMediaQuery();
  const isPhone = isBelow('sm');
  const renderLabel = (action: SelectionBarAction) => (
    <span className='inline-flex items-center gap-1.5'>
      {!isPhone && action.icon}
      {isPhone ? (action.shortLabel ?? action.label) : action.label}
    </span>
  );

  return (
    <>
      <div
        className='h-24 [@media(max-height:699px)]:h-20'
        aria-hidden='true'
      />
      <div className='border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur [&_.form-footer]:mx-auto [&_.form-footer]:max-w-2xl [&_.form-footer]:px-4 [&_.form-footer]:pt-3 [&_.form-footer]:pb-[calc(0.75rem+env(safe-area-inset-bottom))] [@media(max-height:699px)]:[&_.form-footer]:pt-2 [@media(max-height:699px)]:[&_.form-footer]:pb-[calc(0.5rem+env(safe-area-inset-bottom))]'>
        <ModalFooterActions
          note={note}
          leftActions={actions.map((action) => (
            <Button
              key={action.key}
              type='button'
              variant='secondary'
              className={join(
                'h-11 gap-1.5 px-3 max-sm:px-3.5 [@media(max-height:699px)]:h-10',
                action.isDestructive &&
                  'border-destructive/60 text-destructive! hover:bg-destructive/10',
              )}
              aria-label={action.label}
              loading={action.isLoading}
              disabled={action.isDisabled}
              onClick={action.onClick}
            >
              {renderLabel(action)}
            </Button>
          ))}
          rightActions={
            <Button
              type='button'
              className='h-11 gap-1.5 px-5 [@media(max-height:699px)]:h-10'
              aria-label={primary.label}
              loading={primary.isLoading}
              disabled={primary.isDisabled}
              onClick={primary.onClick}
            >
              {renderLabel(primary)}
            </Button>
          }
        />
      </div>
    </>
  );
}

export default SelectionBar;
