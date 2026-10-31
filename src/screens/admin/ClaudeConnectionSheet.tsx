import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import AppToggle from '@/components/AppToggle';
import CopyTextButton from '@/components/CopyTextButton';
import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useFeedbackAutomation } from '@hooks/useFeedbackAutomation';
import {
  disconnectClaudeRoutine,
  saveClaudeRoutine,
  setFeedbackAutomation,
} from '@lib/feedback/claudeRoutine';

import {
  CLAUDE_FIRE_URL_PREFIX,
  CLAUDE_ROUTINE_PROMPT,
  CLAUDE_ROUTINES_URL,
} from './constants';

interface ClaudeConnectionSheetProps {
  isOpen: boolean;
  isConnected: boolean | null;
  onClose: () => void;
}

const isFireUrl = (value: string) => {
  const url = value.trim();
  return (
    url.startsWith(CLAUDE_FIRE_URL_PREFIX) &&
    url.endsWith('/fire') &&
    url.length > CLAUDE_FIRE_URL_PREFIX.length + '/fire'.length
  );
};

/** Where the owner connects a Claude Code routine once, so "Send to Claude" starts a session instead of copying text. */
function ClaudeConnectionSheet({
  isOpen,
  isConnected,
  onClose,
}: ClaudeConnectionSheetProps) {
  const { confirm } = useActionModal();
  const [fireUrl, setFireUrl] = useState('');
  const [token, setToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOn: isAutomationOn } = useFeedbackAutomation(isOpen);
  const showUrlError = fireUrl.trim().length > 0 && !isFireUrl(fireUrl);

  const handleClose = () => {
    setFireUrl('');
    setToken('');
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await saveClaudeRoutine({ fireUrl, token });
      handleClose();
    } catch {
      setError(
        "We couldn't save that just now. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutomationChange = async (isOn: boolean) => {
    setError(null);
    try {
      await setFeedbackAutomation(isOn);
    } catch {
      setError("We couldn't change that just now. Try again.");
    }
  };

  const handleDisconnect = async () => {
    const isConfirmed = await confirm({
      title: 'Disconnect Claude',
      message:
        'This forgets the saved token. "Send to Claude" goes back to copying the feedback for you to paste.',
      confirmText: 'Disconnect',
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      await disconnectClaudeRoutine();
    } catch {
      setError("We couldn't disconnect just now. Try again.");
    }
  };

  return (
    <FormSheet isOpen={isOpen} onClose={handleClose} title='Claude connection'>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          Connect a Claude Code routine once, and &ldquo;Send to Claude&rdquo;
          starts a new session with the feedback in it. Until then it copies the
          feedback for you to paste.
        </p>

        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <div className='text-foreground text-sm font-medium'>
              Let Claude work on feedback by itself
            </div>
            <div className='text-muted-foreground text-xs'>
              New bugs and the ideas you mark Planned start a session on their
              own. Every PR stays a draft for you.
            </div>
          </div>
          <AppToggle
            aria-label='Let Claude work on feedback by itself'
            checked={isAutomationOn === true}
            disabled={!isConnected || isAutomationOn === null}
            onCheckedChange={(isOn) => void handleAutomationChange(isOn)}
          />
        </div>

        {isConnected ? (
          <div className='space-y-3'>
            <InlineNotice tone='success'>Connected</InlineNotice>
            {error ? <InlineNotice tone='warning'>{error}</InlineNotice> : null}
            <ModalFooterActions
              cancelAction={
                <Button type='button' variant='tertiary' onClick={handleClose}>
                  Close
                </Button>
              }
              rightActions={
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => void handleDisconnect()}
                >
                  Disconnect
                </Button>
              }
            />
          </div>
        ) : (
          <form
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <ol className='list-decimal space-y-4 pl-5 text-sm'>
              <li className='space-y-2'>
                <span>
                  Open{' '}
                  <a
                    href={CLAUDE_ROUTINES_URL}
                    target='_blank'
                    rel='noreferrer'
                    className='text-primary underline'
                  >
                    claude.ai/code/routines
                  </a>{' '}
                  and create a scheduled task called &ldquo;Handle
                  feedback&rdquo; on the moondreams-dev-apps repo, with no
                  schedule. Use this as its prompt.
                </span>
                <p className='bg-muted text-muted-foreground max-h-24 overflow-y-auto rounded-lg p-2 text-xs'>
                  {CLAUDE_ROUTINE_PROMPT}
                </p>
                <CopyTextButton
                  text={CLAUDE_ROUTINE_PROMPT}
                  label='Copy prompt'
                  variant='secondary'
                />
              </li>
              <li>Add an API trigger to it, then copy its URL and token.</li>
              <li>Paste them here.</li>
            </ol>

            <Field label='Trigger URL'>
              {() => (
                <Input
                  variant='outline'
                  value={fireUrl}
                  placeholder={`${CLAUDE_FIRE_URL_PREFIX}…/fire`}
                  autoComplete='off'
                  onChange={(event) => setFireUrl(event.target.value)}
                />
              )}
            </Field>
            {showUrlError ? (
              <p role='alert' className='text-destructive text-xs'>
                That doesn&apos;t look like a trigger URL. It starts with{' '}
                {CLAUDE_FIRE_URL_PREFIX} and ends with /fire.
              </p>
            ) : null}
            <Field label='Token'>
              {() => (
                <Input
                  type='password'
                  variant='outline'
                  value={token}
                  autoComplete='off'
                  onChange={(event) => setToken(event.target.value)}
                />
              )}
            </Field>
            {error ? <InlineNotice tone='warning'>{error}</InlineNotice> : null}
            <ModalFooterActions
              note={
                isFireUrl(fireUrl) && token.trim().length > 0
                  ? undefined
                  : 'Paste the URL and the token'
              }
              cancelAction={
                <Button type='button' variant='tertiary' onClick={handleClose}>
                  Cancel
                </Button>
              }
              rightActions={
                <Button
                  type='submit'
                  loading={isSaving}
                  disabled={!isFireUrl(fireUrl) || token.trim().length === 0}
                >
                  Save
                </Button>
              }
            />
          </form>
        )}
      </div>
    </FormSheet>
  );
}

export default ClaudeConnectionSheet;
