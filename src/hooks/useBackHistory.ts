import { useCallback, useEffect, useId, useRef } from 'react';
import { flushSync } from 'react-dom';

import { getDialogsAbove } from '@/utils/dialogUtils';
import { generateUuid } from '@/utils/idUtils';

type LayerKind = 'page' | 'dialog' | 'step';

interface BackLayer {
  key: string;
  seq: number;
  kind: LayerKind;
  dialogId: string | null;
  goBack: () => void;
}

const STEP_TIMEOUT_MS = 1000;

const layers: BackLayer[] = [];
const waiting: BackLayer[] = [];
let lastSeq = 0;
let steppedAt = 0;
let isFlushQueued = false;
let adoptUrl: string | null = null;

const readEntry = () => {
  const state: unknown = window.history.state;
  const fields =
    typeof state === 'object' && state !== null
      ? (state as Record<string, unknown>)
      : {};
  const entry = {
    key: typeof fields.backLayerKey === 'string' ? fields.backLayerKey : null,
    seq: typeof fields.backLayerSeq === 'number' ? fields.backLayerSeq : 0,
  };
  return entry;
};

// An entry kept from before a reload belongs to no layer: it becomes a plain one, so closing a
// layer never steps back into the page as it was.
if (typeof window !== 'undefined' && readEntry().key !== null) {
  window.history.replaceState(
    {
      ...window.history.state,
      backLayerKey: undefined,
      backLayerSeq: undefined,
    },
    '',
  );
}

// Clock-based so an entry kept from an earlier page load never outranks a layer opened now.
const nextSeq = () => {
  lastSeq = Math.max(lastSeq + 1, Date.now());
  return lastSeq;
};

const isStepping = () => Date.now() - steppedAt < STEP_TIMEOUT_MS;

// An entry pushed to keep a closing layer's place (`keepEntryFor`) is dead once its param is gone.
const isKeptEntryDone = () => {
  const keptFor: unknown = window.history.state?.keptFor;
  if (typeof keptFor !== 'string') return false;
  const result = !new URLSearchParams(window.location.search).has(keptFor);
  return result;
};

const isOnDeadEntry = () => {
  const { key } = readEntry();
  const result =
    (key !== null && !layers.some((layer) => layer.key === key)) ||
    (key === null && isKeptEntryDone());
  return result;
};

const writeEntry = (layer: BackLayer) => {
  const next = {
    ...window.history.state,
    backLayerKey: layer.key,
    backLayerSeq: layer.seq,
  };
  if (isOnDeadEntry()) {
    window.history.replaceState(next, '');
    return;
  }
  window.history.pushState(next, '');
};

const leaveDeadEntry = (isClosing = false) => {
  if (isStepping() || !isOnDeadEntry()) return;
  steppedAt = Date.now();
  adoptUrl = isClosing ? window.location.href : null;
  window.history.back();
};

const getDialog = (layer: BackLayer | undefined) => {
  if (!layer?.dialogId) return null;
  const dialog =
    document.getElementById(layer.dialogId)?.closest('[role="dialog"]') ?? null;
  return dialog;
};

const closePopped = (popped: BackLayer[]) => {
  const top = popped[popped.length - 1];
  const holder = layers
    .slice(0, layers.indexOf(top) + 1)
    .reverse()
    .find((layer) => layer.kind === 'dialog');
  if (getDialogsAbove(getDialog(holder)).length > 0) {
    popped.forEach(writeEntry);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    return;
  }
  [...popped].reverse().every((layer) => {
    flushSync(layer.goBack);
    return !layers.includes(layer);
  });
  // A layer still open stepped back inside itself or asked first, so it gets its entry back.
  popped.filter((layer) => layers.includes(layer)).forEach(writeEntry);
};

const handlePop = () => {
  steppedAt = 0;
  const wasClosing = adoptUrl !== null;
  // A layer closed by its own control leaves its entry; stepping off it keeps the screen as it is,
  // so the entry below takes this address, or a param it still carries reopens what just closed.
  // Runs before the router's own listener, which reads the address after it.
  if (adoptUrl !== null) {
    window.history.replaceState(window.history.state, '', adoptUrl);
    adoptUrl = null;
  }
  const { seq } = readEntry();
  const popped = layers.filter(
    (layer) => layer.seq > seq && !waiting.includes(layer),
  );
  if (popped.length > 0) {
    closePopped(popped);
  }
  waiting.splice(0).forEach(writeEntry);
  leaveDeadEntry(wasClosing);
};

const OPEN_POPUP_SELECTOR =
  '[aria-haspopup][aria-expanded="true"], [role="listbox"], [role="menu"]';

