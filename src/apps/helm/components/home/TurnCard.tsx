import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenCapture } from '@apps/helm/types';

interface TurnCardProps {
  capture: OpenCapture;
}

/** What the person sent, as their bubble with its time, and under it what became of it. */
function TurnCard({ capture }: TurnCardProps) {
  return (
    <article className='flex flex-col items-end gap-1'>
      {capture.isUnreadable ? (
        <p className='helm-card text-muted-foreground max-w-[84%] px-3.5 py-2.5 text-[15px] leading-[21px]'>
          {HELM_COPY.unreadable}
        </p>
      ) : (
        <p className='bg-primary text-primary-foreground max-w-[84%] rounded-[18px_18px_4px_18px] px-3.5 py-2.5 text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
          {capture.text}
        </p>
      )}
      <time
        dateTime={new Date(capture.createdAt).toISOString()}
        className='text-muted-foreground text-[13px] tabular-nums'
      >
        {formatTime(capture.createdAt)}
      </time>
      {!capture.isUnreadable && (
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.savedAsWritten}
        </p>
      )}
    </article>
  );
}

export default TurnCard;
