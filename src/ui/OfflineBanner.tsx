import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  CheckCircle2,
  Info,
  LoaderCircle,
  RefreshCw,
  WifiOff,
  WifiZero,
} from 'lucide-react';
import { useState } from 'react';

import {
  useNetworkStatus,
  type NetworkBannerState,
} from '@hooks/useNetworkStatus';
import { useRestartApp } from '@hooks/useRestartApp';
import { getLastSiteNotice, useSiteNotice } from '@hooks/useSiteNotice';
import { useUpdateReady } from '@hooks/useUpdateReady';

type Variant = Exclude<NetworkBannerState, null> | 'notice' | 'update';

const VARIANTS: Record<
  Variant,
  { icon: typeof WifiOff; label: string; className: string; spin?: boolean }
> = {
  offline: {
    icon: WifiOff,
    label: "You're offline",
    className: 'bg-destructive text-destructive-foreground dark:bg-red-600',
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
    className:
      'bg-emerald-700 text-white dark:bg-success dark:text-success-foreground',
  },
  notice: {
    icon: Info,
    label: '',
    className: 'bg-primary text-primary-foreground',
  },
  update: {
    icon: RefreshCw,
    label: 'New version ready',
    className: 'bg-primary text-primary-foreground',
  },
};

/** The top strip: connection problems first, then a tappable restart prompt when an installed app has a newer version, otherwise a page's notice (`setSiteNotice`) with its action. Always mounted; visibility is a transform so sliding away never reflows or squishes the text. */
function OfflineBanner() {
  const networkStatus = useNetworkStatus();
  const isUpdateReady = useUpdateReady();
  const restart = useRestartApp();
  const notice = useSiteNotice();
  const getStatus = (): Variant | null => {
    if (networkStatus) return networkStatus;
    if (isUpdateReady) return 'update';
    return notice ? 'notice' : null;
  };
  const status = getStatus();
  // Keeps the last shown variant while sliding out, so a cleared status doesn't repaint it.
  const [shownVariant, setShownVariant] = useState<Variant>(
    status ?? 'offline',
  );
  if (status && status !== shownVariant) {
    setShownVariant(status);
  }
  const shownNotice = notice ?? getLastSiteNotice();
  const variant = VARIANTS[shownVariant];
  const Icon = variant.icon;

  return (
    <div
      aria-live='polite'
      className={join(
        'pointer-events-none fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-center gap-2 px-4 text-sm font-medium transition-transform duration-300 ease-out',
        status ? 'translate-y-0' : '-translate-y-full',
        variant.className,
      )}
    >
      <Icon
        className={join('size-4 shrink-0', variant.spin && 'animate-spin')}
      />
      <span className='min-w-0 truncate'>
        {shownVariant === 'notice' ? shownNotice?.label : variant.label}
      </span>
      {shownVariant === 'update' && (
        <Button
          size='sm'
          variant='base'
          className='bg-primary-foreground! text-primary! hover:bg-primary-foreground/85! focus-visible:outline-primary-foreground! pointer-events-auto relative h-7 shrink-0 px-3 whitespace-nowrap after:absolute after:-inset-1.5 focus-visible:outline-2 focus-visible:outline-offset-2'
          onClick={restart}
        >
          Restart
        </Button>
      )}
      {shownVariant === 'notice' && shownNotice && (
        <Button
          size='sm'
          variant='base'
          className='bg-primary-foreground! text-primary! hover:bg-primary-foreground/85! focus-visible:outline-primary-foreground! pointer-events-auto relative h-7 shrink-0 px-3 whitespace-nowrap after:absolute after:-inset-1.5 focus-visible:outline-2 focus-visible:outline-offset-2'
          onClick={shownNotice.onAction}
        >
          {shownNotice.actionLabel}
        </Button>
      )}
    </div>
  );
}

export default OfflineBanner;
