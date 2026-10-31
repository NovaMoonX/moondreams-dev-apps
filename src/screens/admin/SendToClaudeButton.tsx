import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ExternalLinkText from '@/components/ExternalLinkText';
import InlineNotice from '@/components/InlineNotice';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { useClaudeRoutineStatus } from '@hooks/useClaudeRoutineStatus';
import { sendFeedbackToClaude } from '@lib/feedback/sendToClaude';

import { CLAUDE_CODE_URL } from './constants';

interface SendToClaudeButtonProps {
  target: { feedbackIds: string[] } | { groupId: string };
  /** The last session this was sent to. */
  lastSessionUrl: string | null;
  onOpenSettings: () => void;
  /** A quiet action among details, where the group card's is the filled primary. */
  isQuiet?: boolean;
}

type Outcome =
  | { kind: 'opened'; url: string }
  | { kind: 'copied' }
  | { kind: 'error'; message: string };

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "We couldn't reach Claude just now. Try again in a minute.";

/** Starts a new Claude Code session with one piece of feedback or a group, or copies the handoff when no routine is connected. */
function SendToClaudeButton({
  target,
  lastSessionUrl,
  onOpenSettings,
  isQuiet = false,
}: SendToClaudeButtonProps) {
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const { isConnected } = useClaudeRoutineStatus(true);
  const [isSending, setIsSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const sessionUrl = outcome?.kind === 'opened' ? outcome.url : lastSessionUrl;

  const handleSend = async () => {
    if (sessionUrl) {
      const isConfirmed = await confirm({
        title: 'Start another session?',
        message: 'This was already sent to Claude.',
        confirmText: 'Start another',
      });
      if (!isConfirmed) return;
    }
    // Opened on the tap itself: a tab opened after the wait is blocked on iOS Safari.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setIsSending(true);
    setOutcome(null);
    try {
      const result = await sendFeedbackToClaude(target);
      if (result.sessionUrl) {
        if (tab) tab.location.href = result.sessionUrl;
        setOutcome({ kind: 'opened', url: result.sessionUrl });
        return;
      }
      await copyToClipboard(result.text);
      if (tab) tab.location.href = CLAUDE_CODE_URL;
      addToast({
        title: 'Copied. Paste it into a new session.',
        type: 'success',
      });
      setOutcome({ kind: 'copied' });
    } catch (error) {
      tab?.close();
      setOutcome({ kind: 'error', message: getErrorMessage(error) });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className='space-y-2'>
      <Button
        type='button'
        variant={isQuiet ? 'tertiary' : 'primary'}
        className={isQuiet ? 'w-full justify-start px-0!' : 'w-full'}
        loading={isSending}
        onClick={() => void handleSend()}
      >
        Send to Claude
      </Button>
      {isConnected === false ? (
        <p className='text-muted-foreground text-xs'>
          Claude isn&apos;t connected yet, so this copies it for you to paste.
        </p>
      ) : null}
      {outcome?.kind === 'opened' ? (
        <p className='flex items-center gap-2 text-sm' role='status'>
          <span className='shrink-0'>Opened in Claude</span>
          <ExternalLinkText href={outcome.url} label='Open session' />
        </p>
      ) : null}
      {outcome?.kind === 'copied' ? (
        <p className='text-muted-foreground text-sm' role='status'>
          Copied for you to paste.{' '}
          <Button
            type='button'
            variant='base'
            size='sm'
            className='text-primary! h-auto p-0 text-left font-normal underline'
            onClick={onOpenSettings}
          >
            Connect Claude once to skip the copy step
          </Button>
        </p>
      ) : null}
      {outcome?.kind === 'error' ? (
        <InlineNotice tone='warning'>{outcome.message}</InlineNotice>
      ) : null}
      {sessionUrl && outcome?.kind !== 'opened' ? (
        <p className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground shrink-0'>Last sent:</span>
          <ExternalLinkText href={sessionUrl} label='open session' />
        </p>
      ) : null}
    </div>
  );
}

export default SendToClaudeButton;
