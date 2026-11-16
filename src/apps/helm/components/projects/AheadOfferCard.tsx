import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarDays, Lightbulb } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import AheadSheet from '@apps/helm/components/projects/AheadSheet';
import { HELM_COPY } from '@apps/helm/constants';
import {
  weeksUntil,
  type AheadOfferMeta,
} from '@apps/helm/engine/researchAhead';
import {
  markAheadShown,
  notNowAhead,
} from '@apps/helm/store/actions/aheadActions';
import type { OpenProject } from '@apps/helm/types';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

interface AheadOfferCardProps {
  project: OpenProject;
  offer: AheadOfferMeta;
  /** The person's day as a date-only UTC midnight. */
  today: number;
  /** Set on Today: the first showing stamps the offer, so Today offers it once. */
  dayKey?: string;
}

/** Research offered ahead of a project's date, in the offer card's dashed look: Ask me a few things first opens the questions, and Not now sits apart below a hairline. */
function AheadOfferCard({
  project,
  offer,
  today,
  dayKey,
}: AheadOfferCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const marked = useRef<string | null>(null);
  const ask = project.aheadAsks?.[offer.id] ?? null;

  useEffect(() => {
    if (!user || !dayKey || marked.current === offer.id) return;
    marked.current = offer.id;
    markAheadShown(user.uid, project.id, offer.id, dayKey)?.catch(
      (error: unknown) =>
        console.error('Helm ahead offer was not marked', error),
    );
  }, [user, dayKey, project.id, offer.id]);

  if (!ask || project.targetDate === null) return null;

  const notNow = () => {
    if (!user) return;
    const result = notNowAhead(user.uid, project.id, offer.id, today);
    if (!result) return;
    addToast({ title: HELM_COPY.aheadNotNowToast(result.weeks), type: 'info' });
    result.written.catch((error: unknown) => {
      console.error('Helm ahead offer was not saved', error);
      addToast({ title: HELM_COPY.aheadActionFailed, type: 'error' });
    });
  };

  return (
    <section className='helm-card border-primary/40! w-full space-y-3 border-dashed! p-4'>
      <p className='text-foreground text-[15px] leading-[21px] font-medium text-pretty break-words'>
        {HELM_COPY.aheadStatement(ask.subject, project.name)}
      </p>
      <ul className='space-y-1.5'>
        <li className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'>
          <CalendarDays
            className='mt-0.5 size-3.5 shrink-0'
            aria-hidden='true'
          />
          <span className='min-w-0 break-words'>
            {HELM_COPY.aheadDateReason(
              formatWeekdayDayUTC(project.targetDate),
              weeksUntil(project.targetDate, today),
              project.name,
            )}
          </span>
        </li>
        {ask.whyNow && (
          <li className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'>
            <Lightbulb
              className='mt-0.5 size-3.5 shrink-0'
              aria-hidden='true'
            />
            <span className='min-w-0 break-words'>{ask.whyNow}</span>
          </li>
        )}
      </ul>
      <Button type='button' className='w-full' onClick={() => setIsOpen(true)}>
        {HELM_COPY.aheadAsk}
      </Button>
      <div className='border-border flex justify-center border-t pt-3'>
        <Button type='button' variant='outline' size='sm' onClick={notNow}>
          {HELM_COPY.aheadNotNow}
        </Button>
      </div>
      <AheadSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        project={project}
        offer={offer}
        ask={ask}
      />
    </section>
  );
}

export default AheadOfferCard;
