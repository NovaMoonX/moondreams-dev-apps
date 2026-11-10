import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarCheck, CalendarDays, Tag } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import AppToggle from '@/components/AppToggle';
import InlineNotice from '@/components/InlineNotice';
import LockedButton from '@/components/LockedButton';
import SectionHeader from '@/components/SectionHeader';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import {
  grantConnection,
  syncConnections,
  updateConnection,
} from '@/lib/connections/connectionCalls';
import {
  isOutsideAccount,
  readConnectorAppId,
} from '@/lib/connections/contract';
import { GOOGLE_DRIVE_MANIFEST } from '@/lib/connections/google/driveManifest';
import { GOOGLE_GMAIL_MANIFEST } from '@/lib/connections/google/gmailManifest';
import { getConnectorManifest } from '@/lib/connections/sources';
import { useConnectionAccounts } from '@/lib/connections/useConnectionAccounts';
import { useConnections } from '@/lib/connections/useConnections';
import { useAuth } from '@/hooks/useAuth';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAppCatalog } from '@/hooks/useAppCatalog';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNow } from '@/hooks/useNow';
import AccountLabelSheet from '@apps/helm/components/connections/AccountLabelSheet';
import DisconnectSheet from '@apps/helm/components/connections/DisconnectSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import {
  formatUpdatedAt,
  getGrantCopyCount,
  getNewestOkAt,
  isStale,
} from '@apps/helm/utils/synced';

interface ConnectionPageProps {
  grantId: string | null;
  /** Back to the list; also where a grant that is missing or has ended lands. */
  onBack: () => void;
}

const GMAIL_SCOPE =
  GOOGLE_GMAIL_MANIFEST.connect.kind === 'oauth'
    ? (GOOGLE_GMAIL_MANIFEST.connect.scopesByCategory.mail?.[0] ?? '')
    : '';

const DRIVE_SCOPE =
  GOOGLE_DRIVE_MANIFEST.connect.kind === 'oauth'
    ? (GOOGLE_DRIVE_MANIFEST.connect.scopesByCategory.documents?.[0] ?? '')
    : '';

const without = <T,>(record: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));

const failureLine = (error: unknown, appName: string, fallback: string) => {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'functions/permission-denied')
    return HELM_COPY.connectNotAllowed(appName);
  if (code === 'functions/failed-precondition')
    return HELM_COPY.connectNotActive;
  if (code === 'functions/not-found') return HELM_COPY.connectionGone;
  return fallback;
};

const formatDay = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

