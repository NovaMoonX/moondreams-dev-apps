import { Button } from '@moondreamsdev/dreamer-ui/components';
import { PenLine, Plus } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import FormSection from '@/components/FormSection';
import { useAppSelector } from '@/store';
import {
  NOTE_KIND_EMOJIS,
  SOFT_MAX_RECIPE_NOTES,
} from '@apps/pinch/constants';
import {
  selectNotesByRecipe,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { formatDateShort } from '@/utils/formatUtils';
import { resolveNoteStep } from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];

const KIND_ORDER = { TIP: 0, CHANGE: 1, NOTE: 2, TWEAK: 3 } as const;
const KIND_TAGS = { TIP: 'Tip', CHANGE: 'To change', NOTE: 'Note', TWEAK: '' };

interface RecipeJournalRowProps {
  recipeId: string;
  /** Opens one entry to read and edit, or a new one when null. */
  onOpen: (noteId: string | null) => void;
  /** Opens the recipe's form to make a planned change. */
  onApplyChange: (noteId: string) => void;
}

/**
 * The person's own tips, notes and planned changes as one row of cards at the foot of the recipe that scrolls sideways and snaps to a card, the last one adding another. The records of edits already made are in the history behind the clock.
 */
function RecipeJournalRow({
  recipeId,
  onOpen,
  onApplyChange,
}: RecipeJournalRowProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;
  const isLoaded = useAppSelector((state) => state.pinch.notes.isLoaded);
  const loadError = useAppSelector((state) => state.pinch.notes.loadError);
  const canAdd = isLoaded && notes.length < SOFT_MAX_RECIPE_NOTES;

  if (loadError !== null || !isLoaded) return null;

  const entries = notes
    .filter((note) => note.kind !== 'TWEAK')
    .map((note) => ({ note, step: resolveNoteStep(note, steps) }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.note.kind] - KIND_ORDER[b.note.kind] ||
        (a.note.kind === 'TIP' ? (a.step ?? -1) - (b.step ?? -1) : 0) ||
        b.note.createdAt - a.note.createdAt,
    );

  const addCard = canAdd && (
    <Button
      type='button'
      variant='tertiary'
      className={
        entries.length === 0
          ? 'border-border text-foreground! h-12 w-full justify-start gap-2 rounded-2xl border border-dashed px-4 font-normal'
          : 'border-border text-foreground! h-auto min-h-28 w-[56%] shrink-0 snap-start flex-col justify-center gap-1 rounded-2xl border border-dashed px-3 font-normal whitespace-normal sm:w-44'
      }
      onClick={() => onOpen(null)}
    >
      <Plus className='h-4 w-4' aria-hidden='true' />
      <span className='text-sm'>Add a tip, note or change</span>
    </Button>
  );

  if (entries.length === 0 && !addCard) return null;

  return (
    <FormSection title='Tips, notes and changes'>
      {entries.length === 0 ? (
        addCard
      ) : (
        <ul
          aria-label='Your tips, notes and changes'
          className='-mx-1 flex snap-x snap-mandatory scroll-px-1 items-stretch gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        >
          {entries.map(({ note, step }) => (
            <li
              key={note.id}
              className='bg-muted/50 border-border flex w-[80%] shrink-0 snap-start flex-col justify-between gap-1 rounded-2xl border sm:w-72'
            >
              <Button
                type='button'
                variant='tertiary'
                aria-label={`${KIND_TAGS[note.kind]}: ${note.text ?? ''}`}
                className='text-foreground! h-auto w-full flex-1 flex-col items-start justify-start gap-1.5 rounded-2xl px-3 pt-3 pb-2 text-left font-normal whitespace-normal'
                onClick={() => onOpen(note.id)}
              >
                <span className='text-muted-foreground flex w-full items-center gap-1.5 text-xs'>
                  <span aria-hidden='true'>{NOTE_KIND_EMOJIS[note.kind]}</span>
                  <span className='font-medium'>{KIND_TAGS[note.kind]}</span>
                  {step !== null && <span>· Step {step + 1}</span>}
                  {note.kind === 'NOTE' && (
                    <span className='ml-auto'>
                      {formatDateShort(note.createdAt)}
                    </span>
                  )}
                </span>
                <span className='line-clamp-5 block w-full text-sm wrap-break-word'>
                  {note.text}
                </span>
                {note.kind === 'CHANGE' && (note.reason ?? '') !== '' && (
                  <span className='text-muted-foreground line-clamp-2 block w-full text-xs'>
                    Why: {note.reason}
                  </span>
                )}
              </Button>
              {note.kind === 'CHANGE' && (
                <ActionChips
                  className='px-3 pb-3'
                  actions={[
                    {
                      key: 'apply',
                      icon: <PenLine className='h-4 w-4' />,
                      label: 'Update the recipe',
                      onClick: () => onApplyChange(note.id),
                    },
                  ]}
                />
              )}
            </li>
          ))}
          {addCard && <li className='flex'>{addCard}</li>}
        </ul>
      )}
    </FormSection>
  );
}

export default RecipeJournalRow;
