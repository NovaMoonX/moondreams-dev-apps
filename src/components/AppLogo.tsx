import { join } from '@moondreamsdev/dreamer-ui/utils';

import FallbackImage from '@components/FallbackImage';

interface AppLogoProps {
  appId: string;
  /** Size and corner radius; the logo and its fallback tile share them. */
  className?: string;
}

/** An app's logo from `/logos/by-app`, or a muted tile of the same size when the file is missing. */
function AppLogo({ appId, className = 'size-8 rounded-lg' }: AppLogoProps) {
  return (
    <FallbackImage
      src={`/logos/by-app/logo-${appId}.svg`}
      alt=''
      className={join('ring-foreground/15 shrink-0 ring-1', className)}
      fallback={<span className={join('bg-muted shrink-0', className)} />}
    />
  );
}

export default AppLogo;
