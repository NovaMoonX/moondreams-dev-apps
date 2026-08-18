import type { PropsWithChildren, ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

type WorthTheWaitShellProps = PropsWithChildren<{
  header?: ReactNode;
  className?: string;
}>;

function WorthTheWaitShell({
  children,
  header,
  className,
}: WorthTheWaitShellProps) {
  return (
    <div className='page min-h-screen px-4 py-6 md:px-6'>
      <div className={join('mx-auto max-w-6xl space-y-6', className)}>
        <header className='flex items-start justify-between gap-4'>
          {header}
        </header>

        <main className='bg-card/80 border-border rounded-2xl border p-5 shadow-sm md:p-8'>
          {children}
        </main>
      </div>
    </div>
  );
}

export default WorthTheWaitShell;
