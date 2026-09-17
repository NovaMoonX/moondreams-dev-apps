import type { ReactNode } from 'react';

interface ModalFooterActionsProps {
  leftActions?: ReactNode;
  rightActions: ReactNode;
}

/** Shared modal footer layout: left (secondary/destructive) and right (cancel/submit) action groups that wrap instead of clipping on narrow viewports. */
function ModalFooterActions({ leftActions, rightActions }: ModalFooterActionsProps) {
  return (
    <div className='col-span-full flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex flex-wrap items-center gap-2'>{leftActions}</div>
      <div className='flex flex-wrap items-center justify-end gap-2'>{rightActions}</div>
    </div>
  );
}

export default ModalFooterActions;
