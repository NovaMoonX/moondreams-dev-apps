import { useRef, useState } from 'react';
import { Archive, CalendarOff, Pause, Play } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import SuggestionChips from '@/components/SuggestionChips';
import { useAuth } from '@/hooks/useAuth';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import EffectPreview from '@apps/runway/components/EffectPreview';
import {
  CHANGE_WORDS,
  LIFECYCLE_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_CHANGE_DAYS_AHEAD,
  MAX_NOTE_LENGTH,
} from '@apps/runway/constants';
import { addUtcDays, addUtcMonths } from '@apps/runway/engine/dates';
import { occurrences } from '@apps/runway/engine/schedule';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  archiveItem,
  endItem,
  setGoalState,
} from '@apps/runway/store/actions/itemActions';
import type { PreviewChange } from '@apps/runway/store/selectors/previewSelectors';
import type { ItemPayload } from '@apps/runway/utils/changeText';
import type {
  BillSealed,
  GoalSealed,
  ItemKind,
  PayLineSealed,
} from '@apps/runway/types';

type View = 'menu' | 'pause' | 'resume' | 'end' | 'archive';

interface ItemActionsSheetProps {
  itemId: string;
  kind: ItemKind;
  payload: ItemPayload;
  today: number;
  onClose: () => void;
}

const isScheduled = (
  payload: ItemPayload,
): payload is PayLineSealed | BillSealed =>
  'schedule' in payload || 'timing' in payload;

const getSchedule = (payload: PayLineSealed | BillSealed) =>
  'schedule' in payload ? payload.schedule : payload.timing.schedule;

const LAST_DAY_OTHER = 'other';

const VIEW_NOTES: Record<View, string> = {
  menu: '',
  pause: LIFECYCLE_WORDS.pauseSub,
  resume: LIFECYCLE_WORDS.resumeSub,
  end: LIFECYCLE_WORDS.endSub,
  archive: LIFECYCLE_WORDS.archiveNote,
};

