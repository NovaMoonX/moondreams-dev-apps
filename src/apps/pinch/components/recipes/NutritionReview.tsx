import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import Field, { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import { formatMacro, MACRO_EMOJIS } from '@/utils/macroUtils';
import { NUTRITION_CELLS, NUTRITION_METRICS } from '@apps/pinch/constants';
import type { NutritionMetric, NutritionValues } from '@apps/pinch/types';

type Draft = Record<NutritionMetric, string>;

const getText = (metric: NutritionMetric, value: number | null) =>
  value === null ? '' : formatMacro(metric, value);

const getDraft = (values: NutritionValues) =>
  Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      getText(metric, values[metric]),
    ]),
  ) as Draft;

interface NutritionReviewProps {
  /** Per serving, added up from the ingredients. */
  calculated: NutritionValues;
  /** How many ingredients couldn't add to some metric, out of how many there are. */
  leftOut: { count: number; total: number };
  /** What the person typed over the added-up value, per metric; blank keeps it derived. */
  typed: Draft;
  onChange: (typed: Draft) => void;
}

/** The nutrition we worked out per serving, shown the way it will read on the recipe, with the way to change any number and to go back to what we calculated. On a phone the numbers change in a drawer; from `sm` up they change in place. */
function NutritionReview({
  calculated,
  leftOut,
  typed,
  onChange,
}: NutritionReviewProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const [draft, setDraft] = useState<Draft | null>(null);
  const effective = Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      typed[metric].trim() === '' ? calculated[metric] : Number(typed[metric]),
    ]),
  ) as unknown as NutritionValues;
  const isEdited = NUTRITION_METRICS.some((metric) => typed[metric] !== '');
  const hasAny = NUTRITION_METRICS.some((metric) => effective[metric] !== null);
  const isEditingInline = draft !== null && !isPhone;

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
    setDraft(draft !== null && isPhone ? getDraft(calculated) : null);
    onChange({ calories: '', protein: '', carbs: '', fat: '' });
  };

  const renderFields = (values: Draft, isCompact: boolean) => (
    <div className='grid grid-cols-2 gap-3'>
      {NUTRITION_CELLS.map((cell) => (
        <Field
          key={cell.key}
          isCompact={isCompact}
          label={`${MACRO_EMOJIS[cell.key]} ${cell.label}${cell.unit === '' ? '' : ' (g)'}`}
        >
          {(id) => (
            <Input
              id={id}
              type='number'
              inputMode='decimal'
              min={0}
              step='any'
              variant='outline'
              className={isCompact ? COMPACT_INPUT_CLASS : undefined}
              value={values[cell.key]}
              onChange={(event) =>
                handleDraftChange(cell.key, event.target.value)
              }
            />
          )}
        </Field>
      ))}
    </div>
  );

  const caption = (
    <p className='text-muted-foreground text-xs'>
      {isEdited
        ? 'Edited by you.'
        : 'Added up from your ingredients, per serving.'}
      {!isEdited && leftOut.count > 0 && (
        <span className='ml-1 inline-flex align-middle'>
          <HelpTip
            variant='warning'
            title='Not everything is counted'
            placement='top'
          >
            {leftOut.count} of {leftOut.total} ingredients have no nutrition
            info yet, so they aren’t in these numbers. Add their nutrition in
            your Kitchen, or change a number here.
          </HelpTip>
        </span>
      )}
    </p>
  );

  const resetButton = isEdited && (
    <Button
      type='button'
      variant='link'
      size='sm'
      className='h-10 justify-start px-0!'
      onClick={reset}
    >
      Reset to what we calculated
    </Button>
  );

  return (
    <div className='space-y-3' onKeyDown={blockEnterSubmit}>
      <div className='flex items-center justify-between gap-3'>
        {caption}
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='h-10 shrink-0 px-2!'
          onClick={() => setDraft(isEditingInline ? null : getDraft(effective))}
        >
          {isEditingInline ? 'Done' : 'Edit'}
        </Button>
      </div>
      {isEditingInline ? (
        renderFields(draft, false)
      ) : hasAny ? (
        <MacroStats values={effective} variant='tiles' />
      ) : (
        <p className='text-muted-foreground text-sm'>
          Add ingredients with nutrition info and we’ll add it up here.
        </p>
      )}
      {resetButton}
      {isPhone && draft !== null && (
        <DetailSheet
          isOpen
          onClose={() => setDraft(null)}
          title='Nutrition per serving'
          footer={
            <div className='px-4 pb-4'>
              <Button
                type='button'
                className='w-full'
                onClick={() => setDraft(null)}
              >
                Done
              </Button>
            </div>
          }
        >
          <div className='space-y-3'>
            {caption}
            {renderFields(draft, true)}
            {resetButton}
          </div>
        </DetailSheet>
      )}
    </div>
  );
}

export default NutritionReview;
