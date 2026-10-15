import { FilterSection } from '@/components/FilterBar';
import { PillGroup } from '@/components/PillGroup';
import ViewOptions, { ViewOptionSwitch } from '@/components/ViewOptions';
import { useAppSelector } from '@/store';
import { NUTRITION_BASIS_OPTIONS } from '@apps/pinch/constants';
import type { ListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

const BASIS_CHOICES = NUTRITION_BASIS_OPTIONS.map((option) => ({ ...option }));

interface ListViewControlsProps {
  options: ListViewOptions;
  customizedCount: number;
  onChange: (patch: Partial<ListViewOptions>) => void;
  onReset: () => void;
  /** An ingredient list also chooses what its numbers are per. */
  hasBasis?: boolean;
  /** A recipe or meal list can hide its fridge and freezer lines. */
  hasStockLines?: boolean;
  className?: string;
}

/** The "View options" button of a Pinch list: which lines its rows show. */
function ListViewControls({
  options,
  customizedCount,
  onChange,
  onReset,
  hasBasis = false,
  hasStockLines = false,
  className,
}: ListViewControlsProps) {
  const isAnyMetricOn = hasAnyMetricOn(useAppSelector(selectShowNutrition));

  return (
    <ViewOptions
      customizedCount={customizedCount}
      onReset={onReset}
      className={className}
    >
      <div className='divide-border divide-y'>
        <ViewOptionSwitch
          label='Show prices'
          checked={options.showPrices}
          onCheckedChange={(showPrices) => onChange({ showPrices })}
        />
        <ViewOptionSwitch
          label='Show calories and macros'
          description={
            isAnyMetricOn
              ? undefined
              : "Calories and macros are off. Turn them on from the Calendar's gear and they'll show here."
          }
          checked={options.showMacros && isAnyMetricOn}
          isDisabled={!isAnyMetricOn}
          onCheckedChange={(showMacros) => onChange({ showMacros })}
        />
        {hasStockLines && (
          <ViewOptionSwitch
            label="Show what's in stock"
            description='The fridge and freezer line under a recipe or meal'
            checked={options.showStock}
            onCheckedChange={(showStock) => onChange({ showStock })}
          />
        )}
      </div>
      {hasBasis && isAnyMetricOn && (
        <FilterSection title='Nutrition numbers'>
          <PillGroup
            label='Nutrition numbers'
            options={BASIS_CHOICES}
            value={options.basis}
            onChange={(basis) => onChange({ basis })}
          />
        </FilterSection>
      )}
    </ViewOptions>
  );
}

export default ListViewControls;
