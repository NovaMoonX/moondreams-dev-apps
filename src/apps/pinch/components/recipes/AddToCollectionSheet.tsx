import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  COLLECTION_NOUN,
  COLLECTION_NOUN_PLURAL,
  COLLECTIONS_TITLE,
} from '@apps/pinch/constants';
import { CollectionsEditor } from '@apps/pinch/components/recipes/RecipeCollectionsField';
import { useAddToCollections } from '@apps/pinch/hooks/useAddToCollections';
import { selectCollections } from '@apps/pinch/store/selectors';
import {
  EMPTY_COLLECTIONS_CHOICE,
  getAddToCollectionsLabel,
  type CollectionsChoice,
} from '@apps/pinch/utils/collections';

interface AddToCollectionSheetProps {
  uid: string;
  /** The recipes the person ticked. */
  recipeIds: string[];
  onClose: () => void;
  /** Called once the recipes are in, so the screen can leave its pick-several mode. */
  onDone: () => void;
}

/** Which collections a few ticked recipes go into: the ones that exist, or a new one named here. It stays open and says so when nothing could be added. */
function AddToCollectionSheet({
  uid,
  recipeIds,
  onClose,
  onDone,
}: AddToCollectionSheetProps) {
  const add = useAddToCollections(uid);
  const collections = useAppSelector(selectCollections);
  const [choice, setChoice] = useState<CollectionsChoice>(
    EMPTY_COLLECTIONS_CHOICE,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const isNothingPicked = choice.ids.length === 0;

  const handleAdd = async () => {
    setNote(null);
    setIsSaving(true);
    try {
      const stayText = await add(recipeIds, choice);
      if (stayText === null) {
        onDone();
        return;
      }
      setIsError(false);
      setNote(stayText);
    } catch (error) {
      setIsError(true);
      setNote(getErrorMessage(error, "Couldn't save that."));
    }
    setIsSaving(false);
  };

  return (
    <FormSheet isOpen onClose={onClose} title={COLLECTIONS_TITLE}>
      <div className='grid gap-4'>
        <p className='text-muted-foreground text-sm'>
          {`${recipeIds.length === 1 ? '1 recipe' : `${recipeIds.length} recipes`} selected. Pick the ${COLLECTION_NOUN_PLURAL} they go into, or name a new one.`}
        </p>
        <CollectionsEditor
          value={choice}
          onChange={setChoice}
          collections={collections}
          suggestions={[]}
        />
        {note && (
          <p
            role={isError ? 'alert' : 'status'}
            className={
              isError
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
            }
          >
            {note}
          </p>
        )}
        <ModalFooterActions
          note={isNothingPicked ? `Pick a ${COLLECTION_NOUN} first.` : null}
          cancelAction={
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              disabled={isNothingPicked || isSaving}
              loading={isSaving}
              onClick={() => void handleAdd()}
            >
              {getAddToCollectionsLabel(recipeIds.length)}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default AddToCollectionSheet;
