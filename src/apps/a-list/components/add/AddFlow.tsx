import { useState } from 'react';

import { Button, Form } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  toLocalTimeInputValue,
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
import TrailerPicksList from '@apps/a-list/components/add/TrailerPicksList';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import ShowtimePicker from '@apps/a-list/components/viewing/ShowtimePicker';
import TheaterPills from '@apps/a-list/components/viewing/TheaterPills';
import TicketFields from '@apps/a-list/components/viewing/TicketFields';
import WatchlistDetailsFields, {
  type WatchlistDetailsValues,
} from '@apps/a-list/components/watchlist/WatchlistDetailsFields';
import {
  DEFAULT_SHOWTIME,
  DEFAULT_WATCH_PRIORITY,
  PREVIEWS_WINDOW_BEFORE_MINUTES,
} from '@apps/a-list/constants';
import { movieDetailsQueryOptions } from '@apps/a-list/queries/movieQueries';
import { addViewing } from '@apps/a-list/store/actions/viewingActions';
import {
  addWatchlistItem,
  removeWatchlistItem,
} from '@apps/a-list/store/actions/watchlistActions';
import {
  evaluateTicketDraft,
  getInitialTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';
import { getReleaseLabel } from '@apps/a-list/utils/releaseLabel';
import { computeEndsAt } from '@apps/a-list/utils/viewingState';
import {
  selectMembership,
  selectTheatres,
  selectPreviewsWindowViewing,
  selectSeenCountByMovieKey,
  selectFeeChips,
  selectWatchlistItems,
} from '@apps/a-list/store/selectors';
import type {
  AListOverlay,
  MovieSearchResult,
  MovieSnapshot,
  ShowtimeOption,
  TheatreSnapshot,
  WatchlistItem,
} from '@apps/a-list/types';
import {
  applyPurchaseToDraft,
  toPurchasePlan,
} from '@apps/a-list/utils/purchase';
import { toTheatreSnapshot } from '@apps/a-list/utils/theatres';

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
  const queryClient = useQueryClient();
  const now = useNow();
  const seenCounts = useAppSelector(selectSeenCountByMovieKey);
  const membership = useAppSelector(selectMembership);
  const feeChips = useAppSelector(selectFeeChips);
  const theatres = useAppSelector(selectTheatres);
  const watchlist = useAppSelector(selectWatchlistItems);
  const previewsViewing = useAppSelector((state) =>
    selectPreviewsWindowViewing(state, now),
  );
  // What counts as "added from trailers": everything saved since the previews window opened, as of this screen opening.
  const [trailersSince] = useState(() =>
    previewsViewing
      ? previewsViewing.showtimeAt - PREVIEWS_WINDOW_BEFORE_MINUTES * 60_000
      : now,
  );
  const [ticketDraft, setTicketDraft] = useState<TicketDraft | null>(null);
  const [pickedShowtime, setPickedShowtime] = useState<{
    theatreId: string;
    option: ShowtimeOption;
  } | null>(null);
  // The date form only reads its values once, so each pick remounts it with a new key, even for the same showtime.
  const [pickCount, setPickCount] = useState(0);
  // Untouched, the favorite theater is picked for them; once they tap a pill (or clear it) their choice stands.
  const [theatreChoice, setTheatreChoice] = useState<
    TheatreSnapshot | null | undefined
  >(undefined);
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
  const [addedSoFar, setAddedSoFar] = useState<{
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
  const isQuick =
    overlay.destination === 'watchlist' && overlay.mode === 'quick';
  const trailerPicks = isQuick
    ? watchlist
        .filter((item) => item.createdAt >= trailersSince)
        .sort((left, right) => right.createdAt - left.createdAt)
    : [];
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
  const favoriteTheatre =
    theatres.find(
      (theatre) => theatre.theatreId === membership?.favoriteTheatreId,
    ) ?? (theatres.length === 1 ? theatres[0] : undefined);
  const theatre =
    theatreChoice === undefined
      ? favoriteTheatre
        ? toTheatreSnapshot(favoriteTheatre)
        : null
      : theatreChoice;
  // A pick only counts while the theater and the time still match it, so editing either one drops it.
  const activePick =
    pickedShowtime &&
    pickedShowtime.theatreId === theatre?.theatreId &&
    pickedShowtime.option.startsAt === showtimeAt
      ? pickedShowtime.option
      : null;
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
        theatre,
        purchase: activePick ? toPurchasePlan(activePick) : null,
      }),
    ).unwrap();
    addToast({
      title:
        viewing.status === 'SEEN' ? 'Added as seen' : 'Added to your calendar',
      description: snapshot.title,
    });
  };

  const handlePickShowtime = (option: ShowtimeOption) => {
    if (!theatre) {
      return;
    }

    setPickedShowtime({ theatreId: theatre.theatreId, option });
    setPickCount((count) => count + 1);
    setShowtimeValues({
      date: toLocalDateInputValue(option.startsAt),
      time: toLocalTimeInputValue(option.startsAt),
    });
    setTicketDraft((current) =>
      current ? applyPurchaseToDraft(current, option) : current,
    );
  };

  const resetForNextMovie = (addedTitle: string) => {
    setAddedSoFar((previous) => ({
      count: (previous?.count ?? 0) + 1,
      lastTitle: addedTitle,
    }));
    setSelection(null);
    setQuery('');
    setIsAddingByTitle(false);
    setManualDraft(EMPTY_MANUAL_DRAFT);
    setTicketDraft(null);
    setTheatreChoice(undefined);
    setPickedShowtime(null);
    setPickCount(0);
    setShowtimeValues({
      date: overlay.destination === 'calendar' ? overlay.date : '',
      time: DEFAULT_SHOWTIME,
    });
    setIsSaving(false);
  };

  const handleQuickPick = async (
    result: MovieSearchResult,
    isListed: boolean,
  ) => {
    if (!user || isSaving) {
      return;
    }

    if (isListed) {
      addToast({
        title: 'Already on your watchlist',
        description: result.title,
      });
      return;
    }

    setIsSaving(true);
    // Poor signal in a theater shouldn't lose the title: save what search knows and the daily refresh fills in the rest.
    const snapshot = await queryClient
      .fetchQuery(movieDetailsQueryOptions(result.movieKey))
      .catch((): MovieSnapshot => ({
        title: result.title,
        releaseDate: null,
        posterUrl: result.posterUrl,
        runtimeMinutes: null,
        contentRating: null,
      }));

    try {
      const { created } = await dispatch(
        addWatchlistItem({
          uid: user.uid,
          movieKey: result.movieKey,
          movie: snapshot,
          priority: DEFAULT_WATCH_PRIORITY,
          preferredFormat: null,
        }),
      ).unwrap();
      if (!created) {
        addToast({
          title: 'Already on your watchlist',
          description: result.title,
        });
      }
      setQuery('');
    } catch (saveError) {
      addToast({
        title: 'Unable to save this movie',
        description: getErrorMessage(saveError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoPick = async (item: WatchlistItem) => {
    if (!user || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await dispatch(
        removeWatchlistItem({ uid: user.uid, movieKey: item.movieKey }),
      ).unwrap();
    } catch (undoError) {
      addToast({
        title: 'Unable to undo',
        description: getErrorMessage(undoError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
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
      const picker = (
        <MoviePicker
          query={query}
          onQueryChange={setQuery}
          showWatchlist={isCalendar}
          isDisabled={isSaving}
          onPick={(result, isListed) =>
            isQuick
              ? void handleQuickPick(result, isListed)
              : setSelection({ kind: 'search', result })
          }
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

      return isQuick ? (
        <div className='space-y-3'>
          {trailerPicks.length > 0 && (
            <TrailerPicksList
              picks={trailerPicks}
              isBusy={isSaving}
              onUndo={(item) => void handleUndoPick(item)}
            />
          )}
          <p className='text-muted-foreground text-sm'>
            Tap a title to save it as Want to See.
          </p>
          {picker}
        </div>
      ) : (
        picker
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
            key={`pick-${pickCount}`}
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
          <TheaterPills
            label='📍 Which theater?'
            value={theatre}
            onChange={setTheatreChoice}
          />
        )}
        {isCalendar && !isPast && !theatre && theatres.length > 0 && (
          <p className='text-muted-foreground text-sm'>
            Pick a theater to see showtimes and prices.
          </p>
        )}
        {isCalendar && !isPast && theatre && movie && (
          <ShowtimePicker
            theatre={theatre}
            dateKey={showtimeValues.date}
            showingAt={showtimeAt ?? null}
            title={movie.title}
            now={now}
            selectedShowtimeId={activePick?.showtimeId ?? null}
            onPick={handlePickShowtime}
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
                  setTicketDraft((current) => {
                    if (current) return current;
                    const initial = getInitialTicketDraft(
                      null,
                      feeChips[1] ?? 0,
                    );
                    return activePick
                      ? applyPurchaseToDraft(initial, activePick)
                      : initial;
                  })
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
              <TicketFields
                key={`pick-${pickCount}`}
                draft={ticketDraft}
                onChange={setTicketDraft}
              />
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
        label:
          selection.kind === 'known' && selection.isManual
            ? 'Back'
            : 'Back to results',
        onClick: handleBack,
      };
    if (isAddingByTitle)
      return {
        label: 'Back to search',
        onClick: () => setIsAddingByTitle(false),
      };
    return { label: title ?? '', onClick: onClose };
  };

  const header = getHeader();

  return (
    <>
      {title !== undefined && (
        <SubviewHeader title={header.label} onBack={header.onClick} />
      )}
      {addedSoFar && (
        <PastMoviesStrip
          count={addedSoFar.count}
          lastTitle={addedSoFar.lastTitle}
        />
      )}
      {getContent()}
    </>
  );
}
