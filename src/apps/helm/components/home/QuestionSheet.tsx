import { useState } from 'react';

import DetailSheet from '@/components/DetailSheet';
import QuestionCard from '@apps/helm/components/home/QuestionCard';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { HELM_COPY } from '@apps/helm/constants';
import {
  getOpenQuestions,
  hasOpenChoice,
  type HeldItem,
} from '@apps/helm/utils/heldCaptures';

interface QuestionSheetProps {
  item: HeldItem | null;
  onClose: () => void;
}

/** Every open question of a turn from Needs you, read from the live turn so it closes by itself once they are answered. */
function QuestionSheet({ item, onClose }: QuestionSheetProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const questions = item ? getOpenQuestions(item.capture) : [];
  const requestClose = useDiscardGuard({
    isDirty: Object.values(drafts).some((text) => text.trim() !== ''),
    onClose: () => {
      setDrafts({});
      onClose();
    },
  });
  const title = questions[0]?.question.prompt ?? HELM_COPY.questionSheetTitle;

  return (
    <DetailSheet
      isOpen={item !== null && hasOpenChoice(item.capture)}
      onClose={requestClose}
      title={title}
    >
      {item && (
        <div className='space-y-4'>
          <p className='text-muted-foreground border-border border-l-2 pl-3 text-[13px] leading-[19px] break-words whitespace-pre-wrap'>
            {item.capture.isUnreadable
              ? HELM_COPY.unreadable
              : item.capture.text}
          </p>
          {questions.length === 0 && !item.capture.isUnreadable && (
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.unreadable}
            </p>
          )}
          <div className='space-y-8'>
            {questions.map((entry, index) => (
              <QuestionCard
                key={entry.id}
                captureId={item.capture.id}
                item={entry}
                isInSheet
                isPromptHidden={index === 0}
                neitherDraft={{
                  text: drafts[entry.id] ?? '',
                  onChange: (text) =>
                    setDrafts((current) => ({ ...current, [entry.id]: text })),
                }}
              />
            ))}
          </div>
        </div>
      )}
    </DetailSheet>
  );
}

export default QuestionSheet;
