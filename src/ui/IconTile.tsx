import type { ReactNode } from 'react';

/** The 40px soft tile an icon sits in beside a heading or a row. */
function IconTile({ children }: { children: ReactNode }) {
  return (
    <span
      className='bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl'
      aria-hidden='true'
    >
      {children}
    </span>
  );
}

export default IconTile;