/** A utility screen: one connection's categories, each switched at once, and Disconnect last. */
function ConnectionPage({ grantId, onBack }: ConnectionPageProps) {
  const name = useAssistantName();
  const { apps } = useAppCatalog();
  const now = useNow(60_000);
  const isOffline = useNetworkStatus() === 'offline';
  const { user } = useAuth();
  const { grants, isKnown } = useConnections({ readerAppId: 'helm' });
  const { accounts } = useConnectionAccounts(user?.uid ?? null);
  const { begin, openCalendarPicker } = useGoogleConnect();
  const grant = grants.find((entry) => entry.id === grantId) ?? null;
  const [pending, setPending] = useState<
    Record<string, { isOn: boolean; since: number }>
  >({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [switchedOff, setSwitchedOff] = useState<Record<string, boolean>>({});
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);
  const [isLabelOpen, setIsLabelOpen] = useState(false);
  const [isGmailDisconnectOpen, setIsGmailDisconnectOpen] = useState(false);
  const [isDriveDisconnectOpen, setIsDriveDisconnectOpen] = useState(false);
  const [isDriveWorking, setIsDriveWorking] = useState(false);
  const [driveFailure, setDriveFailure] = useState<string | null>(null);
  const [isGmailWorking, setIsGmailWorking] = useState(false);
  const [gmailFailure, setGmailFailure] = useState<string | null>(null);
  const isGmailOpen = useIsGateOpen('helm', 'google-mail-and-drive');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFailure, setSyncFailure] = useState<string | null>(null);
  const copyCount = grant ? getGrantCopyCount(grant) : 0;
  const hasLeft = useRef(false);

  // A grant that is gone or ended shows the list instead; the same lands after Disconnect.
  useEffect(() => {
    if (!isKnown || grant || hasLeft.current) return;
    hasLeft.current = true;
    onBack();
  }, [isKnown, grant, onBack]);

  if (!grant) return null;

  const appId = readConnectorAppId(grant.connectorId) ?? '';
  const isGoogle = isOutsideAccount(grant.accountId);
  const account =
    accounts.find((entry) => entry.id === grant.accountId) ?? null;
  const isGmailGrant = grant.connectorId === 'google:gmail';
  const gmailGrant =
    grants.find(
      (entry) =>
        entry.connectorId === 'google:gmail' &&
        entry.accountId === grant.accountId,
    ) ?? null;
  const gmailCategory = GOOGLE_GMAIL_MANIFEST.categories[0];
  const isDriveGrant = grant.connectorId === 'google:drive';
  const driveGrant =
    grants.find(
      (entry) =>
        entry.connectorId === 'google:drive' &&
        entry.accountId === grant.accountId,
    ) ?? null;
  const driveCategory = GOOGLE_DRIVE_MANIFEST.categories[0];
  const appName = isGoogle
    ? isGmailGrant
      ? HELM_COPY.googleGmailName
      : isDriveGrant
        ? HELM_COPY.googleDriveName
        : HELM_COPY.googleCalendarName
    : (apps.find((app) => app.id === appId)?.name ?? appId);
  const manifest = getConnectorManifest(grant.connectorId);
  const kinds = new Set(
    (manifest?.categories ?? [])
      .filter((category) => grant.categories[category.id]?.isOn)
      .map((category) => category.kind),
  );
  const countKind = kinds.size === 1 ? ([...kinds][0] ?? null) : null;
  const hasStopped =
    isGoogle &&
    (grant.status === 'needsReconnect' || account?.status === 'needsReconnect');
  const showsGmailRow =
    isGoogle &&
    !isGmailGrant &&
    !hasStopped &&
    (gmailGrant !== null || isGmailOpen);
  const showsDriveRow =
    isGoogle &&
    !isDriveGrant &&
    !hasStopped &&
    (driveGrant !== null || isGmailOpen);

  const change = async (categoryId: string, isOn: boolean) => {
    setPending((current) => ({
      ...current,
      [categoryId]: { isOn, since: grant.updatedAt },
    }));
    setFailures((current) => without(current, categoryId));
    try {
      await updateConnection({
        grantId: grant.id,
        categories: { [categoryId]: isOn },
      });
      setSwitchedOff((current) => ({ ...current, [categoryId]: !isOn }));
      if (isOn) {
        syncConnections({ grantId: grant.id }).catch((error: unknown) =>
          console.error('Helm connection was not updated', error),
        );
      }
    } catch (error) {
      console.error('Helm connection did not change', error);
      setPending((current) => without(current, categoryId));
      setFailures((current) => ({
        ...current,
        [categoryId]: failureLine(
          error,
          appName,
          HELM_COPY.connectionToggleFailed,
        ),
      }));
    }
  };

  const turnGmailOn = async () => {
    setGmailFailure(null);
    if (!account?.grantedScopes.includes(GMAIL_SCOPE)) {
      begin({ accountId: grant.accountId, connectorId: 'google:gmail' });
      return;
    }
    setIsGmailWorking(true);
    try {
      await grantConnection({
        readerAppId: 'helm',
        connectorId: 'google:gmail',
        accountId: grant.accountId,
        categoryIds: ['mail'],
        options: null,
      });
    } catch (error) {
      console.error('Helm Gmail was not connected', error);
      setGmailFailure(HELM_COPY.gmailFailed);
    }
    setIsGmailWorking(false);
  };

  const turnDriveOn = async () => {
    setDriveFailure(null);
    if (!account?.grantedScopes.includes(DRIVE_SCOPE)) {
      begin({ accountId: grant.accountId, connectorId: 'google:drive' });
      return;
    }
    setIsDriveWorking(true);
    try {
      await grantConnection({
        readerAppId: 'helm',
        connectorId: 'google:drive',
        accountId: grant.accountId,
        categoryIds: ['documents'],
        options: null,
      });
    } catch (error) {
      console.error('Helm Drive was not connected', error);
      setDriveFailure(HELM_COPY.driveFailed);
    }
    setIsDriveWorking(false);
  };

  const syncNow = async () => {
    setIsSyncing(true);
    setSyncFailure(null);
    try {
      await syncConnections({ grantId: grant.id });
    } catch (error) {
      console.error('Helm connection was not updated', error);
      setSyncFailure(HELM_COPY.syncedNowFailed);
    }
    setIsSyncing(false);
  };

  const newestOkAt = getNewestOkAt(grant);
  const hasError = Object.values(grant.categoryState).some(
    (state) => state.lastError !== null,
  );
  const freshnessLine = (categoryId: string) => {
    const state = grant.categoryState[categoryId];
    if (state?.lastError) return HELM_COPY.syncedCouldNot;
    if (!state || state.lastOkAt === null) return HELM_COPY.syncedWaiting;
    if (isStale(state.lastOkAt, now))
      return HELM_COPY.syncedStale(formatUpdatedAt(state.lastOkAt, now));
    // The page's own line already says when it was updated; a row repeats it only when its time differs.
    return state.lastOkAt === newestOkAt
      ? null
      : HELM_COPY.syncedUpdatedLine(formatUpdatedAt(state.lastOkAt, now));
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
        {isGoogle ? (
          <span className='bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl'>
            <CalendarDays className='size-6' aria-hidden='true' />
          </span>
        ) : (
          <AppLogo appId={appId} className='size-11 rounded-xl' />
        )}
        <div className='min-w-0'>
          <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
            {appName}
          </h1>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.connectionConnectedOn(formatDay(grant.createdAt))}
          </p>
        </div>
      </div>
      {hasStopped && (
        <InlineNotice tone='warning' title={HELM_COPY.googleStoppedTitle}>
          <p>
            {HELM_COPY.googleStoppedBody(
              newestOkAt === null ? null : formatUpdatedAt(newestOkAt, now),
            )}
          </p>
          <div className='mt-3 flex'>
            {isOffline ? (
              locked
            ) : (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='relative after:absolute after:inset-x-0 after:-inset-y-1.5'
                onClick={() => begin({ accountId: grant.accountId })}
              >
                {HELM_COPY.googleReconnect}
              </Button>
            )}
          </div>
        </InlineNotice>
      )}
      <p className='text-[15px] break-words'>
        <span className='text-muted-foreground'>
          {HELM_COPY.connectionAccountLabel}
        </span>
        {' · '}
        {isGoogle
          ? (account?.email ?? appName)
          : HELM_COPY.connectionAccountValue}
      </p>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {isGoogle
          ? HELM_COPY.googleReadOnly(name)
          : HELM_COPY.connectReadOnlyPromise(name, appName)}
      </p>
      {isGoogle && !isOffline && (
        <SettingsGroup title={HELM_COPY.connectionAccountLabel}>
          <SettingsRow
            icon={<Tag className='size-5' aria-hidden='true' />}
            title={HELM_COPY.googleLabelRow}
            description={account?.label ?? HELM_COPY.googleLabelNone}
            onClick={() => setIsLabelOpen(true)}
            hasChevron
          />
          {!hasStopped && !isGmailGrant && !isDriveGrant && (
            <SettingsRow
              icon={<CalendarCheck className='size-5' aria-hidden='true' />}
              title={HELM_COPY.googleWhichCalendars}
              description={HELM_COPY.googleCalendarsCount(
                grant.options?.calendarIds.length ?? 0,
              )}
              onClick={() => openCalendarPicker(grant.accountId)}
              hasChevron
            />
          )}
        </SettingsGroup>
      )}
      <section className='flex flex-col gap-3'>
        <SectionHeader title={HELM_COPY.connectionReads(name)} />
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {(manifest?.categories ?? []).map((category) => {
            const entry = pending[category.id];
            const waiting =
              entry && entry.since === grant.updatedAt ? entry : null;
            const isOn =
              waiting?.isOn ?? grant.categories[category.id]?.isOn ?? false;
            const isWaiting = waiting !== null;
            return (
              <li key={category.id} className='flex flex-col gap-1 px-4 py-3'>
                <label className='flex min-h-11 items-center gap-3'>
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block text-[15px]'>
                      {category.label}
                    </span>
                    <span className='text-muted-foreground block text-[13px] text-pretty'>
                      {category.detail}
                    </span>
                    {isOn && freshnessLine(category.id) && (
                      <span className='text-muted-foreground block text-[13px] text-pretty'>
                        {freshnessLine(category.id)}
                      </span>
                    )}
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
                </label>
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
          {showsGmailRow && (
            <li className='flex flex-col gap-1 px-4 py-3'>
              <label className='flex min-h-11 items-center gap-3'>
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block text-[15px]'>
                    {HELM_COPY.gmailRowTitle}
                  </span>
                  <span className='text-muted-foreground block text-[13px] text-pretty'>
                    {gmailCategory?.detail}
                  </span>
                </span>
                {isOffline ? (
                  locked
                ) : (
                  <AppToggle
                    aria-label={HELM_COPY.gmailRowTitle}
                    checked={gmailGrant !== null}
                    disabled={isGmailWorking}
                    onCheckedChange={(next) =>
                      next ? void turnGmailOn() : setIsGmailDisconnectOpen(true)
                    }
                  />
                )}
              </label>
              {gmailFailure && (
                <p className='text-destructive text-[13px]' role='alert'>
                  {gmailFailure}
                </p>
              )}
            </li>
          )}
          {showsDriveRow && (
            <li className='flex flex-col gap-1 px-4 py-3'>
              <label className='flex min-h-11 items-center gap-3'>
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block text-[15px]'>
                    {HELM_COPY.driveRowTitle}
                  </span>
                  <span className='text-muted-foreground block text-[13px] text-pretty'>
                    {driveCategory?.detail}
                  </span>
                </span>
                {isOffline ? (
                  locked
                ) : (
                  <AppToggle
                    aria-label={HELM_COPY.driveRowTitle}
                    checked={driveGrant !== null}
                    disabled={isDriveWorking}
                    onCheckedChange={(next) =>
                      next ? void turnDriveOn() : setIsDriveDisconnectOpen(true)
                    }
                  />
                )}
              </label>
              {driveFailure && (
                <p className='text-destructive text-[13px]' role='alert'>
                  {driveFailure}
                </p>
              )}
            </li>
          )}
        </ul>
        {!hasStopped && (
          <div className='flex items-center justify-between gap-3'>
            <p className='text-muted-foreground min-w-0 text-[13px] text-pretty'>
              {newestOkAt === null
                ? HELM_COPY.syncedWaiting
                : HELM_COPY.syncedUpdatedLine(formatUpdatedAt(newestOkAt, now))}
            </p>
            {isOffline ? (
              locked
            ) : (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                loading={isSyncing}
                onClick={() => void syncNow()}
              >
                {isSyncing
                  ? HELM_COPY.syncedUpdating
                  : hasError
                    ? HELM_COPY.syncedTryNow
                    : HELM_COPY.syncedNow}
              </Button>
            )}
          </div>
        )}
        {syncFailure && (
          <p className='text-destructive text-[13px]' role='alert'>
            {syncFailure}
          </p>
        )}
        {manifest && manifest.never.length > 0 && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.connectionNeverShared(manifest.never.join(', '))}
          </p>
        )}
      </section>
      {isOffline ? (
        <LockedButton
          label={HELM_COPY.connectionDisconnect(appName)}
          title={HELM_COPY.connectionsNeedConnection}
          className='w-full'
        >
          <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
        </LockedButton>
      ) : (
        <div className='helm-card overflow-hidden'>
          <Button
            type='button'
            variant='tertiary'
            className='text-destructive! min-h-12 w-full justify-start rounded-none px-4'
            onClick={() => setIsDisconnectOpen(true)}
          >
            {HELM_COPY.connectionDisconnect(appName)}
          </Button>
        </div>
      )}
      <DisconnectSheet
        isOpen={isDisconnectOpen}
        onClose={() => setIsDisconnectOpen(false)}
        grantId={grant.id}
        appName={appName}
        count={copyCount}
        accountName={isGoogle && account ? account.email : null}
        countKind={countKind}
        note={
          isGoogle
            ? {
                title: HELM_COPY.googleDisconnectNoteTitle,
                text: HELM_COPY.googleDisconnectNote,
              }
            : null
        }
        extraLine={
          isGmailGrant
            ? HELM_COPY.gmailDisconnectNote
            : isDriveGrant
              ? HELM_COPY.driveDisconnectNote
              : null
        }
        failureLine={(error) =>
          failureLine(error, appName, HELM_COPY.disconnectFailed)
        }
      />
      {gmailGrant && (
        <DisconnectSheet
          isOpen={isGmailDisconnectOpen}
          onClose={() => setIsGmailDisconnectOpen(false)}
          grantId={gmailGrant.id}
          appName={HELM_COPY.googleGmailName}
          count={0}
          accountName={account?.email ?? null}
          extraLine={HELM_COPY.gmailDisconnectNote}
          wording={{
            title: HELM_COPY.gmailStopTitle,
            confirm: HELM_COPY.gmailStopConfirm,
          }}
          failureLine={(error) =>
            failureLine(
              error,
              HELM_COPY.googleGmailName,
              HELM_COPY.disconnectFailed,
            )
          }
        />
      )}
      {driveGrant && (
        <DisconnectSheet
          isOpen={isDriveDisconnectOpen}
          onClose={() => setIsDriveDisconnectOpen(false)}
          grantId={driveGrant.id}
          appName={HELM_COPY.googleDriveName}
          count={0}
          accountName={account?.email ?? null}
          extraLine={HELM_COPY.driveDisconnectNote}
          wording={{
            title: HELM_COPY.driveStopTitle,
            confirm: HELM_COPY.driveStopConfirm,
          }}
          failureLine={(error) =>
            failureLine(
              error,
              HELM_COPY.googleDriveName,
              HELM_COPY.disconnectFailed,
            )
          }
        />
      )}
      {isGoogle && (
        <AccountLabelSheet
          isOpen={isLabelOpen}
          onClose={() => setIsLabelOpen(false)}
          grantId={grant.id}
          label={account?.label ?? null}
        />
      )}
    </main>
  );
}

export default ConnectionPage;
