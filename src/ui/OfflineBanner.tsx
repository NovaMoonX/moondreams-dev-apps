import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CheckCircle2, LoaderCircle, WifiOff, WifiZero } from 'lucide-react';

import { useNetworkStatus, type NetworkBannerState } from '@hooks/useNetworkStatus';

type Variant = Exclude<NetworkBannerState, null>;

const VARIANTS: Record<
  Variant,
  { icon: typeof WifiOff; label: string; className: string; spin?: boolean }
> = {
  offline: {
    icon: WifiOff,
    label: "You're offline",
    className: 'bg-destructive text-destructive-foreground',
  },
  reconnecting: {
    icon: LoaderCircle,
    label: 'Reconnecting…',
    className: 'bg-primary text-primary-foreground',
    spin: true,
  },
  slow: {
    icon: WifiZero,
    label: 'Slow connection',
    className: 'bg-warning text-warning-foreground',
  },
  reconnected: {
    icon: CheckCircle2,
    label: 'Back online',
    className: 'bg-success text-success-foreground',
  },
};

/** Fixed, full-width status bar shown above every mini-app while offline, reconnecting, or on a slow connection — and briefly on a successful reconnect. Always mounted; visibility is a transform so it never reflows the page or squishes its own text while sliding away. */
function OfflineBanner() {
  const status = useNetworkStatus();
  const variant = VARIANTS[status ?? 'offline'];
  const Icon = variant.icon;

  return (
    <div
      aria-live='polite'
      className={join(
        'pointer-events-none fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-center gap-2 text-sm font-medium transition-transform duration-300 ease-out',
        status ? 'translate-y-0' : '-translate-y-full',
        variant.className,
      )}
    >
      <Icon className={join('size-4', variant.spin && 'animate-spin')} />
      <span>{variant.label}</span>
    </div>
  );
}

export default OfflineBanner;
