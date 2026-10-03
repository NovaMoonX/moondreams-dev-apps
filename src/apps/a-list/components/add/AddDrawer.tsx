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
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fromDateInputValue,
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  createDateInputField,
  createTimeInputField,
} from '@/utils/formFactoryHelpers';
import { formatDateUTC, formatDuration } from '@/utils/formatUtils';
import ManualMovieForm, {
  type ManualMovieDraft,
} from '@apps/a-list/components/add/ManualMovieForm';
import MoviePicker from '@apps/a-list/components/add/MoviePicker';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import {
  AMC_FORMAT_LABELS,
  AMC_FORMATS,
  DEFAULT_SHOWTIME,
  DEFAULT_WATCH_PRIORITY,
  WATCH_PRIORITIES,
  WATCH_PRIORITY_LABELS,
} from '@apps/a-list/constants';
import { movieDetailsQueryOptions } from '@apps/a-list/queries/movieQueries';
import { addViewing } from '@apps/a-list/store/actions/viewingActions';
import { addWatchlistItem } from '@apps/a-list/store/actions/watchlistActions';
import { selectSeenCountByMovieKey } from '@apps/a-list/store/selectors';
import type {
  AListOverlay,
  AmcFormat,
  MovieSearchResult,
  MovieSnapshot,
  WatchPriority,
} from '@apps/a-list/types';

interface WatchlistDetailsValues {
  priority: WatchPriority;
  preferredFormat: AmcFormat | 'NONE';
}

interface ShowtimeValues {
  date: string;
  time: string;
}

type Selection =
  | { kind: 'search'; result: MovieSearchResult }
  | {
      kind: 'known';
      movieKey: string;
      movie: MovieSnapshot;
      isManual: boolean;
    };

const INITIAL_WATCHLIST_DETAILS: WatchlistDetailsValues = {
  priority: DEFAULT_WATCH_PRIORITY,
  preferredFormat: 'NONE',
};
const EMPTY_MANUAL_DRAFT: ManualMovieDraft = {
  title: '',
  releaseDate: '',
  showReleaseDate: false,
};
const { radio, select } = FormFactories;

