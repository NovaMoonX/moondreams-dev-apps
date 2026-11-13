import { useState } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import {
  BILLS_NOTICED_WORDS,
  RECURRING_SHEET_WORDS,
} from '@apps/runway/constants';
import type { RecurringHint } from '@apps/runway/engine/recurring';
import LinkBankScreen from '@apps/runway/screens/link/LinkBankScreen';
import { cleanBankName } from '@apps/runway/utils/accountText';
import { dismissRecurring } from '@apps/runway/utils/recurringDismissed';
import {
  describeStreamHow,
  getStreamName,
} from '@apps/runway/utils/recurringText';

interface RecurringPlaceSheetProps {
  hint: Extract<RecurringHint, { kind: 'place' }>;
  onClose: () => void;
}

/** An account the bank sees repeating charges on that is not in the plan: lists them, and "Add it to my plan" goes to the bank's account choice. */
function RecurringPlaceSheet({ hint, onClose }: RecurringPlaceSheetProps) {
  const { providerAccount, streams } = hint;
  const link = useAppSelector(
    (state) =>
      state.runway.links.find((entry) => entry.id === providerAccount.linkId) ??
      null,
  );
  const [isAdding, setIsAdding] = useState(false);
  const name = BILLS_NOTICED_WORDS.placeName(
    cleanBankName(providerAccount.name),
    providerAccount.mask,
  );

  if (isAdding && link) {
    return <LinkBankScreen addTo={link} onClose={onClose} />;
  }

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={RECURRING_SHEET_WORDS.accountTitle(name)}
      actions={<ValuesEyeButton />}
      footer={
        <div className='space-y-2 p-4'>
          {link?.status === 'active' && (
            <Button
              type='button'
              className='w-full'
              onClick={() => setIsAdding(true)}
            >
              {RECURRING_SHEET_WORDS.addAccount}
            </Button>
          )}
          <Button
            type='button'
            variant='tertiary'
            className='w-full'
            onClick={() => {
              dismissRecurring(hint.key);
              onClose();
            }}
          >
            {RECURRING_SHEET_WORDS.keepOut}
          </Button>
        </div>
      }
    >
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {RECURRING_SHEET_WORDS.accountIntro}
        </p>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {streams.map((stream) => (
            <li key={stream.streamId} className='p-3 text-sm break-words'>
              <span className='block font-medium'>{getStreamName(stream)}</span>
              <span className='text-muted-foreground block'>
                <SensitiveValue>{formatCents(stream.lastCents)}</SensitiveValue>{' '}
                {describeStreamHow(stream)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DetailSheet>
  );
}

export default RecurringPlaceSheet;
