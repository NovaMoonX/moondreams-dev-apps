import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AppToggle from '@/components/AppToggle';
import FormSheet from '@/components/FormSheet';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { NUTRITION_CELLS } from '@apps/pinch/constants';
import { MACRO_EMOJIS } from '@/utils/macroUtils';
import { saveSettings } from '@apps/pinch/store/actions/settingsActions';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import type { NutritionMetric } from '@apps/pinch/types';

interface SettingsSheetProps {
  uid: string;
  onClose: () => void;
}

function SettingsSheet({ uid, onClose }: SettingsSheetProps) {
  const dispatch = useAppDispatch();
  const show = useAppSelector(selectShowNutrition);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (metric: NutritionMetric, isOn: boolean) => {
    setError(null);
    try {
      await dispatch(
        saveSettings({ uid, showNutrition: { [metric]: isOn } }),
      ).unwrap();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save your settings.'));
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Settings'>
      <div className='space-y-6'>
        <section aria-label='Show nutrition' className='space-y-1'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            Show nutrition
          </h3>
          <ul className='divide-border divide-y'>
            {NUTRITION_CELLS.map((cell) => (
              <li key={cell.key} className='flex items-center gap-3 py-3'>
                <span className='w-5 shrink-0 text-center' aria-hidden='true'>
                  {MACRO_EMOJIS[cell.key]}
                </span>
                <span className='min-w-0 flex-1 font-medium'>{cell.label}</span>
                <AppToggle
                  aria-label={`Show ${cell.label.toLowerCase()}`}
                  checked={show[cell.key]}
                  onCheckedChange={(isOn) => void handleToggle(cell.key, isOn)}
                />
              </li>
            ))}
          </ul>
          <p className='text-muted-foreground pt-2 text-sm'>
            Each switch applies at once. Turning on protein also shows your
            price per gram of protein. Pinch always keeps the values; the
            switches only choose what you see.
          </p>
        </section>

        <section aria-label='About' className='space-y-2'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            About
          </h3>
          <ul className='text-muted-foreground space-y-2 text-sm'>
            <li>
              The built-in nutrition values are approximate, based on USDA
              FoodData Central.
            </li>
            <li>
              Store logos, where shown, are provided by Logo.dev and remain
              their owners' trademarks.
            </li>
          </ul>
        </section>

        {error && <p className='text-destructive text-sm'>{error}</p>}
        <Button
          type='button'
          variant='secondary'
          className='w-full'
          onClick={onClose}
        >
          Done
        </Button>
      </div>
    </FormSheet>
  );
}

export default SettingsSheet;
