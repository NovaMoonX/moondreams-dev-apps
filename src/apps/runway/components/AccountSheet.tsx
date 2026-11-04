import { useState } from 'react';
import {
  Archive,
  ListChecks,
  Pencil,
  TriangleAlert,
  Wallet,
} from 'lucide-react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { ActionSection } from '@apps/runway/components/ActionSection';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  ACCOUNT_WORDS,
  MAX_PURCHASE_CENTS,
  TICK_HIT_CLASS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  archiveAccount,
  setAccountBalance,
  setAccountHolds,
} from '@apps/runway/store/actions/accountActions';
import {
  selectAccountHoldings,
  selectAccounts,
  selectEnvelopes,
  selectGoals,
  selectItemNames,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenAccount } from '@apps/runway/types';
import { formatDayOrdinalUTC } from '@apps/runway/utils/accountText';

const MAX_HOLD_LINES = 4;

interface AccountSheetProps {
  account: OpenAccount;
  onClose: () => void;
  onChange: () => void;
}

/** What an account row opens: what it holds as the figure, then updating the balance, choosing what it holds, changing it and archiving it. */
function AccountSheet({ account, onClose, onChange }: AccountSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const today = todayAsUtcDate(useNow(60_000));
  const openAccounts = useAppSelector(selectAccounts);
  const holdings = useAppSelector(selectAccountHoldings)[account.id];
  const itemNames = useAppSelector(selectItemNames);
  const goals = useAppSelector((state) => selectGoals(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const [view, setView] = useState<'menu' | 'balance' | 'holds'>('menu');
  const [balanceText, setBalanceText] = useState(() =>
    centsToInputValue(account.balanceCents),
  );
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(account.holds),
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) =>
    itemNames.find((item) => item.id === id)?.name ?? '';
  const balanceCents = parseMoneyToCents(balanceText);
  const isBalanceValid =
    balanceCents !== null &&
    balanceCents >= 0 &&
    balanceCents <= MAX_PURCHASE_CENTS;
  const facts = [
    account.balanceOn === null
      ? null
      : ACCOUNT_WORDS.balanceOn(formatDayOrdinalUTC(account.balanceOn)),
    account.isPullAccount ? ACCOUNT_WORDS.pullsFrom : null,
    account.countedTowardTotal ? null : ACCOUNT_WORDS.leftOut,
  ].filter((fact): fact is string => fact !== null);

  const goTo = (next: typeof view) => {
    setError(null);
    setView(next);
  };

  const run = async (
    work: (uid: string) => Promise<void>,
    failure: string,
    success: string | null,
  ) => {
    if (!user || isBusy) return;
    setError(null);
    setIsBusy(true);
    try {
      await work(user.uid);
      if (success) addToast({ title: success, type: 'success' });
      setIsBusy(false);
      setView('menu');
    } catch (saveError) {
      setError(
        `${failure}. ${getErrorMessage(saveError, ACCOUNT_WORDS.failed)}`,
      );
      setIsBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!user || isBusy) return;
    const isConfirmed = await confirm({
      title: ACCOUNT_WORDS.archiveConfirmTitle(account.name),
      message: ACCOUNT_WORDS.archiveSub,
      confirmText: ACCOUNT_WORDS.archiveConfirmText,
    });
    if (!isConfirmed) return;
    setError(null);
    setIsBusy(true);
    try {
      await archiveAccount(
        user.uid,
        await getRunwayEncryption(user.uid),
        account.id,
        ACCOUNT_WORDS.changeArchived(account.name),
      );
      addToast({
        title: ACCOUNT_WORDS.archived(account.name),
        type: 'success',
      });
      onClose();
    } catch (archiveError) {
      setError(
        `${ACCOUNT_WORDS.archiveFailed}. ${getErrorMessage(archiveError, ACCOUNT_WORDS.failed)}`,
      );
      setIsBusy(false);
    }
  };

  const saveBalance = () => {
    if (balanceCents === null || !isBalanceValid) return;
    void run(
      async (uid) =>
        setAccountBalance(
          uid,
          await getRunwayEncryption(uid),
          account.id,
          balanceCents,
          todayAsUtcDate(),
        ),
      ACCOUNT_WORDS.balanceFailed,
      ACCOUNT_WORDS.balanceSaved(account.name),
    );
  };

  const holdItems = [
    {
      heading: ACCOUNT_WORDS.goalsHeading,
      rows: goals.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
      })),
    },
    {
      heading: ACCOUNT_WORDS.envelopesHeading,
      rows: envelopes.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
      })),
    },
  ].filter((group) => group.rows.length > 0);
  const listedIds = new Set(
    holdItems.flatMap((group) => group.rows.map((row) => row.id)),
  );
  const heldElsewhere = Object.fromEntries(
    openAccounts
      .filter((other) => other.id !== account.id)
      .flatMap((other) => other.holds.map((id) => [id, other.name] as const)),
  );

  const saveHolds = () =>
    void run(
      async (uid) =>
        setAccountHolds(
          uid,
          await getRunwayEncryption(uid),
          account.id,
          [
            ...account.holds.filter((id) => !listedIds.has(id)),
            ...[...picked].filter((id) => listedIds.has(id)),
          ],
          openAccounts,
        ),
      ACCOUNT_WORDS.holdsFailed,
      ACCOUNT_WORDS.holdsSaved(account.name),
    );

  const toggle = (id: string, isOn: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (isOn) next.add(id);
      else next.delete(id);
      return next;
    });

  const viewTitle = (title: string) => (
    <div className='flex items-center gap-1'>
      <BackLink isChevronOnly onBack={() => goTo('menu')} />
      <p className='min-w-0 text-2xl font-semibold'>{title}</p>
    </div>
  );

  const errorNotice = error && (
    <InlineNotice tone='warning'>{error}</InlineNotice>
  );

  const holdLines = holdings?.items ?? [];
  const unassigned = holdings?.unassignedCents ?? null;
  const shownLines = holdLines.slice(0, MAX_HOLD_LINES);

  const getBody = () => {
    if (view === 'balance') {
      return (
        <div className='space-y-4'>
          {viewTitle(ACCOUNT_WORDS.balanceTitle)}
          <AmountHero
            label={ACCOUNT_WORDS.balanceLabel}
            value={balanceText}
            onChange={setBalanceText}
            disabled={isBusy}
          />
          {errorNotice}
          <ModalFooterActions
            note={isBalanceValid ? null : ACCOUNT_WORDS.balanceNeeded}
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={() => goTo('menu')}
                disabled={isBusy}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='button'
                loading={isBusy}
                disabled={isBusy || !isBalanceValid}
                onClick={saveBalance}
              >
                {ACCOUNT_WORDS.balanceSave}
              </Button>
            }
          />
        </div>
      );
    }
    if (view === 'holds') {
      return (
        <div className='space-y-4'>
          {viewTitle(ACCOUNT_WORDS.chooseHolds)}
          {holdItems.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {ACCOUNT_WORDS.holdsNothingToPick}
            </p>
          ) : (
            holdItems.map((group) => (
              <div key={group.heading} className='space-y-2'>
                <SectionDivider label={group.heading} />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {group.rows.map((row) => (
                    <li key={row.id} className='flex min-h-12 items-center'>
                      <label className='flex min-w-0 flex-1 items-center gap-3 px-3 py-2'>
                        <Checkbox
                          className={TICK_HIT_CLASS}
                          checked={picked.has(row.id)}
                          onCheckedChange={(next) =>
                            toggle(row.id, Boolean(next))
                          }
                        />
                        <span className='block min-w-0 flex-1 text-sm break-words'>
                          <span className='font-medium'>{row.name}</span>
                          {heldElsewhere[row.id] && !picked.has(row.id) && (
                            <span className='text-muted-foreground block'>
                              {ACCOUNT_WORDS.chooseHoldsHeldElsewhere(
                                heldElsewhere[row.id],
                              )}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {errorNotice}
          <ModalFooterActions
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={() => goTo('menu')}
                disabled={isBusy}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='button'
                loading={isBusy}
                disabled={isBusy}
                onClick={saveHolds}
              >
                {ACCOUNT_WORDS.holdsSave}
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className='space-y-4 [@media(max-height:599px)]:space-y-2.5'>
        <SheetHead
          label={ACCOUNT_WORDS.balanceLabel}
          figure={
            account.balanceCents === null
              ? ACCOUNT_WORDS.noBalance
              : formatCents(account.balanceCents)
          }
          fact={facts.length === 0 ? null : facts.join(' · ')}
        />
        <ActionSection caption={ACCOUNT_WORDS.holdsTitle}>
          {holdLines.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {ACCOUNT_WORDS.holdsEmpty}
            </p>
          ) : (
            <ul className='space-y-1 text-sm'>
              {shownLines.map((line) => (
                <li key={line.id} className='flex justify-between gap-3'>
                  <span className='min-w-0 break-words'>{nameOf(line.id)}</span>
                  <span className='shrink-0 tabular-nums'>
                    <SensitiveValue>{formatCents(line.cents)}</SensitiveValue>
                  </span>
                </li>
              ))}
              {holdLines.length > shownLines.length && (
                <li className='text-muted-foreground'>
                  and {holdLines.length - shownLines.length} more
                </li>
              )}
              {unassigned !== null &&
                (unassigned < 0 && !isHidden ? (
                  <li className='flex items-center gap-1.5 text-(--runway-warning-ink)'>
                    <TriangleAlert
                      className='h-3.5 w-3.5 shrink-0'
                      aria-hidden='true'
                    />
                    <span>
                      <MaskedText>
                        {ACCOUNT_WORDS.overAssigned(formatCents(-unassigned))}
                      </MaskedText>
                    </span>
                  </li>
                ) : (
                  <li className='text-muted-foreground flex justify-between gap-3'>
                    <span>{ACCOUNT_WORDS.notYetGivenAJob}</span>
                    <span className='shrink-0 tabular-nums'>
                      <SensitiveValue>
                        {formatCents(Math.max(0, unassigned))}
                      </SensitiveValue>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </ActionSection>
        {errorNotice}
        <ActionGroup>
          <ActionRow
            isGrouped
            hasChevron
            icon={<Wallet />}
            label={ACCOUNT_WORDS.updateBalance}
            subtitle={ACCOUNT_WORDS.updateBalanceSub}
            onClick={() => goTo('balance')}
          />
          <ActionRow
            isGrouped
            hasChevron
            icon={<ListChecks />}
            label={ACCOUNT_WORDS.chooseHolds}
            subtitle={ACCOUNT_WORDS.chooseHoldsSub}
            onClick={() => {
              setPicked(new Set(account.holds));
              goTo('holds');
            }}
          />
          <ActionRow
            isGrouped
            hasChevron
            icon={<Pencil />}
            label={ACCOUNT_WORDS.change}
            subtitle={ACCOUNT_WORDS.changeSub}
            onClick={onChange}
          />
          <ActionRow
            isGrouped
            icon={<Archive />}
            label={ACCOUNT_WORDS.archive}
            isDisabled={isBusy}
            onClick={() => void handleArchive()}
          />
        </ActionGroup>
      </div>
    );
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={account.name}
      actions={<ValuesEyeButton />}
    >
      {getBody()}
    </FormSheet>
  );
}

export default AccountSheet;
