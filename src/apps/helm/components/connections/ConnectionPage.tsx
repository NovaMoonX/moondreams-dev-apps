import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import AppLogo from '@/components/AppLogo';
import AppToggle from '@/components/AppToggle';
import LockedButton from '@/components/LockedButton';
import SectionHeader from '@/components/SectionHeader';
import {
  endConnection,
  updateConnection,
} from '@/lib/connections/connectionCalls';
import { readConnectorAppId } from '@/lib/connections/contract';
import { getSourceManifest } from '@/lib/connections/sources';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface ConnectionPageProps {
  grantId: string | null;
  /** Back to the list; also where a grant that is missing or has ended lands. */
  onBack: () => void;
}

const without = <T,>(record: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));

const formatDay = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

/** A utility screen: one connection's categories, each switched at once, and Disconnect last. */
function ConnectionPage({ grantId, onBack }: ConnectionPageProps) {
  const name = useAssistantName();
  const { apps } = useAppCatalog();
  const { confirm } = useActionModal();
  const isOffline = useNetworkStatus() === 'offline';
  const { grants, isLoading } = useConnections({ readerAppId: 'helm' });
  const grant = grants.find((entry) => entry.id === grantId) ?? null;
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [switchedOff, setSwitchedOff] = useState<Record<string, boolean>>({});
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectFailure, setDisconnectFailure] = useState<string | null>(
    null,
  );
  const hasLeft = useRef(false);

  // A grant that is gone, unknown or ended shows the list instead; the same lands after Disconnect.
  useEffect(() => {
    if (isLoading || grant || hasLeft.current) return;
    hasLeft.current = true;
    onBack();
  }, [isLoading, grant, onBack]);

  if (!grant) return null;

  const appId = readConnectorAppId(grant.connectorId) ?? '';
  const appName = apps.find((app) => app.id === appId)?.name ?? appId;
  const manifest = getSourceManifest(appId);

  const change = async (categoryId: string, isOn: boolean) => {
    setPending((current) => ({ ...current, [categoryId]: isOn }));
    setFailures((current) => without(current, categoryId));
    try {
      await updateConnection({
        grantId: grant.id,
        categories: { [categoryId]: isOn },
      });
      setSwitchedOff((current) => ({ ...current, [categoryId]: !isOn }));
    } catch (error) {
      console.error('Helm connection did not change', error);
      setFailures((current) => ({
        ...current,
        [categoryId]: HELM_COPY.connectionToggleFailed,
      }));
    } finally {
      setPending((current) => without(current, categoryId));
    }
  };

  const disconnect = async () => {
    const isConfirmed = await confirm({
      title: HELM_COPY.disconnectTitle(appName),
      message: HELM_COPY.disconnectBody(name, appName),
      confirmText: HELM_COPY.disconnectConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsDisconnecting(true);
    setDisconnectFailure(null);
    try {
      await endConnection({ grantId: grant.id, deleteCopies: true });
    } catch (error) {
      console.error('Helm connection did not end', error);
      setDisconnectFailure(HELM_COPY.disconnectFailed);
      setIsDisconnecting(false);
    }
  };

  const locked = (
    <LockedButton
      label={HELM_COPY.connectionsNeedConnection}
      title={HELM_COPY.connectionsNeedConnection}
      size='sm'
    >
      <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
    </LockedButton>
  );

  return (
    <main className='flex flex-1 flex-col gap-6'>
      <HelmHeader
        backLabel={HELM_COPY.connectedAppsRowTitle}
        onBack={onBack}
        onHome={onBack}
        showsHome={false}
      />
      <div className='flex items-center gap-3'>
        <AppLogo appId={appId} className='size-11 rounded-xl' />
        <div className='min-w-0'>
          <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
            {appName}
          </h1>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.connectionConnectedOn(formatDay(grant.createdAt))}
          </p>
        </div>
      </div>
      <p className='text-[15px]'>
        <span className='text-muted-foreground'>
          {HELM_COPY.connectionAccountLabel}
        </span>
        {' · '}
        {HELM_COPY.connectionAccountValue}
      </p>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.connectionReadOnly(name, appName)}
      </p>
      <section className='flex flex-col gap-3'>
        <SectionHeader title={HELM_COPY.connectionReads(name)} />
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {(manifest?.categories ?? []).map((category) => {
            const isOn =
              pending[category.id] ??
              grant.categories[category.id]?.isOn ??
              false;
            const isWaiting = pending[category.id] !== undefined;
            return (
              <li key={category.id} className='flex flex-col gap-1 px-4 py-3'>
                <div className='flex min-h-11 items-center gap-3'>
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block text-[15px]'>
                      {category.label}
                    </span>
                    <span className='text-muted-foreground block text-[13px] text-pretty'>
                      {category.detail}
                    </span>
                  </span>
                  {isOffline ? (
                    locked
                  ) : (
                    <AppToggle
                      aria-label={category.label}
                      checked={isOn}
                      disabled={isWaiting}
                      onCheckedChange={(next) => void change(category.id, next)}
                    />
                  )}
                </div>
                {failures[category.id] && (
                  <p className='text-destructive text-[13px]' role='alert'>
                    {failures[category.id]}
                  </p>
                )}
                {switchedOff[category.id] &&
                  !isOn &&
                  !failures[category.id] && (
                    <p className='text-muted-foreground flex items-center gap-2 text-[13px]'>
                      {HELM_COPY.connectionSwitchedOff(category.label)}
                      {!isOffline && (
                        <Button
                          type='button'
                          variant='tertiary'
                          size='sm'
                          disabled={isWaiting}
                          onClick={() => void change(category.id, true)}
                        >
                          {HELM_COPY.connectionUndo}
                        </Button>
                      )}
                    </p>
                  )}
              </li>
            );
          })}
        </ul>
        {manifest && manifest.never.length > 0 && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.connectionNeverShared(manifest.never.join(', '))}
          </p>
        )}
      </section>
      {disconnectFailure && (
        <p className='text-destructive text-sm text-pretty' role='alert'>
          {disconnectFailure}
        </p>
      )}
      {isOffline ? (
        <LockedButton
          label={HELM_COPY.connectionDisconnect(appName)}
          title={HELM_COPY.connectionsNeedConnection}
          className='w-full'
        >
          <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
        </LockedButton>
      ) : (
        <Button
          type='button'
          variant='tertiary'
          className='text-destructive! min-h-12 w-full justify-start px-4'
          loading={isDisconnecting}
          onClick={() => void disconnect()}
        >
          {HELM_COPY.connectionDisconnect(appName)}
        </Button>
      )}
    </main>
  );
}

export default ConnectionPage;
