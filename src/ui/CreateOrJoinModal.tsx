import {
  Button,
  Input,
  Modal,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useState, type ReactNode } from 'react';

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface CreateOrJoinModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isSubmitting?: boolean;
  /** Lowercase singular name of the shared thing being created/joined, e.g. 'household' or 'space'. */
  noun: string;

  createDescription: string;
  /** The create tab's unique fields + submit button (a name field, a generated code display, etc). */
  createContent: ReactNode;

  joinDescription: string;
  inviteCodeLength: number;
  joinFieldName: string;
  onJoin: (inviteCode: string) => Promise<unknown> | void;
  searchJoinCode?: string | null;

  /** Worth the Wait-style post-submit state: replaces the tabs with a "request sent" message. */
  hasJoinBeenSubmitted?: boolean;
  requestSentDescription?: string;
}

/**
 * Shared create-or-join-by-code onboarding modal for mini-apps built around a
 * shared container a user creates or requests to join (Nine Lives' household,
 * Worth the Wait's space). Owns the modal, tabs, and the join tab (identical
 * across both); each app supplies its own create-tab content and terminology.
 */
function CreateOrJoinModal({
  isOpen,
  onClose,
  isSubmitting = false,
  noun,
  createDescription,
  createContent,
  joinDescription,
  inviteCodeLength,
  joinFieldName,
  onJoin,
  searchJoinCode,
  hasJoinBeenSubmitted = false,
  requestSentDescription,
}: CreateOrJoinModalProps) {
  const [joinInput, setJoinInput] = useState(searchJoinCode ?? '');
  const [joinError, setJoinError] = useState<string | null>(null);

  const nounLabel = capitalize(noun);

  const handleJoin = async () => {
    const trimmedCode = joinInput.trim();

    if (!trimmedCode) {
      setJoinError('Enter a valid invite code.');
      return;
    }

    setJoinError(null);

    try {
      await onJoin(trimmedCode);
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : `Unable to join this ${noun}.`,
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title={hasJoinBeenSubmitted ? 'Request sent' : `Create or join a ${noun}`}
      hideCloseButton={false}
    >
      {hasJoinBeenSubmitted ? (
        <div className='space-y-4 pt-4'>
          <p className='text-muted-foreground text-sm'>{requestSentDescription}</p>
        </div>
      ) : (
        <Tabs defaultValue={searchJoinCode ? 'join' : 'create'} tabsWidth='full' variant='pills'>
          <TabsList>
            <TabsTrigger value='create'>Create {nounLabel}</TabsTrigger>
            <TabsTrigger value='join'>Join {nounLabel}</TabsTrigger>
          </TabsList>

          <TabsContent value='create' className='space-y-4 pt-4'>
            <p className='text-muted-foreground text-sm'>{createDescription}</p>
            {createContent}
          </TabsContent>

          <TabsContent value='join' className='space-y-4 pt-4'>
            <p className='text-muted-foreground text-sm'>{joinDescription}</p>
            <Input
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              placeholder='Enter invite code'
              aria-label='Invite code'
              name={joinFieldName}
              autoComplete='off'
              maxLength={inviteCodeLength}
            />
            {joinError && <p className='text-destructive text-sm'>{joinError}</p>}
            <Button
              onClick={handleJoin}
              disabled={isSubmitting || !joinInput.trim()}
              className='w-full'
            >
              {isSubmitting ? 'Requesting…' : 'Request to join'}
            </Button>
          </TabsContent>
        </Tabs>
      )}
    </Modal>
  );
}

export default CreateOrJoinModal;
