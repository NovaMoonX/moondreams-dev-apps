import type { ReactNode } from 'react';

import FormSection from '@/components/FormSection';
import { CONTAINER_PLACE_EMOJIS } from '@apps/pinch/constants';
import type { RecipeCare } from '@apps/pinch/types';
import { formatCareDays } from '@apps/pinch/utils/recipeCare';

interface CareLineProps {
  emoji: string;
  children: ReactNode;
}

function CareLine({ emoji, children }: CareLineProps) {
  return (
    <li className='flex gap-2 text-sm'>
      <span className='w-5 shrink-0 text-center' aria-hidden='true'>
        {emoji}
      </span>
      <span className='min-w-0 wrap-break-word whitespace-pre-wrap'>
        {children}
      </span>
    </li>
  );
}

interface RecipeCareSectionProps {
  care: RecipeCare;
}

function RecipeCareSection({ care }: RecipeCareSectionProps) {
  return (
    <FormSection title='Keeping it'>
      <ul className='space-y-1.5'>
        {care.fridgeDays !== null && (
          <CareLine emoji={CONTAINER_PLACE_EMOJIS.FRIDGE}>
            Keeps {formatCareDays(care.fridgeDays)} in the fridge
          </CareLine>
        )}
        {care.freezerDays !== null && (
          <CareLine emoji={CONTAINER_PLACE_EMOJIS.FREEZER}>
            Keeps {formatCareDays(care.freezerDays)} in the freezer
          </CareLine>
        )}
        {care.reheat !== null && (
          <CareLine emoji='♨️'>
            <span className='text-muted-foreground'>Reheat:</span> {care.reheat}
          </CareLine>
        )}
        {care.tip !== null && <CareLine emoji='💡'>{care.tip}</CareLine>}
      </ul>
    </FormSection>
  );
}

export default RecipeCareSection;
