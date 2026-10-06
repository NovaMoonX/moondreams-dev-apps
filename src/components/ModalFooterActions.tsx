import type { ReactNode } from 'react';

interface ModalFooterActionsProps {
  leftActions?: ReactNode;
  /** Cancel / Close, kept on the left edge after any destructive icon so the primary action stands alone on the right. */
  cancelAction?: ReactNode;
  rightActions: ReactNode;
}

/**
 * Shared form footer layout (a modal's, or the bottom of a form subview, where it pins to the screen): left (secondary/destructive) and right (cancel/submit) action
 * groups, side by side on one row at every width. Relies on button labels staying short
 * ("Save"/"Add", not "Save changes"/"Add event") — a footer that needs longer labels to be
 * clear belongs in a wider layout, not a wrapped stack here. On a phone the right group takes
 * the row's remaining width and its last button (the primary) grows.
 */
function ModalFooterActions({ leftActions, cancelAction, rightActions }: ModalFooterActionsProps) {
  return (
    <div className='form-footer col-span-full flex flex-row items-center justify-between gap-2'>
      <div className='flex items-center gap-2'>
        {leftActions}
        {cancelAction}
      </div>
      <div className='flex items-center justify-end gap-2 max-sm:flex-1 max-sm:[&>:last-child]:flex-1'>{rightActions}</div>
    </div>
  );
}

export default ModalFooterActions;
