import { useEffect, type ReactNode } from 'react';

import SubviewHeader from '@apps/a-list/components/shell/SubviewHeader';

interface SubviewProps {
  children: ReactNode;
  /** Omit when the content draws its own header because its back step changes. */
  header?: { title: string; onBack: () => void };
}

/** A screen of its own that takes over the app, so it brings its own way back and never needs the app's navigation. */
function Subview({ children, header }: SubviewProps) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className='page'>
      <div className='mx-auto max-w-2xl py-6'>
        {header && <SubviewHeader title={header.title} onBack={header.onBack} />}
        {children}
      </div>
    </div>
  );
}

export default Subview;
