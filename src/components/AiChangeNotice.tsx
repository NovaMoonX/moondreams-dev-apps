import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Sparkles, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';

import SearchSourcesNote from '@/components/SearchSourcesNote';

interface AiChangeNoticeProps {
  /** Who made the change: the assistant's name. */
  who: string;
  /** What changed, without the name: "changed 2 ingredients and a step"; empty when nothing did and only the reply shows. */
  summary: string;
  /** What the AI said about it, in its own words. */
  reply: string | null;
  /** Names of what it took out, shown as "Took out: butter, salt". */
  removed: string[];
  /** The pages a round's web search used, shown under its words; omit when it did not search. */
  sources?: { title: string; url: string }[];
  /** Takes the change back where it was made; omit when there is nothing to take back. */
  onUndo?: () => void;
  undoLabel?: string;
  /** A line under the card's words, such as the finder for the changes still to look at. */
  footer?: ReactNode;
  /** The tighter card for a pinned footer: the reply (or who changed what when there is none), what it took out, and Undo beside the footer. */
  isCompact?: boolean;
  className?: string;
}

/** A quiet card above a form saying what an AI changed in it, in the AI's name, with the one way to take it back. */
function AiChangeNotice({
  who,
  summary,
  reply,
  removed,
  sources = [],
  onUndo,
  undoLabel = 'Undo',
  footer,
  isCompact = false,
  className,
}: AiChangeNoticeProps) {
  const hasReply = reply !== null && reply.trim() !== '';
  const getCompactText = () => {
    if (hasReply) return reply;
    return summary === '' ? '' : `${who} ${summary}.`;
  };
  const words = isCompact ? (
    <div className='min-w-0 flex-1 space-y-0.5'>
      <p className='line-clamp-2 text-sm [@media(max-height:700px)]:line-clamp-1'>
        {getCompactText()}
      </p>
      {removed.length > 0 && (
        <p className='text-muted-foreground line-clamp-2 text-xs'>
          Took out: {removed.join(', ')}
        </p>
      )}
      <SearchSourcesNote sources={sources} />
    </div>
  ) : (
    <div className='min-w-0 flex-1 space-y-0.5'>
      {summary !== '' && (
        <p className='font-medium'>
          {who} {summary}
        </p>
      )}
      {hasReply && (
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
      <SearchSourcesNote sources={sources} />
    </div>
  );
  const undoButton = onUndo && (
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
  );
  return (
    <div
      className={join(
        'bg-muted border-border rounded-2xl border text-sm',
        isCompact ? 'space-y-1.5 p-2.5' : 'space-y-2 p-3',
        className,
      )}
    >
      <div role='status' aria-live='polite' className='flex items-start gap-2'>
        <Sparkles
          className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
          aria-hidden='true'
        />
        {words}
        {!isCompact && undoButton}
      </div>
      {isCompact && (footer || undoButton) ? (
        <div className='flex items-center gap-2'>
          <div className='min-w-0 flex-1'>{footer}</div>
          {undoButton}
        </div>
      ) : (
        footer
      )}
    </div>
  );
}

export default AiChangeNotice;
