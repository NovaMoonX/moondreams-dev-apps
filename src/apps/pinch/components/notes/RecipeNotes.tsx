import { useState } from 'react';

import { NotebookPen } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import FormSection from '@/components/FormSection';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import NoteEntry from '@apps/pinch/components/notes/NoteEntry';
import {
  RECIPE_NOTES_FIRST_PAGE,
  RECIPE_NOTES_PAGE_SIZE,
  SECTION_COUNT_THRESHOLD,
  SOFT_MAX_RECIPE_NOTES,
} from '@apps/pinch/constants';
import {
  selectCooksById,
  selectNoteSummaries,
  selectNotesByRecipe,
  selectNotesLoadError,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import {
  getWrittenBefore,
  isNoteHistoryFull,
  isStepLost,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];
const NO_STEPS: string[] = [];
const HIDDEN_WORTH_A_BUTTON = 3;

interface RecipeNotesProps {
  recipeId: string;
  /** Null reads the notes without the add row (cooking mode, where a note is written on the final panel). */
  onAdd: (() => void) | null;
  /** Null reads the notes without the Edit buttons. */
  onEdit: ((noteId: string) => void) | null;
  /** Opens the recipe's form to make a planned change; null reads the changes without the button. */
  onApplyChange: ((noteId: string) => void) | null;
}

function RecipeNotes({
  recipeId,
  onAdd,
  onEdit,
  onApplyChange,
}: RecipeNotesProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const cooksById = useAppSelector(selectCooksById);
  const steps =
    useAppSelector(selectRecipesById).get(recipeId)?.steps ?? NO_STEPS;
  const isLoaded = useAppSelector((state) => state.pinch.notes.isLoaded);
  const loadError = useAppSelector(selectNotesLoadError);
  const [limit, setLimit] = useState(RECIPE_NOTES_FIRST_PAGE);

  if (loadError !== null) {
    return (
      <FormSection title='Notes'>
        <p className='text-muted-foreground text-sm'>
          Your notes couldn't load just now.
        </p>
      </FormSection>
    );
  }

  const isFull = isNoteHistoryFull(notes.length);
  const getAddSubtitle = () => {
    if (!isLoaded) return 'Loading your notes…';
    if (isFull) {
      return `This recipe's notes are full (${SOFT_MAX_RECIPE_NOTES}). Delete an older one to add more.`;
    }
    return 'A tip, a note or a change to make';
  };

  const hidden = notes.length - limit;
  const visibleCount = hidden > HIDDEN_WORTH_A_BUTTON ? limit : notes.length;
  const isCollapsible =
    visibleCount === notes.length &&
    notes.length > RECIPE_NOTES_FIRST_PAGE + HIDDEN_WORTH_A_BUTTON;

  const addRow = onAdd && (
    <ActionRow
      icon={<NotebookPen className='h-4 w-4' />}
      label='Add to your notes'
      subtitle={getAddSubtitle()}
      isDisabled={!isLoaded || isFull}
      onClick={onAdd}
    />
  );

  if (notes.length === 0) {
    return addRow;
  }

  return (
    <FormSection
      title='Notes'
      detail={
        visibleCount < notes.length || notes.length > SECTION_COUNT_THRESHOLD
          ? notes.length
          : undefined
      }
    >
      {addRow}
      <ul className='divide-border divide-y'>
        {notes.slice(0, visibleCount).map((note) => {
          const cookId = note.cookId ?? null;
          return (
            <NoteEntry
              key={note.id}
              note={note}
              cook={cookId === null ? null : (cooksById.get(cookId) ?? null)}
              writtenBefore={getWrittenBefore(note, lastTweakAt)}
              stepAt={resolveNoteStep(note, steps)}
              isStepLost={isStepLost(note, steps)}
              onEdit={onEdit}
              onApplyChange={onApplyChange}
            />
          );
        })}
      </ul>
      {(hidden > HIDDEN_WORTH_A_BUTTON || isCollapsible) && (
        <ShowMoreButton
          isOpen={isCollapsible}
          onClick={() =>
            setLimit(
              isCollapsible
                ? RECIPE_NOTES_FIRST_PAGE
                : limit + RECIPE_NOTES_PAGE_SIZE,
            )
          }
        >
          {isCollapsible
            ? 'Show fewer'
            : `Show ${Math.min(RECIPE_NOTES_PAGE_SIZE, hidden)} more`}
        </ShowMoreButton>
      )}
    </FormSection>
  );
}

export default RecipeNotes;
