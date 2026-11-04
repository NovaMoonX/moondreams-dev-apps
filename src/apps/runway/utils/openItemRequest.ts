import { useSyncExternalStore } from 'react';

export interface OpenItemRequest {
  itemId: string;
  step: string | null;
}

// Kept out of the URL: the sheet adds its history entry before a URL write lands, so the write would sit on the sheet's entry and Back would drop the request with it.
let request: OpenItemRequest | null = null;
const listeners = new Set<() => void>();

export const setOpenItemRequest = (next: OpenItemRequest | null) => {
  request = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The item a warning asked to open, and the question to open it at, until its sheet closes. */
export const useOpenItemRequest = () =>
  useSyncExternalStore(subscribe, () => request);
