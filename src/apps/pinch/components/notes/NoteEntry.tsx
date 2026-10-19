import { memo } from 'react';

import { Pencil, PenLine } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
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
  /** Null reads the entry without the Edit chip. */
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
  const actions: ActionChip[] = [
    ...(onApply && !isTweak
      ? [
          {
            key: 'apply',
            icon: <PenLine className='h-4 w-4' />,
            label: 'Apply to the recipe',
            description: `Apply the note from ${date} to the recipe`,
            onClick: () => onApply(note.id),
          },
        ]
      : []),
    ...(onEdit
      ? [
          {
            key: 'edit',
            icon: <Pencil className='h-4 w-4' />,
            label: 'Edit',
            description: `Edit the ${isTweak ? 'tweak' : 'note'} from ${date}`,
            onClick: () => onEdit(note.id),
          },
        ]
      : []),
  ];

  return (
    <li className='py-3'>
      <p className='flex flex-wrap items-center gap-x-2 pb-2 text-sm font-medium'>
        <span className='whitespace-nowrap'>
          {isTweak ? `Changed on ${date}` : date}
        </span>
        {isTweak && (
          <span className='bg-accent text-accent-foreground border-border rounded-full border px-2 py-0.5 text-xs font-normal whitespace-nowrap'>
            Tweak
          </span>
        )}
      </p>
      <div className='space-y-2'>
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
        <ActionChips actions={actions} />
      </div>
    </li>
  );
}

export default memo(NoteEntry);
