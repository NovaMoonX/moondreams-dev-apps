import { createContext, useContext } from 'react';

/**
 * `null` means fully online at normal speed — no banner should render.
 * Every other value maps 1:1 to a banner variant.
 */
export type NetworkBannerState =
  | 'offline'
  | 'reconnecting'
  | 'reconnected'
  | 'slow'
  | null;

export const NetworkStatusContext = createContext<NetworkBannerState | undefined>(
  undefined,
);

export function useNetworkStatus() {
  const context = useContext(NetworkStatusContext);

  if (context === undefined) {
    throw new Error(
      'useNetworkStatus must be used within a NetworkStatusProvider',
    );
  }

  return context;
}
