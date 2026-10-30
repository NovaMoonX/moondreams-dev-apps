import { Button } from '@moondreamsdev/dreamer-ui/components';

import InlineNotice from '@/components/InlineNotice';

interface DraftRestoredNoticeProps {
  /** Puts the form back to how it opens normally. */
  onStartOver: () => void;
  onDismiss: () => void;
}

/** Says a form came back with what was typed before the page closed, with a way to drop it. */
function DraftRestoredNotice({
  onStartOver,
  onDismiss,
}: DraftRestoredNoticeProps) {
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
        onClick={onStartOver}
      >
        Start over
      </Button>
    </InlineNotice>
  );
}

export default DraftRestoredNotice;
