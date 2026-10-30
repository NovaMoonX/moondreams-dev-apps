import { Star } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';

import AppLogo from '@/components/AppLogo';
import type { AppMetadata } from '@lib/types/appCatalog';

const HOLD_MS = 450;

interface AppTileProps {
  app: AppMetadata;
  href: string;
  isStarred: boolean;
  onShowInfo: () => void;
}

/** A phone home-screen tile: the logo and name open the app, and pressing and holding (or the context-menu key) shows its details. */
function AppTile({ app, href, isStarred, onShowInfo }: AppTileProps) {
  const holdTimerRef = useRef<number | null>(null);
  const didHoldRef = useRef(false);

  const cancelHold = () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  return (
    <Link
      to={href}
      state={{ resumed: true }}
      aria-label={`Open ${app.name}`}
      className='flex flex-col items-center gap-1.5 rounded-2xl p-1 text-center select-none [-webkit-touch-callout:none]'
      onPointerDown={(event) => {
        didHoldRef.current = false;
        cancelHold();
        // A mouse has right-click for this, so a slow click still opens the app.
        if (event.pointerType === 'mouse') return;
        holdTimerRef.current = window.setTimeout(() => {
          didHoldRef.current = true;
          onShowInfo();
        }, HOLD_MS);
      }}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(event) => {
        event.preventDefault();
        cancelHold();
        if (!didHoldRef.current) onShowInfo();
      }}
      onClick={(event) => {
        if (didHoldRef.current) event.preventDefault();
        didHoldRef.current = false;
      }}
    >
      <span className='relative'>
        <AppLogo appId={app.id} className='size-14 rounded-2xl shadow-sm' />
        {isStarred ? (
          <span className='bg-background absolute -top-1 -right-1 grid size-5 place-items-center rounded-full shadow-sm'>
            <Star className='text-primary size-3 fill-current' aria-hidden='true' />
            <span className='sr-only'>Starred</span>
          </span>
        ) : null}
      </span>
      <span className='text-foreground line-clamp-2 w-full text-xs leading-tight font-medium'>{app.name}</span>
    </Link>
  );
}

export default AppTile;
