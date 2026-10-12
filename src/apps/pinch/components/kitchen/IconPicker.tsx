import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { CATALOG_INGREDIENTS } from '@apps/pinch/catalog';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';

// One entry per vendored icon, labelled by the first ingredient that uses it.
const ICON_CHOICES = CATALOG_INGREDIENTS.reduce<
  { key: string; label: string }[]
>(
  (acc, ingredient) =>
    ingredient.iconKey &&
    !acc.some((choice) => choice.key === ingredient.iconKey)
      ? [...acc, { key: ingredient.iconKey, label: ingredient.name }]
      : acc,
  [],
);

interface IconPickerProps {
  value: string | null;
  onChange: (iconKey: string | null) => void;
}

function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className='space-y-2'>
      <div
        role='group'
        aria-label='Icon'
        className='border-border grid max-h-40 grid-cols-6 gap-1 overflow-y-auto rounded-xl border p-2'
      >
        {ICON_CHOICES.map((choice) => (
          <Button
            key={choice.key}
            type='button'
            variant='tertiary'
            size='icon'
            aria-label={choice.label}
            aria-pressed={value === choice.key}
            onClick={() => onChange(choice.key)}
            className={join(
              'size-10 p-0',
              value === choice.key &&
                'bg-secondary ring-2 ring-[var(--pinch-drizzle)]',
            )}
          >
            <IngredientIcon iconKey={choice.key} size={28} />
          </Button>
        ))}
      </div>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className='h-10 px-0!'
        onClick={() => onChange(null)}
      >
        Use the jar
      </Button>
    </div>
  );
}

export default IconPicker;
