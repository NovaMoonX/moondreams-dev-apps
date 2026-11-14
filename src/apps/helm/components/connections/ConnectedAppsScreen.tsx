import { useState, type ReactNode } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Contact, FolderOpen, Mail } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import { GoogleCalendarMark } from '@/components/BrandMarks';
import ConnectedSourcesList from '@/components/ConnectedSourcesList';
import SectionHeader from '@/components/SectionHeader';
import { grantConnection } from '@/lib/connections/connectionCalls';
import { hasUnseenNews, markNewsSeen } from '@/lib/connections/connectionNews';
import type { ConnectorManifest } from '@/lib/connections/contract';
import { GOOGLE_DRIVE_MANIFEST } from '@/lib/connections/google/driveManifest';
import { GOOGLE_GMAIL_MANIFEST } from '@/lib/connections/google/gmailManifest';
import {
  isOutsideAccount,
  readConnectorAppId,
} from '@/lib/connections/contract';
import {
  getConnectorManifest,
  getSourceManifest,
} from '@/lib/connections/sources';
import { useConnectionAccounts } from '@/lib/connections/useConnectionAccounts';
import { useConnections } from '@/lib/connections/useConnections';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAuth } from '@/hooks/useAuth';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNow } from '@/hooks/useNow';
import KeptCopiesSheet from '@apps/helm/components/connections/KeptCopiesSheet';
import ConnectSheet from '@apps/helm/components/connections/ConnectSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import {
  formatUpdatedAt,
  getNewestOkAt,
  isStale,
} from '@apps/helm/utils/synced';
import { formatDateShort } from '@/utils/formatUtils';

interface ConnectedAppsScreenProps {
  onBack: () => void;
  onOpenConnection: (grantId: string) => void;
}

const LOGO = 'size-10 rounded-[10px]';
const GOOGLE_ADD_ID = 'google-add';
const GMAIL_ADD_ID = 'google:gmail';
const DRIVE_ADD_ID = 'google:drive';

const serviceLogo = (icon: ReactNode) => (
  <span
    className={join(LOGO, 'bg-muted flex shrink-0 items-center justify-center')}
  >
    {icon}
  </span>
);

const googleLogo = (
  <span
    className={join(LOGO, 'bg-muted flex shrink-0 items-center justify-center')}
  >
    <GoogleCalendarMark className='size-6' />
  </span>
);

const ICON = 'text-muted-foreground size-5';

const GOOGLE_SERVICES: Record<
  string,
  { name: string; logo: ReactNode; order: number }
> = {
  'google:calendar': {
    name: HELM_COPY.googleCalendarName,
    logo: googleLogo,
    order: 0,
  },
  'google:gmail': {
    name: HELM_COPY.googleGmailName,
    logo: serviceLogo(<Mail className={ICON} aria-hidden='true' />),
    order: 1,
  },
  'google:drive': {
    name: HELM_COPY.googleDriveRowName,
    logo: serviceLogo(<FolderOpen className={ICON} aria-hidden='true' />),
    order: 2,
  },
  'google:contacts': {
    name: HELM_COPY.contactsRowTitle,
    logo: serviceLogo(<Contact className={ICON} aria-hidden='true' />),
    order: 3,
  },
};

const scopeOf = (manifest: ConnectorManifest, categoryId: string) =>
  manifest.connect.kind === 'oauth'
    ? (manifest.connect.scopesByCategory[categoryId]?.[0] ?? '')
    : '';

const MAIL_AND_DRIVE = [
  {
    id: GMAIL_ADD_ID,
    connectorId: 'google:gmail' as const,
    manifest: GOOGLE_GMAIL_MANIFEST,
    categoryId: 'mail',
    failed: HELM_COPY.gmailFailed,
    hint: HELM_COPY.gmailAddHint,
  },
  {
    id: DRIVE_ADD_ID,
    connectorId: 'google:drive' as const,
    manifest: GOOGLE_DRIVE_MANIFEST,
    categoryId: 'documents',
    failed: HELM_COPY.driveFailed,
    hint: HELM_COPY.driveAddHint,
  },
];

