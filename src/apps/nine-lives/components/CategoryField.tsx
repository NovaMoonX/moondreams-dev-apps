import { Input, Select } from '@moondreamsdev/dreamer-ui/components';

import { CUSTOM_EXPENSE_CATEGORY_OPTION } from '@apps/nine-lives/constants/presetOptions';
import { DEFAULT_EXPENSE_CATEGORIES, getExpenseCategoryLabel } from '@apps/nine-lives/utils/budgetCalculators';

interface CategoryFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

const categoryOptions = [
  ...DEFAULT_EXPENSE_CATEGORIES.map((category) => ({ text: getExpenseCategoryLabel(category), value: category })),
  { text: 'Custom category', value: CUSTOM_EXPENSE_CATEGORY_OPTION },
];

/** Preset expense category select, plus a custom text entry when the value isn't one of the presets. */
function CategoryField({ value, onValueChange, disabled }: CategoryFieldProps) {
  const isPreset = (DEFAULT_EXPENSE_CATEGORIES as readonly string[]).includes(value);
  const selectValue = isPreset ? value : CUSTOM_EXPENSE_CATEGORY_OPTION;

  return (
    <div className='space-y-2'>
      <Select
        options={categoryOptions}
        value={selectValue}
        onChange={(nextValue) => onValueChange(nextValue === CUSTOM_EXPENSE_CATEGORY_OPTION ? '' : nextValue)}
        searchable
        disabled={disabled}
      />
      {!isPreset && (
        <Input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder='Custom category name'
          variant='outline'
          disabled={disabled}
        />
      )}
    </div>
  );
}

export default CategoryField;
