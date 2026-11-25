import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { History, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackHeading from '@/components/BackHeading';
import BackLink from '@/components/BackLink';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort } from '@/utils/formatUtils';
import ChangeList from '@apps/pinch/components/notes/ChangeList';
import {
  goBackToChange,
  undoRecipeChange,
} from '@apps/pinch/store/actions/recipeActions';
import {
  selectNotesByRecipe,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeNote } from '@apps/pinch/types';
import { formatChangeWhen, getUndoableTweakIds } from '@apps/pinch/utils/notes';

const NO_NOTES: RecipeNote[] = [];

interface ChangeEntryViewProps {
  uid: string;
  recipeId: string;
  noteId: string;
  /** Leaves this view for the list it was opened from. */
  onBack: () => void;
}

/** One recorded change, swapped into the sheet that lists it: what changed, Undo while it is the latest and the recipe is as it left it, and "Go back to before this change". */
function ChangeEntryView({
  uid,
  recipeId,
  noteId,
  onBack,
}: ChangeEntryViewProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId) ?? NO_NOTES;
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = notes.find((entry) => entry.id === noteId);
  const undoableIds = recipe
    ? getUndoableTweakIds(
        notes.filter((entry) => entry.kind === 'TWEAK'),
        recipe.updatedAt,
      )
    : [];

  if (!note || !recipe) {
    return (
      <div className='space-y-3'>
        <BackLink onBack={onBack} />
        <p className='text-muted-foreground text-sm'>
          This change is no longer in the history.
        </p>
      </div>
    );
  }

  const day = formatDateShort(note.createdAt);
  const canGoBack = note.previous != null;
  const canUndo = undoableIds.includes(note.id);
  const heading =
    note.by == null || note.by.kind === 'you'
      ? 'Your change'
      : `Change by ${note.by.name ?? 'an assistant'}`;
  const run = async (action: () => Promise<unknown>, done: string) => {
    setIsWorking(true);
    setError(null);
    try {
      await action();
      addToast({ title: done, type: 'success' });
      onBack();
    } catch (failure) {
      setError(getErrorMessage(failure, 'Unable to do that just now.'));
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <BackHeading onBack={onBack} title={heading} />
        <div className='space-y-0.5'>
          <p className='text-muted-foreground text-sm'>
            {formatChangeWhen(note.createdAt)}
          </p>
          {note.text && (
            <p className='text-muted-foreground text-sm wrap-break-word'>
              Why: {note.text}
            </p>
          )}
        </div>
      </div>
      <ChangeList changes={note.changes ?? []} />
      <ActionGroup isRoomy>
        {canUndo && (
          <ActionRow
            isGrouped
            isRoomy
            icon={<Undo2 />}
            label='Undo'
            subtitle='Takes this change back and removes it from the history'
            isDisabled={isWorking}
            onClick={() =>
              void run(
                () =>
                  dispatch(
                    undoRecipeChange({ uid, recipeId, noteIds: undoableIds }),
                  ).unwrap(),
                `Undid the change from ${day}`,
              )
            }
          />
        )}
        {canGoBack && (
          <ActionRow
            isGrouped
            isRoomy
            icon={<History />}
            label='Go back to before this change'
            subtitle='Put the recipe back as it was before this change'
            isDisabled={isWorking}
            onClick={() =>
              void run(
                () =>
                  dispatch(
                    goBackToChange({
                      uid,
                      recipeId,
                      noteId: note.id,
                      seenUpdatedAt: recipe.updatedAt,
                    }),
                  ).unwrap(),
                `Went back to before the ${day} change`,
              )
            }
          />
        )}
      </ActionGroup>
      {!canUndo && (
        <p className='text-muted-foreground text-sm'>
          Only the latest change can be undone.
        </p>
      )}
      {!canGoBack && (
        <p className='text-muted-foreground text-sm'>
          This change was saved without a copy of the recipe before it, so the
          recipe can't go back to it.
        </p>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );
}

export default ChangeEntryView;
