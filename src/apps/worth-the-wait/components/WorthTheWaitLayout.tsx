import NavButton from '@/ui/NavButton';
import { useAuth } from '@hooks/useAuth';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';
import { useWorthTheWait } from '../context/worthTheWaitContext';
import PresenceBadge from './PresenceBadge';

function WorthTheWaitLayout() {
  const { user } = useAuth();
  const { space } = useWorthTheWait();

  const hasLockedSpace = Boolean(space && space.members.length >= 2);

  return (
    <div className='page pt-28'>
      <div className={join('mx-auto max-w-6xl space-y-6')}>
        <header className='flex items-start justify-between gap-4'>
          <NavButton href='/' variant='link'>
            <ChevronLeft /> Back home
          </NavButton>

          {space ? <PresenceBadge className='shrink-0' /> : null}
        </header>

        <main className='bg-card/80 border-border rounded-2xl border p-5 shadow-sm md:p-8'>
          <div className='max-w-xl space-y-5'>
            <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-5xl'>
              Worth the Wait
            </h1>
            <p className='text-foreground/70 max-w-lg text-base leading-7 md:text-lg'>
              A quiet place to hold what is on your mind and in your heart until
              the right moment to share it arrives.
            </p>

            {!hasLockedSpace && user ? (
              <div className='bg-muted/40 border-border text-muted-foreground rounded-lg border p-4 text-sm'>
                Your shared space is waiting for both partners to join and lock
                in.
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export default WorthTheWaitLayout;