const WATCHLIST_FIELDS = [
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

const SHOWTIME_FIELDS = [
  createDateInputField({ name: 'date', label: 'Date', variant: 'outline' }),
  createTimeInputField({ name: 'time', label: 'Showtime', variant: 'outline' }),
];

function getRewatchNote(seenCount: number) {
  if (seenCount === 0) return null;
  if (seenCount === 1) return '↺ Seen once before. This will be a rewatch.';
  return `↺ Seen ${seenCount} times before. This will be a rewatch.`;
}

interface AddDrawerProps {
  overlay: Extract<AListOverlay, { kind: 'add' }>;
  onClose: () => void;
}

function AddDrawer({ overlay, onClose }: AddDrawerProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const now = useNow();
  const seenCounts = useAppSelector(selectSeenCountByMovieKey);
  const [query, setQuery] = useState('');
  const [isAddingByTitle, setIsAddingByTitle] = useState(false);
  const [manualDraft, setManualDraft] =
    useState<ManualMovieDraft>(EMPTY_MANUAL_DRAFT);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [watchlistValues, setWatchlistValues] =
    useState<WatchlistDetailsValues>(INITIAL_WATCHLIST_DETAILS);
  const [showtimeValues, setShowtimeValues] = useState<ShowtimeValues>({
    date: overlay.destination === 'calendar' ? overlay.date : '',
    time: DEFAULT_SHOWTIME,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchedKey =
    selection?.kind === 'search' ? selection.result.movieKey : null;
  const details = useQuery({
    ...movieDetailsQueryOptions(searchedKey ?? ''),
    enabled: searchedKey !== null,
  });
  const movie = selection?.kind === 'known' ? selection.movie : details.data;
  const movieKey =
    selection?.kind === 'known' ? selection.movieKey : searchedKey;
  const fallbackTitle =
    selection?.kind === 'search' ? selection.result.title : '';
  const fallbackPoster =
    selection?.kind === 'search' ? selection.result.posterUrl : null;
  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;
  const showtimeAt = fromLocalDateAndTimeInputValues(
    showtimeValues.date,
    showtimeValues.time,
  );
  const isCalendar = overlay.destination === 'calendar';
  const canSave =
    movie !== undefined &&
    movieKey !== null &&
    (!isCalendar || (showtimeAt !== undefined && showtimeValues.time !== ''));

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

  const saveToWatchlist = async (
    uid: string,
    key: string,
    snapshot: MovieSnapshot,
  ) => {
    const { created } = await dispatch(
      addWatchlistItem({
        uid,
        movieKey: key,
        movie: snapshot,
        priority: watchlistValues.priority,
        preferredFormat:
          watchlistValues.preferredFormat === 'NONE'
            ? null
            : watchlistValues.preferredFormat,
      }),
    ).unwrap();
    addToast({
      title: created ? 'Added to your watchlist' : 'Already on your watchlist',
      description: snapshot.title,
    });
  };

  const saveToCalendar = async (
    uid: string,
    key: string,
    snapshot: MovieSnapshot,
    at: number,
  ) => {
    const viewing = await dispatch(
      addViewing({ uid, movieKey: key, movie: snapshot, showtimeAt: at }),
    ).unwrap();
    addToast({
      title:
        viewing.status === 'SEEN' ? 'Added as seen' : 'Added to your calendar',
      description: snapshot.title,
    });
  };

  const handleAdd = async () => {
    if (!user || !movieKey || !movie || !canSave) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (isCalendar && showtimeAt !== undefined) {
        await saveToCalendar(user.uid, movieKey, movie, showtimeAt);
      } else {
        await saveToWatchlist(user.uid, movieKey, movie);
      }
      onClose();
    } catch (addError) {
      setError(getErrorMessage(addError, 'Unable to save this movie.'));
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    setSelection(null);
    setWatchlistValues(INITIAL_WATCHLIST_DETAILS);
    setError(null);
  };

  const getContent = () => {
    if (selection === null && isAddingByTitle) {
      return (
        <ManualMovieForm
          draft={manualDraft}
          onDraftChange={setManualDraft}
          onCancel={() => setIsAddingByTitle(false)}
          onContinue={(manualKey, manualMovie) =>
            setSelection({
              kind: 'known',
              movieKey: manualKey,
              movie: manualMovie,
              isManual: true,
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
          showWatchlist={isCalendar}
          onPick={(result) => setSelection({ kind: 'search', result })}
          onPickWatchlistItem={(item) =>
            setSelection({
              kind: 'known',
              movieKey: item.movieKey,
              movie: item.movie,
              isManual: false,
            })
          }
          onAddByTitle={() => {
            setManualDraft((draft) =>
              draft.title ? draft : { ...draft, title: query.trim() },
            );
            setIsAddingByTitle(true);
          }}
        />
      );
    }

    const rewatchNote =
      isCalendar && movieKey ? getRewatchNote(seenCounts[movieKey] ?? 0) : null;
    const isManual = selection.kind === 'known' && selection.isManual;

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
          {isManual ? 'Back' : 'Back to results'}
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
            {rewatchNote && (
              <p className='text-primary text-sm'>{rewatchNote}</p>
            )}
          </div>
        </div>
        {isCalendar ? (
          <Form
            id='a-list-add-viewing'
            form={SHOWTIME_FIELDS}
            initialData={showtimeValues}
            columns={2}
            spacing='normal'
            onDataChange={(data) => setShowtimeValues(data as ShowtimeValues)}
          />
        ) : (
          <Form
            id='a-list-add-watchlist'
            form={WATCHLIST_FIELDS}
            initialData={watchlistValues}
            columns={1}
            spacing='normal'
            onDataChange={(data) =>
              setWatchlistValues(data as WatchlistDetailsValues)
            }
          />
        )}
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
                disabled={!canSave || isSaving}
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
