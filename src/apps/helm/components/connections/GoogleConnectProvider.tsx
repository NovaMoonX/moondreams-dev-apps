import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  finishGoogleConnection,
  grantConnection,
  startGoogleConnection,
} from '@/lib/connections/connectionCalls';
import type { FinishGoogleConnectionResult } from '@/lib/connections/contract';
import { useConnections } from '@/lib/connections/useConnections';
import {
  handOffGoogleAuthReturn,
  readGoogleAuthReturn,
  requestGoogleAuthCode,
  takeGoogleAuthState,
} from '@/lib/google/requestGoogleAuthCode';
import { useConnectionAccounts } from '@/lib/connections/useConnectionAccounts';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import CalendarPicker, {
  type CalendarPickerTarget,
} from '@apps/helm/components/connections/CalendarPicker';
import ContactsPicker from '@apps/helm/components/contacts/ContactsPicker';
import { HELM_COPY } from '@apps/helm/constants';
import {
  CONTACTS_CONNECTOR_ID,
  CONTACTS_SCOPE,
} from '@apps/helm/queries/contactsQueries';
import {
  GoogleConnectContext,
  type GoogleConnectOptions,
  type GoogleConnectValue,
} from '@apps/helm/hooks/useGoogleConnect';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

type GoogleConnectorId = NonNullable<GoogleConnectOptions['connectorId']>;

interface Intro {
  connectorId: GoogleConnectorId;
  accountId: string | null;
  isAnotherAccount: boolean;
  /** A line already known when the sheet opens, such as a refusal on the way back from Google. */
  failure: string | null;
}

const CONNECTOR_KEY = 'helm-google-connector';

/** The category a restricted connector switches on at connect, the one its row in the account's page offers. */
const toRestrictedCategory = (connectorId: string) =>
  connectorId === 'google:gmail'
    ? 'mail'
    : connectorId === 'google:drive'
      ? 'documents'
      : null;

const toReadOnlyLine = (connectorId: GoogleConnectorId, name: string) =>
  connectorId === 'google:gmail'
    ? HELM_COPY.googleGmailReadOnly(name)
    : connectorId === 'google:drive'
      ? HELM_COPY.googleDriveReadOnly(name)
      : connectorId === 'google:contacts'
        ? HELM_COPY.googleContactsReadOnly(name)
        : HELM_COPY.googleConnectReadOnly(name);

const toIntroTitle = (connectorId: GoogleConnectorId, isReconnect: boolean) => {
  if (connectorId === 'google:gmail') {
    return isReconnect
      ? HELM_COPY.googleGmailReconnectTitle
      : HELM_COPY.googleGmailTitle;
  }
  if (connectorId === 'google:drive') {
    return isReconnect
      ? HELM_COPY.googleDriveReconnectTitle
      : HELM_COPY.googleDriveTitle;
  }
  if (connectorId === 'google:contacts') {
    return isReconnect
      ? HELM_COPY.googleContactsReconnectTitle
      : HELM_COPY.googleContactsTitle;
  }
  return isReconnect
    ? HELM_COPY.googleReconnectTitle
    : HELM_COPY.googleConnectTitle;
};

const keepConnector = (connectorId: GoogleConnectorId | null) => {
  try {
    if (connectorId === null) sessionStorage.removeItem(CONNECTOR_KEY);
    else sessionStorage.setItem(CONNECTOR_KEY, connectorId);
  } catch {
    // Private browsing can refuse storage; a return then falls back to the calendar.
  }
};

const readKeptConnector = (): GoogleConnectorId => {
  try {
    const kept = sessionStorage.getItem(CONNECTOR_KEY);
    return kept === 'google:gmail' ||
      kept === 'google:drive' ||
      kept === 'google:contacts'
      ? kept
      : 'google:calendar';
  } catch {
    return 'google:calendar';
  }
};

const isPopupPage = () =>
  window.opener !== null && (window.opener as Window) !== window;

const toFailureLine = (error: unknown, name: string) =>
  (error as { code?: string } | null)?.code === 'functions/permission-denied'
    ? HELM_COPY.googleNeedsPermission(name)
    : HELM_COPY.googleConnectFailed;

/** The whole trip to Google and back: where to go, the person's answer, and what the server made of it. */
const connectGoogle = async ({
  connectorId,
  accountId,
  isAnotherAccount,
}: Pick<Intro, 'connectorId' | 'accountId' | 'isAnotherAccount'>) => {
  const { authUrl, state } = await startGoogleConnection({
    readerAppId: 'helm',
    connectorId,
    redirectUri: `${window.location.origin}/helm`,
    accountId,
    isAnotherAccount,
  });
  keepConnector(connectorId);
  const result = await requestGoogleAuthCode({ authUrl, state });
  if (result !== 'redirected') keepConnector(null);
  return typeof result === 'string' ? result : finishGoogleConnection(result);
};

