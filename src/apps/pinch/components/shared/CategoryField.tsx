import { MultiPillGroup } from '@/components/PillGroup';
import SummaryEditor from '@/components/SummaryEditor';
import { CATEGORY_TITLE, DISH_CATEGORIES } from '@apps/pinch/constants';
import type { DishCategory } from '@apps/pinch/types';
import { getCategories, getCategoryLabels } from '@apps/pinch/utils/categories';

const OPTIONS = DISH_CATEGORIES.map(({ value, label, emoji }) => ({
  value,
  label,
  emoji,
}));

interface CategoryFieldProps {
  value: DishCategory[];
  onChange: (value: DishCategory[]) => void;
  /** The roomy framed row a builder screen uses, with its icon chip. */
  isFramed?: boolean;
}

/** What kind of dish it is, as a summary row: any number of a short fixed list. */
function CategoryField({
  value,
  onChange,
  isFramed = false,
}: CategoryFieldProps) {
  return (
    <SummaryEditor
      label={CATEGORY_TITLE}
      title={CATEGORY_TITLE}
      isFramed={isFramed}
      icon='🏷️'
      summary={getCategoryLabels(value).join(', ')}
      placeholder='Add a category'
      lines={2}
      shouldFocus={false}
    >
      <MultiPillGroup
        label={CATEGORY_TITLE}
        options={OPTIONS}
        values={value}
        showAll
        onChange={(next) => onChange(getCategories({ categories: next }))}
      />
      <p className='text-muted-foreground text-xs'>
        Pick every one that fits. A smoothie can be a drink and breakfast.
      </p>
    </SummaryEditor>
  );
}

export default CategoryField;
