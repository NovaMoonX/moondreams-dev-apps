import { useState } from 'react';

import {
  Button,
  Drawer,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC, formatDuration } from '@/utils/formatUtils';
import MoviePicker from '@apps/a-list/components/add/MoviePicker';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import {
  AMC_FORMAT_LABELS,
  AMC_FORMATS,
  DEFAULT_WATCH_PRIORITY,
  WATCH_PRIORITIES,
  WATCH_PRIORITY_LABELS,
} from '@apps/a-list/constants';
import { movieDetailsQueryOptions } from '@apps/a-list/queries/movieQueries';
import { addWatchlistItem } from '@apps/a-list/store/actions/watchlistActions';
import type {
  AmcFormat,
  MovieSearchResult,
  WatchPriority,
} from '@apps/a-list/types';

interface WatchlistDetailsValues {
  priority: WatchPriority;
  preferredFormat: AmcFormat | 'NONE';
}

const INITIAL_DETAILS: WatchlistDetailsValues = {
  priority: DEFAULT_WATCH_PRIORITY,
  preferredFormat: 'NONE',
};
const { radio, select } = FormFactories;

const DETAILS_FIELDS = [
  radio({
    name: 'priority',
    label: 'Priority',
    options: WATCH_PRIORITIES.map((priority) => ({
      value: priority,
      label: WATCH_PRIORITY_LABELS[priority],
    })),
  }),
  select({
    name: 'preferredFormat',
    label: 'Preferred format',
    options: [
      { value: 'NONE', label: 'No preference' },
      ...AMC_FORMATS.map((format) => ({
        value: format,
        label: AMC_FORMAT_LABELS[format],
      })),
    ],
  }),
];

interface AddDrawerProps {
  onClose: () => void;
}

function AddDrawer({ onClose }: AddDrawerProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MovieSearchResult | null>(null);
  const [detailsValues, setDetailsValues] =
    useState<WatchlistDetailsValues>(INITIAL_DETAILS);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const details = useQuery({
    ...movieDetailsQueryOptions(picked?.movieKey ?? ''),
    enabled: picked !== null,
  });
  const movie = details.data;

  const getDetailsLine = () => {
    if (details.isPending) return 'Getting the details…';
    if (details.error || !movie)
      return "We couldn't load this movie's details just now.";
    const parts = [
      movie.releaseDate === null
        ? 'Release date not announced'
        : `Releases ${formatDateUTC(movie.releaseDate)}`,
      movie.runtimeMinutes === null
        ? null
        : formatDuration(movie.runtimeMinutes * 60_000),
      movie.contentRating,
    ];
    return parts.filter(Boolean).join(' · ');
  };

  const handleAdd = async () => {
    if (!user || !picked || !movie) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const { created } = await dispatch(
        addWatchlistItem({
          uid: user.uid,
          movieKey: picked.movieKey,
          movie,
          priority: detailsValues.priority,
          preferredFormat:
            detailsValues.preferredFormat === 'NONE'
              ? null
              : detailsValues.preferredFormat,
        }),
      ).unwrap();
      addToast({
        title: created
          ? 'Added to your watchlist'
          : 'Already on your watchlist',
        description: movie.title,
      });
      onClose();
    } catch (addError) {
      setError(
        getErrorMessage(
          addError,
          'Unable to add this movie to your watchlist.',
        ),
      );
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    setPicked(null);
    setDetailsValues(INITIAL_DETAILS);
    setError(null);
  };

  return (
    <Drawer isOpen onClose={onClose} title='Movie'>
      {picked === null ? (
        <MoviePicker
          query={query}
          onQueryChange={setQuery}
          onPick={setPicked}
        />
      ) : (
        <div className='space-y-4'>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='gap-1 px-0'
            onClick={handleBack}
          >
            <ChevronLeft className='h-4 w-4' /> Back to results
          </Button>
          <div className='flex gap-3'>
            <span className='h-30 w-20 shrink-0 overflow-hidden rounded-md'>
              <PosterCover
                title={movie?.title ?? picked.title}
                posterUrl={movie?.posterUrl ?? picked.posterUrl}
              />
            </span>
            <div className='min-w-0 space-y-1'>
              <p className='font-semibold'>{movie?.title ?? picked.title}</p>
              <p className='text-muted-foreground text-sm'>
                {getDetailsLine()}
              </p>
            </div>
          </div>
          <Form
            id='a-list-add-watchlist'
            form={DETAILS_FIELDS}
            initialData={detailsValues}
            columns={1}
            spacing='normal'
            onDataChange={(data) =>
              setDetailsValues(data as WatchlistDetailsValues)
            }
          />
          {error && <p className='text-destructive text-sm'>{error}</p>}
          <ModalFooterActions
            rightActions={
              <>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={isSaving}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={!movie || isSaving}
                  onClick={() => void handleAdd()}
                >
                  Add
                </Button>
              </>
            }
          />
        </div>
      )}
    </Drawer>
  );
}

export default AddDrawer;