const stripReturnQuery = () => {
  const url = new URL(window.location.href);
  ['code', 'state', 'error', 'scope', 'authuser', 'prompt', 'hd'].forEach(
    (key) => url.searchParams.delete(key),
  );
  window.history.replaceState(window.history.state, '', url);
};

function IntroForm({
  intro,
  accountName,
  onClose,
  onFinished,
}: {
  intro: Intro;
  /** The account being reconnected, named so the person knows which one Google will ask about. */
  accountName: string | null;
  onClose: () => void;
  onFinished: (finished: FinishGoogleConnectionResult) => void;
}) {
  const name = useAssistantName();
  const isOffline = useNetworkStatus() === 'offline';
  const [isWorking, setIsWorking] = useState(false);
  const [failure, setFailure] = useState(intro.failure);

  const proceed = async () => {
    if (isWorking) return;
    setIsWorking(true);
    setFailure(null);
    try {
      const result = await connectGoogle(intro);
      if (result === 'redirected') return;
      if (result !== 'cancelled') return onFinished(result);
    } catch (error) {
      console.error('Helm Google connection did not finish', error);
      setFailure(toFailureLine(error, name));
    }
    setIsWorking(false);
  };

  return (
    <div className='flex flex-col gap-4'>
      {accountName && (
        <p className='text-foreground text-[15px] break-words'>
          {HELM_COPY.googleReconnectAccount(accountName)}
        </p>
      )}
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {toReadOnlyLine(intro.connectorId, name)}
      </p>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.googleConnectTesting(name)}
      </p>
      {failure && (
        <p className='text-destructive text-sm text-pretty' role='alert'>
          {failure}
        </p>
      )}
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={onClose}
            disabled={isWorking}
          >
            {HELM_COPY.connectNotNow}
          </Button>
        }
        rightActions={
          isOffline ? (
            <LockedButton
              label={HELM_COPY.googleContinue}
              title={HELM_COPY.connectionsNeedConnection}
            >
              <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
            </LockedButton>
          ) : (
            <Button
              type='button'
              loading={isWorking}
              onClick={() => void proceed()}
            >
              {failure ? HELM_COPY.googleTryAgain : HELM_COPY.googleContinue}
            </Button>
          )
        }
      />
    </div>
  );
}

