import { useId, type ReactNode } from 'react';

interface SlotCardProps {
  emoji: ReactNode;
  lead: ReactNode;
  hint?: ReactNode;
  isBusy?: boolean;
  children: ReactNode;
}

/** The tinted card the public page draws its one action in, the same card in every state. */
function SlotCard({
  emoji,
  lead,
  hint,
  isBusy = false,
  children,
}: SlotCardProps) {
  const leadId = useId();

  return (
    <section
      aria-labelledby={leadId}
      aria-busy={isBusy}
      aria-live='polite'
      className='bg-accent/60 border-border rounded-2xl border p-3.5'
    >
      <div className='flex items-start gap-3'>
        <span
          aria-hidden='true'
          className='bg-background/70 border-border grid size-10 shrink-0 place-items-center rounded-full border text-lg leading-none'
        >
          {emoji}
        </span>
        <div className='min-h-17 min-w-0 flex-1 space-y-0.5 pt-0.5'>
          <div id={leadId} className='font-medium text-pretty'>
            {lead}
          </div>
          {hint && (
            <div className='text-muted-foreground text-sm text-pretty'>
              {hint}
            </div>
          )}
        </div>
      </div>
      <div className='mt-3 space-y-3'>{children}</div>
    </section>
  );
}

export default SlotCard;
