import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { GraduationCap } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { formatDateShort } from '@/utils/formatUtils';
import { useLearnTaps } from '@apps/helm/components/research/useLearnTaps';
import { HELM_COPY } from '@apps/helm/constants';
import { LEARN_MINUTES, type LearnSlot } from '@apps/helm/engine/learnLater';
import {
  keepStillLearn,
  markLearnOffered,
  notNowLearn,
  showLearn,
} from '@apps/helm/store/actions/learnLaterActions';
import type { OpenResearch } from '@apps/helm/types';

interface LearnCardProps {
  item: OpenResearch;
  /** `still` after three Not nows: the card asks whether it is still wanted instead of offering it. */
  ask: 'offer' | 'still';
  slot: LearnSlot | null;
  dayKey: string;
  onOpen: (itemId: string) => void;
}

/** A saved question offered for a free half hour: dashed like a suggestion, Show me the one next step and Not now below a hairline. After three Not nows it asks Keep it or Remove it the same way. */
function LearnCard({ item, ask, slot, dayKey, onOpen }: LearnCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const taps = useLearnTaps();
  const marked = useRef<string | null>(null);
  const isStill = ask === 'still';

  useEffect(() => {
    if (!user || item.offeredOn === dayKey || marked.current === item.id)
      return;
    marked.current = item.id;
    markLearnOffered(user.uid, item, dayKey).catch((error: unknown) =>
      console.error('Helm learn later offer was not marked', error),
    );
  }, [user, item, dayKey]);

  const write = (change: Promise<unknown>, onDone?: () => void) =>
    change.then(onDone).catch((error: unknown) => {
      console.error('Helm learn later change was not saved', error);
      addToast({ title: HELM_COPY.learnActionFailed, type: 'error' });
    });

  const show = () => {
    if (!user) return;
    void write(showLearn(user.uid, item, slot), () => onOpen(item.id));
  };
  const notNow = () => {
    if (!user) return;
    void write(notNowLearn(user.uid, item, slot), () =>
      addToast({ title: HELM_COPY.learnNotNowLine, type: 'info' }),
    );
  };
  const keep = () => {
    if (!user) return;
    void write(keepStillLearn(user.uid, item));
  };

  return (
    <section className='helm-card space-y-3 border-dashed! border-[var(--helm-verdigris)]! p-4'>
      <div className='flex items-start gap-3'>
        <GraduationCap
          className='text-muted-foreground mt-0.5 size-5 shrink-0'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1 space-y-0.5'>
          <p className='text-foreground text-[15px] leading-[21px] font-medium text-pretty break-words'>
            {isStill
              ? HELM_COPY.learnStill(item.subject)
              : HELM_COPY.learnCardTitle(item.subject)}
          </p>
          {!isStill && (
            <p className='text-foreground text-[15px] leading-[21px] text-pretty'>
              {HELM_COPY.learnCardLine}
            </p>
          )}
          <p className='text-muted-foreground text-[13px] leading-[18px]'>
            {HELM_COPY.learnCardMeta(
              LEARN_MINUTES,
              formatDateShort(item.createdAt),
            )}
          </p>
        </div>
      </div>
      <Button
        type='button'
        className='w-full'
        disabled={taps.isBusy}
        onClick={isStill ? keep : show}
      >
        {isStill ? HELM_COPY.learnKeepIt : HELM_COPY.learnShowMe}
      </Button>
      <div className='border-border flex justify-center border-t pt-3'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={taps.isBusy}
          onClick={isStill ? () => void taps.remove(item) : notNow}
        >
          {isStill ? HELM_COPY.learnRemoveIt : HELM_COPY.learnNotNow}
        </Button>
      </div>
    </section>
  );
}

export default LearnCard;
