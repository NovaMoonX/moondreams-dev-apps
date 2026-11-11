import { WifiOff } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import { helmAppName } from '@apps/helm/queries/helmKeyQueries';

/** Opened with no connection in a browser that keeps no key, or whose kept key has lapsed: the turns can't be opened until the device is back online; `canSave` says whether typing is still kept on this device. */
function NeedsConnectionState({
  name,
  canSave,
  isTrustLapsed,
}: {
  name: string;
  canSave: boolean;
  isTrustLapsed: boolean;
}) {
  return (
    <section className='helm-card flex flex-col gap-2 p-4' role='status'>
      <WifiOff
        className='text-muted-foreground size-[18px]'
        aria-hidden='true'
      />
      <h2 className='helm-serif text-[22px] leading-7'>
        {HELM_COPY.needsConnectionTitle}
      </h2>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {isTrustLapsed
          ? HELM_COPY.trustLapsedBody(helmAppName)
          : canSave
            ? HELM_COPY.outboxIntro(name)
            : HELM_COPY.needsConnectionBody(name)}
      </p>
    </section>
  );
}

export default NeedsConnectionState;
