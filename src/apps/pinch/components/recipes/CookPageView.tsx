import { useMemo, useState, type ReactNode } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { NotebookPen } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import DeleteIconButton from '@/components/DeleteIconButton';
import DurationField from '@/components/forms/DurationField';
import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import ModalFooterActions from '@/components/ModalFooterActions';
import PhotoStrip from '@/components/PhotoStrip';
import StarRating from '@/components/StarRating';
import Stepper from '@/components/Stepper';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import FormSection from '@/ui/FormSection';
import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { formatDuration } from '@/utils/durationUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
import CookResultFields from '@apps/pinch/components/shared/CookResultFields';
import {
  MAX_COOK_DURATION_HOURS,
  MAX_COOKED_SERVINGS,
} from '@apps/pinch/constants';
import { useCookPhotoUrls } from '@apps/pinch/hooks/useCookPhotoUrl';
import {
  addCook,
  removeCook,
  updateCook,
} from '@apps/pinch/store/actions/cookActions';
import type { Cook, CookStepTimes } from '@apps/pinch/types';
import {
  getCookPhotoPaths,
  isValidCookServings,
} from '@apps/pinch/utils/cooks';

const { custom } = FormFactories;

interface CookPageViewProps {
  uid: string;
  recipeId: string;
  recipeTitle: string;
  /** The cook shown; null adds an earlier one, which opens straight on the form. */
  cook: Cook | null;
  defaultServings: number;
  planNote: string | null;
  onBack: () => void;
  /** Opens a note about this cook; null where none can be written (a cook not saved yet, or notes that didn't load). */
  onAddNote: (() => void) | null;
  /** What came out of this cook; null for a cook not saved yet. */
  journal: ReactNode;
}

const toMinutes = (seconds: number | null) =>
  seconds === null ? null : Math.round(seconds / 60);

/** Under ten minutes keeps its seconds ("4 min 20 sec"); longer reads to the minute. */
const formatSpent = (seconds: number) =>
  formatDuration(seconds < 600 ? seconds : Math.round(seconds / 60) * 60);

const FACT_ROW =
  'flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm';

function StepTimes({ times }: { times: CookStepTimes }) {
  const rows = [
    {
      key: 'gather',
      label: 'Getting ingredients out',
      detail: null,
      seconds: times.gatherSeconds,
    },
    ...times.steps.map((step, index) => ({
      key: `step-${index}`,
      label: `Step ${index + 1}`,
      detail: step.text,
      seconds: step.seconds,
    })),
  ];
  return (
    <FormSection label='Time on each step'>
      <ul className='divide-border -my-1 divide-y'>
        {rows.map((row) => (
          <li key={row.key} className='flex items-baseline gap-3 py-2 text-sm'>
            <div className='min-w-0 flex-1'>
              <p className='font-medium'>{row.label}</p>
              {row.detail && (
                <p className='text-muted-foreground truncate'>{row.detail}</p>
              )}
            </div>
            <span
              className={
                row.seconds === 0
                  ? 'text-muted-foreground shrink-0'
                  : 'shrink-0 tabular-nums'
              }
            >
              {row.seconds === 0 ? 'Skipped' : formatSpent(row.seconds)}
            </span>
          </li>
        ))}
      </ul>
      <p className='text-muted-foreground mt-2 text-xs'>
        Timed by cooking mode. Changing how long it took leaves these as they
        were.
      </p>
    </FormSection>
  );
}

