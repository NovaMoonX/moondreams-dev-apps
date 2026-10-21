import { join } from '@moondreamsdev/dreamer-ui/utils';
import { PenLine } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import Pill from '@/components/Pill';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import TickMark from '@/components/TickMark';

const CARD_CLASS = 'bg-muted/50 border-border w-full rounded-2xl border';

export type CookFollowUpChoice = 'NOTHING' | 'NOTE' | 'CHANGE';

interface CookFollowUpProps {
  /** The recipe's name over the card when the screen cooks several. */
  caption: string | null;
  /** "Nothing" stays marked once tapped; it writes nothing. */
  isNothingChosen: boolean;
  /** The note pill waits for the notes to load and for room in the journal. */
  isNoteAvailable: boolean;
  /** What this panel has already done for the recipe ("Note saved."), or null while the question is still open. */
  doneText: string | null;
  /** Puts the note it wrote into the recipe form; null when there is no such note or the recipe was already changed. */
  onApply: (() => void) | null;
  onChoose: (choice: CookFollowUpChoice) => void;
}

/** The last panel's one question about the cook: nothing to change, a note for next time, or a change to the recipe now. Once a note or a change is saved it reads as that one line. */
function CookFollowUp({
  caption,
  isNothingChosen,
  isNoteAvailable,
  doneText,
  onApply,
  onChoose,
}: CookFollowUpProps) {
  const isShort = useIsShortScreen();
  const captionLine = caption && (
    <p className='text-muted-foreground text-xs wrap-break-word'>{caption}</p>
  );

  if (doneText !== null) {
    return (
      <section
        aria-label={caption ? `${caption}: ${doneText}` : doneText}
        className={join(CARD_CLASS, 'space-y-2 px-4 py-3')}
      >
        {captionLine}
        <p role='status' className='flex items-center gap-3 text-sm'>
          <TickMark />
          <span className='min-w-0 flex-1 font-medium text-balance'>
            {doneText}
          </span>
        </p>
        {onApply && (
          <ActionChips
            label='Next'
            actions={[
              {
                key: 'apply',
                icon: <PenLine className='h-4 w-4' />,
                label: 'Apply to the recipe',
                description: 'Apply your note to the recipe',
                onClick: onApply,
              },
            ]}
          />
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={
        caption
          ? `${caption}: Anything you'd change?`
          : "Anything you'd change?"
      }
      className={join(
        CARD_CLASS,
        isShort ? 'space-y-1 px-3 py-2' : 'space-y-3 px-4 py-4 text-center',
      )}
    >
      <div>
        {captionLine}
        <p className={join('font-medium', isShort && 'text-sm')}>
          Anything you'd change?
        </p>
      </div>
      <div
        role='group'
        aria-label="What you'd change"
        className={join(
          'flex gap-2',
          isShort ? 'justify-start' : 'flex-wrap justify-center',
        )}
      >
        <Pill isSelected={isNothingChosen} onClick={() => onChoose('NOTHING')}>
          Nothing
        </Pill>
        {isNoteAvailable && (
          <Pill
            isSelected={false}
            ariaLabel='A note for next time'
            onClick={() => onChoose('NOTE')}
          >
            {isShort ? 'A note' : 'A note for next time'}
          </Pill>
        )}
        <Pill
          isSelected={false}
          ariaLabel='Change the recipe'
          onClick={() => onChoose('CHANGE')}
        >
          {isShort ? 'Change it' : 'Change the recipe'}
        </Pill>
      </div>
    </section>
  );
}

export default CookFollowUp;
