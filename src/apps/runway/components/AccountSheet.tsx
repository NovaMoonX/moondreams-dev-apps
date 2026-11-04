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
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import SectionDivider from '@/components/SectionDivider';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import { ActionSection } from '@apps/runway/components/ActionSection';
import { useHoldsUndo } from '@apps/runway/hooks/useHoldsUndo';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  ACCOUNT_WORDS,
  MAX_PURCHASE_CENTS,
  RUNWAY_SEARCH_THRESHOLD,
  TICK_HIT_CLASS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  archiveAccount,
  setAccountBalance,
  setAccountHolds,
} from '@apps/runway/store/actions/accountActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectAccountHoldings,
  selectAccounts,
  selectEnvelopes,
  selectGoals,
  selectItemLooks,
  selectItemNames,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenAccount } from '@apps/runway/types';

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
  const toastHoldsSaved = useHoldsUndo();
  const today = todayAsUtcDate(useNow(60_000));
  const openAccounts = useAppSelector(selectAccounts);
  const holdings = useAppSelector((state) =>
    selectAccountHoldings(state, today),
  )[account.id];
  const itemNames = useAppSelector(selectItemNames);
  const goals = useAppSelector((state) => selectGoals(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const assignedByItem = useAppSelector(selectBalances).assignedByItem;
  const looks = useAppSelector(selectItemLooks);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'menu' | 'balance' | 'holds'>('menu');
  const [balanceText, setBalanceText] = useState(() =>
    centsToInputValue(account.balanceCents),
  );
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(account.holds),
  );
  const [isUnfolded, setIsUnfolded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) =>
    itemNames.find((item) => item.id === id)?.name ?? '';
  const balanceCents = parseMoneyToCents(balanceText);
  const isBalanceValid =
    balanceCents !== null &&
    balanceCents >= 0 &&
    balanceCents <= MAX_PURCHASE_CENTS;
  const isBalanceSame =
    balanceCents === account.balanceCents && account.balanceOn === today;
  const facts = [
    account.balanceOn === null
      ? null
      : ACCOUNT_WORDS.balanceOn(formatDateOrdinalUTC(account.balanceOn)),
    account.isPullAccount ? ACCOUNT_WORDS.pullsFrom : null,
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
    if (balanceCents === null || !isBalanceValid || isBalanceSame) return;
    void run(
      async (uid) =>
        setAccountBalance(
          uid,
          await getRunwayEncryption(uid),
          account.id,
          balanceCents,
          today,
        ),
      ACCOUNT_WORDS.balanceFailed,
      ACCOUNT_WORDS.balanceSaved(account.name),
    );
  };

  const toHoldRow = ({
    item,
    version,
  }: {
    item: { id: string };
    version: { payload: { name: string } };
  }) => ({
    id: item.id,
    name: version.payload.name,
    emoji: looks.get(item.id)?.emoji ?? null,
    cents: assignedByItem[item.id] ?? 0,
  });
  const allHoldGroups = [
    { heading: ACCOUNT_WORDS.goalsHeading, rows: goals.map(toHoldRow) },
    { heading: ACCOUNT_WORDS.envelopesHeading, rows: envelopes.map(toHoldRow) },
  ];
  const holdRowCount = allHoldGroups.reduce(
    (count, group) => count + group.rows.length,
    0,
  );
  const searchKey = search.trim().toLocaleLowerCase();
  const holdItems = allHoldGroups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) =>
        row.name.toLocaleLowerCase().includes(searchKey),
      ),
    }))
    .filter((group) => group.rows.length > 0);
  const listedIds = new Set(
    allHoldGroups.flatMap((group) => group.rows.map((row) => row.id)),
  );
  const pickedCents = allHoldGroups
    .flatMap((group) => group.rows)
    .filter((row) => picked.has(row.id))
    .reduce((sum, row) => sum + row.cents, 0);
  const pickedShortCents =
    account.balanceCents === null ? 0 : pickedCents - account.balanceCents;
  const heldElsewhere = Object.fromEntries(
    openAccounts
      .filter((other) => other.id !== account.id)
      .flatMap((other) => other.holds.map((id) => [id, other.name] as const)),
  );

  const saveHolds = () =>
    void run(
      async (uid) => {
        const written = await setAccountHolds(
          uid,
          await getRunwayEncryption(uid),
          account.id,
          [...picked].filter((id) => listedIds.has(id)),
          openAccounts,
          nameOf,
        );
        toastHoldsSaved(
          ACCOUNT_WORDS.holdsSaved(account.name),
          written,
          account.name,
        );
      },
      ACCOUNT_WORDS.holdsFailed,
      null,
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

  const holdLines = (holdings?.items ?? []).filter(
    (line) => nameOf(line.id) !== '',
  );
  const unassigned = holdings?.unassignedCents ?? null;
  const shownLines = isUnfolded
    ? holdLines
    : holdLines.slice(0, MAX_HOLD_LINES);

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
            note={
              !isBalanceValid
                ? ACCOUNT_WORDS.balanceNeeded
                : isBalanceSame
                  ? ACCOUNT_WORDS.balanceSame
                  : null
            }
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
                disabled={isBusy || !isBalanceValid || isBalanceSame}
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
          {viewTitle(ACCOUNT_WORDS.chooseHoldsTitle)}
          {holdRowCount > 0 && (
            <p className='flex items-center gap-1.5 text-sm' aria-live='polite'>
              {!isHidden && pickedShortCents > 0 ? (
                <span className='flex items-center gap-1.5 text-(--runway-warning-ink)'>
                  <TriangleAlert
                    className='h-3.5 w-3.5 shrink-0'
                    aria-hidden='true'
                  />
                  {ACCOUNT_WORDS.shortOfWhatItHolds(
                    formatCents(pickedShortCents),
                  )}
                </span>
              ) : (
                <span className='text-muted-foreground'>
                  {ACCOUNT_WORDS.chooseHoldsTotal}{' '}
                  <SensitiveValue>{formatCents(pickedCents)}</SensitiveValue>
                  {account.balanceCents !== null && (
                    <>
                      {' '}
                      {ACCOUNT_WORDS.chooseHoldsOfBalance}{' '}
                      <SensitiveValue>
                        {formatCents(account.balanceCents)}
                      </SensitiveValue>
                    </>
                  )}
                </span>
              )}
            </p>
          )}
          {holdRowCount >= RUNWAY_SEARCH_THRESHOLD && (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={ACCOUNT_WORDS.chooseHoldsSearch}
            />
          )}
          {holdRowCount === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {ACCOUNT_WORDS.holdsNothingToPick}
            </p>
          ) : holdItems.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {ACCOUNT_WORDS.chooseHoldsNoMatch}
            </p>
          ) : (
            <div className='max-h-[max(9rem,calc(92dvh-24rem))] space-y-3 overflow-y-auto [@media(max-height:499px)]:max-h-none'>
              {holdItems.map((group) => (
                <div key={group.heading} className='space-y-2'>
                  <SectionDivider label={group.heading} />
                  <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                    {group.rows.map((row) => (
                      <li key={row.id}>
                        <label className='flex min-h-14 items-center gap-3 px-3 py-2'>
                          <Checkbox
                            className={TICK_HIT_CLASS}
                            checked={picked.has(row.id)}
                            onCheckedChange={(next) =>
                              toggle(row.id, Boolean(next))
                            }
                          />
                          <ItemBadge name={row.name} emoji={row.emoji} />
                          <span className='block min-w-0 flex-1 text-sm'>
                            <span className='line-clamp-2 font-medium break-words'>
                              {row.name}
                            </span>
                            {heldElsewhere[row.id] && !picked.has(row.id) && (
                              <span className='text-muted-foreground line-clamp-2 break-words'>
                                {ACCOUNT_WORDS.chooseHoldsHeldElsewhere(
                                  heldElsewhere[row.id],
                                )}
                              </span>
                            )}
                          </span>
                          <span className='shrink-0 text-sm whitespace-nowrap tabular-nums'>
                            <SensitiveValue>
                              {formatCents(row.cents)}
                            </SensitiveValue>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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
          {holdLines.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              {ACCOUNT_WORDS.holdsEmpty}
            </p>
          )}
          <ul className='space-y-1 text-sm'>
            {shownLines.map((line) => (
              <li key={line.id} className='flex justify-between gap-3'>
                <span className='min-w-0 break-words'>{nameOf(line.id)}</span>
                <span className='shrink-0 tabular-nums'>
                  <SensitiveValue>{formatCents(line.cents)}</SensitiveValue>
                </span>
              </li>
            ))}
            {holdLines.length > MAX_HOLD_LINES && (
              <li>
                <ShowMoreButton
                  isOpen={isUnfolded}
                  onClick={() => setIsUnfolded((current) => !current)}
                >
                  {isUnfolded
                    ? ACCOUNT_WORDS.showFewer
                    : ACCOUNT_WORDS.showMore(holdLines.length - MAX_HOLD_LINES)}
                </ShowMoreButton>
              </li>
            )}
            {unassigned !== null &&
              holdLines.length > 0 &&
              (unassigned < 0 ? (
                <li>
                  {isHidden ? (
                    <NeedsALookRow />
                  ) : (
                    <span className='flex items-center gap-1.5 text-(--runway-warning-ink)'>
                      <TriangleAlert
                        className='h-3.5 w-3.5 shrink-0'
                        aria-hidden='true'
                      />
                      <span>
                        {ACCOUNT_WORDS.shortOfWhatItHolds(
                          formatCents(-unassigned),
                        )}
                      </span>
                    </span>
                  )}
                </li>
              ) : (
                <li className='text-muted-foreground flex justify-between gap-3'>
                  <span>{ACCOUNT_WORDS.notYetGivenAJob}</span>
                  <span className='shrink-0 tabular-nums'>
                    <SensitiveValue>{formatCents(unassigned)}</SensitiveValue>
                  </span>
                </li>
              ))}
          </ul>
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
              setSearch('');
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