/** One cook's page: its photos, facts and what came out of it to read, and an Edit that swaps in the form; an earlier cook being added starts on the form. */
function CookPageView({
  uid,
  recipeId,
  recipeTitle,
  cook,
  defaultServings,
  planNote,
  onBack,
  onAddNote,
  journal,
}: CookPageViewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const now = useNow();
  const [start, setStart] = useState(() => {
    const at = cook?.cookedAt ?? Date.now();
    return {
      date: toLocalDateInputValue(at),
      time: toLocalTimeInputValue(at),
      servings: cook?.servings ?? defaultServings,
      minutes: toMinutes(cook?.durationSeconds ?? null),
    };
  });
  const [isEditing, setIsEditing] = useState(cook === null);
  const [formToken, setFormToken] = useState(0);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [servings, setServings] = useState(start.servings);
  const [minutes, setMinutes] = useState(start.minutes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = useCookPhotoUrls(cook === null ? [] : getCookPhotoPaths(cook));

  const isTimeUntouched =
    cook !== null && date === start.date && time === start.time;
  const cookedAt = isTimeUntouched
    ? cook.cookedAt
    : fromLocalDateAndTimeInputValues(date, time);
  const isDurationUntouched = cook !== null && minutes === start.minutes;
  const durationSeconds = isDurationUntouched
    ? (cook.durationSeconds ?? null)
    : minutes === null || minutes === 0
      ? null
      : minutes * 60;
  const isFuture = cookedAt !== undefined && cookedAt > now;
  const isValid =
    cookedAt !== undefined && !isFuture && isValidCookServings(servings);
  const isChanged =
    cook === null ||
    !isTimeUntouched ||
    servings !== cook.servings ||
    !isDurationUntouched;

  const showRead = () => {
    setError(null);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    if (cook === null) {
      onBack();
      return;
    }
    setDate(start.date);
    setTime(start.time);
    setServings(start.servings);
    setMinutes(start.minutes);
    setFormToken((current) => current + 1);
    showRead();
  };

  const fields = useMemo(
    () => [
      custom({
        name: 'when',
        label: '',
        renderComponent: () => (
          <div className='@container'>
            <div className='grid gap-3 @min-[19rem]:grid-cols-2'>
              <div className='min-w-0 space-y-1'>
                <Label className='text-muted-foreground text-xs'>Day</Label>
                <DateInput
                  variant='outline'
                  aria-label='Day cooked'
                  className={COMPACT_INPUT_CLASS}
                  max={toLocalDateInputValue(now)}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className='min-w-0 space-y-1'>
                <Label className='text-muted-foreground text-xs'>Time</Label>
                <Input
                  type='time'
                  variant='outline'
                  aria-label='Time cooked'
                  className={COMPACT_INPUT_CLASS}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
            </div>
          </div>
        ),
      }),
      custom({
        name: 'amount',
        label: '',
        renderComponent: () => (
          <div className='@container'>
            <div className='grid gap-3 @min-[19rem]:grid-cols-2'>
              <div className='min-w-0 space-y-1'>
                <Label className='text-muted-foreground text-xs'>
                  Servings
                </Label>
                <Stepper
                  value={servings}
                  onChange={setServings}
                  label='Servings cooked'
                  max={MAX_COOKED_SERVINGS}
                />
              </div>
              <DurationField
                key={formToken}
                label='How long it took'
                minutes={minutes}
                onChange={setMinutes}
                maxHours={MAX_COOK_DURATION_HOURS}
                isCompact
              />
            </div>
          </div>
        ),
      }),
      ...(cook
        ? [
            custom({
              name: 'result',
              label: '',
              renderComponent: () => (
                <div className='space-y-1'>
                  <Label className='text-muted-foreground text-xs'>
                    How it turned out
                  </Label>
                  <CookResultFields uid={uid} cookId={cook.id} isLarge />
                  <p className='text-muted-foreground text-xs'>
                    Stars and photos save as you set them.
                  </p>
                </div>
              ),
            }),
          ]
        : []),
    ],
    [date, time, servings, minutes, formToken, now, cook, uid],
  );

  const handleSubmit = async () => {
    if (!isValid || !isChanged || cookedAt === undefined) return;
    setError(null);
    setIsSubmitting(true);
    try {
      if (cook) {
        await dispatch(
          updateCook({ uid, id: cook.id, servings, cookedAt, durationSeconds }),
        ).unwrap();
        setStart({ date, time, servings, minutes });
        setIsSubmitting(false);
        showRead();
      } else {
        await dispatch(
          addCook({ uid, recipeId, servings, cookedAt, durationSeconds }),
        ).unwrap();
        onBack();
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this cook.'));
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!cook) return;
    const confirmed = await confirm({
      title: 'Delete this cook?',
      message: `The cook from ${formatDateTime(cook.cookedAt)} comes off your history, with its stars and photos. This can't be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(removeCook({ uid, id: cook.id })).unwrap();
      onBack();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this cook.'));
      setIsSubmitting(false);
    }
  };

  const heading = (subtitle: string | null) => (
    <div className='space-y-0.5'>
      <p className='font-medium wrap-break-word'>{recipeTitle}</p>
      {subtitle && <p className='text-muted-foreground text-sm'>{subtitle}</p>}
    </div>
  );

  if (cook === null || isEditing) {
    return (
      <div className='space-y-4'>
        <BackLink
          onBack={cook === null ? onBack : cancelEdit}
          label={cook === null ? 'Back' : 'Back to this cook'}
        />
        {heading(
          cook === null
            ? 'An earlier cook'
            : 'Change when, how much and how long it took.',
        )}
        <Form
          key={formToken}
          id='pinch-cook'
          form={fields}
          initialData={{ when: '', amount: '', result: '' }}
          columns={1}
          onSubmit={() => {
            void handleSubmit();
          }}
          submitButton={
            <ModalFooterActions
              note={isFuture ? 'Pick a time that has already passed.' : null}
              leftActions={
                cook && (
                  <DeleteIconButton
                    label='Delete this cook'
                    onClick={() => void handleDelete()}
                    disabled={isSubmitting}
                  />
                )
              }
              cancelAction={
                <Button
                  type='button'
                  variant='secondary'
                  onClick={cancelEdit}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              }
              rightActions={
                <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isValid || !isChanged}
                >
                  Save
                </Button>
              }
            />
          }
        />
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    );
  }

  const took = cook.durationSeconds ?? null;

  return (
    <div className='space-y-4'>
      <BackLink onBack={onBack} />
      {heading(planNote)}
      <PhotoStrip photos={photos} label={`${recipeTitle}, as cooked`} />
      <dl className='border-border divide-border divide-y overflow-hidden rounded-xl border'>
        <div className={FACT_ROW}>
          <dt className='text-muted-foreground'>Cooked</dt>
          <dd className='text-right'>{formatDateTime(cook.cookedAt)}</dd>
        </div>
        <div className={FACT_ROW}>
          <dt className='text-muted-foreground'>Servings</dt>
          <dd className='tabular-nums'>{cook.servings}</dd>
        </div>
        <div className={FACT_ROW}>
          <dt className='text-muted-foreground'>Took</dt>
          <dd
            className={took === null ? 'text-muted-foreground' : 'tabular-nums'}
          >
            {took === null ? 'Not recorded' : formatSpent(took)}
          </dd>
        </div>
        <div className={FACT_ROW}>
          <dt className='text-muted-foreground'>How it turned out</dt>
          <dd>
            {cook.rating == null ? (
              <span className='text-muted-foreground'>Not rated</span>
            ) : (
              <StarRating value={cook.rating} isCaptionReserved={false} />
            )}
          </dd>
        </div>
      </dl>
      {cook.stepTimes && <StepTimes times={cook.stepTimes} />}
      {journal}
      {onAddNote && (
        <ActionRow
          icon={<NotebookPen className='h-4 w-4' />}
          label='Add a note'
          subtitle='About this cook'
          onClick={onAddNote}
        />
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <ModalFooterActions
        rightActions={
          <Button type='button' onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        }
      />
    </div>
  );
}

export default CookPageView;
