import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

interface PersonalPaymentPromptProps {
  title: string | null;
  isSubmitting?: boolean;
  error?: string | null;
  onMarkPaid: () => void;
  onClose: () => void;
}

/** The payment step after a personal expense is added: paid already, or not yet. */
function PersonalPaymentPrompt({ title, isSubmitting = false, error = null, onMarkPaid, onClose }: PersonalPaymentPromptProps) {
  return (
    <Modal isOpen={title !== null} onClose={onClose} title='Payment'>
      <p className='text-muted-foreground mb-4 text-sm'>
        Added <strong className='text-foreground'>{title}</strong>. Has it been paid already?
      </p>
      {error && <p className='text-destructive mb-3 text-sm'>{error}</p>}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='secondary' onClick={onClose}>
          Not yet
        </Button>
        <Button type='button' loading={isSubmitting} disabled={isSubmitting} onClick={onMarkPaid}>
          Mark paid
        </Button>
      </div>
    </Modal>
  );
}

export default PersonalPaymentPrompt;
