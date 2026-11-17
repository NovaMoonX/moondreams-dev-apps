import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useStore } from 'react-redux';

import AppToggle from '@/components/AppToggle';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
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

interface NumbersRowProps {
  uid: string;
  position: SummaryGroupPosition;
}

/** "Calories, protein and fat", "All four" or "None shown". */
const getNumbersSummary = (shown: string[]) => {
  if (shown.length === 0) return 'None shown';
  if (shown.length === NUTRITION_CELLS.length) return 'All four';
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)?.toLowerCase()}`;
};

/** Which numbers Pinch shows on every screen that has them. */
function NumbersRow({ uid, position }: NumbersRowProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { addToast } = useToast();
  const show = useAppSelector(selectShowNutrition);
  const loadError = useAppSelector(selectNutritionLoadError);
  const recipes = useListViewOptions(uid, 'recipes');
  const ingredients = useListViewOptions(uid, 'ingredients');
  const shown = NUTRITION_CELLS.filter((cell) => show[cell.key]).map(
    (cell, index) => (index === 0 ? cell.label : cell.label.toLowerCase()),
  );

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
    <li className='-mx-3'>
      <SummaryEditor
        label='Calories and macros'
        title='Calories and macros'
        groupPosition={position}
        icon={MACRO_EMOJIS.calories}
        summary={
          loadError !== null
            ? "Couldn't load just now"
            : getNumbersSummary(shown)
        }
        placeholder=''
        shouldFocus={false}
      >
        {loadError !== null ? (
          <p className='text-muted-foreground text-sm'>
            Your numbers couldn't load just now.
          </p>
        ) : (
          <>
            <p className='text-muted-foreground text-sm text-pretty'>
              The numbers recipes, meals and the calendar show.
            </p>
            <ul className='divide-border divide-y'>
              {NUTRITION_CELLS.map((cell) => (
                <li key={cell.key}>
                  <label className='flex min-h-12 cursor-pointer items-center gap-3 py-1'>
                    <span
                      className='w-6 text-center text-lg'
                      aria-hidden='true'
                    >
                      {MACRO_EMOJIS[cell.key]}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block font-medium'>{cell.label}</span>
                      {cell.key === 'protein' && (
                        <span className='text-muted-foreground block text-sm text-pretty'>
                          Also shows the price per gram of protein
                        </span>
                      )}
                    </span>
                    <AppToggle
                      aria-label={`Show ${cell.label.toLowerCase()}`}
                      checked={show[cell.key]}
                      onCheckedChange={(isOn) =>
                        void handleToggle(cell.key, isOn)
                      }
                    />
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </SummaryEditor>
    </li>
  );
}

export default NumbersRow;
