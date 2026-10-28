import { useState } from 'react';
import { CalendarX } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { CONFIRM_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { undoNotArrived } from '@apps/runway/store/actions/dayActions';
import type { ListedDay } from '@apps/runway/store/selectors/runwaySelectors';

interface NotArrivedViewProps {
  day: ListedDay;
  onClose: () => void;
}

/** A day marked as not arrived: off the plan until the person puts it back. */
function NotArrivedView({ day, onClose }: NotArrivedViewProps) {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = day.sourceName ?? day.payLineName;

  const putBack = async () => {
    if (!user) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoNotArrived(user.uid, encryption, {
        payLineId: day.payLineId,
        sourceId: day.sourceId,
        expectedOn: day.on,
      });
    } catch (putError) {
      setError(
        getErrorMessage(putError, 'This did not save. Nothing was changed.'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Subview title='Income day' onClose={onClose}>
      <div className='space-y-4'>
        <div>
          <p className='line-clamp-2 text-lg font-medium break-words'>
            {title}
          </p>
          <p className='text-muted-foreground text-sm'>
            {formatDateUTC(day.on)}
          </p>
        </div>
        <EmptyCard icon={<CalendarX className='h-5 w-5' />}>
          {CONFIRM_WORDS.notArrivedLine}
        </EmptyCard>
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <Button
          type='button'
          variant='secondary'
          className='w-full'
          loading={isSaving}
          disabled={isSaving}
          onClick={() => void putBack()}
        >
          {CONFIRM_WORDS.undoNotArrived}
        </Button>
      </div>
    </Subview>
  );
}

export default NotArrivedView;
