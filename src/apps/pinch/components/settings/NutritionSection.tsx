import { useState } from 'react';

import AppToggle from '@/components/AppToggle';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MACRO_EMOJIS } from '@/utils/macroUtils';
import { NUTRITION_CELLS } from '@apps/pinch/constants';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { saveSettings } from '@apps/pinch/store/actions/settingsActions';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import type { NutritionMetric } from '@apps/pinch/types';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

interface NutritionSectionProps {
  uid: string;
}

/** Which numbers Pinch shows and whether the Calendar draws its stat tiles. */
function NutritionSection({ uid }: NutritionSectionProps) {
  const dispatch = useAppDispatch();
  const show = useAppSelector(selectShowNutrition);
  const recipes = useListViewOptions(uid, 'recipes');
  const ingredients = useListViewOptions(uid, 'ingredients');
  const calendar = useListViewOptions(uid, 'calendar');
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (metric: NutritionMetric, isOn: boolean) => {
    const isFirst = isOn && !hasAnyMetricOn(show);
    setError(null);
    try {
      await dispatch(
        saveSettings({ uid, showNutrition: { [metric]: isOn } }),
      ).unwrap();
      if (isFirst) {
        [recipes, ingredients].forEach(({ options, update }) => {
          if (!options.showMacros) update({ showMacros: true });
        });
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
    }
  };

  return (
    <SettingsGroup
      title='Numbers'
      footer={
        <>
          {error && <p className='text-destructive text-sm'>{error}</p>}
          <p>
            <span className='font-medium'>About the numbers:</span> nutrition
            values are approximate, based on USDA FoodData Central. Store logos
            are provided by Logo.dev and remain their owners' trademarks.
          </p>
        </>
      }
    >
      {NUTRITION_CELLS.map((cell) => (
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
      ))}
      <SettingsRow
        icon='📊'
        title='Calendar stats'
        description='Total, average per fully priced meal and daily nutrition, as tiles'
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
