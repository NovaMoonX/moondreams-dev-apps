import { PropsWithChildren } from 'react';
import { BoxContext, BoxContextValue } from './boxContext';

interface BoxProviderProps extends PropsWithChildren {
  value: BoxContextValue;
}

export function BoxProvider({ children, value }: BoxProviderProps) {
  return <BoxContext.Provider value={value}>{children}</BoxContext.Provider>;
}
