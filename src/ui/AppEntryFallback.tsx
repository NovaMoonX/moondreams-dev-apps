import { Button } from '@moondreamsdev/dreamer-ui/components';
import type { ReactNode } from 'react';

interface AppEntryFallbackProps {
  appName: string;
  onEnterApp: () => void;
  onBackHome: () => void;
  /** Extra content (e.g. pending requests) shown above the hero, still inside the '.page' container. */
  children?: ReactNode;
}

function AppEntryFallback({
  appName,
  onEnterApp,
  onBackHome,
  children,
}: AppEntryFallbackProps) {
  return (
    <div className='page space-y-6 pb-0!'>
      {children}

      <div className='relative flex min-h-[60vh] items-center justify-center'>
        <div className='flex flex-col items-center gap-6 text-center'>
          <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-5xl'>
            {appName}
          </h1>
          <div className='flex items-center gap-3'>
            <Button variant='link' onClick={onBackHome}>
              Back home
            </Button>
            <Button onClick={onEnterApp}>Enter app</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppEntryFallback;
