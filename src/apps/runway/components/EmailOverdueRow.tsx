import { useState } from 'react';

import { ChevronRight, Mail } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import { useEmailOverduePurchases } from '@apps/runway/hooks/useEmailPurchases';
import EmailOverdueScreen from '@apps/runway/screens/home/EmailOverdueScreen';

/** Home's one row for every emailed purchase its bank has not matched after the wait, however many there are; it opens the list. Draws nothing while there are none. */
function EmailOverdueRow() {
  const overdue = useEmailOverduePurchases();
  const [isOpen, setIsOpen] = useState(false);
  if (overdue.length === 0) return null;
  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border border-(--runway-warning-edge) bg-(--runway-warning-soft) px-3! py-1.5 text-left font-normal whitespace-normal'
        onClick={() => setIsOpen(true)}
      >
        <span
          className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
          aria-hidden='true'
        >
          <Mail className='size-4' />
        </span>
        <span className='block min-w-0 flex-1 text-sm break-words'>
          <span className='block font-medium sm:hidden'>
            {EMAIL_WORDS.homeCount(overdue.length)}
          </span>
          <span className='text-muted-foreground block sm:hidden'>
            {EMAIL_WORDS.homeSub}
          </span>
          <span className='hidden font-medium sm:block'>
            {EMAIL_WORDS.homeSentence(overdue.length)}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      {isOpen && <EmailOverdueScreen onClose={() => setIsOpen(false)} />}
    </>
  );
}

/** The same count as one row of "Things to fix", for when Home's warning row already holds the plan's problems. */
export function EmailWarningRow({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  const sentence = EMAIL_WORDS.homeSentence(count);
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
      aria-label={`${sentence}. ${EMAIL_WORDS.overdueSub}`}
      onClick={onOpen}
    >
      <span
        className='grid size-9 shrink-0 place-items-center rounded-full bg-(--runway-warning-soft) text-(--runway-warning-ink) shadow-[inset_0_0_0_1px_var(--runway-warning-edge)]'
        aria-hidden='true'
      >
        <Mail className='size-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block font-medium break-words'>{sentence}</span>
        <span className='text-muted-foreground block text-sm'>
          {EMAIL_WORDS.overdueSub}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-2.5 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default EmailOverdueRow;
