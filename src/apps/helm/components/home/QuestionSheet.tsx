import DetailSheet from '@/components/DetailSheet';
import QuestionBlock from '@apps/helm/components/home/QuestionBlock';
import { HELM_COPY } from '@apps/helm/constants';
import { getOpenQuestions, type HeldItem } from '@apps/helm/utils/heldCaptures';

interface QuestionSheetProps {
  item: HeldItem | null;
  onClose: () => void;
}

/** A turn's open which-person and which-place questions from Needs you, read from the live turn so it closes by itself once they are answered. */
function QuestionSheet({ item, onClose }: QuestionSheetProps) {
  const questions = item ? getOpenQuestions(item.capture) : [];

  return (
    <DetailSheet
      isOpen={item !== null && questions.length > 0}
      onClose={onClose}
      title={HELM_COPY.questionSheetTitle}
    >
      {item && (
        <div className='space-y-4'>
          <p className='bg-muted/60 rounded-[10px] px-3.5 py-2.5 text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
            {item.capture.isUnreadable
              ? HELM_COPY.unreadable
              : item.capture.text}
          </p>
          {questions.map((entry) => (
            <QuestionBlock
              key={entry.id}
              captureId={item.capture.id}
              item={entry}
              isInSheet
            />
          ))}
        </div>
      )}
    </DetailSheet>
  );
}

export default QuestionSheet;
