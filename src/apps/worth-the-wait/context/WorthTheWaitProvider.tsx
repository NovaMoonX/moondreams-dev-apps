import type { PropsWithChildren } from 'react';

import type { Space } from '../types';
import {
  WorthTheWaitContext,
  type WorthTheWaitContextValue,
} from './worthTheWaitContext';

interface WorthTheWaitProviderProps extends PropsWithChildren {
  space: Space | null;
}

export function WorthTheWaitProvider({
  children,
  space,
}: WorthTheWaitProviderProps) {
  const value: WorthTheWaitContextValue = { space };

  return (
    <WorthTheWaitContext.Provider value={value}>
      {children}
    </WorthTheWaitContext.Provider>
  );
}
