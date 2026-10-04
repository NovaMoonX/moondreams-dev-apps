import { useState } from 'react';

import { Input, Modal } from '@moondreamsdev/dreamer-ui/components';

interface JoinWithCodeModalProps {
  isOpen: boolean;
  onSubmit: (inviteCode: string) => void;
  onClose: () => void;
}

function JoinWithCodeModal({ isOpen, onSubmit, onClose }: JoinWithCodeModalProps) {
  const [code, setCode] = useState('');
  const trimmedCode = code.trim().toUpperCase();
  const isValid = trimmedCode.length > 0;

  const handleSubmit = () => {
    if (!isValid) {
      return;
    }

    onSubmit(trimmedCode);
    setCode('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Join a trip'
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: 'Find trip', onClick: handleSubmit, disabled: !isValid },
      ]}
    >
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          Got a code from a friend? Pop it in and we&apos;ll take you to the
          trip.
        </p>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleSubmit();
            }
          }}
          placeholder='Enter invite code'
          aria-label='Invite code'
          name='waypoint-join-code'
          autoComplete='off'
          autoFocus
          className='text-center font-mono tracking-[0.3em] uppercase'
        />
      </div>
    </Modal>
  );
}

export default JoinWithCodeModal;
