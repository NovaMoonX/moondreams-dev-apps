import { CalendarDays } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';

function DaysScreen() {
  return (
    <EmptyCard icon={<CalendarDays className='h-5 w-5' />}>
      Your coming income days will be listed here once you add an income source.
    </EmptyCard>
  );
}

export default DaysScreen;
