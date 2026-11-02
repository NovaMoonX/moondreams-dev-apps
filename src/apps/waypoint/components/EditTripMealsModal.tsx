import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import AppToggle from '@/components/AppToggle';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup } from '@/components/PillGroup';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  WATCHABLE_MEALS,
} from '@apps/waypoint/constants';
import type { MealType, TripSpace } from '@apps/waypoint/types';
import { getWatchedMeals } from '@apps/waypoint/utils/missingMeals';

interface EditTripMealsModalProps {
  isOpen: boolean;
  trip: TripSpace;
  isSubmitting?: boolean;
  onSubmit: (watchedMeals: MealType[]) => Promise<void> | void;
  onClose: () => void;
}

const MEAL_OPTIONS = WATCHABLE_MEALS.map((meal) => ({
  value: meal,
  label: MEAL_TYPE_LABELS[meal],
  emoji: MEAL_TYPE_EMOJIS[meal],
}));

const sortMeals = (meals: readonly MealType[]): MealType[] =>
  WATCHABLE_MEALS.filter((meal) => meals.includes(meal));

function EditTripMealsModal({
  isOpen,
  trip,
  isSubmitting = false,
  onSubmit,
  onClose,
}: EditTripMealsModalProps) {
  const saved = getWatchedMeals(trip);
  const [isOn, setIsOn] = useState(saved.length > 0);
  const [meals, setMeals] = useState<MealType[]>(sortMeals(saved));
  const [error, setError] = useState<string | null>(null);
  const next = isOn ? meals : [];
  const hasChanged = next.join() !== sortMeals(saved).join();

  const handleSubmit = async () => {
    setError(null);
    try {
      await onSubmit(next);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save the meals.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Meals to plan'>
      <div className='space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-sm'>Point out days missing a meal</span>
          <AppToggle
            checked={isOn}
            onCheckedChange={(checked) => {
              setIsOn(checked);
              if (checked && meals.length === 0) setMeals(['LUNCH', 'DINNER']);
            }}
            aria-label='Point out days missing a meal'
          />
        </div>
        {isOn && (
          <MultiPillGroup
            label='Which meals?'
            options={MEAL_OPTIONS}
            values={meals}
            onChange={(picked) => setMeals(sortMeals(picked))}
            showAll
          />
        )}
        <p className='text-muted-foreground text-sm'>
          {isOn
            ? 'Upcoming days on the Timeline with none of these planned get a quiet note, with a shortcut to add one.'
            : 'The Timeline stays quiet about days with no meal planned.'}
        </p>
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          cancelAction={
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSubmitting}
              disabled={
                isSubmitting || !hasChanged || (isOn && meals.length === 0)
              }
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          }
        />
      </div>
    </Modal>
  );
}

export default EditTripMealsModal;
