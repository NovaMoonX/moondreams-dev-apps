import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import {
  afterBackLayersClose,
  keepEntryFor,
  usePageHistory,
  useSheetHistory,
} from '@/hooks/useBackHistory';

// A stand-in app on the real history hook: a sheet (`sheet`), a page opened from it (`day`) and a door out of it (`target`).
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
window.addEventListener('popstate', notify);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const useAddress = () =>
  useSyncExternalStore(subscribe, () => window.location.href);

// Like the URL-state library: a write keeps whatever the entry's state already holds.
const writeParams = (change: Record<string, string | null>, isPush = false) => {
  const url = new URL(window.location.href);
  Object.entries(change).forEach(([key, value]) =>
    value === null
      ? url.searchParams.delete(key)
      : url.searchParams.set(key, value),
  );
  if (isPush) window.history.pushState(window.history.state, '', url);
  else window.history.replaceState(window.history.state, '', url);
  notify();
};

function Sheet() {
  const { dialogId, onDialogClose } = useSheetHistory(true, () =>
    writeParams({ sheet: null }),
  );
  return (
    <div role='dialog' id={dialogId}>
      <button type='button' onClick={onDialogClose}>
        Close sheet
      </button>
      <button
        type='button'
        onClick={() => {
          keepEntryFor('sheet');
          writeParams({ day: '1' });
        }}
      >
        Open day
      </button>
      <button
        type='button'
        onClick={() =>
          afterBackLayersClose(() =>
            writeParams({ day: null, sheet: null, target: '1' }, true),
          )
        }
      >
        Door
      </button>
    </div>
  );
}

function Day() {
  const close = () => writeParams({ day: null });
  usePageHistory(close);
  return (
    <section>
      <button type='button' onClick={close}>
        Close day
      </button>
    </section>
  );
}

function AddForm() {
  const close = () => writeParams({ add: null });
  usePageHistory(close);
  return (
    <section>
      <button type='button' onClick={close}>
        Close add
      </button>
    </section>
  );
}

// Like an app's door to an add form from a tab: a kept entry carrying the request goes under the form's own.
const openAdd = () => {
  const address = new URL(window.location.href);
  address.searchParams.set('add', '1');
  keepEntryFor('add', address);
  writeParams({ add: '1' });
};

function Harness() {
  const address = new URL(useAddress());
  const params = address.searchParams;
  if (address.pathname !== '/app') {
    return (
      <button
        type='button'
        onClick={() => {
          window.history.pushState({ idx: 1 }, '', '/app');
          notify();
        }}
      >
        Enter app
      </button>
    );
  }
  return (
    <main>
      <button type='button' onClick={() => writeParams({ sheet: '1' })}>
        Open sheet
      </button>
      <button type='button' onClick={openAdd}>
        Open add
      </button>
      {params.has('target') && <p>Arrived</p>}
      {params.has('add') && <AddForm />}
      {params.has('sheet') && <Sheet />}
      {params.has('day') && <Day />}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
