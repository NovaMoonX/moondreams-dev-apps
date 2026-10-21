import { useMemo, type ReactNode } from 'react';

import {
  SubviewFrameContext,
  type SubviewFrameParts,
} from '@/contexts/SubviewFrameContext';

interface SubviewFrameProviderProps extends SubviewFrameParts {
  children: ReactNode;
}

/** Wrap a mini-app's page to replace parts of the frame its subviews draw; omitted parts keep the default. */
function SubviewFrameProvider({
  children,
  identity,
  Surround,
  Eyebrow,
}: SubviewFrameProviderProps) {
  const value = useMemo(
    () => ({ identity, Surround, Eyebrow }),
    [identity, Surround, Eyebrow],
  );

  return (
    <SubviewFrameContext.Provider value={value}>
      {children}
    </SubviewFrameContext.Provider>
  );
}

export default SubviewFrameProvider;
