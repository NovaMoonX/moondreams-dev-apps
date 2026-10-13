import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import Field from '@/components/forms/Field';
import HelpTip from '@/components/HelpTip';
import MacroStats, { formatMacro } from '@/components/MacroStats';
import { NUTRITION_CELLS, NUTRITION_METRICS } from '@apps/pinch/constants';
import type { NutritionMetric, NutritionValues } from '@apps/pinch/types';

const EMOJIS: Record<NutritionMetric, string> = {
  calories: '🔥',
  protein: '💪',
  carbs: '🌾',
  fat: '🥑',
};

const getText = (metric: NutritionMetric, value: number | null) =>
  value === null ? '' : formatMacro(metric, value);

interface NutritionReviewProps {
  /** Per serving, added up from the ingredients. */
  calculated: NutritionValues;
  /** How many ingredients couldn't add to some metric, out of how many there are. */
  leftOut: { count: number; total: number };
  /** What the person typed over the added-up value, per metric; blank keeps it derived. */
  typed: Record<NutritionMetric, string>;
  onChange: (typed: Record<NutritionMetric, string>) => void;
}

/** The nutrition we worked out per serving, shown the way it will read on the recipe, with the way to change any number and to go back to what we calculated. */
function NutritionReview({
  calculated,
  leftOut,
  typed,
  onChange,
}: NutritionReviewProps) {
  const [draft, setDraft] = useState<Record<NutritionMetric, string> | null>(
    null,
  );
  const effective = Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      typed[metric].trim() === '' ? calculated[metric] : Number(typed[metric]),
    ]),
  ) as unknown as NutritionValues;
  const isEdited = NUTRITION_METRICS.some((metric) => typed[metric] !== '');
  const hasAny = NUTRITION_METRICS.some((metric) => effective[metric] !== null);

  const startEditing = () =>
    setDraft(
      Object.fromEntries(
        NUTRITION_METRICS.map((metric) => [
          metric,
          getText(metric, effective[metric]),
        ]),
      ) as Record<NutritionMetric, string>,
    );

  const handleDraftChange = (metric: NutritionMetric, text: string) => {
    if (draft === null) return;
    setDraft({ ...draft, [metric]: text });
    onChange({
      ...typed,
      [metric]:
        text.trim() === '' || text === getText(metric, calculated[metric])
          ? ''
          : text,
    });
  };

  const reset = () => {
    setDraft(null);
    onChange({ calories: '', protein: '', carbs: '', fat: '' });
  };

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-muted-foreground text-xs'>
          {isEdited
            ? 'Edited by you.'
            : 'Added up from your ingredients, per serving.'}
          {!isEdited && leftOut.count > 0 && (
            <span className='ml-1 inline-flex align-middle'>
              <HelpTip
                variant='warning'
                title='Not everything is counted'
                noModal
                placement='top'
              >
                {leftOut.count} of {leftOut.total} ingredients have no nutrition
                info yet, so they aren’t in these numbers. Add their nutrition
                in your Kitchen, or change a number here.
              </HelpTip>
            </span>
          )}
        </p>
        {draft === null ? (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-10 shrink-0 px-2!'
            onClick={startEditing}
          >
            Edit
          </Button>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-10 shrink-0 px-2!'
            onClick={() => setDraft(null)}
          >
            Done
          </Button>
        )}
      </div>
      {draft === null ? (
        hasAny ? (
          <MacroStats values={effective} variant='tiles' />
        ) : (
          <p className='text-muted-foreground text-sm'>
            Add ingredients with nutrition info and we’ll add it up here.
          </p>
        )
      ) : (
        <div className='grid grid-cols-2 gap-3'>
          {NUTRITION_CELLS.map((cell) => (
            <Field
              key={cell.key}
              label={`${EMOJIS[cell.key]} ${cell.label}${cell.unit === '' ? '' : ' (g)'}`}
            >
              {(id) => (
                <Input
                  id={id}
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  variant='outline'
                  value={draft[cell.key]}
                  onChange={(event) =>
                    handleDraftChange(cell.key, event.target.value)
                  }
                />
              )}
            </Field>
          ))}
        </div>
      )}
      {isEdited && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 justify-start px-0!'
          onClick={reset}
        >
          Reset to what we calculated
        </Button>
      )}
    </div>
  );
}

export default NutritionReview;
