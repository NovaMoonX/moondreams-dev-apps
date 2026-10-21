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
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import {
  selectNutritionLoadError,
  selectPinchSettingsLoadError,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

const BASIS_CHOICES = NUTRITION_BASIS_OPTIONS.map((option) => ({ ...option }));

interface NumbersDoorProps {
  isAnyMetricOn: boolean;
}

/** The way from a View options sheet to the numbers Pinch shows, which are chosen once in Settings; until one is on it stands where the screen's own macros switch would be. */
function NumbersDoor({ isAnyMetricOn }: NumbersDoorProps) {
  const { showSettingsTab } = usePinchOverlay();

  return (
    <ActionRow
      icon='🔥'
      label={isAnyMetricOn ? 'Your numbers' : 'Calories and macros'}
      subtitle={
        isAnyMetricOn
          ? 'Choose which in Settings'
          : 'Switch them on in Settings'
      }
      hasChevron
      onClick={showSettingsTab}
    />
  );
}

interface CalendarViewOptionsProps {
  uid: string;
  options: ListViewOptions;
  customizedCount: number;
  onChange: (patch: Partial<ListViewOptions>) => void;
}

/** The Calendar's "View options": its stat tiles (saved with the account), its prices (kept on this device), and the door to the numbers, which are chosen in Settings. */
export function CalendarViewOptions({
  uid,
  options,
  customizedCount,
  onChange,
}: CalendarViewOptionsProps) {
  const { settings, save } = usePinchSettings(uid);
  const isAnyMetricOn = hasAnyMetricOn(useAppSelector(selectShowNutrition));
  const hasNumbersLoadError = useAppSelector(selectNutritionLoadError) !== null;
  const hasSettingsLoadError =
    useAppSelector(selectPinchSettingsLoadError) !== null;

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
          {!hasSettingsLoadError && (
            <ViewOptionSwitch
              label='Show stats'
              description='The total, averages and daily nutrition, as tiles'
              checked={settings.calendarStats}
              onCheckedChange={(calendarStats) => void save({ calendarStats })}
            />
          )}
          <ViewOptionSwitch
            label='Show prices'
            description='On each meal in the Week view. Kept on this device.'
            checked={options.showPrices}
            onCheckedChange={(showPrices) => onChange({ showPrices })}
          />
        </div>
      </FilterSection>
      {!hasNumbersLoadError && <NumbersDoor isAnyMetricOn={isAnyMetricOn} />}
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

/** The "View options" button of a Pinch list: which lines this list's rows show. Which numbers exist at all is chosen in Settings, so a door to them closes the sheet, and until one is on it stands in the calories switch's place (when the numbers couldn't load, neither is drawn). */
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
  const isAnyMetricOn = hasAnyMetricOn(useAppSelector(selectShowNutrition));
  const hasNumbersLoadError = useAppSelector(selectNutritionLoadError) !== null;

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
      {!hasNumbersLoadError && <NumbersDoor isAnyMetricOn={isAnyMetricOn} />}
    </ViewOptions>
  );
}

export default ListViewControls;
