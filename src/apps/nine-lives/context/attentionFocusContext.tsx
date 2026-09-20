import { createContext, useContext } from 'react';

export type AttentionFocusRequest =
  | { kind: 'visit-complete'; requestedAt: number; visitId: string }
  | { kind: 'litter-log'; requestedAt: number; litterBoxId: string }
  | { kind: 'vaccination-log-dose'; requestedAt: number; catId: string; vaccinationId: string }
  | { kind: 'preventive-log-dose'; requestedAt: number; catId: string; preventiveId: string };

export interface AttentionFocusContextValue {
  focusRequest: AttentionFocusRequest | null;
  requestFocus: (request: AttentionFocusRequest) => void;
}

export const AttentionFocusContext = createContext<AttentionFocusContextValue | null>(null);

export function useAttentionFocus() {
  const context = useContext(AttentionFocusContext);

  if (!context) {
    throw new Error('useAttentionFocus must be used within an AttentionFocusContext.Provider');
  }

  return context;
}
