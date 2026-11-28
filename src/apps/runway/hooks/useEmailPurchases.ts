import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  createEmailFilter,
  deleteEmailFilter,
  rotateEmailAddress,
  setEmailWaitUntil,
  setEmailWaiting,
  suggestEmailFilters,
  addEmailPurchase,
} from '@apps/runway/store/actions/emailActions';
import {
  selectEmailEvents,
  selectEmailFilters,
  selectEmailIntake,
  getWaitingBank,
  selectEmailOverdue,
  selectPostedOnlySides,
  selectSideBankNames,
  selectIsEmailEventsLoaded,
  selectIsEmailIntakeFailed,
  selectIsEmailIntakeLoaded,
} from '@apps/runway/store/selectors/emailSelectors';
import { retryEmailIntake } from '@apps/runway/store/runwaySlice';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import type {
  DateOnly,
  EmailEventSealed,
  EmailFilterSealed,
  EmailIntakeDoc,
  EmailOutcome,
  EmailSenderKind,
  OpenPurchase,
} from '@apps/runway/types';
import type { PurchaseBankLink } from '@apps/runway/utils/emailSenders';
import { EMAIL_ADDRESS_PREFIX, EMAIL_DOMAIN } from '@apps/runway/constants';

export interface EmailIntakeRead {
  address: string | null;
  lastReceivedAt: number | null;
  /** When an email a provider forwarded on its own last arrived. */
  forwardedAt: number | null;
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
  savedAt: number | null;
  addedByPersonAt: number | null;
}

export type EmailFilterRead = {
  id: string;
  createdAt: number;
} & EmailFilterSealed;

export type EmailFilterSuggestion = EmailFilterSealed & { label: string };

export interface EmailActions {
  rotateAddress(): Promise<void>;
  createFilter(filter: EmailFilterSealed): Promise<string>;
  deleteFilter(id: string): Promise<void>;
  suggestFilters(eventId: string): Promise<EmailFilterSuggestion[]>;
  addAsPurchase(eventId: string): Promise<string>;
  stopWaiting(purchaseId: string): Promise<void>;
  resumeWaiting(purchaseId: string): Promise<void>;
  /** Waits for the bank's charge until the day given, or the usual wait when null. */
  setWaitUntil(
    purchaseId: string,
    until: DateOnly | null,
    expected?: DateOnly | null,
  ): Promise<void>;
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
        forwardedAt: null,
        confirm: null,
        isLoading: !isLoaded && !isFailed,
        isFailed,
        retry,
      };
    }
    return {
      address: `${EMAIL_ADDRESS_PREFIX}-${intake.token}@${EMAIL_DOMAIN}`,
      lastReceivedAt: intake.lastReceivedAt,
      forwardedAt: intake.forwardedAt,
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

/** Where a loaded purchase's card or account sits at the bank, for the linked-bank logo a sender falls back on. */
export function usePurchaseBankLink(): PurchaseBankLink {
  const purchases = useAppSelector((state) => state.runway.purchases);
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const cards = useAppSelector((state) => state.runway.cards);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const links = useAppSelector((state) => state.runway.links);
  return useMemo(() => {
    const byId = new Map(
      [...waiting, ...purchases].map((purchase) => [purchase.id, purchase]),
    );
    return (purchaseId) => {
      const purchase = byId.get(purchaseId);
      if (purchase === undefined) return undefined;
      const linkId =
        cards.find((card) => card.id === purchase.paidByCardId)?.linkId ??
        accounts.find((account) => account.id === purchase.accountId)?.linkId ??
        null;
      const link = links.find((entry) => entry.id === linkId);
      return link === undefined
        ? null
        : {
            linkId: link.id,
            name: link.institutionName,
            logo: link.institutionLogo,
          };
    };
  }, [purchases, waiting, cards, accounts, links]);
}

export function useEmailFilters(): EmailFilterRead[] {
  return useAppSelector(selectEmailFilters);
}

/** Emailed purchases still waiting for their bank's charge past how long its card, account or order is expected to take. */
export function useEmailOverduePurchases(): OpenPurchase[] {
  return useAppSelector(selectEmailOverdue);
}

/** The bank an emailed purchase waits on, when its card or account is known, and whether that bank sends a charge only once it posts. */
export function useWaitingBank(
  purchase: Pick<OpenPurchase, 'accountId' | 'paidByCardId'>,
) {
  const names = useAppSelector(selectSideBankNames);
  const postedOnly = useAppSelector(selectPostedOnlySides);
  return getWaitingBank(purchase, names, postedOnly);
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
        return createEmailFilter(uid, await getRunwayEncryption(uid), filter);
      },
      deleteFilter: (id) =>
        uid === null ? NO_UID() : deleteEmailFilter(uid, id),
      suggestFilters: suggestEmailFilters,
      addAsPurchase: addEmailPurchase,
      stopWaiting: (purchaseId) =>
        uid === null ? NO_UID() : setEmailWaiting(uid, purchaseId, false),
      resumeWaiting: (purchaseId) =>
        uid === null ? NO_UID() : setEmailWaiting(uid, purchaseId, true),
      setWaitUntil: (purchaseId, until, expected) =>
        uid === null
          ? NO_UID()
          : setEmailWaitUntil(uid, purchaseId, until, expected),
    }),
    [uid],
  );
}
