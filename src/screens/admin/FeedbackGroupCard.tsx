import { useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import EllipsisDropdown from '@/components/EllipsisDropdown';
import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@hooks/useAuth';
import {
  deleteFeedbackGroup,
  renameFeedbackGroup,
  setGroupStatus,
} from '@lib/feedback/feedbackGroupWrites';
import { getSharedAgentSummary } from '@lib/feedback/feedbackDisplay';
import type { Feedback, FeedbackGroup } from '@lib/feedback/types';

import { CARD_CLASS } from './constants';
import FeedbackAgentRow from './FeedbackAgentRow';
import SendToClaudeButton from './SendToClaudeButton';

const { option } = DropdownMenuFactories;

const BASE_MENU_ITEMS = [
  option({ label: 'Rename group', value: 'rename' }),
  option({ label: 'Remove group', value: 'remove' }),
];
const MARK_DONE_ITEM = option({ label: 'Mark all done', value: 'done' });

interface FeedbackGroupCardProps {
  group: FeedbackGroup;
  items: Feedback[];
  onOpenSettings: () => void;
  onRemoved: () => void;
}

/** The group the list is filtered to: its name and count, renaming and removing it (the feedback stays), marking all of it done from its menu, and sending it to Claude. */
function FeedbackGroupCard({
  group,
  items,
  onOpenSettings,
  onRemoved,
}: FeedbackGroupCardProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openCount = items.filter(
    (item) => item.status !== 'done' && item.status !== 'wont-do',
  ).length;

  const agentSummary = getSharedAgentSummary(items);
  const menuItems =
    openCount > 0 ? [MARK_DONE_ITEM, ...BASE_MENU_ITEMS] : BASE_MENU_ITEMS;

  const run = async (write: () => Promise<unknown>, message: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await write();
      return true;
    } catch {
      setError(message);
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const handleRename = async () => {
    if (nameDraft === null || nameDraft.trim().length === 0) return;
    const didRename = await run(
      () => renameFeedbackGroup({ groupId: group.id, name: nameDraft }),
      "We couldn't rename the group just now. Try again.",
    );
    if (didRename) setNameDraft(null);
  };

  const handleRemove = async () => {
    const isConfirmed = await confirm({
      title: 'Remove group',
      message: `"${group.name}" goes away, and its ${items.length} ${items.length === 1 ? 'item stays' : 'items stay'} in your feedback, just not grouped.`,
      confirmText: 'Remove group',
      destructive: true,
    });
    if (!isConfirmed) return;
    const didRemove = await run(
      () =>
        deleteFeedbackGroup({
          groupId: group.id,
          feedbackIds: items.map((item) => item.id),
        }),
      "We couldn't remove the group just now. Try again.",
    );
    if (didRemove) onRemoved();
  };

  const handleMarkDone = async () => {
    if (!user) return;
    const people = new Set(
      items
        .filter((item) => item.status !== 'done' && item.status !== 'wont-do')
        .map((item) => item.authorEmail ?? item.authorName ?? item.id),
    ).size;
    const isConfirmed = await confirm({
      title: 'Mark all done',
      message: `This marks ${openCount} ${openCount === 1 ? 'item' : 'items'} done. ${people} ${people === 1 ? 'person' : 'people'} will see it marked done.`,
      confirmText: 'Mark all done',
    });
    if (!isConfirmed) return;
    await run(
      () => setGroupStatus({ group, items, uid: user.uid, status: 'done' }),
      "We couldn't mark them done just now. Try again.",
    );
  };

  return (
    <section className={CARD_CLASS} aria-label={`Group ${group.name}`}>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h3 className='font-semibold wrap-break-word'>{group.name}</h3>
          <p className='text-muted-foreground text-xs'>
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {openCount > 0 ? ` · ${openCount} open` : ''}
          </p>
        </div>
        <EllipsisDropdown
          items={menuItems}
          variant='tertiary'
          className='size-10'
          ariaLabel={`Actions for ${group.name}`}
          onItemSelect={(value) => {
            if (value === 'rename') setNameDraft(group.name);
            if (value === 'remove') void handleRemove();
            if (value === 'done') void handleMarkDone();
          }}
        />
      </div>
      <div className='mt-3 space-y-3'>
        {agentSummary ? <FeedbackAgentRow {...agentSummary} /> : null}
        <SendToClaudeButton
          target={{ groupId: group.id }}
          lastSessionUrl={group.claudeSessionUrl}
          onOpenSettings={onOpenSettings}
        />
        {error ? <InlineNotice tone='warning'>{error}</InlineNotice> : null}
      </div>

      <FormSheet
        isOpen={nameDraft !== null}
        onClose={() => setNameDraft(null)}
        title='Rename group'
      >
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            void handleRename();
          }}
        >
          <Field label='Name'>
            {() => (
              <Input
                variant='outline'
                value={nameDraft ?? ''}
                maxLength={60}
                onChange={(event) => setNameDraft(event.target.value)}
              />
            )}
          </Field>
          <ModalFooterActions
            cancelAction={
              <Button
                type='button'
                variant='tertiary'
                onClick={() => setNameDraft(null)}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isBusy}
                disabled={(nameDraft ?? '').trim().length === 0}
              >
                Rename
              </Button>
            }
          />
        </form>
      </FormSheet>
    </section>
  );
}

export default FeedbackGroupCard;
