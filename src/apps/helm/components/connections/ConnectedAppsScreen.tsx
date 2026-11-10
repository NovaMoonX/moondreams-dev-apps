import { useState } from 'react';

import { CalendarDays } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import ConnectedSourcesList from '@/components/ConnectedSourcesList';
import SectionHeader from '@/components/SectionHeader';
import { readConnectorAppId } from '@/lib/connections/contract';
import {
  getConnectorManifest,
  getSourceManifest,
} from '@/lib/connections/sources';
import { useConnectionAccounts } from '@/lib/connections/useConnectionAccounts';
import { useConnections } from '@/lib/connections/useConnections';
import { useAuth } from '@/hooks/useAuth';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import { useNow } from '@/hooks/useNow';
import KeptCopiesSheet from '@apps/helm/components/connections/KeptCopiesSheet';
import ConnectSheet from '@apps/helm/components/connections/ConnectSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import { formatUpdatedAt, getNewestOkAt } from '@apps/helm/utils/synced';
import { formatDateShort } from '@/utils/formatUtils';

interface ConnectedAppsScreenProps {
  onBack: () => void;
  onOpenConnection: (grantId: string) => void;
}

const LOGO = 'size-10 rounded-[10px]';
const GOOGLE_ADD_ID = 'google-add';

const googleLogo = (
  <span
    className={`${LOGO} bg-muted text-muted-foreground flex shrink-0 items-center justify-center`}
  >
    <CalendarDays className='size-5' aria-hidden='true' />
  </span>
);

/** A utility screen: the apps the assistant reads, and the ones it could. */
function ConnectedAppsScreen({
  onBack,
  onOpenConnection,
}: ConnectedAppsScreenProps) {
  const name = useAssistantName();
  const { apps } = useAppCatalog();
  const now = useNow(60_000);
  const { user } = useAuth();
  const { accounts } = useConnectionAccounts(user?.uid ?? null);
  const { begin } = useGoogleConnect();
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

  const googleConnected = grants
    .filter((grant) => grant.connectorId === 'google:calendar')
    .map((grant) => {
      const account = accounts.find((entry) => entry.id === grant.accountId);
      const isTrouble =
        grant.status !== 'live' || account?.status === 'needsReconnect';
      const newestOkAt = getNewestOkAt(grant);
      const readLine = (
        getConnectorManifest(grant.connectorId)?.categories ?? []
      )
        .filter((category) => grant.categories[category.id]?.isOn)
        .map((category) => category.label)
        .join(', ');
      return {
        id: grant.id,
        appName: account
          ? HELM_COPY.googleAccountTitle(account.email, account.label)
          : HELM_COPY.googleCalendarName,
        logo: googleLogo,
        meta: isTrouble
          ? HELM_COPY.connectedStopped
          : newestOkAt === null || readLine === ''
            ? readLine || HELM_COPY.connectedNothingOn
            : `${readLine} · ${HELM_COPY.syncedUpdatedLine(formatUpdatedAt(newestOkAt, now))}`,
        isTrouble,
      };
    })
    .sort((a, b) => a.appName.localeCompare(b.appName));
  const connectedRows = [...googleConnected, ...connected];
  const hasGoogleAccount = googleConnected.length > 0;

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
        {connectedRows.length > 0 && (
          <section className='flex flex-col gap-3'>
            <SectionHeader title={HELM_COPY.connectedSection} />
            <div className='helm-card overflow-hidden'>
              <ConnectedSourcesList
                rows={connectedRows.map((row) => ({
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
        {isKnown && (
          <section className='flex flex-col gap-3'>
            <SectionHeader title={HELM_COPY.notConnectedSection} />
            <div className='helm-card overflow-hidden'>
              <ConnectedSourcesList
                rows={[
                  {
                    id: GOOGLE_ADD_ID,
                    logo: googleLogo,
                    title: hasGoogleAccount
                      ? HELM_COPY.googleAddAnother
                      : HELM_COPY.googleAddAccount,
                    meta: hasGoogleAccount
                      ? HELM_COPY.googleAddAnotherHint
                      : HELM_COPY.googleAddAccountHint(name),
                    isTrouble: false,
                  },
                  ...available.map((app) => ({
                    id: app.id,
                    logo: <AppLogo appId={app.id} className={LOGO} />,
                    title: app.name,
                    meta: '',
                    isTrouble: false,
                  })),
                ]}
                onOpen={(id) =>
                  id === GOOGLE_ADD_ID
                    ? begin({ isAnotherAccount: hasGoogleAccount })
                    : setConnecting({ id, name: nameOf(id) })
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
