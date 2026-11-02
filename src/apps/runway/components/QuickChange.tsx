import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import type { QuestionStep } from '@/hooks/useQuestionFlow';
import { ITEM_SHEET_R2_WORDS } from '@apps/runway/constants';

interface QuickChangeProps {
  step: QuestionStep;
  /** Back to the sheet that opened this question. */
  onBack?: () => void;
  /** Opens the view that lists every other field as a row. */
  onAll: () => void;
  /** Giving an undated item its first date: just the question, no door to the rest. */
  isFirstDate?: boolean;
  /** What the change does, drawn between the question and the door to the rest. */
  children?: ReactNode;
}

/** The most frequent change to an item: only its one question, with one door to the rest of its fields. */
function QuickChange({
  step,
  onBack,
  onAll,
  isFirstDate = false,
  children,
}: QuickChangeProps) {
  return (
    <div className='space-y-4' role='group' aria-label={step.title}>
      {onBack && <BackLink onBack={onBack} />}
      <h3 className='text-2xl leading-tight font-semibold break-words'>
        {step.title}
      </h3>
      {step.render({ moveOn: () => undefined })}
      {children}
      {isFirstDate ? (
        <p className='text-muted-foreground text-sm'>
          {ITEM_SHEET_R2_WORDS.firstDateNote}
        </p>
      ) : (
        <ActionRow
          hasChevron
          icon={<SlidersHorizontal />}
          label={ITEM_SHEET_R2_WORDS.changeElse}
          onClick={onAll}
        />
      )}
    </div>
  );
}

export default QuickChange;
