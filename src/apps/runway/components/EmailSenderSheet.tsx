import { useState } from 'react';

import { Filter } from 'lucide-react';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import { formatDateOrdinal } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import {
  useEmailActions,
  useEmailFilters,
} from '@apps/runway/hooks/useEmailPurchases';
import {
  isSenderFiltered,
  type EmailSender,
} from '@apps/runway/utils/emailSenders';

interface EmailSenderSheetProps {
  sender: EmailSender;
  onClose: () => void;
}

/** One sender: its address, how much it has sent and a way to filter out everything it sends. */
function EmailSenderSheet({ sender, onClose }: EmailSenderSheetProps) {
  const { confirm } = useActionModal();
  const actions = useEmailActions();
  const filters = useEmailFilters();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCovered = isSenderFiltered(filters, sender.address);

  const filterOut = async () => {
    if (sender.hasPurchase) {
      const isAccepted = await confirm({
        title: EMAIL_WORDS.senderStopTitle(sender.address),
        message: EMAIL_WORDS.senderStopMessage,
        confirmText: EMAIL_WORDS.senderStopConfirm,
        destructive: true,
      });
      if (!isAccepted) return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await actions.createFilter({
        fromAddress: sender.address,
        subjectTemplate: null,
        subjectContains: [],
        bodyContains: [],
      });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, EMAIL_WORDS.saveFailed));
      setIsSaving(false);
    }
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={EMAIL_WORDS.senderTitle}
    >
      <div className='space-y-4 pb-4'>
        <div>
          <p className='text-lg font-semibold break-words'>
            {sender.name ?? sender.address}
          </p>
          {sender.name !== null && (
            <p className='text-muted-foreground text-sm break-words'>
              {sender.address}
            </p>
          )}
          <p className='text-muted-foreground text-sm'>
            {EMAIL_WORDS.senderDetail(
              sender.count,
              formatDateOrdinal(sender.lastAt),
            )}
          </p>
        </div>
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        {isCovered ? (
          <p className='text-muted-foreground text-sm'>
            {EMAIL_WORDS.senderCovered}
          </p>
        ) : (
          <ActionRow
            isRoomy
            icon={<Filter />}
            label={
              sender.hasPurchase
                ? EMAIL_WORDS.senderStop
                : EMAIL_WORDS.senderFilterOut
            }
            subtitle={
              sender.hasPurchase
                ? EMAIL_WORDS.senderHadPurchases
                : EMAIL_WORDS.senderFilterSub
            }
            isDisabled={isSaving}
            onClick={() => void filterOut()}
          />
        )}
      </div>
    </FormSheet>
  );
}

export default EmailSenderSheet;
