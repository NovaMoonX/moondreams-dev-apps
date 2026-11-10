import { Globe, Stethoscope } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface GeneralKnowledgeCardProps {
  text: string;
  isHealth: boolean;
}

/** General knowledge, always under its "Not from your records" label, with no sources and no doors. */
function GeneralKnowledgeCard({ text, isHealth }: GeneralKnowledgeCardProps) {
  const name = useAssistantName();
  return (
    <div className='flex w-full flex-col gap-3'>
      <SectionDivider label={HELM_COPY.answerNotFromRecords} />
      <section className='helm-card flex flex-col gap-2.5 p-3.5'>
        <h3 className='text-muted-foreground flex items-center gap-2 text-[13px] font-semibold'>
          <Globe className='size-4 shrink-0' aria-hidden='true' />
          {HELM_COPY.answerGeneralHeading}
        </h3>
        {isHealth && (
          <p className='bg-muted text-foreground flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[13px] leading-[18px] font-semibold text-pretty'>
            <Stethoscope className='mt-px size-4 shrink-0' aria-hidden='true' />
            <span className='min-w-0'>{HELM_COPY.answerHealthCaution}</span>
          </p>
        )}
        <p className='text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
          {text}
        </p>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.answerGeneralCaution(name)}
        </p>
      </section>
    </div>
  );
}

export default GeneralKnowledgeCard;
