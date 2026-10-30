import type { ReactNode } from 'react';

/** A "How this is counted" disclosure under a list of figures. */
function CountedNote({ children }: { children: ReactNode }) {
  return (
    <details className='text-muted-foreground text-xs'>
      <summary className='cursor-pointer py-1'>How this is counted</summary>
      <p className='pt-1'>{children}</p>
    </details>
  );
}

export default CountedNote;
