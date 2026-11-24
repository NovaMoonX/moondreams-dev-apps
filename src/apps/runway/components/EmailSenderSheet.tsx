import { useState } from 'react';

import { Filter } from 'lucide-react';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import { formatDateOrdinal } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import EmailAddressText from '@apps/runway/components/EmailAddressText';
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
  const { addToast } = useToast();
  const actions = useEmailActions();
  const filters = useEmailFilters();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCovered = isSenderFiltered(filters, sender.address);

  const filterOut = async () => {
    if (sender.hasPurchase) {
      const isAccepted = await confirm({
        title: EMAIL_WORDS.senderFilterOutTitle(sender.address),
        message: EMAIL_WORDS.senderFilterOutMessage,
        confirmText: EMAIL_WORDS.senderFilterOutConfirm,
        destructive: true,
      });
      if (!isAccepted) return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const filterId = await actions.createFilter({
        fromAddress: sender.address,
        subjectTemplate: null,
        subjectContains: [],
        bodyContains: [],
      });
      addToast({
        title: EMAIL_WORDS.filteredOut(sender.address),
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: EMAIL_WORDS.undo,
          onClick: () =>
            void actions.deleteFilter(filterId).catch((undoError: unknown) =>
              addToast({
                title: EMAIL_WORDS.filterUndoFailed,
                description: getErrorMessage(undoError, ''),
                type: 'error',
              }),
            ),
        },
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
      title={sender.name ?? sender.address}
    >
      <div className='space-y-4 pb-4'>
        <div>
          {sender.name !== null && (
            <p className='text-muted-foreground text-sm break-words'>
              <EmailAddressText address={sender.address} />
            </p>
          )}
          <p className='text-muted-foreground text-sm'>
            {EMAIL_WORDS.senderDetail(
              sender.kind,
              sender.company?.toLowerCase() === sender.name?.toLowerCase()
                ? null
                : sender.company,
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
            isDestructive={sender.hasPurchase}
            icon={<Filter />}
            label={EMAIL_WORDS.senderFilterOut}
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
