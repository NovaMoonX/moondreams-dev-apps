import { memo } from 'react';

import { Pencil, PenLine } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import ClampedText from '@/components/ClampedText';
import { formatDateShort } from '@/utils/formatUtils';
import ChangeList from '@apps/pinch/components/notes/ChangeList';
import { NOTE_KIND_LABELS } from '@apps/pinch/constants';
import type { Cook, RecipeNote } from '@apps/pinch/types';

interface NoteEntryProps {
  note: RecipeNote;
  /** The cook this follows up, when it still exists. */
  cook: Cook | null;
  /** The day of the recipe's latest tweak when this note was written before it. */
  writtenBefore: number | null;
  /** The step this is about (0-based) in the recipe as it is now, or null for the whole recipe. */
  stepAt: number | null;
  /** It was written about a step that has since been rewritten or removed. */
  isStepLost: boolean;
  /** Null reads the entry without the Edit chip. */
  onEdit: ((id: string) => void) | null;
  /** Opens the recipe's form to make a planned change; offered on a change only. */
  onApplyChange: ((id: string) => void) | null;
}

function NoteEntry({
  note,
  cook,
  writtenBefore,
  stepAt,
  isStepLost,
  onEdit,
  onApplyChange,
}: NoteEntryProps) {
  const isTweak = note.kind === 'TWEAK';
  const isChange = note.kind === 'CHANGE';
  const date = formatDateShort(note.createdAt);
  const text = note.text ?? null;
  const reason = note.reason ?? null;
  const kindName = NOTE_KIND_LABELS[note.kind].toLowerCase();
  const actions: ActionChip[] = [
    ...(onApplyChange && isChange
      ? [
          {
            key: 'apply',
            icon: <PenLine className='h-4 w-4' />,
            label: 'Update the recipe',
            description: `Update the recipe with the change from ${date}`,
            onClick: () => onApplyChange(note.id),
          },
        ]
      : []),
    ...(onEdit
      ? [
          {
            key: 'edit',
            icon: <Pencil className='h-4 w-4' />,
            label: 'Edit',
            description: `Edit the ${kindName} from ${date}`,
            onClick: () => onEdit(note.id),
          },
        ]
      : []),
  ];

  return (
    <li className='py-3'>
      <p className='flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 text-sm font-medium'>
        <span className='whitespace-nowrap'>
          {isTweak ? `Changed on ${date}` : date}
        </span>
        {note.kind !== 'NOTE' && (
          <span className='bg-accent text-accent-foreground border-border rounded-full border px-2 py-0.5 text-xs font-normal whitespace-nowrap'>
            {isChange ? 'To change' : NOTE_KIND_LABELS[note.kind]}
          </span>
        )}
        {stepAt !== null && (
          <span className='text-muted-foreground text-xs font-normal whitespace-nowrap'>
            Step {stepAt + 1}
          </span>
        )}
      </p>
      <div className='space-y-2'>
        {cook && (
          <p className='text-muted-foreground text-xs'>
            After cooking on {formatDateShort(cook.cookedAt)}
          </p>
        )}
        {isStepLost && (
          <p className='text-muted-foreground text-xs'>
            Written for a step that has changed since
          </p>
        )}
        {isTweak && <ChangeList changes={note.changes ?? []} />}
        {text && <ClampedText text={text} />}
        {isChange && reason && (
          <p className='text-muted-foreground text-sm wrap-break-word'>
            Why: {reason}
          </p>
        )}
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
