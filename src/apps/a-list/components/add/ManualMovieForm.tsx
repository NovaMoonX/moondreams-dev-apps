import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import type { MovieSnapshot } from '@apps/a-list/types';

export interface ManualMovieDraft {
  title: string;
  releaseDate: string;
  showReleaseDate: boolean;
}

interface ManualMovieFormProps {
  draft: ManualMovieDraft;
  onDraftChange: (draft: ManualMovieDraft) => void;
  onCancel: () => void;
  onContinue: (movieKey: string, movie: MovieSnapshot) => void;
}

const { input } = FormFactories;

function ManualMovieForm({
  draft,
  onDraftChange,
  onCancel,
  onContinue,
}: ManualMovieFormProps) {
  const values = draft;
  const showReleaseDate = draft.showReleaseDate;
  const title = values.title.trim();

  const fields = [
    input({
      name: 'title',
      label: 'Title',
      placeholder: 'Dune: Part Three',
      variant: 'outline',
      rounded: 'full',
    }),
    ...(showReleaseDate
      ? [
          createDateInputField({
            name: 'releaseDate',
            label: 'Release date',
            variant: 'outline',
            rounded: 'full',
          }),
        ]
      : []),
  ];

  const handleContinue = () => {
    if (!title) {
      return;
    }

    const movie: MovieSnapshot = {
      title: title.slice(0, 200),
      releaseDate: showReleaseDate
        ? (fromDateInputValue(values.releaseDate) ?? null)
        : null,
      posterUrl: null,
      runtimeMinutes: null,
      contentRating: null,
    };
    onContinue(`manual-${crypto.randomUUID()}`, movie);
  };

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>
        No problem. Tell us the title and we'll make it a tile of its own.
      </p>
      <Form
        key={showReleaseDate ? 'with-date' : 'no-date'}
        id='a-list-manual-movie'
        form={fields}
        initialData={values}
        columns={1}
        spacing='normal'
        onDataChange={(data) =>
          onDraftChange({ ...values, ...(data as Partial<ManualMovieDraft>) })
        }
      />
      {showReleaseDate ? (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='px-0'
          onClick={() =>
            onDraftChange({
              ...values,
              releaseDate: '',
              showReleaseDate: false,
            })
          }
        >
          Remove release date
        </Button>
      ) : (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='px-0'
          onClick={() => onDraftChange({ ...values, showReleaseDate: true })}
        >
          + Add release date
        </Button>
      )}
      <ModalFooterActions
        rightActions={
          <>
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              onClick={onCancel}
            >
              Back
            </Button>
            <Button
              type='button'
              rounded='full'
              disabled={!title}
              onClick={handleContinue}
            >
              Next
            </Button>
          </>
        }
      />
    </div>
  );
}

export default ManualMovieForm;
