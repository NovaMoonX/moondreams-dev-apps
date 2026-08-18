import { createContext, useContext } from 'react';

import type { Space } from '../types';

export type WorthTheWaitContextValue = {
  space: Space | null;
};

export const WorthTheWaitContext = createContext<WorthTheWaitContextValue | null>(
  null,
);

export function useWorthTheWait() {
  const context = useContext(WorthTheWaitContext);

  if (!context) {
    throw new Error('useWorthTheWait must be used within a WorthTheWaitProvider');
  }

  return context;
}
