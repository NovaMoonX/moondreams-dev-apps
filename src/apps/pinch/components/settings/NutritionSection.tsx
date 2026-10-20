import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useStore } from 'react-redux';

import AppToggle from '@/components/AppToggle';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { useAppDispatch, useAppSelector, type RootState } from '@/store';
import { MACRO_EMOJIS } from '@/utils/macroUtils';
import { NUTRITION_CELLS } from '@apps/pinch/constants';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { saveSettings } from '@apps/pinch/store/actions/settingsActions';
import {
  selectNutritionLoadError,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { NutritionMetric } from '@apps/pinch/types';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

interface NutritionSectionProps {
  uid: string;
}

/** Which numbers Pinch shows and whether the Calendar draws its stat tiles. */
function NutritionSection({ uid }: NutritionSectionProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { addToast } = useToast();
  const show = useAppSelector(selectShowNutrition);
  const loadError = useAppSelector(selectNutritionLoadError);
  const recipes = useListViewOptions(uid, 'recipes');
  const ingredients = useListViewOptions(uid, 'ingredients');
  const calendar = useListViewOptions(uid, 'calendar');

  const handleToggle = async (metric: NutritionMetric, isOn: boolean) => {
    const isFirst =
      isOn && !hasAnyMetricOn(selectShowNutrition(store.getState()));
    const result = await dispatch(
      saveSettings({ uid, showNutrition: { [metric]: isOn } }),
    );
    if (saveSettings.rejected.match(result)) {
      addToast({
        title: 'That didn’t save',
        description: result.payload ?? 'Unable to save your settings.',
        type: 'error',
      });
      return;
    }
    if (isFirst) {
      [recipes, ingredients].forEach(({ update }) =>
        update({ showMacros: true }),
      );
    }
  };

  return (
    <SettingsGroup title='Numbers'>
      {loadError !== null ? (
        <li className='text-muted-foreground py-3 text-sm'>
          Your numbers couldn't load just now.
        </li>
      ) : (
        NUTRITION_CELLS.map((cell) => (
          <SettingsRow
            key={cell.key}
            icon={MACRO_EMOJIS[cell.key]}
            title={cell.label}
            description={
              cell.key === 'protein'
                ? 'Also shows the price per gram of protein'
                : undefined
            }
            control={
              <AppToggle
                aria-label={`Show ${cell.label.toLowerCase()}`}
                checked={show[cell.key]}
                onCheckedChange={(isOn) => void handleToggle(cell.key, isOn)}
              />
            }
          />
        ))
      )}
      <SettingsRow
        icon='📊'
        title='Calendar stats'
        description='Total, average per fully priced meal and daily nutrition, as tiles. Kept on this device.'
        control={
          <AppToggle
            aria-label='Show stats on the Calendar'
            checked={calendar.options.showStats}
            onCheckedChange={(showStats) => calendar.update({ showStats })}
          />
        }
      />
    </SettingsGroup>
  );
}

export default NutritionSection;
