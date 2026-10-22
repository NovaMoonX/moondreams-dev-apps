import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, PenLine, Pencil, Volume2 } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import { NOTE_KIND_EMOJIS } from '@apps/pinch/constants';
import type { RecipeNote } from '@apps/pinch/types';

interface CookStepNotesProps {
  /** The notes and planned changes for this step, newest first within each kind. */
  entries: RecipeNote[];
  onEdit: (id: string) => void;
  /** Opens the recipe's form to make a planned change. */
  onApplyChange: (id: string) => void;
  /** Reads the notes aloud; null where the browser cannot speak. */
  onRead: (() => void) | null;
}

const getSummary = (entries: RecipeNote[]) => {
  const notes = entries.filter((entry) => entry.kind === 'NOTE').length;
  const changes = entries.filter((entry) => entry.kind === 'CHANGE').length;
  return [
    notes > 0 && `${NOTE_KIND_EMOJIS.NOTE} ${notes === 1 ? '1 note' : `${notes} notes`}`,
    changes > 0 &&
      `${NOTE_KIND_EMOJIS.CHANGE} ${changes === 1 ? '1 change to make' : `${changes} changes to make`}`,
  ]
    .filter(Boolean)
    .join(' · ');
};

/** One quiet line above the ingredient tray for a step's notes and planned changes, opening in place. A step with none draws nothing; the way to write a new one is the pencil beside the step counter. */
function CookStepNotes({
  entries,
  onEdit,
  onApplyChange,
  onRead,
}: CookStepNotesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const summary = getSummary(entries);
  if (entries.length === 0) return null;

  return (
    <div data-cook='step-notes' className='space-y-1'>
      <div className='flex items-center gap-1'>
        <Button
            type='button'
            variant='tertiary'
            aria-expanded={isOpen}
            className='text-foreground! h-10 min-w-0 flex-1 justify-between gap-2 px-0! font-normal hover:bg-transparent'
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className='min-w-0 flex-1 truncate text-left text-sm'>
              {summary}
            </span>
            <ChevronDown
              className={join('h-4 w-4 shrink-0', isOpen && 'rotate-180')}
              aria-hidden='true'
            />
          </Button>
        {onRead && (
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            className='size-10 shrink-0'
            aria-label='Read the notes aloud'
            onClick={onRead}
          >
            <Volume2 className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
      </div>
      {isOpen && entries.length > 0 && (
        <ul className='divide-border divide-y'>
          {entries.map((entry) => {
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
                description: `Edit your ${entry.kind === 'CHANGE' ? 'change' : 'note'}`,
                onClick: () => onEdit(entry.id),
              },
            ];
            return (
              <li key={entry.id} className='space-y-1.5 py-2.5'>
                <p className='flex gap-2 text-sm wrap-break-word'>
                  <span aria-hidden='true' className='w-5 shrink-0 text-center'>
                    {NOTE_KIND_EMOJIS[entry.kind]}
                  </span>
                  <span className='min-w-0 flex-1 whitespace-pre-wrap'>
                    {entry.text}
                  </span>
                </p>
                {entry.kind === 'CHANGE' && (entry.reason ?? '') !== '' && (
                  <p className='text-muted-foreground pl-7 text-xs wrap-break-word'>
                    Why: {entry.reason}
                  </p>
                )}
                <ActionChips actions={actions} className='pl-7' />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default CookStepNotes;
