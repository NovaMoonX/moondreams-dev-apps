import { useCallback, useState, type PropsWithChildren } from 'react';

import type { Space } from '../types';
import { useActiveAction } from '../hooks/useActiveAction';
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
  const { activeAction, dismissPresentedAction, presentedAction } =
    useActiveAction(space?.id ?? '');
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  const openBox = useCallback((boxId: string) => {
    setSelectedBoxId(boxId);
  }, []);

  const closeBox = useCallback(() => {
    setSelectedBoxId(null);
  }, []);

  const value: WorthTheWaitContextValue = {
    space,
    activeAction,
    presentedAction,
    dismissPresentedAction,
    selectedBoxId,
    openBox,
    closeBox,
  };

  return (
    <WorthTheWaitContext.Provider value={value}>
      {children}
    </WorthTheWaitContext.Provider>
  );
}
