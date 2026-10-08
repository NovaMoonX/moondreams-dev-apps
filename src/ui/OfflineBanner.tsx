import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CheckCircle2, LoaderCircle, RefreshCw, WifiOff, WifiZero } from 'lucide-react';
import { useState } from 'react';

import { useNetworkStatus, type NetworkBannerState } from '@hooks/useNetworkStatus';
import { useUpdateReady } from '@hooks/useUpdateReady';

type Variant = Exclude<NetworkBannerState, null> | 'update';

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
  update: {
    icon: RefreshCw,
    label: 'New version ready',
    className: 'bg-primary text-primary-foreground',
  },
};

/** The top strip: connection problems first, otherwise a tappable restart prompt when an installed app has a newer version. Always mounted; visibility is a transform so sliding away never reflows or squishes the text. */
function OfflineBanner() {
  const networkStatus = useNetworkStatus();
  const isUpdateReady = useUpdateReady();
  const status: Variant | null = networkStatus ?? (isUpdateReady ? 'update' : null);
  // Keeps the last shown variant while sliding out, so a cleared status doesn't repaint it.
  const [shownVariant, setShownVariant] = useState<Variant>(status ?? 'offline');
  if (status && status !== shownVariant) {
    setShownVariant(status);
  }
  const variant = VARIANTS[shownVariant];
  const Icon = variant.icon;

  return (
    <div
      aria-live='polite'
      className={join(
        'fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-center gap-2 text-sm font-medium transition-transform duration-300 ease-out',
        shownVariant === 'update' && status ? 'pointer-events-auto' : 'pointer-events-none',
        status ? 'translate-y-0' : '-translate-y-full',
        variant.className,
      )}
    >
      <Icon className={join('size-4', variant.spin && 'animate-spin')} />
      <span>{variant.label}</span>
      {shownVariant === 'update' && (
        <Button
          size='sm'
          variant='secondary'
          className='relative h-7 px-3 after:absolute after:-inset-1.5'
          tabIndex={status ? 0 : -1}
          onClick={() => window.location.reload()}
        >
          Restart
        </Button>
      )}
    </div>
  );
}

export default OfflineBanner;
