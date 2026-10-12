import { memo } from 'react';

import SectionHeader from '@/components/SectionHeader';

function CalendarScreen() {
  return (
    <div className='space-y-4'>
      <SectionHeader title='Calendar' />
      <p className='text-muted-foreground py-6 text-center text-sm'>
        An empty month is fine. What you plan to eat will show up here.
      </p>
    </div>
  );
}

export default memo(CalendarScreen);
