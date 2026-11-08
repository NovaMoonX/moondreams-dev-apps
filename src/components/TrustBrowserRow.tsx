import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Monitor,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import DetailSheet from '@/components/DetailSheet';
import SettingsRow from '@/components/SettingsRow';
import { canKeepDeviceSecrets } from '@/lib/security';
import type { TrustedBrowser } from '@/lib/security/trustedBrowsers';
import type { TrustedKeyStore } from '@/lib/security/trustedKey';
import { formatDateShort, formatList } from '@/utils/formatUtils';

const TRUST_BROWSER_WORDS = {
  label: 'Trust this browser',
  help: (appName: string) =>
    `Open ${appName} in this browser without a connection. Anyone using it could open your data, so leave it off on a shared device.`,
  helpOn: (appName: string) =>
    `${appName} opens in this browser without a connection. Signing out turns this off.`,
  onFailed: (appName: string) =>
    `This browser could not keep your data unlocked. ${appName} still works online.`,
  offFailed: 'This browser is still trusted. Try again.',
  others: 'Other trusted browsers',
  othersIntro: (appName: string) =>
    `These can open ${appName} without a connection. One you remove stops opening it the next time it’s online.`,
  removedWhen: (appName: string, place: string) =>
    `${appName} stops opening in ${place} the next time it’s online, or on its own after 30 days offline.`,
  removeOne: (label: string) => `Remove ${label}?`,
  removeAll: 'Remove all',
  removeAllTitle: (count: number) => `Remove all ${count} browsers?`,
} as const;

const isPhone = (label: string) => /iPhone|iPad|Android/.test(label);

/** "Chrome on Linux ×2": one name per kind of browser, so two alike never read as one listed twice. */
const mergeLabels = (browsers: TrustedBrowser[]) =>
  Object.entries(
    browsers.reduce<Record<string, number>>(
      (counts, browser) => ({
        ...counts,
        [browser.label]: (counts[browser.label] ?? 0) + 1,
      }),
      {},
    ),
  ).map(([label, count]) => (count > 1 ? `${label} ×${count}` : label));

const summarize = (browsers: TrustedBrowser[]) => {
  const names = mergeLabels(browsers);
  if (names.length <= 3) return formatList(names);
  return formatList([...names.slice(0, 3), `${names.length - 3} more`]);
};

const describeDay = (timestamp: number) =>
  new Date(timestamp).toDateString() === new Date().toDateString()
    ? 'today'
    : formatDateShort(timestamp);

const describeBrowser = (browser: TrustedBrowser) =>
  `Trusted ${formatDateShort(browser.trustedAt)}, last opened ${describeDay(browser.lastSeenAt)}`;

interface TrustBrowserRowProps {
  store: TrustedKeyStore;
  uid: string;
  appName: string;
}

/** An app's offline switch for this browser, and the other browsers that keep its key with a way to remove them; draws nothing where the browser can't keep the key. */
function TrustBrowserRow({ store, uid, appName }: TrustBrowserRowProps) {
  const canKeep = canKeepDeviceSecrets();
  const isTrusted =
    useQuery({ ...store.trustedQueryOptions(uid), enabled: canKeep }).data ??
    false;
  const others =
    useQuery({ ...store.otherBrowsersQueryOptions(uid), enabled: canKeep })
      .data ?? [];
  const [error, setError] = useState<string | null>(null);
  const [isListOpen, setListOpen] = useState(false);
  const { confirm } = useActionModal();

  if (!canKeep) return null;

  const choose = (next: boolean) => {
    setError(null);
    store.setTrusted(uid, next).catch((saveError: unknown) => {
      console.error(saveError);
      setError(
        next
          ? TRUST_BROWSER_WORDS.onFailed(appName)
          : TRUST_BROWSER_WORDS.offFailed,
      );
    });
  };

  const removeOne = async (browser: TrustedBrowser) => {
    const isConfirmed = await confirm({
      title: TRUST_BROWSER_WORDS.removeOne(browser.label),
      message: `${describeBrowser(browser)}. ${TRUST_BROWSER_WORDS.removedWhen(appName, 'that browser')}`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!isConfirmed) return;
    store.removeBrowsers(uid, [browser.browserId]);
    if (others.length === 1) setListOpen(false);
  };

  const removeAll = async () => {
    const isConfirmed = await confirm({
      title: TRUST_BROWSER_WORDS.removeAllTitle(others.length),
      message: `${formatList(mergeLabels(others))}. ${TRUST_BROWSER_WORDS.removedWhen(appName, 'each one')}`,
      confirmText: TRUST_BROWSER_WORDS.removeAll,
      destructive: true,
    });
    if (!isConfirmed) return;
    store.removeBrowsers(
      uid,
      others.map((browser) => browser.browserId),
    );
    setListOpen(false);
  };

  return (
    <>
      <ul className='border-border divide-border divide-y rounded-2xl border px-3'>
        <SettingsRow
          icon={<ShieldCheck className='size-5' />}
          title={TRUST_BROWSER_WORDS.label}
          description={
            isTrusted
              ? TRUST_BROWSER_WORDS.helpOn(appName)
              : TRUST_BROWSER_WORDS.help(appName)
          }
          control={
            <AppToggle
              aria-label={TRUST_BROWSER_WORDS.label}
              checked={isTrusted}
              onCheckedChange={choose}
            />
          }
        />
        {others.length > 0 && (
          <SettingsRow
            icon={<MonitorSmartphone className='size-5' />}
            title={TRUST_BROWSER_WORDS.others}
            description={summarize(others)}
            onClick={() => setListOpen(true)}
            hasChevron
          />
        )}
      </ul>
      {error && (
        <p className='text-destructive mt-2 text-sm' role='alert'>
          {error}
        </p>
      )}
      <DetailSheet
        isOpen={isListOpen}
        onClose={() => setListOpen(false)}
        title={TRUST_BROWSER_WORDS.others}
        footer={
          others.length > 1 && (
            <Button
              type='button'
              variant='secondary'
              className='text-destructive! w-full'
              onClick={() => void removeAll()}
            >
              {TRUST_BROWSER_WORDS.removeAll}
            </Button>
          )
        }
      >
        <p className='text-muted-foreground text-sm'>
          {TRUST_BROWSER_WORDS.othersIntro(appName)}
        </p>
        <ul className='divide-border divide-y'>
          {others.map((browser) => (
            <li
              key={browser.browserId}
              className='flex items-center gap-3 py-3'
            >
              <span
                className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full'
                aria-hidden='true'
              >
                {isPhone(browser.label) ? (
                  <Smartphone className='size-5' />
                ) : (
                  <Monitor className='size-5' />
                )}
              </span>
              <span className='flex min-w-0 flex-1 flex-col'>
                <span className='text-foreground font-medium'>
                  {browser.label}
                </span>
                <span className='text-muted-foreground text-sm text-pretty'>
                  {describeBrowser(browser)}
                </span>
              </span>
              <DeleteIconButton
                label={`Remove ${browser.label}, ${describeBrowser(browser)}`}
                onClick={() => void removeOne(browser)}
              />
            </li>
          ))}
        </ul>
      </DetailSheet>
    </>
  );
}

export default TrustBrowserRow;
