import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  finishGoogleConnection,
  startGoogleConnection,
} from '@/lib/connections/connectionCalls';
import type { FinishGoogleConnectionResult } from '@/lib/connections/contract';
import { useConnections } from '@/lib/connections/useConnections';
import {
  handOffGoogleAuthReturn,
  readGoogleAuthReturn,
  requestGoogleAuthCode,
} from '@/lib/google/requestGoogleAuthCode';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import CalendarPicker, {
  type CalendarPickerTarget,
} from '@apps/helm/components/connections/CalendarPicker';
import { HELM_COPY } from '@apps/helm/constants';
import {
  GoogleConnectContext,
  type GoogleConnectOptions,
  type GoogleConnectValue,
} from '@apps/helm/hooks/useGoogleConnect';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface Intro {
  accountId: string | null;
  isAnotherAccount: boolean;
  /** A line already known when the sheet opens, such as a refusal on the way back from Google. */
  failure: string | null;
}

const toFailureLine = (error: unknown, name: string) =>
  (error as { code?: string } | null)?.code === 'functions/permission-denied'
    ? HELM_COPY.googleNeedsPermission(name)
    : HELM_COPY.googleConnectFailed;

/** The whole trip to Google and back: where to go, the person's answer, and what the server made of it. */
const connectGoogle = async ({
  accountId,
  isAnotherAccount,
}: Pick<Intro, 'accountId' | 'isAnotherAccount'>) => {
  const { authUrl, state } = await startGoogleConnection({
    readerAppId: 'helm',
    connectorId: 'google:calendar',
    redirectUri: `${window.location.origin}/helm`,
    accountId,
    isAnotherAccount,
  });
  const result = await requestGoogleAuthCode({ authUrl, state });
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
  onClose,
  onFinished,
}: {
  intro: Intro;
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
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.googleConnectReadOnly(name)}
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
  const [intro, setIntro] = useState<Intro | null>(null);
  const [picker, setPicker] = useState<CalendarPickerTarget | null>(null);
  const hasHandledReturn = useRef(false);

  const value = useMemo<GoogleConnectValue>(
    () => ({
      begin: (options: GoogleConnectOptions = {}) =>
        setIntro({
          accountId: options.accountId ?? null,
          isAnotherAccount: options.isAnotherAccount ?? false,
          failure: null,
        }),
      openCalendarPicker: (accountId) => setPicker({ accountId, mode: 'edit' }),
    }),
    [],
  );

  const handleFinished = (finished: FinishGoogleConnectionResult) => {
    setIntro(null);
    const hasGrant = grants.some(
      (grant) =>
        grant.connectorId === 'google:calendar' &&
        grant.accountId === finished.accountId &&
        grant.status !== 'ended',
    );
    if (finished.hasLiveGrant || hasGrant) {
      addToast({ title: HELM_COPY.googleReconnected, type: 'success' });
      return;
    }
    setPicker({ accountId: finished.accountId, mode: 'connect' });
  };

  const onReturnFinished = useEffectEvent(handleFinished);
  const onReturnFailed = useEffectEvent((error: unknown) => {
    console.error('Helm Google connection did not finish', error);
    setIntro({
      accountId: null,
      isAnotherAccount: false,
      failure: toFailureLine(error, name),
    });
  });

  useEffect(() => {
    if (hasHandledReturn.current) return;
    const returned = readGoogleAuthReturn(window.location.search);
    if (!returned) return;
    if (handOffGoogleAuthReturn()) {
      hasHandledReturn.current = true;
      return;
    }
    if (loading || !user) return;
    hasHandledReturn.current = true;
    stripReturnQuery();
    if ('code' in returned)
      finishGoogleConnection(returned)
        .then(onReturnFinished)
        .catch(onReturnFailed);
  }, [loading, user]);

  return (
    <GoogleConnectContext.Provider value={value}>
      {children}
      <FormSheet
        isOpen={intro !== null}
        onClose={() => setIntro(null)}
        title={HELM_COPY.googleConnectTitle}
      >
        {intro && (
          <IntroForm
            intro={intro}
            onClose={() => setIntro(null)}
            onFinished={handleFinished}
          />
        )}
      </FormSheet>
      <CalendarPicker target={picker} onClose={() => setPicker(null)} />
    </GoogleConnectContext.Provider>
  );
}

export default GoogleConnectProvider;
