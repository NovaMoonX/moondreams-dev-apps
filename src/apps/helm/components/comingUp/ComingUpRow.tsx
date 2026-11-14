import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import { HELM_COPY } from '@apps/helm/constants';
import { formatDayLabel } from '@apps/helm/utils/keyDateText';
import type { UpcomingKeyDate } from '@apps/helm/utils/keyDateUpcoming';

interface ComingUpRowProps {
  date: UpcomingKeyDate;
  onOpen: (whoId: string) => void;
}

const toDayWord = (date: UpcomingKeyDate) =>
  date.days === 0
    ? HELM_COPY.comingUpToday
    : date.days === 1
      ? HELM_COPY.comingUpTomorrow
      : formatDayLabel(date.date);

const toCountWord = (date: UpcomingKeyDate) =>
  date.count === null
    ? null
    : date.kind === 'birthday'
      ? HELM_COPY.comingUpAge(date.count)
      : HELM_COPY.comingUpYears(date.count);

/** One date: "Thu, Nov 12 · Maya's birthday · turns 32". Opens the page of whose it is. */
function ComingUpRow({ date, onOpen }: ComingUpRowProps) {
  const line = [toDayWord(date), date.title, toCountWord(date)]
    .filter(Boolean)
    .join(' · ');
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(date.whoId)}
    >
      <PrivateTitle
        kind='fact'
        record={{ id: date.id, subjectIds: [date.whoId] }}
        className='text-foreground flex-1 text-[15px] leading-[21px]'
      >
        {line}
      </PrivateTitle>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default ComingUpRow;
