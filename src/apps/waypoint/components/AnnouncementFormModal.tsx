import { useState } from 'react';

import { Button, Input, Label, Modal, Select, Textarea } from '@moondreamsdev/dreamer-ui/components';

import {
  fromLocalDateAndTimeInputValues,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import { ANNOUNCEMENT_SEVERITY_LABELS } from '@apps/waypoint/constants';
import type { AnnouncementSeverity } from '@apps/waypoint/types';

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

const severityOptions = Object.entries(ANNOUNCEMENT_SEVERITY_LABELS).map(([value, text]) => ({
  value,
  text,
}));

function AnnouncementFormModal({
  isOpen,
  isSubmitting = false,
  onSubmit,
  onClose,
}: AnnouncementFormModalProps) {
  const [severity, setSeverity] = useState<AnnouncementSeverity>('INFO');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryTime, setExpiryTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Enter a title and message.');
      return;
    }
    const expiresAt = hasExpiry ? fromLocalDateAndTimeInputValues(expiryDate, expiryTime) : undefined;
    if (hasExpiry && expiresAt === undefined) {
      setError('Choose a valid expiry date, or remove it.');
      return;
    }

    try {
      await onSubmit({ severity, title, body, expiresAt: hasExpiry ? (expiresAt as number) : null });
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to post this announcement.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Announcement'>
      <div className='space-y-4'>
        <div className='space-y-1.5'>
          <Label>Type</Label>
          <Select
            options={severityOptions}
            value={severity}
            onChange={(value) => setSeverity(value as AnnouncementSeverity)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>Title</Label>
          <Input value={title} onChange={(changeEvent) => setTitle(changeEvent.target.value)} />
        </div>
        <div className='space-y-1.5'>
          <Label>Message</Label>
          <Textarea rows={3} value={body} onChange={(changeEvent) => setBody(changeEvent.target.value)} />
        </div>
        {hasExpiry ? (
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <Label>Expires</Label>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => {
                  setHasExpiry(false);
                  setExpiryDate('');
                  setExpiryTime('');
                }}
              >
                Remove
              </Button>
            </div>
            <div className='flex gap-2'>
              <Input type='date' value={expiryDate} onChange={(changeEvent) => setExpiryDate(changeEvent.target.value)} />
              <Input type='time' value={expiryTime} onChange={(changeEvent) => setExpiryTime(changeEvent.target.value)} />
            </div>
          </div>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={() => {
              setHasExpiry(true);
              const now = Date.now();
              setExpiryDate(toLocalDateInputValue(now));
              setExpiryTime(toLocalTimeInputValue(now));
            }}
          >
            + Add expiry
          </Button>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='button' loading={isSubmitting} onClick={() => void handleSubmit()}>
                Post
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default AnnouncementFormModal;
