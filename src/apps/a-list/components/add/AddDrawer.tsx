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
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC, formatDuration } from '@/utils/formatUtils';
import ManualMovieForm from '@apps/a-list/components/add/ManualMovieForm';
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
  MovieSnapshot,
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

type Selection =
  | { kind: 'search'; result: MovieSearchResult }
  | { kind: 'manual'; movieKey: string; movie: MovieSnapshot };

function AddDrawer({ onClose }: AddDrawerProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [isAddingByTitle, setIsAddingByTitle] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailsValues, setDetailsValues] =
    useState<WatchlistDetailsValues>(INITIAL_DETAILS);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchedKey =
    selection?.kind === 'search' ? selection.result.movieKey : null;
  const details = useQuery({
    ...movieDetailsQueryOptions(searchedKey ?? ''),
    enabled: searchedKey !== null,
  });
  const movie = selection?.kind === 'manual' ? selection.movie : details.data;
  const movieKey =
    selection?.kind === 'manual' ? selection.movieKey : searchedKey;
  const fallbackTitle =
    selection?.kind === 'search' ? selection.result.title : '';
  const fallbackPoster =
    selection?.kind === 'search' ? selection.result.posterUrl : null;
  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;

  const getReleaseLabel = (releaseDate: number | null) => {
    if (releaseDate === null) return 'Release date not announced';
    if (releaseDate > todayDay) return `Opens ${formatDateUTC(releaseDate)}`;
    return `Released ${formatDateUTC(releaseDate)}`;
  };

  const getDetailsLine = () => {
    if (selection?.kind === 'search' && details.isPending)
      return 'Getting the details…';
    if (!movie) return "We couldn't load this movie's details just now.";
    const parts = [
      getReleaseLabel(movie.releaseDate),
      movie.runtimeMinutes === null
        ? null
        : formatDuration(movie.runtimeMinutes * 60_000),
      movie.contentRating,
    ];
    return parts.filter(Boolean).join(' · ');
  };

  const handleAdd = async () => {
    if (!user || !movieKey || !movie) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const { created } = await dispatch(
        addWatchlistItem({
          uid: user.uid,
          movieKey,
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
    setSelection(null);
    setDetailsValues(INITIAL_DETAILS);
    setError(null);
  };

  const getContent = () => {
    if (selection === null && isAddingByTitle) {
      return (
        <ManualMovieForm
          initialTitle={query.trim()}
          onCancel={() => setIsAddingByTitle(false)}
          onContinue={(manualKey, manualMovie) =>
            setSelection({
              kind: 'manual',
              movieKey: manualKey,
              movie: manualMovie,
            })
          }
        />
      );
    }

    if (selection === null) {
      return (
        <MoviePicker
          query={query}
          onQueryChange={setQuery}
          onPick={(result) => setSelection({ kind: 'search', result })}
          onAddByTitle={() => setIsAddingByTitle(true)}
        />
      );
    }

    return (
      <div className='space-y-4'>
        <Button
          type='button'
          variant='link'
          size='sm'
          className='gap-1 px-0'
          onClick={handleBack}
        >
          <ChevronLeft className='h-4 w-4' />{' '}
          {selection.kind === 'manual' ? 'Back' : 'Back to results'}
        </Button>
        <div className='flex gap-3'>
          <span className='h-30 w-20 shrink-0 overflow-hidden rounded-md'>
            <PosterCover
              title={movie?.title ?? fallbackTitle}
              posterUrl={movie?.posterUrl ?? fallbackPoster}
            />
          </span>
          <div className='min-w-0 space-y-1'>
            <p className='font-semibold'>{movie?.title ?? fallbackTitle}</p>
            <p className='text-muted-foreground text-sm'>{getDetailsLine()}</p>
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
    );
  };

  return (
    <Drawer isOpen onClose={onClose} title='Movie'>
      {getContent()}
    </Drawer>
  );
}

export default AddDrawer;
