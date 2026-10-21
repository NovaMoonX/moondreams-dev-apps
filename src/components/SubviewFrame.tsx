import { useContext, useMemo } from 'react';

import FallbackImage from '@/components/FallbackImage';
import {
  SubviewFrameContext,
  type SubviewFrameIdentity,
} from '@/contexts/SubviewFrameContext';
import { getRegistryAppForPath } from '@/lib/app';

function useFrameIdentity() {
  const { identity } = useContext(SubviewFrameContext);
  const routedApp = useMemo(
    () => getRegistryAppForPath(window.location.pathname),
    [],
  );

  if (identity !== undefined) {
    return identity;
  }

  const result = routedApp
    ? { name: routedApp.name, logoSrc: `/logos/by-app/logo-${routedApp.id}.svg` }
    : null;
  return result;
}

function DefaultSurround() {
  return <div aria-hidden='true' data-subview-frame='' className='subview-frame' />;
}

function DefaultEyebrow({ identity }: { identity: SubviewFrameIdentity | null }) {
  if (identity === null) {
    return null;
  }

  return (
    <>
      {identity.logoSrc !== null && (
        <FallbackImage
          src={identity.logoSrc}
          alt=''
          loading='eager'
          className='h-3.5 w-3.5 shrink-0 rounded-[0.2rem]'
        />
      )}
      <span className='truncate'>{identity.name}</span>
    </>
  );
}

/** The non-interactive edge around a subview; it paints above the page and the site header and below every drawer, modal and toast. */
export function SubviewSurround() {
  const { Surround } = useContext(SubviewFrameContext);

  if (Surround === null) {
    return null;
  }

  const Layer = Surround ?? DefaultSurround;
  return <Layer />;
}

/** The strip above a subview's header that names the mini-app. It takes the place of the page's top padding, so it costs no height on a phone (12px and empty on a short landscape phone); from md up it is 12px taller so its text clears the wider frame edge. */
export function SubviewEyebrow() {
  const { Eyebrow } = useContext(SubviewFrameContext);
  const identity = useFrameIdentity();
  const Line = Eyebrow === undefined ? DefaultEyebrow : Eyebrow;

  return (
    <div
      aria-hidden='true'
      className='text-muted-foreground flex h-6 items-center text-xs font-medium [@media(max-height:499px)]:h-3 [@media(min-width:768px)_and_(min-height:500px)]:h-9 [@media(min-width:768px)_and_(min-height:500px)]:pt-3'
    >
      {Line !== null && (
        <span className='flex min-w-0 items-center gap-1.5 [@media(max-height:499px)]:hidden'>
          <Line identity={identity} />
        </span>
      )}
    </div>
  );
}
