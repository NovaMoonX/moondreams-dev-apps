import { useState } from 'react';

import { Button, Select } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { ACCOUNT_WORDS, HOLDS_PROMPT_WORDS } from '@apps/runway/constants';
import { useHoldsPrompt } from '@apps/runway/hooks/useHoldsPrompt';
import { useHoldsUndo } from '@apps/runway/hooks/useHoldsUndo';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  setAccountHolds,
  type WrittenHolds,
} from '@apps/runway/store/actions/accountActions';
import { setHoldsPrompt } from '@apps/runway/store/actions/planActions';
import { describeAccountLine } from '@apps/runway/utils/accountText';

const NO_ACCOUNT = 'none';

interface HeldInPromptScreenProps {
  onClose: () => void;
}

/** One list of the goals and envelopes no account holds, each with the account it sits in; a row left unset stays unset. Saves through the same holds write as an item's own sheet. */
function HeldInPromptScreen({ onClose }: HeldInPromptScreenProps) {
  const { user } = useAuth();
  const toastHoldsSaved = useHoldsUndo();
  const { unheld, accounts } = useHoldsPrompt();
  const [picks, setPicks] = useState<Readonly<Record<string, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = unheld.flatMap((item) =>
    picks[item.id] ? [{ item, accountId: picks[item.id] }] : [],
  );
  const requestClose = useDiscardGuard({
    isDirty: chosen.length > 0,
    isBusy: isSaving,
    onClose,
    title: HOLDS_PROMPT_WORDS.discardTitle,
    message: HOLDS_PROMPT_WORDS.discardMessage,
  });

  const save = async () => {
    if (!user || isSaving || chosen.length === 0) return;
    setIsSaving(true);
    setError(null);
    const written: WrittenHolds[] = [];
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const accountIds = Array.from(
        new Set(chosen.map((entry) => entry.accountId)),
      );
      for (const accountId of accountIds) {
        const ids = chosen
          .filter((entry) => entry.accountId === accountId)
          .map((entry) => entry.item.id);
        const result = await setAccountHolds(
          user.uid,
          encryption,
          accountId,
          (current) => Array.from(new Set([...current, ...ids])),
          accounts,
          (id) => unheld.find((item) => item.id === id)?.name ?? '',
        );
        written.push(...result);
      }
      toastHoldsSaved(HOLDS_PROMPT_WORDS.saved(chosen.length), written);
      onClose();
    } catch (saveError) {
      toastHoldsSaved(HOLDS_PROMPT_WORDS.saved(written.length), written);
      setError(
        `${HOLDS_PROMPT_WORDS.failed}. ${getErrorMessage(saveError, ACCOUNT_WORDS.failed)}`,
      );
      setIsSaving(false);
    }
  };

  const skip = async (isForGood: boolean) => {
    if (!user || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await setHoldsPrompt(
        user.uid,
        await getRunwayEncryption(user.uid),
        isForGood ? 'never' : 'later',
      );
      onClose();
    } catch (skipError) {
      setError(getErrorMessage(skipError, HOLDS_PROMPT_WORDS.skipFailed));
      setIsSaving(false);
    }
  };

  const skipButton = (label: string, note: string, isForGood: boolean) => (
    <div className='flex flex-col items-center'>
      <Button
        type='button'
        variant='tertiary'
        className='text-muted-foreground!'
        disabled={isSaving}
        onClick={() => void skip(isForGood)}
      >
        {label}
      </Button>
      <p className='text-muted-foreground text-xs'>{note}</p>
    </div>
  );

  return (
    <Subview
      overlay
      title={HOLDS_PROMPT_WORDS.screenTitle}
      onClose={requestClose}
    >
      <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
        <p className='text-muted-foreground text-sm'>
          {HOLDS_PROMPT_WORDS.subtitle}
        </p>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {unheld.map((item) => (
            <li key={item.id} className='flex items-center gap-3 p-3'>
              <ItemBadge name={item.name} emoji={item.emoji} />
              <span className='min-w-0 flex-1 text-sm font-medium break-words'>
                {item.name}
              </span>
              <Select
                className='w-40 shrink-0'
                aria-label={HOLDS_PROMPT_WORDS.accountLabel(item.name)}
                options={[
                  { text: HOLDS_PROMPT_WORDS.notSure, value: NO_ACCOUNT },
                  ...accounts.map((account) => ({
                    text: account.name,
                    value: account.id,
                    description: describeAccountLine(account),
                  })),
                ]}
                value={picks[item.id] ?? NO_ACCOUNT}
                onChange={(value) =>
                  setPicks((current) => ({
                    ...current,
                    [item.id]: value === NO_ACCOUNT ? '' : value,
                  }))
                }
              />
            </li>
          ))}
        </ul>
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <div className='flex justify-center gap-6'>
          {skipButton(
            HOLDS_PROMPT_WORDS.askLater,
            HOLDS_PROMPT_WORDS.askLaterNote,
            false,
          )}
          {skipButton(
            HOLDS_PROMPT_WORDS.dontAsk,
            HOLDS_PROMPT_WORDS.dontAskNote,
            true,
          )}
        </div>
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={requestClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSaving}
              disabled={isSaving || chosen.length === 0}
              onClick={() => void save()}
            >
              {HOLDS_PROMPT_WORDS.save}
            </Button>
          }
        />
      </div>
    </Subview>
  );
}

export default HeldInPromptScreen;