/** The ways an item stops or pauses, each naming what it does, each showing its effect on the coming income days before it is saved. */
function ItemActionsSheet({
  itemId,
  kind,
  payload,
  today,
  onClose,
}: ItemActionsSheetProps) {
  const { user } = useAuth();
  const [view, setView] = useState<View>('menu');
  const [note, setNote] = useState('');
  const [endPick, setEndPick] = useState<string>(String(today));
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const goal = kind === 'goal' ? (payload as GoalSealed) : null;
  const isPaused = goal !== null && (goal.state ?? 'active') === 'paused';
  const upcoming = isScheduled(payload)
    ? occurrences(
        getSchedule(payload),
        payload.ending,
        today,
        addUtcMonths(today, LOOKAHEAD_MONTHS),
      ).slice(0, 3)
    : [];
  const endOptions = [
    ...upcoming.map((on) => ({
      value: String(on),
      label:
        kind === 'bill'
          ? `After the ${formatDateUTC(on)} payment`
          : `After the ${formatDateUTC(on)} payday`,
    })),
    ...(upcoming.includes(today)
      ? []
      : [{ value: String(today), label: 'Today' }]),
    { value: LAST_DAY_OTHER, label: 'A date' },
  ];
  const endOn =
    endPick === LAST_DAY_OTHER ? fromDateInputValue(endDate) : Number(endPick);
  const isEndValid =
    endOn !== undefined &&
    endOn >= today &&
    endOn <= addUtcDays(today, MAX_CHANGE_DAYS_AHEAD);

  const goTo = (next: View) => {
    setError(null);
    setNote('');
    setView(next);
  };

  const getChange = (): PreviewChange | null => {
    if (view === 'pause' || view === 'resume') {
      return {
        kind: 'version',
        version: {
          itemId,
          kind: 'goal',
          effectiveFrom: today,
          effectiveUntil: null,
          changeId: 'what-if',
          payload: {
            ...(payload as GoalSealed),
            state: view === 'pause' ? 'paused' : 'active',
          },
        },
      };
    }
    if (view === 'end') {
      return isEndValid ? { kind: 'end', itemId, endedAt: endOn } : null;
    }
    if (view === 'archive')
      return { kind: 'archive', itemId, archivedAt: today };
    return null;
  };
  const change = getChange();
  const changeJson = change === null ? null : JSON.stringify(change);

  const run = async () => {
    if (isSavingRef.current || !user) return;
    const reason = note.trim() === '' ? null : note.trim();
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      if (view === 'pause' || view === 'resume') {
        await setGoalState(user.uid, encryption, {
          itemId,
          goal: payload as GoalSealed,
          state: view === 'pause' ? 'paused' : 'active',
          note: reason,
          effectiveFrom: today,
        });
        onClose();
        return;
      }
      if (view === 'end' && isEndValid) {
        const written = await endItem(user.uid, encryption, {
          itemId,
          endedOn: endOn,
          summary: `${payload.name}: ended after ${formatDateUTC(endOn)}.`,
          note: reason,
        });
        if (written) onClose();
        else setError(LIFECYCLE_WORDS.alreadyEnded);
        return;
      }
      if (view === 'archive') {
        const written = await archiveItem(
          user.uid,
          encryption,
          { itemId, summary: `${payload.name}: archived.`, note: reason },
          today,
        );
        if (written) onClose();
        else setError(LIFECYCLE_WORDS.alreadyArchived);
      }
    } catch (saveError) {
      setError(
        getErrorMessage(saveError, 'This did not save. Nothing was changed.'),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const chips =
    view === 'end'
      ? LIFECYCLE_WORDS.chipsEnd
      : view === 'archive'
        ? LIFECYCLE_WORDS.chipsArchive
        : LIFECYCLE_WORDS.chipsPause;
  const confirmLabel =
    view === 'end'
      ? LIFECYCLE_WORDS.endConfirm
      : view === 'archive'
        ? LIFECYCLE_WORDS.archiveConfirm
        : view === 'resume'
          ? LIFECYCLE_WORDS.resumeConfirm
          : LIFECYCLE_WORDS.pauseConfirm;
  const blocker =
    view === 'end' && !isEndValid ? LIFECYCLE_WORDS.endBlocker : null;

  const menu = (
    <div className='space-y-3'>
      <ActionGroup isRoomy caption={LIFECYCLE_WORDS.sheetHeading}>
        {goal && !isPaused && (
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Pause />}
            label={LIFECYCLE_WORDS.pause}
            subtitle={LIFECYCLE_WORDS.pauseSub}
            onClick={() => goTo('pause')}
          />
        )}
        {goal && isPaused && (
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Play />}
            label={LIFECYCLE_WORDS.resume}
            subtitle={LIFECYCLE_WORDS.resumeSub}
            onClick={() => goTo('resume')}
          />
        )}
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<CalendarOff />}
          label={LIFECYCLE_WORDS.end}
          subtitle={LIFECYCLE_WORDS.endSub}
          onClick={() => goTo('end')}
        />
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<Archive />}
          label={LIFECYCLE_WORDS.archive}
          subtitle={LIFECYCLE_WORDS.archiveSub}
          onClick={() => goTo('archive')}
        />
      </ActionGroup>
    </div>
  );

  const action = (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={() => goTo('menu')} />
      <p className='text-muted-foreground text-sm'>{VIEW_NOTES[view]}</p>
      {view === 'end' && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            {LIFECYCLE_WORDS.endHeading}
          </p>
          <PillGroup
            label={LIFECYCLE_WORDS.endHeading}
            options={endOptions}
            value={endPick}
            onChange={setEndPick}
          />
          {endPick === LAST_DAY_OTHER && (
            <Input
              type='date'
              variant='outline'
              aria-label={LIFECYCLE_WORDS.endDateLabel}
              min={toDateInputValue(today)}
              max={toDateInputValue(addUtcDays(today, MAX_CHANGE_DAYS_AHEAD))}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          )}
        </div>
      )}
      <EffectPreview
        changeJson={changeJson}
        emptyText={CHANGE_WORDS.previewNone}
      />
      <p className='text-sm font-medium'>
        {view === 'end' ? LIFECYCLE_WORDS.whyEnd : CHANGE_WORDS.whyHeading}
      </p>
      <SuggestionChips
        label={CHANGE_WORDS.whyHint}
        suggestions={chips}
        isDisabled={isSaving}
        onPick={setNote}
      />
      <NoteTextField
        label='Note'
        value={note}
        onChange={setNote}
        placeholder={CHANGE_WORDS.whyPlaceholder}
        maxLength={MAX_NOTE_LENGTH}
        rows={3}
      />
      <ModalFooterActions
        note={error ?? blocker}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void run()}
          >
            {confirmLabel}
          </Button>
        }
      />
    </div>
  );

  return (
    <FormSheet isOpen onClose={onClose} title={payload.name}>
      <ChangeSteps isReason={view !== 'menu'} reason={action}>
        {menu}
      </ChangeSteps>
    </FormSheet>
  );
}

export default ItemActionsSheet;
