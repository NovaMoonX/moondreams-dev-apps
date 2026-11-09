import type { ReactNode } from 'react';

import { History, Lock, Send, Server } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface WhatTheAiSeesProps {
  isOpen: boolean;
  onClose: () => void;
}

function Block({
  icon,
  lead,
  children,
}: {
  icon: ReactNode;
  lead: string;
  children: string;
}) {
  return (
    <li className='flex items-start gap-3'>
      <span
        className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full'
        aria-hidden='true'
      >
        {icon}
      </span>
      <div className='min-w-0 flex-1 text-pretty'>
        <p className='text-[15px] leading-[21px] font-medium'>{lead}</p>
        <p className='text-muted-foreground text-[15px] leading-[21px]'>
          {children}
        </p>
      </div>
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
        <Block
          icon={<Send className='size-4' />}
          lead={HELM_COPY.aiSeesSentLead}
        >
          {HELM_COPY.aiSeesSent(name)}
        </Block>
        <Block
          icon={<Server className='size-4' />}
          lead={HELM_COPY.aiSeesWhereLead}
        >
          {HELM_COPY.aiSeesWhere(name)}
        </Block>
        <Block
          icon={<Lock className='size-4' />}
          lead={HELM_COPY.aiSeesStoredLead}
        >
          {HELM_COPY.aiSeesStored}
        </Block>
        <Block
          icon={<History className='size-4' />}
          lead={HELM_COPY.aiSeesKeptLead}
        >
          {HELM_COPY.aiSeesKept}
        </Block>
      </ul>
    </DetailSheet>
  );
}

export default WhatTheAiSees;
