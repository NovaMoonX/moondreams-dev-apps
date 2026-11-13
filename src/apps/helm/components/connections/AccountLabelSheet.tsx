import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { updateConnection } from '@/lib/connections/connectionCalls';
import { MAX_ACCOUNT_LABEL_LENGTH } from '@/lib/connections/contract';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { HELM_COPY } from '@apps/helm/constants';

interface AccountLabelSheetProps {
  isOpen: boolean;
  onClose: () => void;
  grantId: string;
  label: string | null;
}

function LabelForm({
  onClose,
  grantId,
  label,
}: Omit<AccountLabelSheetProps, 'isOpen'>) {
  const fieldId = useId();
  const isOffline = useNetworkStatus() === 'offline';
  const [value, setValue] = useState(label ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setFailure(null);
    try {
      await updateConnection({
        grantId,
        accountLabel: value.trim() === '' ? null : value.trim(),
      });
      onClose();
    } catch (error) {
      console.error('Helm account label was not saved', error);
      setFailure(HELM_COPY.googleLabelFailed);
      setIsSaving(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='space-y-1.5'>
        <label htmlFor={fieldId} className='text-sm font-medium'>
          {HELM_COPY.googleLabelField}
        </label>
        <Input
          id={fieldId}
          value={value}
          maxLength={MAX_ACCOUNT_LABEL_LENGTH}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.googleLabelHelp}
        </p>
      </div>
      {failure && (
        <p className='text-destructive text-sm text-pretty' role='alert'>
          {failure}
        </p>
      )}
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={onClose}
            disabled={isSaving}
          >
            {HELM_COPY.disconnectCancel}
          </Button>
        }
        rightActions={
          isOffline ? (
            <LockedButton
              label={HELM_COPY.googleLabelSave}
              title={HELM_COPY.connectionsNeedConnection}
            >
              <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
            </LockedButton>
          ) : (
            <Button
              type='button'
              loading={isSaving}
              onClick={() => void save()}
            >
              {HELM_COPY.googleLabelSave}
            </Button>
          )
        }
      />
    </div>
  );
}

/** A short name for an account ("work"), shown beside its email wherever the account is named. */
function AccountLabelSheet({ isOpen, ...form }: AccountLabelSheetProps) {
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={form.onClose}
      title={HELM_COPY.googleLabelTitle}
    >
      {isOpen && <LabelForm {...form} />}
    </FormSheet>
  );
}

export default AccountLabelSheet;
