import { memo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { PenLine } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import ClampedText from '@/components/ClampedText';
import { formatDateShort } from '@/utils/formatUtils';
import ChangeList from '@apps/pinch/components/notes/ChangeList';
import type { Cook, RecipeNote } from '@apps/pinch/types';

interface NoteEntryProps {
  note: RecipeNote;
  /** The cook this follows up, when it still exists. */
  cook: Cook | null;
  /** The day of the recipe's latest tweak when this note was written before it. */
  writtenBefore: number | null;
  /** Null reads the entry without the Edit button. */
  onEdit: ((id: string) => void) | null;
  /** Opens the recipe's form with this note quoted; offered on a note, never on a tweak. */
  onApply: ((id: string) => void) | null;
}

function NoteEntry({
  note,
  cook,
  writtenBefore,
  onEdit,
  onApply,
}: NoteEntryProps) {
  const isTweak = note.kind === 'TWEAK';
  const date = formatDateShort(note.createdAt);
  const text = note.text ?? null;

  return (
    <li className='py-1'>
      <div
        className={join(
          'flex items-center justify-between gap-3',
          onEdit && 'min-h-10',
        )}
      >
        <p className='flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-medium'>
          <span className='whitespace-nowrap'>
            {isTweak ? `Changed on ${date}` : date}
          </span>
          {isTweak && (
            <span className='bg-accent text-accent-foreground border-border rounded-full border px-2 py-0.5 text-xs font-normal whitespace-nowrap'>
              Tweak
            </span>
          )}
        </p>
        {onEdit && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            aria-label={`Edit the ${isTweak ? 'tweak' : 'note'} from ${date}`}
            className='-mr-2 h-10 shrink-0 px-2!'
            onClick={() => onEdit(note.id)}
          >
            Edit
          </Button>
        )}
      </div>
      <div className='space-y-2 pb-2'>
        {cook && (
          <p className='text-muted-foreground text-xs'>
            After cooking on {formatDateShort(cook.cookedAt)}
          </p>
        )}
        {isTweak && <ChangeList changes={note.changes ?? []} />}
        {text && <ClampedText text={text} />}
        {writtenBefore !== null && (
          <p className='text-muted-foreground text-xs'>
            Written before your {formatDateShort(writtenBefore)} tweak
          </p>
        )}
        {onApply && !isTweak && (
          <ActionChips
            actions={[
              {
                key: 'apply',
                icon: <PenLine className='h-4 w-4' />,
                label: 'Apply to the recipe',
                description: `Apply the note from ${date} to the recipe`,
                onClick: () => onApply(note.id),
              },
            ]}
          />
        )}
      </div>
    </li>
  );
}

export default memo(NoteEntry);
