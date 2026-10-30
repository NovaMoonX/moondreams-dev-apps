import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import InlineNotice from '@/components/InlineNotice';

interface DraftRestoredNoticeProps {
  /** Puts the form back to how it opens normally. */
  onStartOver: () => void;
  onDismiss: () => void;
}

/** Says a form came back with what was typed before the page closed, with a way to drop it that asks first. */
function DraftRestoredNotice({
  onStartOver,
  onDismiss,
}: DraftRestoredNoticeProps) {
  const { confirm } = useActionModal();

  const askToStartOver = async () => {
    const isConfirmed = await confirm({
      title: 'Start over?',
      message: 'What we kept goes away, and the form opens as new.',
      confirmText: 'Start over',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (isConfirmed) onStartOver();
  };

  return (
    <InlineNotice
      tone='info'
      onDismiss={onDismiss}
      dismissLabel='Hide this note'
    >
      <span>We kept what you typed before the app closed. </span>
      <Button
        type='button'
        variant='link'
        size='sm'
        className='h-auto p-0 align-baseline'
        onClick={() => void askToStartOver()}
      >
        Start over
      </Button>
    </InlineNotice>
  );
}

export default DraftRestoredNotice;
