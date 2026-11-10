import { useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';

import AppLogo from '@/components/AppLogo';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import LockedButton from '@/components/LockedButton';
import {
  grantConnection,
  syncConnections,
} from '@/lib/connections/connectionCalls';
import { SITE_ACCOUNT_ID, toAppConnectorId } from '@/lib/connections/contract';
import { getSourceManifest } from '@/lib/connections/sources';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface ConnectSheetProps {
  app: { id: string; name: string } | null;
  onClose: () => void;
}

const list = new Intl.ListFormat('en', { type: 'conjunction' });

const failureLine = (error: unknown, appName: string) => {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'functions/already-exists')
    return HELM_COPY.connectAlreadyConnected(appName);
  if (code === 'functions/permission-denied')
    return HELM_COPY.connectNotAllowed(appName);
  if (code === 'functions/failed-precondition')
    return HELM_COPY.connectNotActive;
  if (code === 'functions/not-found') return HELM_COPY.connectionGone;
  return HELM_COPY.connectFailed;
};

function ConnectForm({
  app,
  onClose,
}: {
  app: { id: string; name: string };
  onClose: () => void;
}) {
  const name = useAssistantName();
  const isOffline = useNetworkStatus() === 'offline';
  const manifest = getSourceManifest(app.id);
  const categories = manifest?.categories ?? [];
  const [ticked, setTicked] = useState(
    () =>
      new Set(
        categories
          .filter((category) => category.isOnAtConnect)
          .map((category) => category.id),
      ),
  );
  const [isTouched, setIsTouched] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const startsTicked = categories
    .filter((category) => category.isOnAtConnect)
    .map((category) => category.label);
  const isNoneTicked = ticked.size === 0;

  const connect = async () => {
    setIsTouched(true);
    if (isNoneTicked || isConnecting) return;
    setIsConnecting(true);
    setFailure(null);
    try {
      const grantId = await grantConnection({
        readerAppId: 'helm',
        connectorId: toAppConnectorId(app.id),
        accountId: SITE_ACCOUNT_ID,
        categoryIds: [...ticked],
      });
      syncConnections({ grantId }).catch((error: unknown) =>
        console.error('Helm first sync did not run', error),
      );
      onClose();
    } catch (error) {
      console.error('Helm connection did not start', error);
      setFailure(failureLine(error, app.name));
      setIsConnecting(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-3'>
        <AppLogo appId={app.id} className='size-11 rounded-xl' />
        <h3 className='helm-serif text-[20px] leading-[26px] font-semibold text-pretty'>
          {HELM_COPY.connectQuestion(name, app.name)}
        </h3>
      </div>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.connectReadOnlyPromise(name, app.name)}
      </p>
      {manifest && manifest.never.length > 0 && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.connectNeverShared(manifest.never.join(', '))}
        </p>
      )}
      <ul className='flex flex-col'>
        {categories.map((category) => (
          <li key={category.id}>
            <label className='flex min-h-12 items-start gap-3 py-2'>
              <Checkbox
                className='mt-0.5'
                aria-label={category.label}
                checked={ticked.has(category.id)}
                onCheckedChange={(isOn) =>
                  setTicked(
                    (current) =>
                      new Set(
                        isOn
                          ? [...current, category.id]
                          : [...current].filter((id) => id !== category.id),
                      ),
                  )
                }
              />
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block text-[15px]'>
                  {category.label}
                </span>
                <span className='text-muted-foreground block text-[13px] text-pretty'>
                  {category.detail}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {isTouched && isNoneTicked && (
        <p className='text-destructive text-sm' role='alert'>
          {HELM_COPY.connectTickOne}
        </p>
      )}
      {startsTicked.length > 0 && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.connectStartsTicked(
            list.format(startsTicked),
            startsTicked.length,
          )}
        </p>
      )}
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
            disabled={isConnecting}
          >
            {HELM_COPY.connectNotNow}
          </Button>
        }
        rightActions={
          isOffline ? (
            <LockedButton
              label={HELM_COPY.connectConfirm(app.name)}
              title={HELM_COPY.connectionsNeedConnection}
            >
              <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
            </LockedButton>
          ) : (
            <Button
              type='button'
              onClick={() => void connect()}
              loading={isConnecting}
            >
              {HELM_COPY.connectConfirm(app.name)}
            </Button>
          )
        }
      />
    </div>
  );
}

/** Connect a site app: what to read, ticked by the person, with nothing the assistant can change. */
function ConnectSheet({ app, onClose }: ConnectSheetProps) {
  return (
    <FormSheet
      isOpen={app !== null}
      onClose={onClose}
      title={HELM_COPY.connectSheetTitle}
    >
      {app && <ConnectForm key={app.id} app={app} onClose={onClose} />}
    </FormSheet>
  );
}

export default ConnectSheet;
