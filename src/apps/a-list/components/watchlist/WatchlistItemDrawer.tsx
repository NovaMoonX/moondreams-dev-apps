import { useState } from 'react';

import {
  Button,
  Drawer,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
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
import { AddFlow } from '@apps/a-list/components/add/AddDrawer';
import WatchlistRow from '@apps/a-list/components/watchlist/WatchlistRow';
import {
  AMC_FORMAT_LABELS,
  AMC_FORMATS,
  WATCH_PRIORITIES,
  WATCH_PRIORITY_LABELS,
} from '@apps/a-list/constants';
import {
  removeWatchlistItem,
  updateWatchlistItem,
} from '@apps/a-list/store/actions/watchlistActions';
import { selectWatchlistRows } from '@apps/a-list/store/selectors';
import type { AmcFormat, WatchPriority } from '@apps/a-list/types';

type DrawerView = 'details' | 'addToCalendar' | 'edit';

interface EditValues {
  priority: WatchPriority;
  preferredFormat: AmcFormat | 'NONE';
}

const { radio, select } = FormFactories;

const EDIT_FIELDS = [
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
  const [editValues, setEditValues] = useState<EditValues | null>(null);
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
  const savedValues: EditValues = {
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
          <p className='font-semibold'>{item.movie.title}</p>
          <Form
            id='a-list-edit-watchlist-item'
            form={EDIT_FIELDS}
            initialData={draft}
            columns={1}
            spacing='normal'
            onDataChange={(data) => setEditValues(data as EditValues)}
          />
          <ModalFooterActions
            rightActions={
              <>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={isSaving}
                  onClick={() => showView('details')}
                >
                  Cancel
                </Button>
                <Button
                  type='button'
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

    return (
      <div className='space-y-4'>
        <WatchlistRow row={row} todayDay={todayDay} />
        <div className='bg-muted/50 divide-border divide-y rounded-lg'>
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
