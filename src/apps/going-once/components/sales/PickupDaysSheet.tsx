import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DaysPicker from '@/components/DaysPicker';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { getLocalToday } from '@/utils/dayRunUtils';
import { MAX_PICKUP_DAYS } from '@apps/going-once/constants';
import { updateSalePickupDays } from '@apps/going-once/store/actions/saleActions';
import { getUpcomingDays } from '@apps/going-once/utils/pickupDays';

const SAVE_FAILED = "That didn't save. Check your connection and try again.";
/** An offline write never settles, so after this long it counts as kept on the device and the sheet closes. */
const QUEUED_AFTER_MS = 2000;

interface PickupDaysSheetProps {
  saleId: string;
  value: number[];
  /** The sale's time zone, so a day passes when it does for buyers. */
  timeZone: string | null;
  onClose: () => void;
}

/** The days the sellers can hand things over, on a calendar; written on Done, and only when they changed. */
function PickupDaysSheet({
  saleId,
  value,
  timeZone,
  onClose,
}: PickupDaysSheetProps) {
  const { addToast } = useToast();
  const [now] = useState(() => Date.now());
  const [upcoming] = useState(() => getUpcomingDays(value, now, timeZone));
  const [draft, setDraft] = useState(upcoming);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChanged = draft.join() !== upcoming.join();
  const requestClose = useDiscardGuard({
    isDirty: isChanged,
    isBusy: isSaving,
    onClose,
    title: 'Discard these changes?',
    message: 'Buyers keep seeing the pickup days you had before.',
  });

  const done = async () => {
    if (isSaving) return;
    if (!isChanged) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    const write = updateSalePickupDays(saleId, draft);
    const outcome = await Promise.race([
      write.then(
        () => 'saved' as const,
        () => 'failed' as const,
      ),
      new Promise<'queued'>((resolve) =>
        window.setTimeout(() => resolve('queued'), QUEUED_AFTER_MS),
      ),
    ]);
    if (outcome === 'failed') {
      setIsSaving(false);
      setError(SAVE_FAILED);
      return;
    }
    if (outcome === 'queued')
      write.catch(() =>
        addToast({
          title: "Pickup days didn't save",
          description: 'Open them and try again.',
          type: 'error',
        }),
      );
    onClose();
  };

  return (
    <FormSheet isOpen onClose={requestClose} title='Pickup days'>
      <div className='space-y-3 pb-4'>
        <p className='text-muted-foreground text-sm text-pretty'>
          Buyers pick the ones that work when they ask.
        </p>
        <DaysPicker
          days={draft}
          onChange={setDraft}
          minDay={getLocalToday(now, timeZone)}
          maxDays={MAX_PICKUP_DAYS}
        />
      </div>
      <ModalFooterActions
        note={error}
        rightActions={
          <Button type='button' disabled={isSaving} onClick={() => void done()}>
            Done
          </Button>
        }
      />
    </FormSheet>
  );
}

export default PickupDaysSheet;
