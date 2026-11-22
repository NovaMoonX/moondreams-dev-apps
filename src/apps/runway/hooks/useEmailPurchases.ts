import type {
  EmailEventSealed,
  EmailFilterSealed,
  EmailOutcome,
  OpenPurchase,
} from '@apps/runway/types';

export interface EmailIntakeRead {
  address: string | null;
  lastReceivedAt: number | null;
  confirm: {
    url: string | null;
    code: string | null;
    at: number | null;
  } | null;
  isLoading: boolean;
}

export interface EmailEventRead extends EmailEventSealed {
  id: string;
  receivedAt: number;
  outcome: EmailOutcome;
  purchaseId: string | null;
}

export type EmailFilterRead = {
  id: string;
  createdAt: number;
} & EmailFilterSealed;

export type EmailFilterSuggestion = EmailFilterSealed & { label: string };

export interface EmailActions {
  rotateAddress(): Promise<void>;
  createFilter(filter: EmailFilterSealed): Promise<void>;
  deleteFilter(id: string): Promise<void>;
  suggestFilters(eventId: string): Promise<EmailFilterSuggestion[]>;
  stopWaiting(purchaseId: string): Promise<void>;
  removePurchase(purchase: OpenPurchase): Promise<void>;
}

const NO_INTAKE: EmailIntakeRead = {
  address: null,
  lastReceivedAt: null,
  confirm: null,
  isLoading: false,
};
const NO_EVENTS: EmailEventRead[] = [];
const NO_FILTERS: EmailFilterRead[] = [];
const NO_PURCHASES: OpenPurchase[] = [];
const NO_ACTIONS: EmailActions = {
  rotateAddress: async () => {},
  createFilter: async () => {},
  deleteFilter: async () => {},
  suggestFilters: async () => [],
  stopWaiting: async () => {},
  removePurchase: async () => {},
};

/** TEMPORARY stubs: the data layer replaces these bodies. */
export function useEmailIntake(): EmailIntakeRead {
  return NO_INTAKE;
}

export function useEmailEvents(): EmailEventRead[] {
  return NO_EVENTS;
}

export function useEmailFilters(): EmailFilterRead[] {
  return NO_FILTERS;
}

/** Emailed purchases still waiting for their bank's charge after `EMAIL_WAIT_DAYS`. */
export function useEmailOverduePurchases(): OpenPurchase[] {
  return NO_PURCHASES;
}

export function useEmailActions(): EmailActions {
  return NO_ACTIONS;
}