/** A utility screen: the apps the assistant reads, and the ones it could. */
function ConnectedAppsScreen({
  onBack,
  onOpenConnection,
}: ConnectedAppsScreenProps) {
  const name = useAssistantName();
  const { apps } = useAppCatalog();
  const now = useNow(60_000);
  const isOffline = useNetworkStatus() === 'offline';
  const { user } = useAuth();
  const { accounts } = useConnectionAccounts(user?.uid ?? null);
  const { begin } = useGoogleConnect();
  const { addToast } = useToast();
  const isGoogleReadOpen = useIsGateOpen('helm', 'google-mail-and-drive');
  const {
    grants: everyGrant,
    isKnown,
    error,
  } = useConnections({
    readerAppId: 'helm',
    includeEnded: true,
  });
  const grants = everyGrant.filter((grant) => grant.status !== 'ended');
  const { nameOf: sourceNameOf } = useSourceAppName();
  const kept = everyGrant.flatMap((grant) => {
    const account = accounts.find((entry) => entry.id === grant.accountId);
    return grant.status === 'ended' &&
      grant.keptCopies &&
      grant.keptCopies.count > 0
      ? [
          {
            grantId: grant.id,
            connectorId: grant.connectorId,
            appName: account
              ? HELM_COPY.googleAccountTitle(account.email, account.label)
              : sourceNameOf(grant.connectorId),
            ...grant.keptCopies,
          },
        ]
      : [];
  });
  const [openKeptId, setOpenKeptId] = useState<string | null>(null);
  const [busyServices, setBusyServices] = useState<string[]>([]);
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
          : newestOkAt === null || !isStale(newestOkAt, now)
            ? readLine
            : `${readLine} · ${HELM_COPY.syncedStale(formatUpdatedAt(newestOkAt, now))}`,
        isTrouble,
        covers: [grant],
      };
    })
    .sort((a, b) => a.appName.localeCompare(b.appName));

  const googleAccountIds = [
    ...new Set(
      grants
        .filter((grant) => isOutsideAccount(grant.accountId))
        .map((grant) => grant.accountId),
    ),
  ];
  const hasManyAccounts = googleAccountIds.length > 1;
  const googleConnected = grants
    .filter((grant) => isOutsideAccount(grant.accountId))
    .map((grant) => {
      const account = accounts.find((entry) => entry.id === grant.accountId);
      const service = GOOGLE_SERVICES[grant.connectorId];
      const isTrouble =
        grant.status !== 'live' || account?.status === 'needsReconnect';
      const newestOkAt = getNewestOkAt(grant);
      const readLine =
        (getConnectorManifest(grant.connectorId)?.categories ?? [])
          .filter((category) => grant.categories[category.id]?.isOn)
          .map((category) => category.label)
          .join(', ') || HELM_COPY.connectedNothingOn;
      const statusLine = isTrouble
        ? HELM_COPY.connectedStopped
        : newestOkAt === null || !isStale(newestOkAt, now)
          ? readLine
          : `${readLine} · ${HELM_COPY.syncedStale(formatUpdatedAt(newestOkAt, now))}`;
      return {
        id: grant.id,
        appName: service?.name ?? HELM_COPY.googleCalendarName,
        logo: service?.logo ?? googleLogo,
        meta:
          hasManyAccounts && account
            ? HELM_COPY.googleServiceMeta(account.email, statusLine)
            : statusLine,
        isTrouble,
        covers: [grant],
        order: `${account?.email ?? grant.accountId} ${service?.order ?? 0}`,
      };
    })
    .sort((a, b) => a.order.localeCompare(b.order));
  const connectedRows = [...googleConnected, ...connected];
  const hasGoogleAccount = googleAccountIds.length > 0;

  const openConnection = (id: string) => {
    const covers = connectedRows.find((row) => row.id === id)?.covers ?? [];
    if (!isOffline)
      void markNewsSeen(covers, now).catch((failure: unknown) =>
        console.error('Helm could not mark what is new as seen', failure),
      );
    onOpenConnection(id);
  };

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

  const mailAndDriveRows = MAIL_AND_DRIVE.filter(
    (service) =>
      isGoogleReadOpen &&
      !grants.some((grant) => grant.connectorId === service.connectorId),
  );

  const connectMailOrDrive = async (
    service: (typeof MAIL_AND_DRIVE)[number],
  ) => {
    if (busyServices.includes(service.id)) return;
    const scope = scopeOf(service.manifest, service.categoryId);
    const candidates = accounts.filter((entry) =>
      googleAccountIds.includes(entry.id),
    );
    const live = candidates.filter(
      (entry) => entry.status !== 'needsReconnect',
    );
    const account =
      live.find((entry) => entry.grantedScopes.includes(scope)) ??
      live[0] ??
      candidates[0];
    if (
      !account ||
      account.status === 'needsReconnect' ||
      !account.grantedScopes.includes(scope)
    ) {
      begin({
        accountId: account?.id ?? null,
        connectorId: service.connectorId,
      });
      return;
    }
    setBusyServices((ids) => [...ids, service.id]);
    try {
      await grantConnection({
        readerAppId: 'helm',
        connectorId: service.connectorId,
        accountId: account.id,
        categoryIds: [service.categoryId],
        options: null,
      });
      addToast({
        title: HELM_COPY.googleServiceConnected(
          GOOGLE_SERVICES[service.connectorId]?.name ?? '',
        ),
        type: 'success',
      });
    } catch (failure) {
      console.error('Helm could not connect a Google service', failure);
      addToast({ title: service.failed, type: 'error' });
    } finally {
      setBusyServices((ids) => ids.filter((id) => id !== service.id));
    }
  };

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
                  isNew: row.covers.some((grant) => hasUnseenNews(grant, now)),
                }))}
                onOpen={openConnection}
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
                  logo:
                    readConnectorAppId(row.connectorId) === null ? (
                      googleLogo
                    ) : (
                      <AppLogo
                        appId={readConnectorAppId(row.connectorId) ?? ''}
                        className={LOGO}
                      />
                    ),
                  title: row.appName,
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
                  ...mailAndDriveRows.map((service) => ({
                    id: service.id,
                    logo: GOOGLE_SERVICES[service.connectorId]?.logo,
                    title: GOOGLE_SERVICES[service.connectorId]?.name ?? '',
                    meta: service.hint(name),
                    isTrouble: false,
                  })),
                  ...available.map((app) => ({
                    id: app.id,
                    logo: <AppLogo appId={app.id} className={LOGO} />,
                    title: app.name,
                    meta: '',
                    isTrouble: false,
                  })),
                ]}
                onOpen={(id) => {
                  const service = mailAndDriveRows.find(
                    (entry) => entry.id === id,
                  );
                  if (service) return void connectMailOrDrive(service);
                  return id === GOOGLE_ADD_ID
                    ? begin({ isAnotherAccount: hasGoogleAccount })
                    : setConnecting({ id, name: nameOf(id) });
                }}
              />
            </div>
          </section>
        )}
      </main>
      <KeptCopiesSheet
        kept={kept.filter((row) => row.grantId === openKeptId)[0] ?? null}
        onClose={() => setOpenKeptId(null)}
      />
      <ConnectSheet app={connecting} onClose={() => setConnecting(null)} />
    </>
  );
}

export default ConnectedAppsScreen;
