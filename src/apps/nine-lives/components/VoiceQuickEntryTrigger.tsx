import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic, Square } from 'lucide-react';

interface VoiceQuickEntryTriggerProps {
  isListening: boolean;
  isExtracting: boolean;
  isSupported: boolean;
  /** 'flat' sits inline with a label always shown; 'floating' is icon-only below the `sm` breakpoint. */
  variant: 'flat' | 'floating';
  onClick: () => void;
  buttonClassName?: string;
}

function VoiceQuickEntryTrigger({
  isListening,
  isExtracting,
  isSupported,
  variant,
  onClick,
  buttonClassName,
}: VoiceQuickEntryTriggerProps) {
  const isFlat = variant === 'flat';

  return (
    <Button
      type='button'
      variant='outline'
      size={isFlat ? 'sm' : 'icon'}
      aria-label={isListening ? 'Stop voice entry' : 'Start voice entry'}
      title={
        isSupported
          ? isListening
            ? 'Stop voice entry'
            : 'Voice entry'
          : 'Voice entry is not supported in this browser'
      }
      disabled={!isSupported || isExtracting}
      className={join('gap-1', buttonClassName)}
      onClick={onClick}
    >
      {isListening ? (
        <Square className='h-4 w-4' />
      ) : (
        <Mic className='h-4 w-4' />
      )}
      <span className={isFlat ? undefined : 'hidden sm:inline'}>
        {isListening ? 'Stop' : 'Voice'}
      </span>
    </Button>
  );
}

export default VoiceQuickEntryTrigger;
