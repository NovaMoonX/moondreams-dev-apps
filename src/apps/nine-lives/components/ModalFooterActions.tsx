import type { ReactNode } from 'react';

interface ModalFooterActionsProps {
  leftActions?: ReactNode;
  rightActions: ReactNode;
}

/**
 * Shared modal footer layout: left (secondary/destructive) and right (cancel/submit) action
 * groups. On narrow viewports this reads top-to-bottom as one cohesive stack (left group, then
 * right group, both left-aligned with matching spacing) instead of two misaligned rows — the
 * `sm:justify-end` on the right group only kicks in once there's room for a single row.
 */
function ModalFooterActions({ leftActions, rightActions }: ModalFooterActionsProps) {
  return (
    <div className='col-span-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3'>
      <div className='flex flex-wrap items-center gap-2'>{leftActions}</div>
      <div className='flex flex-wrap items-center gap-2 sm:justify-end'>{rightActions}</div>
    </div>
  );
}

export default ModalFooterActions;
