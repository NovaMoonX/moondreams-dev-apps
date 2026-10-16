import { useState } from 'react';

import AppToggle from '@/components/AppToggle';
import { FilterSection } from '@/components/FilterBar';
import { PillGroup } from '@/components/PillGroup';
import ViewOptions, { ViewOptionSwitch } from '@/components/ViewOptions';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MACRO_EMOJIS } from '@/utils/macroUtils';
import {
  NUTRITION_BASIS_OPTIONS,
  NUTRITION_CELLS,
} from '@apps/pinch/constants';
import type { ListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { saveSettings } from '@apps/pinch/store/actions/settingsActions';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import type { NutritionMetric } from '@apps/pinch/types';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

const BASIS_CHOICES = NUTRITION_BASIS_OPTIONS.map((option) => ({ ...option }));

interface NutritionEverywhereProps {
  /** Called once a number switched on has saved, so the list it was switched on from shows it on its rows too; a failed save leaves the person's choice alone. */
  onTurnOn?: () => void;
}

function NutritionEverywhere({ onTurnOn }: NutritionEverywhereProps) {
  const dispatch = useAppDispatch();
  const uid = useAuth().user?.uid ?? null;
  const show = useAppSelector(selectShowNutrition);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (metric: NutritionMetric, isOn: boolean) => {
    if (uid === null) return;
    setError(null);
    try {
      await dispatch(
        saveSettings({ uid, showNutrition: { [metric]: isOn } }),
      ).unwrap();
      if (isOn) onTurnOn?.();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
    }
  };

  return (
    <FilterSection title='Nutrition, everywhere'>
      <ul className='divide-border divide-y'>
        {NUTRITION_CELLS.map((cell) => (
          <li key={cell.key}>
            <label className='flex items-start gap-3 py-3'>
              <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                {MACRO_EMOJIS[cell.key]}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>{cell.label}</span>
                {cell.key === 'protein' && (
                  <span className='text-muted-foreground block text-xs'>
                    Also shows the price per gram of protein
                  </span>
                )}
              </span>
              <AppToggle
                aria-label={`Show ${cell.label.toLowerCase()}`}
                checked={show[cell.key]}
                onCheckedChange={(isOn) => void handleToggle(cell.key, isOn)}
                className='mt-0.5 shrink-0'
              />
            </label>
          </li>
        ))}
      </ul>
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </FilterSection>
  );
}

function AboutTheNumbers() {
  return (
    <p className='text-muted-foreground border-border border-t pt-3 text-xs'>
      <span className='font-medium'>About the numbers:</span> nutrition values
      are approximate, based on USDA FoodData Central. Store logos are provided
      by Logo.dev and remain their owners' trademarks.
    </p>
  );
}

interface NutritionViewOptionsProps {
  options: ListViewOptions;
  customizedCount: number;
  onChange: (patch: Partial<ListViewOptions>) => void;
  onReset: () => void;
}

export function NutritionViewOptions({
  options,
  customizedCount,
  onChange,
  onReset,
}: NutritionViewOptionsProps) {
  return (
    <ViewOptions isQuiet customizedCount={customizedCount} onReset={onReset}>
      <NutritionEverywhere />
      <FilterSection title='On the calendar'>
        <div className='divide-border divide-y'>
          <ViewOptionSwitch
            label='Show stats'
            description='Total, average per meal and daily nutrition, as tiles'
            checked={options.showStats}
            onCheckedChange={(showStats) => onChange({ showStats })}
          />
          <ViewOptionSwitch
            label='Show prices'
            description='On each meal in the week'
            checked={options.showPrices}
            onCheckedChange={(showPrices) => onChange({ showPrices })}
          />
        </div>
      </FilterSection>
      <AboutTheNumbers />
    </ViewOptions>
  );
}

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

/** The "View options" button of a Pinch list: the nutrition every screen shows, then which lines this list's rows show. */
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
      <NutritionEverywhere
        onTurnOn={() => {
          if (!options.showMacros) onChange({ showMacros: true });
        }}
      />
      <FilterSection title='On this list'>
        <div className='divide-border divide-y'>
          <ViewOptionSwitch
            label='Show prices'
            checked={options.showPrices}
            onCheckedChange={(showPrices) => onChange({ showPrices })}
          />
          <ViewOptionSwitch
            label='Show calories and macros'
            description={
              isAnyMetricOn ? undefined : 'Shows the numbers you turn on above'
            }
            checked={options.showMacros}
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
      </FilterSection>
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
      <AboutTheNumbers />
    </ViewOptions>
  );
}

export default ListViewControls;
