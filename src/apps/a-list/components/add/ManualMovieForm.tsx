import { useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import type { MovieSnapshot } from '@apps/a-list/types';

interface ManualMovieValues {
  title: string;
  releaseDate: string;
}

interface ManualMovieFormProps {
  initialTitle: string;
  onCancel: () => void;
  onContinue: (movieKey: string, movie: MovieSnapshot) => void;
}

const { input } = FormFactories;

function ManualMovieForm({
  initialTitle,
  onCancel,
  onContinue,
}: ManualMovieFormProps) {
  const [values, setValues] = useState<ManualMovieValues>({
    title: initialTitle,
    releaseDate: '',
  });
  const [showReleaseDate, setShowReleaseDate] = useState(false);
  const title = values.title.trim();

  const fields = [
    input({
      name: 'title',
      label: 'Title',
      placeholder: 'Dune: Part Three',
      variant: 'outline',
    }),
    ...(showReleaseDate
      ? [
          createDateInputField({
            name: 'releaseDate',
            label: 'Release date',
            variant: 'outline',
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
          setValues({ ...values, ...(data as Partial<ManualMovieValues>) })
        }
      />
      {showReleaseDate ? (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='px-0'
          onClick={() => {
            setValues({ ...values, releaseDate: '' });
            setShowReleaseDate(false);
          }}
        >
          Remove release date
        </Button>
      ) : (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='px-0'
          onClick={() => setShowReleaseDate(true)}
        >
          + Add release date
        </Button>
      )}
      <ModalFooterActions
        rightActions={
          <>
            <Button type='button' variant='secondary' onClick={onCancel}>
              Back
            </Button>
            <Button type='button' disabled={!title} onClick={handleContinue}>
              Next
            </Button>
          </>
        }
      />
    </div>
  );
}

export default ManualMovieForm;
