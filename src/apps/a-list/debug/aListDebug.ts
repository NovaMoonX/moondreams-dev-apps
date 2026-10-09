// TEMPORARY: on-screen diagnostics for one account. Remove with DebugPanel.
import { useSyncExternalStore } from 'react';

export const A_LIST_DEBUG_EMAIL = 'stephon.ricks.01@gmail.com';

const MAX_ENTRIES = 40;
const listeners = new Set<() => void>();
let entries: string[] = [];

export function logAListDebug(message: string) {
  const time = new Date().toISOString().slice(11, 23);
  entries = [...entries, `${time} ${message}`].slice(-MAX_ENTRIES);
  console.log('[a-list-debug]', message);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAListDebugEntries() {
  return useSyncExternalStore(subscribe, () => entries);
}
