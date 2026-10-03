import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import NavButton from '@/ui/NavButton';

function AList() {
  return (
    <div className='page'>
      <div className='mx-auto max-w-4xl space-y-6 py-8'>
        <NavButton href='/' variant='link'>
          <ChevronLeft /> Back home
        </NavButton>

        <div>
          <h1 className='text-3xl font-semibold'>A-List Tracker</h1>
          <p className='text-muted-foreground mt-1'>
            Your movie calendar is getting its popcorn ready. Check back soon.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AList;
