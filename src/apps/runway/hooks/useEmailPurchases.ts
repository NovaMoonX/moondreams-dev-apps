import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import {
  createEmailFilter,
  deleteEmailFilter,
  rotateEmailAddress,
  saveEmailBanks,
  saveEmailSetup,
  setEmailWaiting,
  suggestEmailFilters,
} from '@apps/runway/store/actions/emailActions';
import {
  selectEmailEvents,
  selectEmailFilters,
  selectEmailIntake,
  selectEmailOverdue,
  selectEmailSetup,
  selectIsEmailEventsLoaded,
  selectKnownBanks,
  type KnownBank,
} from '@apps/runway/store/selectors/emailSelectors';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import type {
  EmailBank,
  EmailEventSealed,
  EmailFilterSealed,
  EmailOutcome,
  EmailProvider,
  OpenPurchase,
} from '@apps/runway/types';
import {
  getEmailSetupSteps,
  type EmailSetupStepId,
} from '@apps/runway/utils/emailSetupSteps';
import {
  EMAIL_ADDRESS_PREFIX,
  EMAIL_DOMAIN,
  EMAIL_EVENT_KEEP_DAYS,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';

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
  resumeWaiting(purchaseId: string): Promise<void>;
  chooseProvider(provider: EmailProvider): Promise<void>;
  reachStep(stepId: EmailSetupStepId): Promise<void>;
  finishSetup(): Promise<void>;
  noteConfirmOpened(): Promise<void>;
  saveBanks(change: (banks: EmailBank[]) => EmailBank[]): Promise<boolean>;
}

const NO_UID = () => Promise.reject(new Error('Sign in to change this.'));

export function useEmailIntake(): EmailIntakeRead {
  const intake = useAppSelector(selectEmailIntake);
  return useMemo(() => {
    if (intake === null) {
      return {
        address: null,
        lastReceivedAt: null,
        confirm: null,
        isLoading: false,
      };
    }
    const hasConfirm =
      intake.confirmUrl !== null || intake.confirmCode !== null;
    return {
      address: `${EMAIL_ADDRESS_PREFIX}-${intake.token}@${EMAIL_DOMAIN}`,
      lastReceivedAt: intake.lastReceivedAt,
      confirm: hasConfirm
        ? {
            url: intake.confirmUrl,
            code: intake.confirmCode,
            at: intake.confirmAt,
          }
        : null,
      isLoading: false,
    };
  }, [intake]);
}

export function useEmailEvents(): EmailEventRead[] {
  return useAppSelector(selectEmailEvents);
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
      chooseProvider: (provider) =>
        uid === null
          ? NO_UID()
          : saveEmailSetup(uid, (current) => ({
              provider,
              stepId:
                current?.provider === provider &&
                current.stepId !== null &&
                current.stepId !== 'provider'
                  ? current.stepId
                  : 'copy',
            })),
      reachStep: (stepId) =>
        uid === null
          ? NO_UID()
          : saveEmailSetup(uid, (current) => {
              const order = getEmailSetupSteps(current?.provider ?? null, true);
              return order.indexOf(stepId) >
                order.indexOf(current?.stepId ?? 'provider')
                ? { stepId }
                : null;
            }),
      finishSetup: () =>
        uid === null
          ? NO_UID()
          : saveEmailSetup(uid, (current) =>
              current?.doneAt != null ? null : { doneAt: Date.now() },
            ),
      noteConfirmOpened: () =>
        uid === null
          ? NO_UID()
          : saveEmailSetup(uid, () => ({ confirmOpenedAt: Date.now() })),
      saveBanks: async (change) => {
        if (uid === null) return NO_UID();
        return saveEmailBanks(uid, await getRunwayEncryption(uid), change);
      },
    }),
    [uid],
  );
}

export interface EmailSetupRead {
  provider: EmailProvider | null;
  /** The banks whose alerts are forwarded, in the order they were added. */
  banks: EmailBank[];
  steps: EmailSetupStepId[];
  /** When the confirmation link was last tapped; null until then. */
  confirmOpenedAt: number | null;
  /** Index of the furthest step reached in this provider's list; 0 when it is unknown. */
  step: number;
  /** Written once, or any purchase has already come from email (known only once the emails have loaded). */
  isDone: boolean;
  /** Whether the stored doneAt is still empty. */
  isDoneUnwritten: boolean;
}

/** Where the person is in setting up forwarding, with the steps their provider needs. */
/** The shown step for a stored one; a stored step that is hidden now (a confirm step whose email is gone) falls back to the shown step before it, never to the start. */
function findShownStep(
  steps: EmailSetupStepId[],
  provider: EmailProvider | null,
  stepId: EmailSetupStepId | null,
) {
  const order = getEmailSetupSteps(provider, true);
  const reached = order.indexOf(stepId ?? 'provider');
  return steps.reduce(
    (found, step, index) => (order.indexOf(step) <= reached ? index : found),
    0,
  );
}

export function useEmailSetup(): EmailSetupRead {
  const setup = useAppSelector(selectEmailSetup);
  const intake = useEmailIntake();
  const events = useEmailEvents();
  const isEventsLoaded = useAppSelector(selectIsEmailEventsLoaded);
  return useMemo(() => {
    const provider = setup?.provider ?? null;
    const steps = getEmailSetupSteps(provider, intake.confirm?.url != null);
    const doneAt = setup?.doneAt ?? null;
    return {
      provider,
      banks: setup?.banks ?? [],
      steps,
      confirmOpenedAt: setup?.confirmOpenedAt ?? null,
      step: findShownStep(steps, provider, setup?.stepId ?? null),
      isDone:
        doneAt !== null ||
        (isEventsLoaded &&
          events.some((entry) => entry.outcome === 'purchase')),
      isDoneUnwritten: doneAt === null,
    };
  }, [setup, intake.confirm?.url, events, isEventsLoaded]);
}

/** The banks Runway knows from cards, accounts and links, to offer before typing one. */
export function useKnownBanks(): KnownBank[] {
  return useAppSelector(selectKnownBanks);
}

export type BankArrival = 'arriving' | 'waiting' | 'quiet';

/** Whether a bank's alerts reach Runway: an alert from one of its addresses became a purchase, it was added too recently to tell, or none has come in the days emails are kept. */
export function getBankArrival(
  bank: EmailBank,
  events: EmailEventRead[],
  now: number,
): BankArrival {
  const isArriving = events.some(
    (event) =>
      event.outcome === 'purchase' &&
      bank.addresses.includes(event.from.toLowerCase()),
  );
  if (isArriving) return 'arriving';
  return now - bank.addedAt < EMAIL_EVENT_KEEP_DAYS * DAY_MS
    ? 'waiting'
    : 'quiet';
}
