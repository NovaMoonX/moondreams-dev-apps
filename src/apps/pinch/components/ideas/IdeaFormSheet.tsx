import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import FallbackImage from '@/components/FallbackImage';
import Field from '@/components/forms/Field';
import PhotoPicker from '@/components/forms/PhotoPicker';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import { hasSeveralWebLinks, toWebLink } from '@/utils/urlUtils';
import IdeaNoteField from '@apps/pinch/components/ideas/IdeaNoteField';
import {
  IDEA_KIND_EMOJIS,
  MAX_IDEA_TITLE_LENGTH,
  MAX_IDEA_URL_LENGTH,
} from '@apps/pinch/constants';
import { useIdeaImageUrl } from '@apps/pinch/hooks/useIdeaImageUrl';
import { removeIdea, updateIdea } from '@apps/pinch/store/actions/ideaActions';
import { selectIdeas, selectRecipesById } from '@apps/pinch/store/selectors';
import type { Idea } from '@apps/pinch/types';
import { findIdeaByUrl, toIdeaUrl } from '@apps/pinch/utils/ideas';

const { custom } = FormFactories;

interface IdeaFormData {
  title: string;
  url: string;
  note: string;
}

interface IdeaFormSheetProps {
  uid: string;
  idea: Idea;
  onClose: () => void;
}

function IdeaFormSheet({ uid, idea, onClose }: IdeaFormSheetProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const ideas = useAppSelector(selectIdeas);
  const recipesById = useAppSelector(selectRecipesById);
  const savedPhotoUrl = useIdeaImageUrl(idea);
  const upload = useImageUpload(null, 'photo');
  const { pick: pickPhoto, error: photoError } = upload;
  const [data, setData] = useState<IdeaFormData>({
    title: idea.title,
    url: idea.url ?? '',
    note: idea.note ?? '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLink = idea.kind === 'LINK';
  const url = isLink ? toIdeaUrl(data.url) : null;
  const duplicate = url === null ? null : findIdeaByUrl(ideas, url, idea.id);
  const getBlocker = () => {
    if (data.title.trim() === '') return 'Give it a title to save.';
    if (isLink && url === null) {
      return hasSeveralWebLinks(data.url)
        ? 'That looks like more than one link. Paste one at a time.'
        : "That doesn't look like a web link. Paste the address from your browser.";
    }
    return duplicate ? "That one's already in your ideas." : null;
  };
  const blocker = getBlocker();
  const photoUrl = upload.previewUrl ?? savedPhotoUrl;

  const fields = useMemo(
    () => [
      custom({
        name: 'title',
        label: '',
        renderComponent: (props) => (
          <Field label='Title'>
            {(id) => (
              <Input
                id={id}
                variant='outline'
                maxLength={MAX_IDEA_TITLE_LENGTH}
                value={String(props.value)}
                onChange={(event) => props.onValueChange(event.target.value)}
              />
            )}
          </Field>
        ),
      }),
      ...(isLink
        ? [
            custom({
              name: 'url',
              label: '',
              renderComponent: (props) => (
                <div onKeyDown={blockEnterSubmit}>
                  <Field label='Link'>
                    {(id) => (
                      <Input
                        id={id}
                        type='url'
                        variant='outline'
                        maxLength={MAX_IDEA_URL_LENGTH}
                        value={String(props.value)}
                        onChange={(event) =>
                          props.onValueChange(event.target.value)
                        }
                        onPaste={(event) => {
                          const pasted = event.clipboardData.getData('text');
                          if (!/\s/.test(pasted.trim())) return;
                          event.preventDefault();
                          props.onValueChange(
                            toWebLink(pasted) ??
                              pasted.trim().replace(/\s+/g, ' '),
                          );
                        }}
                      />
                    )}
                  </Field>
                </div>
              ),
            }),
          ]
        : []),
      ...(idea.kind === 'PHOTO'
        ? [
            custom({
              name: 'photo',
              label: '',
              renderComponent: () => (
                <div className='space-y-2'>
                  <span className='block text-sm font-medium'>Picture</span>
                  <div className='flex items-center gap-4'>
                    <span
                      className='bg-accent grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl text-3xl'
                      aria-hidden='true'
                    >
                      {photoUrl ? (
                        <FallbackImage
                          src={photoUrl}
                          alt=''
                          fallback={IDEA_KIND_EMOJIS.PHOTO}
                          className='size-full object-cover'
                        />
                      ) : (
                        IDEA_KIND_EMOJIS.PHOTO
                      )}
                    </span>
                    <PhotoPicker
                      photoUrl={photoUrl}
                      showPreview={false}
                      changeLabel='Replace photo'
                      error={photoError}
                      onSelect={(file) => {
                        setError(null);
                        void pickPhoto(file);
                      }}
                    />
                  </div>
                </div>
              ),
            }),
          ]
        : []),
      custom({
        name: 'note',
        label: '',
        renderComponent: (props) => (
          <IdeaNoteField
            isOpen
            value={String(props.value)}
            onChange={props.onValueChange}
          />
        ),
      }),
    ],
    [isLink, idea.kind, photoUrl, photoError, pickPhoto],
  );

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const photoFile = await upload.readyFile();
      await dispatch(
        updateIdea({
          uid,
          id: idea.id,
          title: data.title,
          note: data.note,
          url: data.url,
          photoFile,
        }),
      ).unwrap();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this idea.'));
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const recipe = recipesById.get(idea.recipeId ?? '');
    const madeRecipe = recipe && recipe.isArchived !== true ? recipe : null;
    const confirmed = await confirm({
      title: 'Delete this idea?',
      message: madeRecipe
        ? `Delete “${idea.title}”? The recipe you made from it, ${madeRecipe.title}, stays.`
        : `Delete “${idea.title}”? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(removeIdea({ uid, id: idea.id })).unwrap();
      onClose();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this idea.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Idea'>
      <Form
        id='pinch-idea'
        form={fields}
        initialData={data}
        columns={1}
        onDataChange={(next) => {
          setData(next as IdeaFormData);
          setError(null);
        }}
        onSubmit={() => {
          void handleSubmit();
        }}
        submitButton={
          <ModalFooterActions
            note={
              blocker ??
              (error && <span className='text-destructive'>{error}</span>)
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
                formNoValidate
                loading={isSubmitting}
                disabled={isSubmitting || blocker !== null}
              >
                Save
              </Button>
            }
          />
        }
      />
    </FormSheet>
  );
}

export default IdeaFormSheet;
