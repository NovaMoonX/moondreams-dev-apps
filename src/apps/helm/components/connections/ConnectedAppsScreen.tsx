import { useState } from 'react';

import AppLogo from '@/components/AppLogo';
import ConnectedSourcesList from '@/components/ConnectedSourcesList';
import SectionHeader from '@/components/SectionHeader';
import { readConnectorAppId } from '@/lib/connections/contract';
import { getSourceManifest } from '@/lib/connections/sources';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import { useNow } from '@/hooks/useNow';
import KeptCopiesSheet from '@apps/helm/components/connections/KeptCopiesSheet';
import ConnectSheet from '@apps/helm/components/connections/ConnectSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { formatUpdatedAt, getNewestOkAt } from '@apps/helm/utils/synced';
import { formatDateShort } from '@/utils/formatUtils';

interface ConnectedAppsScreenProps {
  onBack: () => void;
  onOpenConnection: (grantId: string) => void;
}

const LOGO = 'size-10 rounded-[10px]';

/** A utility screen: the apps the assistant reads, and the ones it could. */
function ConnectedAppsScreen({
  onBack,
  onOpenConnection,
}: ConnectedAppsScreenProps) {
  const name = useAssistantName();
  const { apps } = useAppCatalog();
  const now = useNow(60_000);
  const {
    grants: everyGrant,
    isKnown,
    error,
  } = useConnections({
    readerAppId: 'helm',
    includeEnded: true,
  });
  const grants = everyGrant.filter((grant) => grant.status !== 'ended');
  const kept = everyGrant.flatMap((grant) => {
    const appId = readConnectorAppId(grant.connectorId);
    return grant.status === 'ended' &&
      appId &&
      grant.keptCopies &&
      grant.keptCopies.count > 0
      ? [{ grantId: grant.id, appId, ...grant.keptCopies }]
      : [];
  });
  const [openKeptId, setOpenKeptId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const nameOf = (appId: string) =>
    apps.find((app) => app.id === appId)?.name ?? appId;

  const connected = grants
    .map((grant) => ({ grant, appId: readConnectorAppId(grant.connectorId) }))
    .flatMap(({ grant, appId }) => (appId ? [{ grant, appId }] : []))
    .map(({ grant, appId }) => {
      const labels = (getSourceManifest(appId)?.categories ?? [])
        .filter((category) => grant.categories[category.id]?.isOn)
        .map((category) => category.label);
      const isTrouble = grant.status !== 'live';
      const newestOkAt = getNewestOkAt(grant);
      const readLine =
        labels.length > 0 ? labels.join(', ') : HELM_COPY.connectedNothingOn;
      return {
        id: grant.id,
        appName: nameOf(appId),
        logo: <AppLogo appId={appId} className={LOGO} />,
        meta: isTrouble
          ? HELM_COPY.connectedStopped
          : newestOkAt === null
            ? readLine
            : `${readLine} · ${HELM_COPY.syncedUpdatedLine(formatUpdatedAt(newestOkAt, now))}`,
        isTrouble,
      };
    })
    .sort((a, b) => a.appName.localeCompare(b.appName));

  const connectedIds = new Set(
    grants.flatMap((grant) => readConnectorAppId(grant.connectorId) ?? []),
  );
  const available = apps
    .filter(
      (app) =>
        !connectedIds.has(app.id) &&
        (getSourceManifest(app.id)?.categories.length ?? 0) > 0,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const isEmpty = isKnown && connected.length === 0 && available.length === 0;

  return (
    <>
      <main className='flex flex-1 flex-col gap-6'>
        <HelmHeader
          backLabel={HELM_COPY.settingsTitle}
          onBack={onBack}
          onHome={onBack}
          showsHome={false}
        />
        <div className='flex flex-col gap-2'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.connectedAppsRowTitle}
          </h1>
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.connectedAppsLead(name)}
          </p>
        </div>
        {error && (
          <p className='helm-card p-4 text-[15px] text-pretty' role='alert'>
            {HELM_COPY.connectedAppsFailed}
          </p>
        )}
        {!isKnown && !error && (
          <p className='text-muted-foreground text-[13px]' role='status'>
            {HELM_COPY.connectedAppsLoading}
          </p>
        )}
        {isEmpty && (
          <p className='helm-card p-4 text-[15px] text-pretty'>
            {HELM_COPY.connectedAppsEmpty(name)}
          </p>
        )}
        {connected.length > 0 && (
          <section className='flex flex-col gap-3'>
            <SectionHeader title={HELM_COPY.connectedSection} />
            <div className='helm-card overflow-hidden'>
              <ConnectedSourcesList
                rows={connected.map((row) => ({
                  id: row.id,
                  logo: row.logo,
                  title: row.appName,
                  meta: row.meta,
                  isTrouble: row.isTrouble,
                }))}
                onOpen={onOpenConnection}
              />
            </div>
          </section>
        )}
        {kept.length > 0 && (
          <section className='flex flex-col gap-3'>
            <SectionHeader title={HELM_COPY.keptSection} />
            <div className='helm-card overflow-hidden'>
              <ConnectedSourcesList
                rows={kept.map((row) => ({
                  id: row.grantId,
                  logo: <AppLogo appId={row.appId} className={LOGO} />,
                  title: nameOf(row.appId),
                  meta: HELM_COPY.keptFromRow(
                    row.count,
                    row.deleteAfter === null
                      ? null
                      : formatDateShort(row.deleteAfter),
                  ),
                  isTrouble: false,
                }))}
                onOpen={setOpenKeptId}
              />
            </div>
          </section>
        )}
        {isKnown && available.length > 0 && (
          <section className='flex flex-col gap-3'>
            <SectionHeader title={HELM_COPY.notConnectedSection} />
            <div className='helm-card overflow-hidden'>
              <ConnectedSourcesList
                rows={available.map((app) => ({
                  id: app.id,
                  logo: <AppLogo appId={app.id} className={LOGO} />,
                  title: app.name,
                  meta: '',
                  isTrouble: false,
                }))}
                onOpen={(appId) =>
                  setConnecting({ id: appId, name: nameOf(appId) })
                }
              />
            </div>
          </section>
        )}
      </main>
      <KeptCopiesSheet
        kept={
          kept
            .filter((row) => row.grantId === openKeptId)
            .map((row) => ({ ...row, appName: nameOf(row.appId) }))[0] ?? null
        }
        onClose={() => setOpenKeptId(null)}
      />
      <ConnectSheet app={connecting} onClose={() => setConnecting(null)} />
    </>
  );
}

export default ConnectedAppsScreen;
