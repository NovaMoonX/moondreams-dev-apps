import type { Ref } from 'react';

import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import Composer from '@apps/helm/components/home/Composer';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface HomeSurfaceProps {
  composerRef: Ref<HTMLTextAreaElement>;
}

/** Home is the conversation: the assistant's name, one quiet line and, before anything is said, one card saying how to begin. */
function HomeSurface({ composerRef }: HomeSurfaceProps) {
  const name = useAssistantName();

  return (
    <main className='flex flex-1 flex-col gap-8'>
      <div className='flex flex-col items-center gap-2 pt-10 text-center'>
        <div className='flex items-center gap-2'>
          <AssistantMark name={name} />
          <h1 className='helm-serif text-[28px] leading-[34px]'>{name}</h1>
        </div>
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.homeHint}
        </p>
      </div>
      <p className='helm-card p-4 text-[15px] text-pretty'>
        {HELM_COPY.firstOpen(name)}
      </p>
      <Composer fieldRef={composerRef} />
    </main>
  );
}

export default HomeSurface;
