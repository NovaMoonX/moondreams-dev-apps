import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, ChevronDown, PenLine } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import RecipeNotes from '@apps/pinch/components/notes/RecipeNotes';
import {
  selectNoteSummaries,
  selectNotesByRecipe,
  selectNotesLoadError,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { getNoteSummary, leadWithAdvice } from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const LONG_NOTE_CHARS = 180;

interface CookNoteCardProps {
  recipeId: string;
  onGotIt: () => void;
  onApply: (noteId: string) => void;
}

function CookNoteCard({ recipeId, onGotIt, onApply }: CookNoteCardProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const isReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const [isOpen, setIsOpen] = useState(false);

  const latest = notes.find((entry) => entry.kind === 'NOTE') ?? null;
  if (!isReady || latest === null) {
    return null;
  }

  const body = getNoteSummary(latest, formatDateShort).body;
  const isChangedSince = lastTweakAt !== null && lastTweakAt > latest.createdAt;
  const hasMore = notes.length > 1 || body.length > LONG_NOTE_CHARS;
  const date = formatDateShort(latest.createdAt);

  return (
    <section
      data-cook='note-card'
      aria-label='Your latest note for this recipe'
      className='bg-accent/60 border-border rounded-2xl border px-3 pt-1 pb-3'
    >
      {hasMore ? (
        <Button
          type='button'
          variant='tertiary'
          aria-expanded={isOpen}
          className='text-foreground! h-10 w-full justify-between gap-2 px-0! font-normal hover:bg-transparent'
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className='flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium'>
            <span aria-hidden='true'>📝</span>
            Last time · {date}
          </span>
          <ChevronDown
            className={join('h-4 w-4 shrink-0', isOpen && 'rotate-180')}
            aria-hidden='true'
          />
        </Button>
      ) : (
        <p className='flex h-10 items-center gap-2 text-sm font-medium'>
          <span aria-hidden='true'>📝</span>
          Last time · {date}
        </p>
      )}
      {isOpen ? (
        <RecipeNotes
          recipeId={recipeId}
          onAdd={null}
          onEdit={null}
          onApply={onApply}
        />
      ) : (
        <div className='space-y-1'>
          <p className='line-clamp-4 text-sm text-pretty wrap-break-word [@media(max-height:700px)]:line-clamp-2'>
            {leadWithAdvice(body)}
          </p>
          {isChangedSince && (
            <p className='text-muted-foreground text-xs'>
              You've changed the recipe since.
            </p>
          )}
        </div>
      )}
      <ActionChips
        label='Your note'
        className='mt-2'
        actions={[
          {
            key: 'got-it',
            icon: <Check className='h-4 w-4' />,
            label: 'Got it',
            description: 'Got it, hide this note while you cook',
            onClick: onGotIt,
          },
          ...(isOpen
            ? []
            : [
                {
                  key: 'apply',
                  icon: <PenLine className='h-4 w-4' />,
                  label: 'Apply to the recipe',
                  description: `Apply the note from ${date} to the recipe`,
                  onClick: () => onApply(latest.id),
                },
              ]),
        ]}
      />
    </section>
  );
}

export default CookNoteCard;
