import CookResultFields from '@apps/pinch/components/shared/CookResultFields';

interface CookResultCardProps {
  uid: string;
  cookId: string;
  /** The recipe's name over the card when the screen cooks several. */
  caption: string | null;
}

/** The last panel's card for how the cook turned out: stars and one photo, saved as they are set, shown once the cook is recorded. */
function CookResultCard({ uid, cookId, caption }: CookResultCardProps) {
  return (
    <section
      aria-label={caption ? `${caption}: How did it turn out?` : 'How did it turn out?'}
      className='bg-muted/50 border-border w-full space-y-3 rounded-2xl border px-4 py-4'
    >
      <div className='text-center'>
        {caption && (
          <p className='text-muted-foreground text-xs wrap-break-word'>{caption}</p>
        )}
        <p className='font-medium'>How did it turn out?</p>
      </div>
      <CookResultFields uid={uid} cookId={cookId} />
    </section>
  );
}

export default CookResultCard;
