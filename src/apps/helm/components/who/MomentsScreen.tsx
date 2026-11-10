import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { formatMoment } from '@/utils/yearlyDateUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenWho } from '@apps/helm/types';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { toKeyDateTitleWord } from '@apps/helm/utils/keyDateText';
import { groupMoments, type WhoMoment } from '@apps/helm/utils/moments';

interface MomentsScreenProps {
  who: OpenWho;
  /** Every moment of the who, newest first, already read by the page. */
  moments: WhoMoment[];
  isLoaded: boolean;
  hasFailed: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}

const ROW_HEIGHT = 60;

/** The month and day under a year's heading: "Jan 15", "Mar"; none for a moment known only to the year. */
const rowDate = (moment: WhoMoment) =>
  moment.month === null
    ? null
    : new Date(
        Date.UTC(2000, moment.month - 1, moment.day ?? 1),
      ).toLocaleDateString('en-US', {
        month: 'short',
        day: moment.precision === 'day' ? 'numeric' : undefined,
        timeZone: 'UTC',
      });

function MomentRow({
  moment,
  onOpen,
}: {
  moment: WhoMoment;
  onOpen: (id: string) => void;
}) {
  const when = rowDate(moment);
  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
        onClick={() => onOpen(moment.id)}
      >
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-[15px] leading-[21px] break-words'>
            {toKeyDateTitleWord(moment.kind, moment.label)}
          </span>
          {when && (
            <span className='text-muted-foreground block text-[13px] break-words'>
              {when}
            </span>
          )}
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
}

/** All of one who's moments, by decade and then year, each decade mounted as it nears the screen; nothing more is read. */
function MomentsScreen({
  who,
  moments,
  isLoaded,
  hasFailed,
  onOpen,
  onClose,
}: MomentsScreenProps) {
  const assistant = useAssistantName();
  const groups = groupMoments(moments);
  const isEmpty = isLoaded && moments.length === 0 && who.momentCount === 0;
  return (
    <Subview
      overlay
      isTitleWrapped
      title={HELM_COPY.momentsScreenTitle(who.name)}
      onClose={onClose}
    >
      {hasFailed && (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.momentsFailed}
        </p>
      )}
      {!hasFailed && !isEmpty && moments.length === 0 && (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.momentsLoading}
        </p>
      )}
      {isEmpty && (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.momentsEmpty(assistant)}
        </p>
      )}
      <div className='space-y-4'>
        {groups.map((group, index) => (
          <section key={group.decade} className='space-y-2'>
            <SectionDivider label={`${group.decade}s`} />
            <LazyMount
              eager={index === 0}
              estimatedHeight={
                ROW_HEIGHT *
                (group.sometime.length +
                  group.years.reduce(
                    (sum, year) => sum + year.moments.length,
                    0,
                  ))
              }
            >
              <div className='space-y-3'>
                {group.years.map((year) => (
                  <div key={year.year} className='space-y-1'>
                    <h2 className='text-muted-foreground text-[13px] font-medium'>
                      {year.year}
                    </h2>
                    <ul className='helm-card divide-border divide-y overflow-hidden'>
                      {year.moments.map((moment) => (
                        <MomentRow
                          key={moment.id}
                          moment={moment}
                          onOpen={onOpen}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
                {group.sometime.length > 0 && (
                  <div className='space-y-1'>
                    <h2 className='text-muted-foreground text-[13px] font-medium'>
                      {HELM_COPY.momentDecade(
                        formatMoment({
                          precision: 'decade',
                          month: null,
                          day: null,
                          year: group.decade,
                        }),
                      )}
                    </h2>
                    <ul className='helm-card divide-border divide-y overflow-hidden'>
                      {group.sometime.map((moment) => (
                        <MomentRow
                          key={moment.id}
                          moment={moment}
                          onOpen={onOpen}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </LazyMount>
          </section>
        ))}
      </div>
    </Subview>
  );
}

export default MomentsScreen;
