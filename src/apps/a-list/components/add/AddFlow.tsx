import { useState } from 'react';

import { Button, Form } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';

import ModalFooterActions from '@/components/ModalFooterActions';
import Pill from '@/components/Pill';
import { SubviewHeader } from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fromDateInputValue,
  fromLocalDateAndTimeInputValues,
  toDateInputValue,
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
import PastMoviesStrip from '@apps/a-list/components/add/PastMoviesStrip';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import TicketFields from '@apps/a-list/components/viewing/TicketFields';
import WatchlistDetailsFields, {
  type WatchlistDetailsValues,
} from '@apps/a-list/components/watchlist/WatchlistDetailsFields';
import {
  DEFAULT_SHOWTIME,
  DEFAULT_WATCH_PRIORITY,
} from '@apps/a-list/constants';
import { movieDetailsQueryOptions } from '@apps/a-list/queries/movieQueries';
import { addViewing } from '@apps/a-list/store/actions/viewingActions';
import { addWatchlistItem } from '@apps/a-list/store/actions/watchlistActions';
import {
  evaluateTicketDraft,
  getInitialTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';
import { getReleaseLabel } from '@apps/a-list/utils/releaseLabel';
import { computeEndsAt } from '@apps/a-list/utils/viewingState';
import {
  selectMembership,
  selectSeenCountByMovieKey,
  selectFeeChips,
} from '@apps/a-list/store/selectors';
import type {
  AListOverlay,
  MovieSearchResult,
  MovieSnapshot,
} from '@apps/a-list/types';

interface ShowtimeValues {
  date: string;
  time: string;
}

export type AddSelection =
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
const SHOWTIME_FIELDS = [
  createDateInputField({
    name: 'date',
    label: 'Date',
    variant: 'outline',
    rounded: 'full',
  }),
  createTimeInputField({
    name: 'time',
    label: 'Showtime',
    variant: 'outline',
    rounded: 'full',
  }),
];

function getRewatchNote(seenCount: number) {
  if (seenCount === 0) return null;
  if (seenCount === 1) return '↺ Seen once before. This will be a rewatch.';
  return `↺ Seen ${seenCount} times before. This will be a rewatch.`;
}

interface AddFlowProps {
  overlay: Extract<AListOverlay, { kind: 'add' }>;
  onClose: () => void;
  initialSelection?: AddSelection;
  onBack?: () => void;
  /** Set when the flow is a screen of its own: it then draws its own header, whose back control steps back before it exits. */
  title?: string;
}

export function AddFlow({
  overlay,
  onClose,
  initialSelection,
  onBack,
  title,
}: AddFlowProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const now = useNow();
  const seenCounts = useAppSelector(selectSeenCountByMovieKey);
  const membership = useAppSelector(selectMembership);
  const feeChips = useAppSelector(selectFeeChips);
  const [ticketDraft, setTicketDraft] = useState<TicketDraft | null>(null);
  const [query, setQuery] = useState('');
  const [isAddingByTitle, setIsAddingByTitle] = useState(false);
  const [manualDraft, setManualDraft] =
    useState<ManualMovieDraft>(EMPTY_MANUAL_DRAFT);
  const [selection, setSelection] = useState<AddSelection | null>(
    initialSelection ?? null,
  );
  const [watchlistValues, setWatchlistValues] =
    useState<WatchlistDetailsValues>(INITIAL_WATCHLIST_DETAILS);
  const [showtimeValues, setShowtimeValues] = useState<ShowtimeValues>({
    date: overlay.destination === 'calendar' ? overlay.date : '',
    time: DEFAULT_SHOWTIME,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [pastAdded, setPastAdded] = useState<{
    count: number;
    lastTitle: string;
  } | null>(null);
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
  const isPast = overlay.destination === 'calendar' && overlay.mode === 'past';
  // Past mode only adds seen movies, so the showing must have ended, not just started.
  const isNotYetShown =
    isPast &&
    showtimeAt !== undefined &&
    movie !== undefined &&
    computeEndsAt(showtimeAt, movie.runtimeMinutes) > now;
  const startDateKey = membership ? toDateInputValue(membership.startDate) : '';
  const isBeforeStart =
    isCalendar &&
    showtimeValues.date !== '' &&
    showtimeValues.date < startDateKey;
  const ticketResult = ticketDraft ? evaluateTicketDraft(ticketDraft) : null;
  const canSave =
    !isBeforeStart &&
    !isNotYetShown &&
    (ticketResult === null || ticketResult.isValid) &&
    movie !== undefined &&
    movieKey !== null &&
    (!isCalendar || (showtimeAt !== undefined && showtimeValues.time !== ''));

  const getDetailsLine = () => {
    if (selection?.kind === 'search' && details.isPending)
      return 'Getting the details…';
    if (!movie) return "We couldn't load this movie's details just now.";
    const parts = [
      getReleaseLabel(movie.releaseDate, todayDay),
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
      addViewing({
        uid,
        movieKey: key,
        movie: snapshot,
        showtimeAt: at,
        ticket: ticketResult?.ticket ?? null,
      }),
    ).unwrap();
    addToast({
      title:
        viewing.status === 'SEEN' ? 'Added as seen' : 'Added to your calendar',
      description: snapshot.title,
    });
  };

  const resetForNextMovie = (addedTitle: string) => {
    setPastAdded((previous) => ({
      count: (previous?.count ?? 0) + 1,
      lastTitle: addedTitle,
    }));
    setSelection(null);
    setQuery('');
    setIsAddingByTitle(false);
    setManualDraft(EMPTY_MANUAL_DRAFT);
    setTicketDraft(null);
    setShowtimeValues({
      date: overlay.destination === 'calendar' ? overlay.date : '',
      time: DEFAULT_SHOWTIME,
    });
    setIsSaving(false);
  };

  const handleAdd = async (keepGoing: boolean) => {
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
      if (keepGoing) {
        resetForNextMovie(movie.title);
      } else {
        onClose();
      }
    } catch (addError) {
      setError(getErrorMessage(addError, 'Unable to save this movie.'));
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
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
    const getBackLabel = () => {
      if (onBack) return 'Back to movie';
      if (isManual) return 'Back';
      return 'Back to results';
    };

    return (
      <div className='space-y-4'>
        {title === undefined && (
          <Button
            type='button'
            rounded='full'
            variant='link'
            size='sm'
            className='gap-1 px-0'
            onClick={handleBack}
          >
            <ChevronLeft className='h-4 w-4' /> {getBackLabel()}
          </Button>
        )}
        <div className='flex gap-3'>
          <span className='h-30 w-20 shrink-0 overflow-hidden rounded-xl shadow-sm'>
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
          <WatchlistDetailsFields
            values={watchlistValues}
            onChange={setWatchlistValues}
          />
        )}
        {isCalendar && (
          <div className='space-y-3'>
            <div>
              <p className='font-medium'>🎟️ Already bought your ticket?</p>
              <p className='text-muted-foreground text-sm'>
                Add what you paid and your savings count right away.
              </p>
            </div>
            <div className='flex gap-2'>
              <Pill
                emoji='💳'
                isSelected={ticketDraft !== null}
                onClick={() =>
                  setTicketDraft(
                    (current) =>
                      current ?? getInitialTicketDraft(null, feeChips[1] ?? 0),
                  )
                }
              >
                Yes, I paid
              </Pill>
              <Pill
                emoji='🕒'
                isSelected={ticketDraft === null}
                onClick={() => setTicketDraft(null)}
              >
                Not yet
              </Pill>
            </div>
            {ticketDraft && (
              <TicketFields draft={ticketDraft} onChange={setTicketDraft} />
            )}
          </div>
        )}
        {isNotYetShown && (
          <p className='text-destructive text-sm'>
            These are movies you've already seen, so pick a showing that has
            already ended.
          </p>
        )}
        {isBeforeStart && membership && (
          <p className='text-destructive text-sm'>
            Your membership started {formatDateUTC(membership.startDate)}, so
            pick that day or later.
          </p>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            isPast ? (
              <>
                <Button
                  type='button'
                  rounded='full'
                  variant='secondary'
                  disabled={!canSave || isSaving}
                  onClick={() => void handleAdd(false)}
                >
                  Add & finish
                </Button>
                <Button
                  type='button'
                  rounded='full'
                  loading={isSaving}
                  disabled={!canSave || isSaving}
                  onClick={() => void handleAdd(true)}
                >
                  Add + another
                </Button>
              </>
            ) : (
              <>
                <Button
                  type='button'
                  rounded='full'
                  variant='secondary'
                  disabled={isSaving}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                  type='button'
                  rounded='full'
                  loading={isSaving}
                  disabled={!canSave || isSaving}
                  onClick={() => void handleAdd(false)}
                >
                  Add
                </Button>
              </>
            )
          }
        />
      </div>
    );
  };

  const getHeader = () => {
    if (selection !== null)
      return {
        label: selection.kind === 'known' && selection.isManual ? 'Back' : 'Back to results',
        onClick: handleBack,
      };
    if (isAddingByTitle)
      return { label: 'Back to search', onClick: () => setIsAddingByTitle(false) };
    return { label: title ?? '', onClick: onClose };
  };

  const header = getHeader();

  return (
    <>
      {title !== undefined && (
        <SubviewHeader title={header.label} onBack={header.onClick} />
      )}
      {pastAdded && (
        <PastMoviesStrip
          count={pastAdded.count}
          lastTitle={pastAdded.lastTitle}
        />
      )}
      {getContent()}
    </>
  );
}
