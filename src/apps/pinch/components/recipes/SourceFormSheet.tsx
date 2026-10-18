import { useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import DeleteIconButton from '@/components/DeleteIconButton';
import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_SOURCE_LABEL_LENGTH } from '@apps/pinch/constants';
import {
  removeSource,
  renameSource,
} from '@apps/pinch/store/actions/sourceActions';
import { selectSourceCounts, selectSources } from '@apps/pinch/store/selectors';
import type { Source } from '@apps/pinch/types';
import { findSourceByLabel } from '@apps/pinch/utils/sources';

const { custom } = FormFactories;

interface SourceFormSheetProps {
  uid: string;
  /** The source being opened: its recipes, its name and its delete. */
  source: Source;
  /** Closes this and the Sources screen and leaves the Recipes list filtered to the source. */
  onShowRecipes: () => void;
  onClose: () => void;
}

function SourceFormSheet({
  uid,
  source,
  onShowRecipes,
  onClose,
}: SourceFormSheetProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const sources = useAppSelector(selectSources);
  const recipeCount =
    useAppSelector(selectSourceCounts).bySource.get(source.id) ?? 0;
  const [label, setLabel] = useState(source.label);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipesText = recipeCount === 1 ? 'recipe' : `${recipeCount} recipes`;
  const trimmed = label.trim();
  const duplicate = findSourceByLabel(sources, trimmed, source.id);
  const isFormComplete = trimmed !== '' && duplicate === null;

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(renameSource({ uid, id: source.id, label })).unwrap();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this source.'));
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const getMessage = () => {
      if (recipeCount === 0) {
        return `Delete “${source.label}”? It isn't on any recipe, and this can't be undone.`;
      }
      if (recipeCount === 1) {
        return `"${source.label}" is on 1 recipe. It stays, and only loses this label.`;
      }
      return `"${source.label}" is on ${recipeCount} recipes. They stay, and only lose this label.`;
    };
    const confirmed = await confirm({
      title: 'Delete source',
      message: getMessage(),
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(removeSource({ uid, id: source.id })).unwrap();
      onClose();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this source.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Source'>
      {recipeCount > 0 ? (
        <div className='mb-4'>
          <ActionRow
            isRoomy
            hasChevron
            icon='📖'
            label={`Show the ${recipesText} from ${source.label}`}
            onClick={onShowRecipes}
          />
        </div>
      ) : (
        <p className='text-muted-foreground mb-4 text-sm'>Not on any recipe</p>
      )}
      <Form
        id='pinch-source'
        form={[
          custom({
            name: 'label',
            label: '',
            renderComponent: (props) => (
              <Field label='Name'>
                {(id) => (
                  <Input
                    id={id}
                    variant='outline'
                    placeholder='Serious Eats'
                    maxLength={MAX_SOURCE_LABEL_LENGTH}
                    value={String(props.value)}
                    onChange={(event) =>
                      props.onValueChange(event.target.value)
                    }
                  />
                )}
              </Field>
            ),
          }),
        ]}
        initialData={{ label: source.label }}
        columns={1}
        onDataChange={(data) =>
          setLabel(String((data as { label?: string }).label ?? ''))
        }
        onSubmit={() => {
          void handleSubmit();
        }}
        submitButton={
          <ModalFooterActions
            note={
              duplicate &&
              `You already have a source called “${duplicate.label}”.`
            }
            leftActions={
              <DeleteIconButton
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              />
            }
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isSubmitting}
                disabled={isSubmitting || !isFormComplete}
              >
                Save
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </FormSheet>
  );
}

export default SourceFormSheet;
