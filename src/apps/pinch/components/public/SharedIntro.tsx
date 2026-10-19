import { join } from '@moondreamsdev/dreamer-ui/utils';

import FactsLine, { type Fact } from '@/components/FactsLine';
import SharedCover from '@apps/pinch/components/public/SharedCover';

interface SharedIntroProps {
  shareId: string;
  coverIndex: number | null;
  hasCover: boolean;
  emoji: string;
  title: string;
  facts: Fact[];
  /** A short screen keeps the small tile beside the title, so the card below it stays in view. */
  isCompact: boolean;
}

function SharedIntro({
  shareId,
  coverIndex,
  hasCover,
  emoji,
  title,
  facts,
  isCompact,
}: SharedIntroProps) {
  return (
    <div
      className={join(
        'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4',
        !isCompact && 'sm:grid-cols-1',
      )}
    >
      <SharedCover
        shareId={shareId}
        index={coverIndex}
        hasCover={hasCover}
        emoji={emoji}
        className={join(
          'size-20 rounded-2xl',
          !isCompact && 'sm:h-[min(14rem,26dvh)] sm:w-full sm:rounded-3xl',
        )}
        emojiClassName={join('text-4xl', !isCompact && 'sm:text-7xl')}
      />
      <div className='min-w-0 space-y-1.5'>
        <h1 className='text-2xl font-semibold tracking-tight wrap-break-word'>
          {title}
        </h1>
        <FactsLine facts={facts} className='text-muted-foreground text-sm' />
      </div>
    </div>
  );
}

export default SharedIntro;
