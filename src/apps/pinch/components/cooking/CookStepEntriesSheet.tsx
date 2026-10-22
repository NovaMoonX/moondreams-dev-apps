import { Button } from '@moondreamsdev/dreamer-ui/components';
import { PenLine, Pencil, Plus, Volume2 } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { NOTE_KIND_EMOJIS } from '@apps/pinch/constants';
import type { RecipeNote } from '@apps/pinch/types';

interface CookStepEntriesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stepNumber: number;
  /** Everything written for the step on screen (the whole recipe's too on the first), tips first. */
  entries: RecipeNote[];
  /** Null where writing isn't available. */
  onAdd: (() => void) | null;
  onEdit: (id: string) => void;
  /** Opens the recipe's form to make a planned change. */
  onApplyChange: (id: string) => void;
  /** Reads the entries aloud; null where the browser cannot speak. */
  onRead: (() => void) | null;
}

/** What was written for a step while cooking: its tips, then its notes and planned changes, in a sheet so the step itself stays bare. */
function CookStepEntriesSheet({
  isOpen,
  onClose,
  stepNumber,
  entries,
  onAdd,
  onEdit,
  onApplyChange,
  onRead,
}: CookStepEntriesSheetProps) {
  const tips = entries.filter((entry) => entry.kind === 'TIP');
  const others = entries.filter((entry) => entry.kind !== 'TIP');
  const hasBoth = tips.length > 0 && others.length > 0;

  const renderEntry = (entry: RecipeNote) => {
    const actions: ActionChip[] = [
      ...(entry.kind === 'CHANGE'
        ? [
            {
              key: 'apply',
              icon: <PenLine className='h-4 w-4' />,
              label: 'Update the recipe',
              onClick: () => onApplyChange(entry.id),
            },
          ]
        : []),
      {
        key: 'edit',
        icon: <Pencil className='h-4 w-4' />,
        label: 'Edit',
        description: `Edit your ${entry.kind === 'TIP' ? 'tip' : entry.kind === 'CHANGE' ? 'change' : 'note'}`,
        onClick: () => onEdit(entry.id),
      },
    ];
    return (
      <li key={entry.id} className='space-y-1.5 py-2.5'>
        <p className='flex gap-2 text-base wrap-break-word'>
          <span aria-hidden='true' className='w-5 shrink-0 text-center'>
            {NOTE_KIND_EMOJIS[entry.kind]}
          </span>
          <span className='min-w-0 flex-1 whitespace-pre-wrap'>
            {entry.text}
          </span>
        </p>
        {entry.kind === 'CHANGE' && (entry.reason ?? '') !== '' && (
          <p className='text-muted-foreground pl-7 text-sm wrap-break-word'>
            Why: {entry.reason}
          </p>
        )}
        <ActionChips actions={actions} className='pl-7' />
      </li>
    );
  };

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Step ${stepNumber}`}
      footer={
        onAdd || onRead ? (
          <div className='flex gap-2'>
            {onRead && (
              <Button
                type='button'
                variant='secondary'
                size='icon'
                className='size-12 shrink-0'
                aria-label='Read them aloud'
                onClick={onRead}
              >
                <Volume2 className='h-4 w-4' aria-hidden='true' />
              </Button>
            )}
            {onAdd && (
              <Button
                type='button'
                className='h-12 min-w-0 flex-1 gap-2'
                onClick={onAdd}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                Add a tip, note or change
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {tips.length > 0 && (
        <>
          {hasBoth && <SectionDivider label='Tips' />}
          <ul className='divide-border divide-y'>{tips.map(renderEntry)}</ul>
        </>
      )}
      {others.length > 0 && (
        <>
          {hasBoth && <SectionDivider label='Notes and changes' />}
          <ul className='divide-border divide-y'>{others.map(renderEntry)}</ul>
        </>
      )}
    </DetailSheet>
  );
}

export default CookStepEntriesSheet;
