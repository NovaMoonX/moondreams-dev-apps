import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import SheetHead from '@apps/runway/components/SheetHead';
import { MAX_NAME_LENGTH, SPEND_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  deleteExpense,
  renameExpense,
} from '@apps/runway/store/actions/expenseActions';
import {
  selectExpenses,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';

interface ExpenseViewProps {
  expenseId: string;
  /** The group's purchases across every date, newest first; null until read. */
  purchases: OpenPurchase[] | null;
  isFailed: boolean;
  onBack: () => void;
  onOpenPurchase: (purchaseId: string) => void;
}

/** One expense group: the total across its purchases, the purchases themselves, and the ways to rename or remove it. It changes no balance. */
function ExpenseView({
  expenseId,
  purchases,
  isFailed,
  onBack,
  onOpenPurchase,
}: ExpenseViewProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const expense = useAppSelector(selectExpenses).find(
    (entry) => entry.id === expenseId,
  );
  const looks = useAppSelector(selectItemLooks);
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (expense === undefined) {
    return (
      <div className='space-y-4'>
        <BackLink onBack={onBack} />
        <p className='text-muted-foreground text-sm'>{SPEND_WORDS.groupGone}</p>
      </div>
    );
  }

  const trimmed = name.trim();
  const total = (purchases ?? []).reduce(
    (sum, entry) => sum + entry.amountCents,
    0,
  );
  const dates = (purchases ?? []).map((entry) => entry.date);
  const first = Math.min(...dates);
  const last = Math.max(...dates);
  const fact =
    purchases === null || purchases.length === 0
      ? null
      : [
          purchases.length === 1
            ? '1 purchase'
            : `${purchases.length} purchases`,
          first === last
            ? formatDateShortUTC(first)
            : `${formatDateShortUTC(first)} to ${formatDateShortUTC(last)}`,
        ].join(' · ');

  const rename = async () => {
    if (!user || isBusy || trimmed === '') return;
    setIsBusy(true);
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await renameExpense(user.uid, encryption, expense, trimmed);
      addToast({ title: SPEND_WORDS.groupRenamed, type: 'success' });
      setIsRenaming(false);
    } catch (renameError) {
      setError(getErrorMessage(renameError, SPEND_WORDS.groupFailed));
    }
    setIsBusy(false);
  };

  const remove = async () => {
    if (!user || isBusy) return;
    const isConfirmed = await confirm({
      title: SPEND_WORDS.removeGroupTitle,
      message: SPEND_WORDS.removeGroupMessage,
      confirmText: SPEND_WORDS.removeGroupConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      await deleteExpense(user.uid, expense);
      addToast({ title: SPEND_WORDS.groupRemoved, type: 'success' });
      onBack();
    } catch (removeError) {
      setError(getErrorMessage(removeError, SPEND_WORDS.groupFailed));
      setIsBusy(false);
    }
  };

  return (
    <div className='space-y-4'>
      <BackLink onBack={onBack} />
      <SheetHead
        label={SPEND_WORDS.groupHead}
        figure={
          purchases === null
            ? undefined
            : total < 0
              ? `+${formatCents(-total)}`
              : formatCents(total)
        }
        fact={
          isFailed
            ? SPEND_WORDS.groupFailed
            : purchases === null
              ? SPEND_WORDS.groupLoading
              : fact
        }
      />
      {purchases !== null && purchases.length > 0 && (
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {purchases.map((entry) => (
            <PurchaseRow
              key={entry.id}
              purchase={entry}
              looks={looks}
              onOpen={() => onOpenPurchase(entry.id)}
            />
          ))}
        </ul>
      )}
      <ActionGroup isRoomy>
        <ActionRow
          isGrouped
          isRoomy
          icon={<Pencil />}
          label={SPEND_WORDS.renameGroup}
          isDisabled={isBusy}
          onClick={() => {
            setName(expense.name);
            setError(null);
            setIsRenaming(true);
          }}
        />
      </ActionGroup>
      {error && !isRenaming && (
        <p className='text-destructive text-sm' role='alert'>
          {mask(error)}
        </p>
      )}
      <ActionRow
        isRoomy
        isDestructive
        icon={<Trash2 />}
        label={SPEND_WORDS.removeGroup}
        isDisabled={isBusy}
        onClick={() => void remove()}
      />
      {isRenaming && (
        <FormSheet
          isOpen
          onClose={() => setIsRenaming(false)}
          title={SPEND_WORDS.renameGroupTitle}
        >
          <div className='space-y-4 pb-4'>
            <Input
              variant='outline'
              aria-label={SPEND_WORDS.group}
              placeholder={SPEND_WORDS.groupPlaceholder}
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void rename();
              }}
            />
          </div>
          <ModalFooterActions
            note={error}
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={() => setIsRenaming(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='button'
                loading={isBusy}
                disabled={isBusy || trimmed === '' || trimmed === expense.name}
                onClick={() => void rename()}
              >
                {SPEND_WORDS.renameSave}
              </Button>
            }
          />
        </FormSheet>
      )}
    </div>
  );
}

export default ExpenseView;
