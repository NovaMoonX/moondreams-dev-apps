import { ListChecks } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';

function PlanScreen() {
  return (
    <EmptyCard icon={<ListChecks className='h-5 w-5' />}>
      Income, bills, envelopes and goals live here. Start with where your money
      comes from.
    </EmptyCard>
  );
}

export default PlanScreen;
