import { Home } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';

function HomeScreen() {
  return (
    <EmptyCard icon={<Home className='h-5 w-5' />}>
      Add an income source to see what your next income day does with the money.
    </EmptyCard>
  );
}

export default HomeScreen;
