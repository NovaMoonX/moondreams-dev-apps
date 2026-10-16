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

const isOnDeadEntry = () => {
  const { key } = readEntry();
  const result = key !== null && !layers.some((layer) => layer.key === key);
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

const leaveDeadEntry = () => {
  if (isStepping() || !isOnDeadEntry()) return;
  steppedAt = Date.now();
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
  const { seq } = readEntry();
  const popped = layers.filter(
    (layer) => layer.seq > seq && !waiting.includes(layer),
  );
  if (popped.length > 0) {
    closePopped(popped);
  }
  waiting.splice(0).forEach(writeEntry);
  leaveDeadEntry();
};

// Always listening, so landing on an entry kept from before a reload steps on instead of costing a press.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', handlePop);
}

const queueFlush = () => {
  if (isFlushQueued) return;
  isFlushQueued = true;
  window.setTimeout(() => {
    isFlushQueued = false;
    leaveDeadEntry();
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

/** A full-page screen's own history entry, so the back gesture calls `onBack` instead of leaving the page under it. */
export function usePageHistory(onBack: () => void) {
  useHistoryLayer(true, onBack, 'page', null);
}

/** A swapped-in view of a drawer or sheet (a "‹ Back" view) takes the back gesture while `isActive`, stepping back to the view before it. */
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
