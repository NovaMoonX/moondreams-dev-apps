import FactsLine, { type Fact } from '@/components/FactsLine';
import SharedCover from '@apps/pinch/components/public/SharedCover';

interface SharedIntroProps {
  shareId: string;
  coverIndex: number | null;
  hasCover: boolean;
  emoji: string;
  title: string;
  facts: Fact[];
}

function SharedIntro({
  shareId,
  coverIndex,
  hasCover,
  emoji,
  title,
  facts,
}: SharedIntroProps) {
  return (
    <div className='grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:grid-cols-1'>
      <SharedCover
        shareId={shareId}
        index={coverIndex}
        hasCover={hasCover}
        emoji={emoji}
        className='size-24 rounded-2xl sm:h-56 sm:w-full sm:rounded-3xl'
        emojiClassName='text-4xl sm:text-7xl'
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
