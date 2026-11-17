import { createContext } from 'react';

interface CookConversionState {
  /** The line whose other units are open, keyed by recipe and line; one at a time. */
  openKey: string | null;
  onToggle: (key: string) => void;
}

export const CookConversionContext = createContext<CookConversionState>({
  openKey: null,
  onToggle: () => {},
});
