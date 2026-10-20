import ActionRow from '@/components/ActionRow';
import { FilterSection } from '@/components/FilterBar';
import { PillGroup } from '@/components/PillGroup';
import ViewOptions, { ViewOptionSwitch } from '@/components/ViewOptions';
import { useAppSelector } from '@/store';
import { NUTRITION_BASIS_OPTIONS } from '@apps/pinch/constants';
import {
  DEFAULT_LIST_VIEW_OPTIONS,
  type ListViewOptions,
} from '@apps/pinch/hooks/useListViewOptions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

const BASIS_CHOICES = NUTRITION_BASIS_OPTIONS.map((option) => ({ ...option }));

interface CalendarViewOptionsProps {
  options: ListViewOptions;
  customizedCount: number;
  onChange: (patch: Partial<ListViewOptions>) => void;
}

/** The Calendar's "View options": its one row switch, and the way to the stat tiles and numbers, which are chosen in Settings. */
export function CalendarViewOptions({
  options,
  customizedCount,
  onChange,
}: CalendarViewOptionsProps) {
  const { showSettingsTab } = usePinchOverlay();

  return (
    <ViewOptions
      isQuiet
      customizedCount={customizedCount}
      onReset={() =>
        onChange({ showPrices: DEFAULT_LIST_VIEW_OPTIONS.showPrices })
      }
    >
      <FilterSection title='On the calendar'>
        <div className='divide-border divide-y'>
          <ViewOptionSwitch
            label='Show prices'
            description='On each meal in the week'
            checked={options.showPrices}
            onCheckedChange={(showPrices) => onChange({ showPrices })}
          />
        </div>
      </FilterSection>
      <ActionRow
        icon='📊'
        label='Stats, calories and macros'
        subtitle='Choose them in Settings'
        hasChevron
        onClick={showSettingsTab}
      />
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
  /** Draws it as the shared header icon, for a header's action cluster. */
  isQuiet?: boolean;
  className?: string;
}

/** The "View options" button of a Pinch list: which lines this list's rows show. Which numbers exist at all is chosen in Settings, so until one is on the calories switch is the way there. */
function ListViewControls({
  options,
  customizedCount,
  onChange,
  onReset,
  hasBasis = false,
  hasStockLines = false,
  isQuiet = false,
  className,
}: ListViewControlsProps) {
  const { showSettingsTab } = usePinchOverlay();
  const isAnyMetricOn = hasAnyMetricOn(useAppSelector(selectShowNutrition));

  return (
    <ViewOptions
      customizedCount={customizedCount}
      onReset={onReset}
      isQuiet={isQuiet}
      className={className}
    >
      <FilterSection title='On this list'>
        <div className='divide-border divide-y'>
          <ViewOptionSwitch
            label='Show prices'
            checked={options.showPrices}
            onCheckedChange={(showPrices) => onChange({ showPrices })}
          />
          {isAnyMetricOn && (
            <ViewOptionSwitch
              label='Show calories and macros'
              checked={options.showMacros}
              onCheckedChange={(showMacros) => onChange({ showMacros })}
            />
          )}
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
      {!isAnyMetricOn && (
        <ActionRow
          icon='🔥'
          label='Show calories and macros'
          subtitle='Choose your numbers in Settings first'
          hasChevron
          onClick={showSettingsTab}
        />
      )}
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
