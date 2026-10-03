import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ModalFooterActions from '@/components/ModalFooterActions';
import { ANNOUNCEMENT_SEVERITY_LABELS } from '@apps/waypoint/constants';
import type { AnnouncementSeverity } from '@apps/waypoint/types';

interface AnnouncementExpiry {
  enabled: boolean;
  date: string;
  time: string;
}

interface AnnouncementFormData {
  severity: AnnouncementSeverity;
  title: string;
  body: string;
  expiry: AnnouncementExpiry;
}

interface AnnouncementFormModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onSubmit: (fields: {
    severity: AnnouncementSeverity;
    title: string;
    body: string;
    expiresAt: number | null;
  }) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input, select, textarea } = FormFactories;

const severityOptions = Object.entries(ANNOUNCEMENT_SEVERITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const INITIAL_DATA: AnnouncementFormData = {
  severity: 'INFO',
  title: '',
  body: '',
  expiry: { enabled: false, date: '', time: '' },
};

function getExpiresAt(expiry: AnnouncementExpiry) {
  return expiry.enabled ? fromLocalDateAndTimeInputValues(expiry.date, expiry.time) : null;
}

function AnnouncementFormModal({
  isOpen,
  isSubmitting = false,
  onSubmit,
  onClose,
}: AnnouncementFormModalProps) {
  const [formData, setFormData] = useState<AnnouncementFormData>(INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);

  const isFormComplete =
    formData.title.trim() !== '' &&
    formData.body.trim() !== '' &&
    getExpiresAt(formData.expiry) !== undefined;

  const fields = useMemo(
    () => [
      select({ name: 'severity', label: 'Type', options: severityOptions }),
      input({ name: 'title', label: 'Title', variant: 'outline' }),
      textarea({ name: 'body', label: 'Message', rows: 3, variant: 'outline' }),
      custom({
        name: 'expiry',
        label: 'Expires',
        renderComponent: (props) => {
          const expiry = props.value as AnnouncementExpiry;

          if (!expiry.enabled) {
            return (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => {
                  const now = Date.now();
                  props.onValueChange({
                    enabled: true,
                    date: toLocalDateInputValue(now),
                    time: toLocalTimeInputValue(now),
                  });
                }}
              >
                + Add expiry
              </Button>
            );
          }

          return (
            <div className='space-y-2'>
              <div className='flex gap-2'>
                <Input
                  type='date'
                  variant='outline'
                  value={expiry.date}
                  onChange={(changeEvent) =>
                    props.onValueChange({ ...expiry, date: changeEvent.target.value })
                  }
                />
                <Input
                  type='time'
                  variant='outline'
                  value={expiry.time}
                  onChange={(changeEvent) =>
                    props.onValueChange({ ...expiry, time: changeEvent.target.value })
                  }
                />
              </div>
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => props.onValueChange(INITIAL_DATA.expiry)}
              >
                Remove expiry
              </Button>
            </div>
          );
        },
      }),
    ],
    [],
  );

  const handleSubmit = async (data: AnnouncementFormData) => {
    const expiresAt = getExpiresAt(data.expiry);
    if (expiresAt === undefined) {
      setError('Choose a valid expiry date, or remove it.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        severity: data.severity,
        title: data.title,
        body: data.body,
        expiresAt,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to post this announcement.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Announcement'>
      <Form
        id='waypoint-announcement'
        form={fields}
        initialData={INITIAL_DATA}
        columns={1}
        onDataChange={(data) => setFormData(data as AnnouncementFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as AnnouncementFormData);
        }}
        submitButton={
          <ModalFooterActions
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete}
                >
                  Post
                </Button>
              </>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default AnnouncementFormModal;
