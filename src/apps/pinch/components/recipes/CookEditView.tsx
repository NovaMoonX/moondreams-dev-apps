import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, NotebookPen } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DeleteIconButton from '@/components/DeleteIconButton';
import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import ModalFooterActions from '@/components/ModalFooterActions';
import Stepper from '@/components/Stepper';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
import { MAX_COOKED_SERVINGS } from '@apps/pinch/constants';
import {
  addCook,
  removeCook,
  updateCook,
} from '@apps/pinch/store/actions/cookActions';
import type { Cook } from '@apps/pinch/types';
import { isValidCookServings } from '@apps/pinch/utils/cooks';

const { custom } = FormFactories;

interface CookEditViewProps {
  uid: string;
  recipeId: string;
  recipeTitle: string;
  /** The cook being corrected; null adds an earlier one. */
  cook: Cook | null;
  defaultServings: number;
  planNote: string | null;
  onBack: () => void;
  /** Opens a note about this cook; null where none can be written (a cook not saved yet, or notes that didn't load). */
  onAddNote: (() => void) | null;
}

function CookEditView({
  uid,
  recipeId,
  recipeTitle,
  cook,
  defaultServings,
  planNote,
  onBack,
  onAddNote,
}: CookEditViewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const now = useNow();
  const [start] = useState(() => {
    const at = cook?.cookedAt ?? Date.now();
    return { date: toLocalDateInputValue(at), time: toLocalTimeInputValue(at) };
  });
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [servings, setServings] = useState(cook?.servings ?? defaultServings);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTimeUntouched =
    cook !== null && date === start.date && time === start.time;
  const cookedAt = isTimeUntouched
    ? cook.cookedAt
    : fromLocalDateAndTimeInputValues(date, time);
  const isFuture = cookedAt !== undefined && cookedAt > now;
  const isValid =
    cookedAt !== undefined && !isFuture && isValidCookServings(servings);
  const isChanged =
    cook === null || !isTimeUntouched || servings !== cook.servings;

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
                <Input
                  type='date'
                  variant='outline'
                  aria-label='Day cooked'
                  className={join(COMPACT_INPUT_CLASS, 'min-w-0')}
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
                  className={join(COMPACT_INPUT_CLASS, 'min-w-0')}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
            </div>
          </div>
        ),
      }),
      custom({
        name: 'servings',
        label: '',
        renderComponent: () => (
          <div className='space-y-1'>
            <Label className='text-muted-foreground text-xs'>Servings</Label>
            <Stepper
              value={servings}
              onChange={setServings}
              label='Servings cooked'
              max={MAX_COOKED_SERVINGS}
            />
          </div>
        ),
      }),
    ],
    [date, time, servings, now],
  );

  const handleSubmit = async () => {
    if (!isValid || !isChanged || cookedAt === undefined) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (cook) {
        await dispatch(
          updateCook({ uid, id: cook.id, servings, cookedAt }),
        ).unwrap();
      } else {
        await dispatch(addCook({ uid, recipeId, servings, cookedAt })).unwrap();
      }
      onBack();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this cook.'));
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!cook) {
      return;
    }
    const confirmed = await confirm({
      title: 'Delete this cook?',
      message: `The cook from ${formatDateTime(cook.cookedAt)} comes off your history. This can't be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

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

  return (
    <div className='space-y-4'>
      <Button
        type='button'
        variant='tertiary'
        className='h-10 gap-1 px-0!'
        onClick={onBack}
      >
        <ChevronLeft className='h-4 w-4' aria-hidden='true' />
        Back
      </Button>
      <div className='space-y-0.5'>
        <p className='font-medium wrap-break-word'>{recipeTitle}</p>
        <p className='text-muted-foreground text-sm'>
          {cook ? (planNote ?? 'Change when or how much.') : 'An earlier cook'}
        </p>
      </div>
      {cook && onAddNote && (
        <ActionRow
          icon={<NotebookPen className='h-4 w-4' />}
          label='Add a note'
          subtitle={isChanged ? 'Save your changes first' : 'About this cook'}
          isDisabled={isChanged || isSubmitting}
          onClick={onAddNote}
        />
      )}
      <Form
        id='pinch-cook'
        form={fields}
        initialData={{ when: '', servings: '' }}
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
                onClick={onBack}
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

export default CookEditView;
