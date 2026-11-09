import type { ReactNode } from 'react';

import { History, Lock, Send, Server } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface WhatTheAiSeesProps {
  isOpen: boolean;
  onClose: () => void;
}

function Block({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <li className='flex items-start gap-3'>
      <span
        className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full'
        aria-hidden='true'
      >
        {icon}
      </span>
      <p className='min-w-0 flex-1 pt-2 text-[15px] text-pretty'>{children}</p>
    </li>
  );
}

function WhatTheAiSees({ isOpen, onClose }: WhatTheAiSeesProps) {
  const name = useAssistantName();

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.whatTheAiSees}
    >
      <ul className='space-y-4'>
        <Block icon={<Send className='size-4' />}>
          {HELM_COPY.aiSeesSent(name)}
        </Block>
        <Block icon={<Server className='size-4' />}>
          {HELM_COPY.aiSeesWhere(name)}
        </Block>
        <Block icon={<Lock className='size-4' />}>
          {HELM_COPY.aiSeesStored}
        </Block>
        <Block icon={<History className='size-4' />}>
          {HELM_COPY.aiSeesKept}
        </Block>
      </ul>
    </DetailSheet>
  );
}

export default WhatTheAiSees;
