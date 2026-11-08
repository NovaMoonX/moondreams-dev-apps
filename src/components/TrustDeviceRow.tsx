import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import SettingsRow from '@/components/SettingsRow';
import { canKeepDeviceSecrets } from '@/lib/security';
import type { TrustedKeyStore } from '@/lib/security/trustedKey';

const TRUST_DEVICE_WORDS = {
  label: 'Trust this device',
  help: (appName: string) =>
    `Open ${appName} here without a connection. Anyone using this browser could open your data, so leave it off on a shared device.`,
  helpOn: (appName: string) =>
    `${appName} opens here without a connection. Signing out turns this off.`,
  onFailed: (appName: string) =>
    `This device could not keep your data unlocked. ${appName} still works online.`,
  offFailed: 'This device is still trusted. Try again.',
} as const;

interface TrustDeviceRowProps {
  store: TrustedKeyStore;
  uid: string;
  appName: string;
}

/** The one switch an app with a server-held key offers to open offline; draws nothing where the browser can't keep the key. */
function TrustDeviceRow({ store, uid, appName }: TrustDeviceRowProps) {
  const isTrusted =
    useQuery({
      ...store.trustedQueryOptions(uid),
      enabled: canKeepDeviceSecrets(),
    }).data ?? false;
  const [error, setError] = useState<string | null>(null);

  if (!canKeepDeviceSecrets()) return null;

  const choose = (next: boolean) => {
    setError(null);
    store.setTrusted(uid, next).catch((saveError: unknown) => {
      console.error(saveError);
      setError(
        next
          ? TRUST_DEVICE_WORDS.onFailed(appName)
          : TRUST_DEVICE_WORDS.offFailed,
      );
    });
  };

  return (
    <>
      <ul className='border-border rounded-2xl border px-3'>
        <SettingsRow
          icon={<ShieldCheck className='size-5' />}
          title={TRUST_DEVICE_WORDS.label}
          description={
            isTrusted
              ? TRUST_DEVICE_WORDS.helpOn(appName)
              : TRUST_DEVICE_WORDS.help(appName)
          }
          control={
            <AppToggle
              aria-label={TRUST_DEVICE_WORDS.label}
              checked={isTrusted}
              onCheckedChange={choose}
            />
          }
        />
      </ul>
      {error && (
        <p className='text-destructive mt-2 text-sm' role='alert'>
          {error}
        </p>
      )}
    </>
  );
}

export default TrustDeviceRow;
