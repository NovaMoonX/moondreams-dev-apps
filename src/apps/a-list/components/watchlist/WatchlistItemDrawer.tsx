import { useState } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarPlus, ChevronLeft, Pencil, Trash2 } from 'lucide-react';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fromDateInputValue,
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDate, formatDuration } from '@/utils/formatUtils';
import { AddFlow } from '@apps/a-list/components/add/AddFlow';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import PriorityBadge from '@apps/a-list/components/shared/PriorityBadge';
import WatchlistDetailsFields, {
  type WatchlistDetailsValues,
} from '@apps/a-list/components/watchlist/WatchlistDetailsFields';
import {
  removeWatchlistItem,
  updateWatchlistItem,
} from '@apps/a-list/store/actions/watchlistActions';
import { selectWatchlistRows } from '@apps/a-list/store/selectors';
import { getReleaseLabel } from '@apps/a-list/utils/releaseLabel';

type DrawerView = 'details' | 'addToCalendar' | 'edit';

interface WatchlistItemDrawerProps {
  movieKey: string;
  onClose: () => void;
}

function WatchlistItemDrawer({ movieKey, onClose }: WatchlistItemDrawerProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const now = useNow();
  const row = useAppSelector(
    (state) =>
      selectWatchlistRows(state, now).find(
        (candidate) => candidate.item.movieKey === movieKey,
      ) ?? null,
  );
  const [view, setView] = useState<DrawerView>('details');
  const [editValues, setEditValues] = useState<WatchlistDetailsValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  if (!row) {
    return (
      <Drawer isOpen onClose={onClose} title='Movie'>
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Looks like this movie is already off your watchlist.
          </p>
          <Button type='button' variant='secondary' onClick={onClose}>
            Close
          </Button>
        </div>
      </Drawer>
    );
  }

  const { item } = row;
  const todayKey = toLocalDateInputValue(now);
  const todayDay = fromDateInputValue(todayKey) ?? 0;
  const releaseKey =
    item.movie.releaseDate === null
      ? null
      : toDateInputValue(item.movie.releaseDate);
  const startDate =
    releaseKey !== null && releaseKey > todayKey ? releaseKey : todayKey;
  const savedValues: WatchlistDetailsValues = {
    priority: item.priority,
    preferredFormat: item.preferredFormat ?? 'NONE',
  };
  const draft = editValues ?? savedValues;
  const hasChanges =
    draft.priority !== savedValues.priority ||
    draft.preferredFormat !== savedValues.preferredFormat;

  const showView = (next: DrawerView) => {
    setError(null);
    setEditValues(null);
    setView(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await dispatch(
        updateWatchlistItem({
          uid: user.uid,
          movieKey,
          priority: draft.priority,
          preferredFormat:
            draft.preferredFormat === 'NONE' ? null : draft.preferredFormat,
        }),
      ).unwrap();
      showView('details');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this movie.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: 'Remove from watchlist',
      message: `Take ${item.movie.title} off your watchlist? Showings already on your calendar stay put.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    onClose();
    try {
      await dispatch(removeWatchlistItem({ uid: user.uid, movieKey })).unwrap();
      addToast({
        title: 'Removed from watchlist',
        description: item.movie.title,
      });
    } catch (removeError) {
      addToast({
        title: getErrorMessage(removeError, 'Unable to remove this movie.'),
      });
    }
  };

  const getContent = () => {
    if (view === 'addToCalendar') {
      return (
        <AddFlow
          overlay={{
            kind: 'add',
            destination: 'calendar',
            date: startDate,
            mode: 'single',
          }}
          initialSelection={{
            kind: 'known',
            movieKey,
            movie: item.movie,
            isManual: false,
          }}
          onBack={() => showView('details')}
          onClose={onClose}
        />
      );
    }

    if (view === 'edit') {
      return (
        <div className='space-y-4'>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='gap-1 px-0'
            onClick={() => showView('details')}
          >
            <ChevronLeft className='h-4 w-4' /> Back to movie
          </Button>
          <div className='flex items-center gap-3'>
            <span className='h-24 w-16 shrink-0 overflow-hidden rounded-xl shadow-md'>
              <PosterCover
                title={item.movie.title}
                posterUrl={item.movie.posterUrl}
                compact
              />
            </span>
            <p className='text-lg leading-tight font-semibold'>
              {item.movie.title}
            </p>
          </div>
          <WatchlistDetailsFields values={draft} onChange={setEditValues} />
          <ModalFooterActions
            rightActions={
              <>
                <Button
                  type='button'
                  rounded='full'
                  variant='secondary'
                  disabled={isSaving}
                  onClick={() => showView('details')}
                >
                  Cancel
                </Button>
                <Button
                  type='button'
                  rounded='full'
                  loading={isSaving}
                  disabled={!hasChanges || isSaving}
                  onClick={() => void handleSave()}
                >
                  Save
                </Button>
              </>
            }
          />
        </div>
      );
    }

    const detailLines = [
      {
        emoji: '🎬',
        parts: [
          getReleaseLabel(item.movie.releaseDate, todayDay),
          item.movie.runtimeMinutes === null
            ? null
            : formatDuration(item.movie.runtimeMinutes * 60_000),
          item.movie.contentRating,
        ].filter((part): part is string => part !== null),
      },
      ...(row.nextPlannedAt === null
        ? []
        : [
            {
              emoji: '📅',
              parts: [`Planned for ${formatDate(row.nextPlannedAt)}`],
            },
          ]),
      ...(row.lastWatchedAt === null
        ? []
        : [
            {
              emoji: '🍿',
              parts: [`Seen ${formatDate(row.lastWatchedAt)}`],
              count: row.seenCount > 1 ? `×${row.seenCount}` : null,
            },
          ]),
    ];

    return (
      <div className='space-y-5'>
        <div className='flex gap-4'>
          <span className='h-44 w-30 shrink-0 overflow-hidden rounded-2xl shadow-lg'>
            <PosterCover
              title={item.movie.title}
              posterUrl={item.movie.posterUrl}
            />
          </span>
          <div className='min-w-0 flex-1 space-y-2'>
            <p className='text-xl leading-tight font-semibold'>
              {item.movie.title}
            </p>
            <div className='flex flex-wrap items-center gap-1.5'>
              <PriorityBadge priority={item.priority} />
              {item.preferredFormat !== null && (
                <FormatBadge format={item.preferredFormat} />
              )}
            </div>
            <ul className='space-y-1.5 pt-1'>
              {detailLines.map((line) => (
                <li
                  key={line.emoji}
                  className='text-muted-foreground flex items-start gap-2 text-sm'
                >
                  <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                    {line.emoji}
                  </span>
                  <span className='min-w-0 flex-1'>
                    {line.parts.map((part, index) => (
                      <span key={part} className={join(index > 0 && 'whitespace-nowrap')}>
                        {index > 0 && '· '}
                        {part}{' '}
                      </span>
                    ))}
                  </span>
                  {line.count && (
                    <span className='bg-muted shrink-0 rounded-full px-2 text-xs font-medium whitespace-nowrap'>
                      {line.count}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className='bg-muted/50 divide-border divide-y overflow-hidden rounded-2xl'>
          <Button
            type='button'
            variant='tertiary'
            className='w-full justify-start gap-2 rounded-none'
            onClick={() => showView('addToCalendar')}
          >
            <CalendarPlus className='h-4 w-4' /> Add to calendar
          </Button>
          <Button
            type='button'
            variant='tertiary'
            className='w-full justify-start gap-2 rounded-none'
            onClick={() => showView('edit')}
          >
            <Pencil className='h-4 w-4' /> Edit
          </Button>
        </div>
        <Button
          type='button'
          variant='tertiary'
          className='text-destructive! w-full justify-start gap-2'
          onClick={() => void handleRemove()}
        >
          <Trash2 className='h-4 w-4' /> Remove
        </Button>
      </div>
    );
  };

  return (
    <Drawer isOpen onClose={onClose} title='Movie'>
      {getContent()}
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Drawer>
  );
}

export default WatchlistItemDrawer;
