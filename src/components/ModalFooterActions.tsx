import type { ReactNode } from 'react';

interface ModalFooterActionsProps {
  leftActions?: ReactNode;
  rightActions: ReactNode;
}

/**
 * Shared modal footer layout: left (secondary/destructive) and right (cancel/submit) action
 * groups, side by side on one row at every width. Relies on button labels staying short
 * ("Save"/"Add", not "Save changes"/"Add event") — a footer that needs longer labels to be
 * clear belongs in a wider layout, not a wrapped stack here.
 */
function ModalFooterActions({ leftActions, rightActions }: ModalFooterActionsProps) {
  return (
    <div className='col-span-full flex flex-row items-center justify-between gap-2'>
      <div className='flex items-center gap-2'>{leftActions}</div>
      <div className='flex items-center justify-end gap-2'>{rightActions}</div>
    </div>
  );
}

export default ModalFooterActions;
