import type { ReactNode } from 'react';

import { BookOpen, Globe, Stethoscope } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { selectNoteById } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { CaptureAnswer } from '@apps/helm/types';

interface GeneralKnowledgeCardProps {
  text: string;
  isHealth: boolean;
  differs: CaptureAnswer['generalDiffersFrom'];
  /** What goes under the words: Save to my knowledge, where the turn can keep a note. */
  children?: ReactNode;
}

function DiffersLine({
  differs,
}: {
  differs: NonNullable<CaptureAnswer['generalDiffersFrom']>;
}) {
  const note = useAppSelector(selectNoteById).get(differs.noteId) ?? null;
  return (
    <p className='bg-muted text-foreground flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[13px] leading-[18px] text-pretty'>
      <BookOpen className='mt-px size-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 break-words'>
        {HELM_COPY.answerDiffersFromNote(
          note?.title ?? differs.title,
          differs.says,
        )}
      </span>
    </p>
  );
}

/** General knowledge, always under its "Not from your records" label, with no sources and no doors. */
function GeneralKnowledgeCard({
  text,
  isHealth,
  differs,
  children,
}: GeneralKnowledgeCardProps) {
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
        {differs && <DiffersLine differs={differs} />}
        <p className='text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
          {text}
        </p>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.answerGeneralCaution(name)}
        </p>
        {children}
      </section>
    </div>
  );
}

export default GeneralKnowledgeCard;
