import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  createFeedbackGroup,
  moveFeedbackToGroup,
} from '@lib/feedback/feedbackGroupWrites';
import type { FeedbackGroup } from '@lib/feedback/types';

interface FeedbackGroupSheetProps {
  isOpen: boolean;
  feedbackIds: string[];
  groups: FeedbackGroup[];
  /** The group a single item is in now, so it can be taken out. */
  currentGroupId: string | null;
  onClose: () => void;
  onDone: () => void;
}

/** Puts feedback in an existing group or a new one, or takes it out of its group. */
function FeedbackGroupSheet({
  isOpen,
  feedbackIds,
  groups,
  currentGroupId,
  onClose,
  onDone,
}: FeedbackGroupSheetProps) {
  const [choice, setChoice] = useState('');
  const [newText, setNewText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = choice === NEW_CHOICE;
  const canSave = isNew ? newText.trim().length > 0 : choice !== '';

  const handleClose = () => {
    setChoice('');
    setNewText('');
    setError(null);
    onClose();
  };

  const run = async (write: () => Promise<unknown>) => {
    setIsSaving(true);
    setError(null);
    try {
      await write();
      setChoice('');
      setNewText('');
      onDone();
    } catch {
      setError("We couldn't change the group just now. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSheet isOpen={isOpen} onClose={handleClose} title='Group'>
      <div className='space-y-4'>
        <PickOrCreate
          label='Group'
          options={groups.map((group) => ({
            value: group.id,
            label: group.name,
          }))}
          choice={choice}
          newText={newText}
          newPillLabel='New group'
          newPlaceholder='Small fixes'
          maxLength={60}
          onChange={(nextChoice, nextText) => {
            setChoice(nextChoice);
            setNewText(nextText);
          }}
        />
        {error ? <InlineNotice tone='warning'>{error}</InlineNotice> : null}
        <ModalFooterActions
          note={canSave ? undefined : 'Pick or name a group'}
          leftActions={
            currentGroupId ? (
              <Button
                type='button'
                variant='tertiary'
                disabled={isSaving}
                onClick={() =>
                  void run(() =>
                    moveFeedbackToGroup({ feedbackIds, groupId: null }),
                  )
                }
              >
                Not in a group
              </Button>
            ) : null
          }
          cancelAction={
            <Button type='button' variant='tertiary' onClick={handleClose}>
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSaving}
              disabled={!canSave}
              onClick={() =>
                void run(() =>
                  isNew
                    ? createFeedbackGroup({ name: newText, feedbackIds })
                    : moveFeedbackToGroup({ feedbackIds, groupId: choice }),
                )
              }
            >
              {currentGroupId ? 'Move' : 'Add to group'}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default FeedbackGroupSheet;
