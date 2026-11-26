import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Sparkles, Undo2 } from 'lucide-react';

interface AiChangeNoticeProps {
  /** Who made the change: "Pepper". */
  who: string;
  /** What changed, without the name: "changed 2 ingredients and a step"; empty when nothing did and only the reply shows. */
  summary: string;
  /** What the AI said about it, in its own words. */
  reply: string | null;
  /** Names of what it took out, shown as "Took out: butter, salt". */
  removed: string[];
  /** Takes the change back where it was made; omit when there is nothing to take back. */
  onUndo?: () => void;
  undoLabel?: string;
  className?: string;
}

/** A quiet card above a form saying what an AI changed in it, in the AI's name, with the one way to take it back. */
function AiChangeNotice({
  who,
  summary,
  reply,
  removed,
  onUndo,
  undoLabel = 'Undo',
  className,
}: AiChangeNoticeProps) {
  return (
    <div
      role='status'
      aria-live='polite'
      className={join(
        'bg-muted border-border flex items-start gap-2 rounded-2xl border p-3 text-sm',
        className,
      )}
    >
      <Sparkles
        className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1 space-y-0.5'>
        {summary !== '' && (
          <p className='font-medium'>
            {who} {summary}
          </p>
        )}
        {reply !== null && reply.trim() !== '' && (
          <p
            className={join(
              summary === '' ? 'text-sm' : 'text-foreground/80 text-xs',
            )}
          >
            {reply}
          </p>
        )}
        {removed.length > 0 && (
          <p className='text-muted-foreground text-xs'>
            Took out: {removed.join(', ')}
          </p>
        )}
      </div>
      {onUndo && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className="relative -my-0.5 shrink-0 gap-1 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
          onClick={onUndo}
        >
          <Undo2 className='h-3.5 w-3.5' aria-hidden='true' />
          {undoLabel}
        </Button>
      )}
    </div>
  );
}

export default AiChangeNotice;