/** Holds the one way to connect a Google account for the whole app: the sheet before Google, the return from Google (a popup hands its answer to this page, a redirect lands here) and the calendar picker that follows. */
function GoogleConnectProvider({ children }: { children: ReactNode }) {
  const name = useAssistantName();
  const { user, loading } = useAuth();
  const { addToast } = useToast();
  const { grants } = useConnections({ readerAppId: 'helm' });
  const { accounts } = useConnectionAccounts(user?.uid ?? null);
  const [returned] = useState(() =>
    readGoogleAuthReturn(window.location.search),
  );
  const [returnedConnector] = useState(readKeptConnector);
  const [intro, setIntro] = useState<Intro | null>(() =>
    returned && 'error' in returned && !isPopupPage()
      ? {
          connectorId: returnedConnector,
          accountId: null,
          isAnotherAccount: false,
          failure:
            returned.error === 'access_denied'
              ? HELM_COPY.googleNeedsPermission(name)
              : HELM_COPY.googleConnectFailed,
        }
      : null,
  );
  const [picker, setPicker] = useState<CalendarPickerTarget | null>(null);
  const [contactsAccountId, setContactsAccountId] = useState<string | null>(
    null,
  );
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const introAccount = intro?.accountId
    ? (accounts.find((entry) => entry.id === intro.accountId) ?? null)
    : null;

  const contactsAccount = accounts.find(
    (entry) =>
      entry.status === 'live' &&
      entry.grantedScopes.includes(CONTACTS_SCOPE) &&
      grants.some(
        (grant) =>
          grant.connectorId === CONTACTS_CONNECTOR_ID &&
          grant.accountId === entry.id &&
          grant.status !== 'ended' &&
          grant.categories.contacts?.isOn === true,
      ),
  );
  const contactsAccountKey = contactsAccount?.id ?? null;

  const value = useMemo<GoogleConnectValue>(
    () => ({
      begin: (options: GoogleConnectOptions = {}) =>
        setIntro({
          connectorId: options.connectorId ?? 'google:calendar',
          accountId: options.accountId ?? null,
          isAnotherAccount: options.isAnotherAccount ?? false,
          failure: null,
        }),
      openCalendarPicker: (accountId) => setPicker({ accountId, mode: 'edit' }),
      openContacts: () => {
        if (contactsAccountKey !== null) {
          setContactsAccountId(contactsAccountKey);
          setIsContactsOpen(true);
          return;
        }
        setIntro({
          connectorId: CONTACTS_CONNECTOR_ID,
          accountId: null,
          isAnotherAccount: false,
          failure: null,
        });
      },
    }),
    [contactsAccountKey],
  );

  const openContactsFor = (accountId: string) => {
    setContactsAccountId(accountId);
    setIsContactsOpen(true);
  };

  const handleFinished = (finished: FinishGoogleConnectionResult) => {
    setIntro(null);
    const hasGrant = grants.some(
      (grant) =>
        grant.connectorId === finished.connectorId &&
        grant.accountId === finished.accountId &&
        grant.status !== 'ended',
    );
    if (finished.connectorId === CONTACTS_CONNECTOR_ID) {
      if (finished.hasLiveGrant || hasGrant)
        return openContactsFor(finished.accountId);
      grantConnection({
        readerAppId: 'helm',
        connectorId: finished.connectorId,
        accountId: finished.accountId,
        categoryIds: ['contacts'],
        options: null,
      })
        .then(() => openContactsFor(finished.accountId))
        .catch((error: unknown) => {
          console.error('Helm contacts were not connected', error);
          addToast({ title: HELM_COPY.googleContactsFailed, type: 'error' });
        });
      return;
    }
    if (finished.hasLiveGrant || hasGrant) {
      addToast({ title: HELM_COPY.googleReconnected, type: 'success' });
      return;
    }
    const restrictedCategory = toRestrictedCategory(finished.connectorId);
    if (restrictedCategory) {
      const isDrive = finished.connectorId === 'google:drive';
      grantConnection({
        readerAppId: 'helm',
        connectorId: finished.connectorId,
        accountId: finished.accountId,
        categoryIds: [restrictedCategory],
        options: null,
      }).catch((error: unknown) => {
        console.error('Helm restricted connector was not connected', error);
        addToast({
          title: isDrive ? HELM_COPY.driveFailed : HELM_COPY.gmailFailed,
          type: 'error',
        });
      });
      return;
    }
    setPicker({ accountId: finished.accountId, mode: 'connect' });
  };

  const onReturnFailed = (error: unknown) => {
    console.error('Helm Google connection did not finish', error);
    setIntro({
      connectorId: returnedConnector,
      accountId: null,
      isAnotherAccount: false,
      failure: toFailureLine(error, name),
    });
  };

  useEffect(() => {
    if (!returned || handOffGoogleAuthReturn()) return;
    if ('error' in returned) {
      stripReturnQuery();
      keepConnector(null);
    }
  }, [returned]);

  const isReturningWithCode =
    returned !== null && 'code' in returned && !isPopupPage();
  useQuery({
    queryKey: [
      'helm',
      'googleReturn',
      returned && 'code' in returned ? returned.state : null,
    ],
    enabled: isReturningWithCode && !loading && !!user,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      if (!returned || !('code' in returned)) return false;
      stripReturnQuery();
      keepConnector(null);
      const kept = takeGoogleAuthState();
      try {
        if (kept !== null && kept !== returned.state)
          throw new Error('Google sign-in state did not match');
        handleFinished(await finishGoogleConnection(returned));
      } catch (error) {
        onReturnFailed(error);
      }
      return true;
    },
  });

  return (
    <GoogleConnectContext.Provider value={value}>
      {children}
      <FormSheet
        isOpen={intro !== null}
        onClose={() => setIntro(null)}
        title={
          intro
            ? toIntroTitle(intro.connectorId, !!intro.accountId)
            : HELM_COPY.googleConnectTitle
        }
      >
        {intro && (
          <IntroForm
            intro={intro}
            accountName={
              introAccount
                ? HELM_COPY.googleAccountTitle(
                    introAccount.email,
                    introAccount.label,
                  )
                : null
            }
            onClose={() => setIntro(null)}
            onFinished={handleFinished}
          />
        )}
      </FormSheet>
      <CalendarPicker target={picker} onClose={() => setPicker(null)} />
      {isContactsOpen && (
        <ContactsPicker
          accountId={contactsAccountId}
          onClose={() => setIsContactsOpen(false)}
          onReconnect={(accountId) => {
            setIsContactsOpen(false);
            setIntro({
              connectorId: CONTACTS_CONNECTOR_ID,
              accountId,
              isAnotherAccount: false,
              failure: null,
            });
          }}
        />
      )}
    </GoogleConnectContext.Provider>
  );
}

export default GoogleConnectProvider;
