import { memo } from 'react';

import SectionHeader from '@/components/SectionHeader';

function RecipesScreen() {
  return (
    <div className='space-y-4'>
      <SectionHeader title='Recipes' />
      <p className='text-muted-foreground py-6 text-center text-sm'>
        Your recipes will live here, ready to put on the calendar.
      </p>
    </div>
  );
}

export default memo(RecipesScreen);
