import { useMemo, useSyncExternalStore } from 'react';

import { generateUuid } from '@/utils/idUtils';
import type { CreateIncomeInput } from '@apps/runway/store/actions/itemActions';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
} from '@apps/runway/types';

export const START_DRAFT_KEY = 'runway:start-draft';
export const START_DRAFT_DAYS = 7;
const DAY_MS = 86_400_000;

export const START_STEPS = [
  'income',
  'bills',
  'envelopes',
  'goals',
  'stand',
  'done',
] as const;
export type StartStep = (typeof START_STEPS)[number];

export interface DraftEntry<T> {
  id: string;
  value: T;
}

export type DraftKind = 'incomes' | 'bills' | 'envelopes' | 'goals';

/** What a person entered in Starting out before signing in. Kept unencrypted in this browser only. */
export interface StartDraft {
  savedAt: number;
  step: StartStep;
  incomes: DraftEntry<CreateIncomeInput>[];
  bills: DraftEntry<BillSealed>[];
  envelopes: DraftEntry<EnvelopeSealed>[];
  goals: DraftEntry<GoalSealed>[];
}

export const EMPTY_START_DRAFT: StartDraft = {
  savedAt: 0,
  step: 'income',
  incomes: [],
  bills: [],
  envelopes: [],
  goals: [],
};

const listeners = new Set<() => void>();

const readRaw = (): string | null => {
  try {
    return window.localStorage.getItem(START_DRAFT_KEY);
  } catch {
    return null;
  }
};

const notify = () => listeners.forEach((listener) => listener());

const asList = (value: unknown) => (Array.isArray(value) ? value : []);

/** The draft a stored string holds, or null when it is missing, unreadable or older than a week. */
export const parseStartDraft = (
  raw: string | null,
  now: number,
): StartDraft | null => {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Partial<StartDraft>;
    if (typeof data.savedAt !== 'number') return null;
    if (now - data.savedAt > START_DRAFT_DAYS * DAY_MS) return null;
    const draft: StartDraft = {
      savedAt: data.savedAt,
      step: START_STEPS.find((step) => step === data.step) ?? 'income',
      incomes: asList(data.incomes),
      bills: asList(data.bills),
      envelopes: asList(data.envelopes),
      goals: asList(data.goals),
    };
    return draft;
  } catch {
    return null;
  }
};

export const countDraft = (draft: StartDraft | null) =>
  draft === null
    ? 0
    : draft.incomes.length +
      draft.bills.length +
      draft.envelopes.length +
      draft.goals.length;

/** Removes an expired draft and returns the live one, if any. */
export const readStartDraft = (): StartDraft | null => {
  const raw = readRaw();
  const draft = parseStartDraft(raw, Date.now());
  if (raw !== null && draft === null) clearStartDraft();
  return draft;
};

const writeStartDraft = (draft: StartDraft) => {
  try {
    window.localStorage.setItem(
      START_DRAFT_KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Storage can be blocked; the answers then last until the page closes.
  }
  notify();
};

export const clearStartDraft = () => {
  try {
    window.localStorage.removeItem(START_DRAFT_KEY);
  } catch {
    // Nothing stored to clear.
  }
  notify();
};

const update = (change: (draft: StartDraft) => StartDraft) =>
  writeStartDraft(change(readStartDraft() ?? EMPTY_START_DRAFT));

/** Adds an answer, or replaces the one with this id. */
export const saveDraftEntry = <K extends DraftKind>(
  kind: K,
  value: StartDraft[K][number]['value'],
  id: string | null = null,
) =>
  update((draft) => {
    const entryId = id ?? generateUuid();
    const list = draft[kind] as DraftEntry<unknown>[];
    const exists = list.some((entry) => entry.id === entryId);
    const next = exists
      ? list.map((entry) =>
          entry.id === entryId ? { id: entryId, value } : entry,
        )
      : [...list, { id: entryId, value }];
    return { ...draft, [kind]: next };
  });

export const removeDraftEntry = (kind: DraftKind, id: string) =>
  update((draft) => ({
    ...draft,
    [kind]: (draft[kind] as DraftEntry<unknown>[]).filter(
      (entry) => entry.id !== id,
    ),
  }));

export const saveDraftStep = (step: StartStep) =>
  update((draft) => ({ ...draft, step }));

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === START_DRAFT_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
};

/** The saved draft, live across tabs; null when there is none or it has expired. */
export function useStartDraft(): StartDraft | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const draft = useMemo(() => parseStartDraft(raw, Date.now()), [raw]);
  return draft;
}
