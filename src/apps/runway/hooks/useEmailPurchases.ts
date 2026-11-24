import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  createEmailFilter,
  deleteEmailFilter,
  rotateEmailAddress,
  setEmailWaiting,
  suggestEmailFilters,
} from '@apps/runway/store/actions/emailActions';
import {
  selectEmailEvents,
  selectEmailFilters,
  selectEmailIntake,
  selectEmailOverdue,
  selectIsEmailEventsLoaded,
  selectIsEmailIntakeFailed,
  selectIsEmailIntakeLoaded,
} from '@apps/runway/store/selectors/emailSelectors';
import { retryEmailIntake } from '@apps/runway/store/runwaySlice';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import type {
  EmailEventSealed,
  EmailFilterSealed,
  EmailIntakeDoc,
  EmailOutcome,
  EmailSenderKind,
  OpenPurchase,
} from '@apps/runway/types';
import { EMAIL_ADDRESS_PREFIX, EMAIL_DOMAIN } from '@apps/runway/constants';

export interface EmailIntakeRead {
  address: string | null;
  lastReceivedAt: number | null;
  confirm: {
    url: string | null;
    code: string | null;
    at: number;
    autoConfirm: EmailIntakeDoc['autoConfirm'];
    provider: EmailIntakeDoc['confirmProvider'];
  } | null;
  isLoading: boolean;
  /** The address could not be read; nothing here says whether there is one. */
  isFailed: boolean;
  retry(): void;
}

export interface EmailEventRead extends EmailEventSealed {
  id: string;
  receivedAt: number;
  outcome: EmailOutcome;
  senderKind: EmailSenderKind | null;
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
  resumeWaiting(purchaseId: string): Promise<void>;
}

const NO_UID = () => Promise.reject(new Error('Sign in to change this.'));

export function useEmailIntake(): EmailIntakeRead {
  const intake = useAppSelector(selectEmailIntake);
  const isLoaded = useAppSelector(selectIsEmailIntakeLoaded);
  const isFailed = useAppSelector(selectIsEmailIntakeFailed);
  const dispatch = useAppDispatch();
  return useMemo(() => {
    const retry = () => {
      dispatch(retryEmailIntake());
    };
    if (intake === null) {
      return {
        address: null,
        lastReceivedAt: null,
        confirm: null,
        isLoading: !isLoaded && !isFailed,
        isFailed,
        retry,
      };
    }
    return {
      address: `${EMAIL_ADDRESS_PREFIX}-${intake.token}@${EMAIL_DOMAIN}`,
      lastReceivedAt: intake.lastReceivedAt,
      confirm:
        intake.confirmAt === null
          ? null
          : {
              url: intake.confirmUrl,
              code: intake.confirmCode,
              at: intake.confirmAt,
              autoConfirm: intake.autoConfirm,
              provider: intake.confirmProvider,
            },
      isLoading: false,
      isFailed: false,
      retry,
    };
  }, [intake, isLoaded, isFailed, dispatch]);
}

export function useEmailEvents(): EmailEventRead[] {
  return useAppSelector(selectEmailEvents);
}

export function useIsEmailEventsLoaded(): boolean {
  return useAppSelector(selectIsEmailEventsLoaded);
}

export function useEmailFilters(): EmailFilterRead[] {
  return useAppSelector(selectEmailFilters);
}

/** Emailed purchases still waiting for their bank's charge after `EMAIL_WAIT_DAYS`. */
export function useEmailOverduePurchases(): OpenPurchase[] {
  return useAppSelector(selectEmailOverdue);
}

export function useEmailActions(): EmailActions {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  return useMemo(
    () => ({
      rotateAddress: async () => {
        await rotateEmailAddress();
      },
      createFilter: async (filter) => {
        if (uid === null) return NO_UID();
        await createEmailFilter(uid, await getRunwayEncryption(uid), filter);
      },
      deleteFilter: (id) =>
        uid === null ? NO_UID() : deleteEmailFilter(uid, id),
      suggestFilters: suggestEmailFilters,
      stopWaiting: (purchaseId) =>
        uid === null ? NO_UID() : setEmailWaiting(uid, purchaseId, false),
      resumeWaiting: (purchaseId) =>
        uid === null ? NO_UID() : setEmailWaiting(uid, purchaseId, true),
    }),
    [uid],
  );
}
