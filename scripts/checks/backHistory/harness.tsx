import { useEffect, useState, useSyncExternalStore } from 'react';
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
// Whether the open page has published what it shows (Helm's ask conversation opens only once it has).
const published = { isOn: false };
const useAddress = () =>
  useSyncExternalStore(
    subscribe,
    () => `${window.location.href}#${published.isOn}`,
  );

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

function AskOverlay() {
  const close = () => writeParams({ ask: null });
  usePageHistory(close);
  return (
    <section>
      <p>Ask open</p>
      <button type='button' onClick={close}>
        Close ask
      </button>
      <button
        type='button'
        onClick={() =>
          afterBackLayersClose(() =>
            writeParams({ ask: null, view: 'record' }, true),
          )
        }
      >
        Follow link
      </button>
    </section>
  );
}

function TaskSheet({ onClose }: { onClose: () => void }) {
  const { dialogId, onDialogClose } = useSheetHistory(true, onClose);
  return (
    <div role='dialog' id={dialogId}>
      <p>Sheet of one record</p>
      <button type='button' onClick={onDialogClose}>
        Close task
      </button>
      <button type='button' onClick={() => writeParams({ ask: 'page' })}>
        Ask this one
      </button>
    </div>
  );
}

// Like Helm's content page: it publishes on mount, the ask overlay opens over it, and a task sheet is local state.
function AskPage() {
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  useEffect(() => {
    published.isOn = true;
    notify();
    return () => {
      published.isOn = false;
    };
  }, []);
  return (
    <main style={{ height: 4000 }}>
      <p>Today page</p>
      <div style={{ position: 'fixed', top: 0, right: 0 }}>
        <button type='button' onClick={() => writeParams({ ask: 'page' })}>
          Ask page
        </button>
        <button type='button' onClick={() => setIsTaskOpen(true)}>
          Open record sheet
        </button>
      </div>
      {isTaskOpen && <TaskSheet onClose={() => setIsTaskOpen(false)} />}
    </main>
  );
}

function Harness() {
  const address = new URL(useAddress());
  const params = address.searchParams;
  if (address.pathname === '/helm') {
    return params.get('view') === 'record' ? (
      <p>Record page</p>
    ) : (
      <>
        <AskPage />
        {params.has('ask') && published.isOn && <AskOverlay />}
      </>
    );
  }
  if (address.pathname !== '/app') {
    return (
      <>
        <button
          type='button'
          onClick={() => {
            window.history.pushState({ idx: 1 }, '', '/app');
            notify();
          }}
        >
          Enter app
        </button>
        <button
          type='button'
          onClick={() => {
            window.history.pushState({ idx: 1 }, '', '/helm');
            notify();
          }}
        >
          Enter ask page
        </button>
      </>
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
