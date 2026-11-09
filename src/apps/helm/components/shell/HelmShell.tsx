import type { ReactNode } from 'react';

interface HelmShellProps {
  children: ReactNode;
  /** The voice dock, drawn at the foot of home only. */
  dock?: ReactNode;
}

/** The page every Helm view sits in: one column, with the dock fixed at the foot when the view has one. */
function HelmShell({ children, dock }: HelmShellProps) {
  return (
    <div className='page pb-40'>
      <div className='mx-auto flex w-full max-w-xl flex-col pt-4'>
        {children}
      </div>
      {dock}
    </div>
  );
}

export default HelmShell;
