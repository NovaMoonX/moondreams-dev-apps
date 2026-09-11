import { Button, Input, Modal, Toggle } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import type { VetClinic } from '@apps/nine-lives/types';

interface VetClinicFormValues {
  name: string;
  phone?: string;
  address?: string;
  isEmergency24Hour: boolean;
  notes?: string;
}

interface VetClinicFormModalProps {
  isOpen: boolean;
  initialClinic?: Partial<VetClinic> | null;
  isSubmitting?: boolean;
  onSubmit: (clinic: VetClinicFormValues) => Promise<void> | void;
  onClose?: () => void;
}

function VetClinicFormModal({
  isOpen,
  initialClinic,
  isSubmitting = false,
  onSubmit,
  onClose,
}: VetClinicFormModalProps) {
  const [name, setName] = useState(initialClinic?.name ?? '');
  const [phone, setPhone] = useState(initialClinic?.phone ?? '');
  const [address, setAddress] = useState(initialClinic?.address ?? '');
  const [notes, setNotes] = useState(initialClinic?.notes ?? '');
  const [isEmergency24Hour, setIsEmergency24Hour] = useState(
    Boolean(initialClinic?.isEmergency24Hour),
  );

  const handleSubmit = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    await onSubmit({
      name: trimmedName,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      isEmergency24Hour,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title={initialClinic?.id ? 'Edit clinic' : 'Add clinic'}
    >
      <div className='space-y-4'>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder='Clinic name'
          aria-label='Clinic name'
          name='vet-clinic-name'
        />
        <Input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder='Phone number'
          aria-label='Clinic phone'
          name='vet-clinic-phone'
        />
        <Input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder='Address'
          aria-label='Clinic address'
          name='vet-clinic-address'
        />
        <div className='flex items-center justify-between rounded-md border border-border bg-background px-3 py-2'>
          <div>
            <p className='font-medium'>24-hour emergency clinic</p>
            <p className='text-muted-foreground text-xs'>Available for urgent overnight care.</p>
          </div>
          <Toggle
            checked={isEmergency24Hour}
            onCheckedChange={(checked) => setIsEmergency24Hour(Boolean(checked))}
          />
        </div>
        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder='Notes (optional)'
          aria-label='Clinic notes'
          name='vet-clinic-notes'
        />
        <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim()} className='w-full'>
          {isSubmitting ? 'Saving…' : initialClinic?.id ? 'Save clinic' : 'Add clinic'}
        </Button>
      </div>
    </Modal>
  );
}

export default VetClinicFormModal;
