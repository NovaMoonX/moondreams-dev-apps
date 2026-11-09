import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppSelector } from '@/store';
import AskAboutThisControl from '@apps/helm/components/shell/AskAboutThisControl';
import { selectTopScreen } from '@apps/helm/store/screenSlice';

interface HelmShellProps {
  children: ReactNode;
  /** The voice dock, drawn at the foot of home only. */
  dock?: ReactNode;
  /** False while the data key is out, when every view gives way to home and nothing can be asked about. */
  isAskAvailable: boolean;
}

/** The page every view sits in: one column, with the dock fixed at the foot of home and the ask bar at the foot of a content page. */
function HelmShell({ children, dock, isAskAvailable }: HelmShellProps) {
  const entry = useAppSelector(selectTopScreen);
  const hasAskBar = isAskAvailable && entry !== null;

  return (
    <div
      className={join(
        'page flex min-h-dvh flex-col',
        hasAskBar ? 'pb-28' : 'pb-40',
      )}
    >
      <div className='mx-auto flex w-full max-w-xl flex-1 flex-col pt-4'>
        {children}
      </div>
      {dock}
      {isAskAvailable && <AskAboutThisControl placement='page' />}
    </div>
  );
}

export default HelmShell;