// Escape takes a swapped-in view back one step, like the back gesture, before the sheet under it
// (or, on a plain page, nothing) sees it as a close. Capture, so the sheet's own listener never gets it.
const handleEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = layers[layers.length - 1];
  const holder = [...layers].reverse().find((layer) => layer.kind !== 'step');
  if (top?.kind !== 'step' || (holder && holder.kind !== 'dialog')) return;
  const isPopupOpen =
    (event.target instanceof Element &&
      event.target.closest(OPEN_POPUP_SELECTOR) !== null) ||
    document.querySelector('[role="tooltip"]') !== null;
  if (isPopupOpen || getDialogsAbove(getDialog(holder)).length > 0) return;
  event.preventDefault();
  event.stopPropagation();
  top.goBack();
};

// Always listening, so landing on an entry kept from before a reload steps on instead of costing a press.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', handlePop);
  window.addEventListener('keydown', handleEscape, true);
}

const queueFlush = () => {
  if (isFlushQueued) return;
  isFlushQueued = true;
  window.setTimeout(() => {
    isFlushQueued = false;
    leaveDeadEntry(true);
  }, 0);
};

const open = (layer: BackLayer) => {
  layers.push(layer);
  if (isStepping()) {
    waiting.push(layer);
    return;
  }
  writeEntry(layer);
};

const close = (layer: BackLayer) => {
  const index = layers.indexOf(layer);
  if (index === -1) return;
  const nextNonStep = layers.findIndex(
    (other, at) => at > index && other.kind !== 'step',
  );
  const getEnd = () => {
    if (layer.kind !== 'dialog') return index + 1;
    return nextNonStep === -1 ? layers.length : nextNonStep;
  };
  const removed = layers.splice(index, getEnd() - index);
  const stillWaiting = waiting.filter((other) => !removed.includes(other));
  waiting.splice(0, waiting.length, ...stillWaiting);
  queueFlush();
};

const useHistoryLayer = (
  isOpen: boolean,
  onBack: () => void,
  kind: LayerKind,
  dialogId: string | null,
) => {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!isOpen) return;
    const layer: BackLayer = {
      key: generateUuid(),
      seq: nextSeq(),
      kind,
      dialogId,
      goBack: () => onBackRef.current(),
    };
    open(layer);
    return () => close(layer);
  }, [isOpen, kind, dialogId]);
};

const MAX_BACK_STEPS = 6;
const BACK_STEP_TIMEOUT_MS = 1500;
let isSteppingBack = false;

/** Runs `action` once the history entries of every open sheet have been stepped back over (the sheets close as for a back gesture), or at once when none is open, so a route change made from inside a sheet never replaces the sheet's own entry. A call made while another is stepping is ignored, and a sheet that keeps its entry stops the stepping after a few presses. */
export function afterBackLayersClose(action: () => void) {
  if (isSteppingBack) return;
  const step = (stepsLeft: number) => {
    if (readEntry().key === null || stepsLeft === 0) {
      isSteppingBack = false;
      action();
      return;
    }
    const onPop = () => {
      window.clearTimeout(timer);
      step(stepsLeft - 1);
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener('popstate', onPop);
      isSteppingBack = false;
    }, BACK_STEP_TIMEOUT_MS);
    window.addEventListener('popstate', onPop, { once: true });
    window.history.back();
  };
  isSteppingBack = true;
  step(MAX_BACK_STEPS);
}

/** A full-page screen's own history entry, so the back gesture calls `onBack` instead of leaving the page under it. */
export function usePageHistory(onBack: () => void) {
  useHistoryLayer(true, onBack, 'page', null);
}

/** A swapped-in view of a drawer or sheet (a "‹ Back" view) takes the back gesture and Escape while `isActive`, stepping back to the view before it. */
export function useBackStep(isActive: boolean, onBack: () => void) {
  useHistoryLayer(isActive, onBack, 'step', null);
}

/**
 * A drawer, modal or panel's history entry while it is open, so the back gesture closes it before
 * anything under it. Give the dialog `dialogId` as its `id` and `onDialogClose` as its `onClose`:
 * an Escape meant for a dialog opened above it (a confirm, a help note) then leaves it open.
 */
export function useSheetHistory(isOpen: boolean, onClose: () => void) {
  const dialogId = useId();
  const onCloseRef = useRef(onClose);
  const isEscapeForAboveRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useHistoryLayer(isOpen, onClose, 'dialog', dialogId);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const dialog =
        document.getElementById(dialogId)?.closest('[role="dialog"]') ?? null;
      if (dialog === null || getDialogsAbove(dialog).length === 0) return;
      isEscapeForAboveRef.current = true;
      window.setTimeout(() => {
        isEscapeForAboveRef.current = false;
      }, 0);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, dialogId]);

  const onDialogClose = useCallback(() => {
    if (!isEscapeForAboveRef.current) onCloseRef.current();
  }, []);

  return { dialogId, onDialogClose };
}
