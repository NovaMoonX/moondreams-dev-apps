import { useRef, useState } from 'react';
import { Landmark } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import BankBalanceChoice from '@apps/runway/components/BankBalanceChoice';
import ReconnectRow from '@apps/runway/components/ReconnectRow';
import { LINK_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  matchLinkRows,
  type LinkChoice,
  type MatchTargetKind,
} from '@apps/runway/engine/linkMatch';
import { openBankLink } from '@apps/runway/lib/bankLink';
import { useReconnectLink } from '@apps/runway/hooks/useReconnectLink';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  useApplyBankBalance,
  type BalanceTarget,
} from '@apps/runway/hooks/useBankBalance';
import {
  createLinkSession,
  discardLink,
  exchangeLink,
  linkChosenAccounts,
  reconnectLink,
  syncLinks,
  type LinkSession,
} from '@apps/runway/store/actions/linkActions';
import { moveToLink } from '@apps/runway/store/actions/planActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import LinkMatchView from '@apps/runway/screens/link/LinkMatchView';
import type { NormalizedAccount, OpenLink } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

interface LinkBankScreenProps {
  onClose: () => void;
  /** The card or account the person started from; preset on the first row of its kind. */
  startedFrom?: { target: MatchTargetKind; id: string } | null;
  /** A link whose accounts were never matched: opens straight on the match step. */
  resume?: OpenLink | null;
  /** A live link to add accounts to: the sign-in goes straight to that bank's account choice. */
  addTo?: OpenLink | null;
}

interface BalanceOffer {
  target: BalanceTarget;
  name: string;
  yoursCents: number | null;
  bankCents: number;
}

type Step =
  | { kind: 'explain' }
  | { kind: 'match' }
  | { kind: 'offers'; offers: BalanceOffer[]; count: number; owedCents: number }
  | { kind: 'done'; count: number; owedCents: number };

const toSessionAccounts = (
  entries: readonly Omit<NormalizedAccount, 'subtype'>[],
): NormalizedAccount[] =>
  entries.map((entry) => ({
    providerAccountId: entry.providerAccountId,
    name: entry.name,
    kind: entry.kind,
    subtype: null,
    mask: entry.mask,
    balanceCents: entry.balanceCents,
  }));

const toResumedSession = (link: OpenLink): LinkSession => ({
  linkId: link.id,
  institutionName: link.institutionName,
  accounts: toSessionAccounts(
    link.providerAccounts.filter(
      (entry) =>
        entry.accountId === null && entry.cardId === null && !entry.isSkipped,
    ),
  ),
});

const presetChoices = (
  session: LinkSession,
  startedFrom: LinkBankScreenProps['startedFrom'],
) => {
  const { cards, accounts } = store.getState().runway;
  return matchLinkRows({
    institutionName: session.institutionName,
    rows: session.accounts,
    cards: cards.map((card) => ({ ...card, bank: card.issuer })),
    accounts: accounts.map((account) => ({
      ...account,
      bank: account.institution,
    })),
    startedFrom: startedFrom ?? null,
  });
};

const toRowLabel = (row: LinkSession['accounts'][number]) =>
  `${row.name}${row.mask ? ` \u2022\u2022${row.mask}` : ''}`;

/** The name of the item a link was started from, or null when it started from Settings or the add picker. */
const getStartedName = (startedFrom: LinkBankScreenProps['startedFrom']) => {
  if (!startedFrom) return null;
  const { cards, accounts } = store.getState().runway;
  if (startedFrom.target === 'card') {
    const card = cards.find((entry) => entry.id === startedFrom.id);
    return card ? getCardName(card, cards) : null;
  }
  return accounts.find((entry) => entry.id === startedFrom.id)?.name ?? null;
};

/** Choosing Link: the explainer, the bank's own window, "Is this one of yours?", the bank's balances offered one by one, and a Linked end. */
function LinkBankScreen({
  onClose,
  startedFrom = null,
  resume = null,
  addTo = null,
}: LinkBankScreenProps) {
  const { user } = useAuth();
  const mask = useMaskedText();
  const links = useAppSelector((state) => state.runway.links);
  const joinable = links.filter(
    (link) => link.status === 'active' || link.status === 'needsAttention',
  );
  const { addToast } = useToast();
  const { reconnect, busyId } = useReconnectLink();
  const owedRef = useRef(0);
  const { confirm } = useActionModal();
  const applyBankBalance = useApplyBankBalance();
  const [session, setSession] = useState<LinkSession | null>(() =>
    resume ? toResumedSession(resume) : null,
  );
  const [initial] = useState<LinkChoice[]>(() =>
    resume ? presetChoices(toResumedSession(resume), startedFrom) : [],
  );
  const [choices, setChoices] = useState<LinkChoice[]>(initial);
  const [baseline, setBaseline] = useState<LinkChoice[]>(initial);
  const [step, setStep] = useState<Step>(
    resume ? { kind: 'match' } : { kind: 'explain' },
  );
  const [isOnExistingLink, setIsOnExistingLink] = useState(resume !== null);
  const [isBusy, setIsBusy] = useState(false);
  const isWorking = isBusy || busyId !== null;
  const [message, setMessage] = useState<string | null>(null);
  const [isLevelStuck, setIsLevelStuck] = useState(false);
  const [settled, setSettled] = useState<
    Readonly<Record<string, 'used' | 'kept'>>
  >({});
  const isPartialLink =
    isOnExistingLink &&
    (links
      .find((link) => link.id === session?.linkId)
      ?.providerAccounts.some(
        (entry) =>
          entry.accountId !== null || entry.cardId !== null || entry.isSkipped,
      ) ??
      false);
  const startedName = getStartedName(startedFrom);
  const isChanged =
    step.kind === 'match' &&
    JSON.stringify(choices) !== JSON.stringify(baseline);
  const requestClose = useDiscardGuard({
    isDirty: isChanged,
    isBusy,
    onClose,
    title: 'Discard your picks?',
    message: 'Nothing is linked until you tap Link these.',
  });

  const signIn = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const linkToken = await createLinkSession();
      const opened = await openBankLink(linkToken);
      if (opened === null) {
        setMessage(LINK_WORDS.notLinked);
        return;
      }
      const next = await exchangeLink(
        opened.publicToken,
        opened.institutionName,
      );
      const preset = presetChoices(next, startedFrom);
      setSession(next);
      setChoices(preset);
      setBaseline(preset);
      setStep({ kind: 'match' });
    } catch (error) {
      setMessage(getErrorMessage(error, LINK_WORDS.sessionFailed));
    } finally {
      setIsBusy(false);
    }
  };

  const addAccounts = async (link: OpenLink) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setMessage(null);
    const bank = link.institutionName || LINK_WORDS.yourBank;
    try {
      const result = await reconnectLink(link.id);
      if (result === null) {
        setMessage(LINK_WORDS.notLinked);
        return;
      }
      if (result.stopped > 0) {
        addToast({
          title: LINK_WORDS.stoppedAccounts(bank, result.stopped),
          type: 'warning',
        });
      }
      const waiting = store
        .getState()
        .runway.links.find((entry) => entry.id === link.id);
      const next: LinkSession = {
        linkId: link.id,
        institutionName: link.institutionName,
        accounts:
          result.added.length > 0
            ? toSessionAccounts(result.added)
            : waiting
              ? toResumedSession(waiting).accounts
              : [],
      };
      if (next.accounts.length === 0) {
        setMessage(LINK_WORDS.noNewAccounts(bank));
        return;
      }
      const preset = presetChoices(next, null);
      setSession(next);
      setChoices(preset);
      setBaseline(preset);
      setIsOnExistingLink(true);
      setStep({ kind: 'match' });
    } catch (error) {
      setMessage(getErrorMessage(error, LINK_WORDS.reconnectFailed(bank)));
    } finally {
      setIsBusy(false);
    }
  };

  const picked = choices.filter((choice) => choice.kind !== 'skip').length;

  const getConfirmLines = (linking: LinkSession) => {
    const { cards, accounts } = store.getState().runway;
    return linking.accounts.map((row, index) => {
      const choice = choices[index] ?? { kind: 'skip' };
      if (choice.kind === 'skip')
        return LINK_WORDS.confirmSkip(toRowLabel(row));
      if (choice.kind === 'new') {
        return LINK_WORDS.confirmNew(toRowLabel(row), row.kind === 'credit');
      }
      const ours =
        choice.target === 'card'
          ? cards.find((card) => card.id === choice.id)
          : accounts.find((account) => account.id === choice.id);
      return LINK_WORDS.confirmJoins(
        toRowLabel(row),
        ours && 'issuer' in ours
          ? getCardName(ours, cards)
          : (ours?.name ?? ''),
      );
    });
  };

  const linkThese = async () => {
    if (!user || !session || isBusy || picked === 0) return;
    const isConfirmed = await confirm({
      title: LINK_WORDS.confirmTitle(session.institutionName),
      message: (
        <ul className='space-y-1 text-left'>
          {getConfirmLines(session).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ),
      confirmText: LINK_WORDS.confirmText(picked),
    });
    if (!isConfirmed) return;
    const isLinkGone =
      isOnExistingLink &&
      !store.getState().runway.links.some((link) => link.id === session.linkId);
    if (isLinkGone) {
      setMessage(LINK_WORDS.linkReplaced);
      return;
    }
    setIsBusy(true);
    setMessage(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const result = await linkChosenAccounts(
        user.uid,
        encryption,
        session,
        choices,
        (index, created) => {
          const row = session.accounts[index];
          if (created.kind === 'existing' && created.target === 'card') {
            owedRef.current += Math.max(0, row?.balanceCents ?? 0);
          }
          setChoices((current) =>
            current.map((choice, at) => (at === index ? created : choice)),
          );
        },
      );
      if (result.attached > 0 && selectLevel(store.getState()) === 'track') {
        await moveToLink(user.uid, encryption, todayAsUtcDate()).catch(() =>
          setIsLevelStuck(true),
        );
      }
      if (result.attached > 0) {
        void syncLinks().catch((error: unknown) =>
          console.error('The first sync did not run', error),
        );
      }
      const { accounts } = store.getState().runway;
      const owedCents = owedRef.current;
      const offers = result.balances.flatMap((balance): BalanceOffer[] => {
        if (result.created.includes(balance.targetId)) return [];
        const sent = result.sent.find(
          (entry) => entry.accountId === balance.targetId,
        );
        if (!sent) return [];
        const yours =
          accounts.find((account) => account.id === balance.targetId)
            ?.balanceCents ?? null;
        if (yours === balance.cents) return [];
        const name =
          session.accounts.find(
            (entry) => entry.providerAccountId === sent.providerAccountId,
          )?.name ?? '';
        return [
          {
            target: { kind: 'account', id: balance.targetId },
            name,
            yoursCents: yours,
            bankCents: balance.cents,
          },
        ];
      });
      setStep(
        offers.length > 0
          ? { kind: 'offers', offers, count: result.attached, owedCents }
          : { kind: 'done', count: result.attached, owedCents },
      );
    } catch (error) {
      setMessage(getErrorMessage(error, LINK_WORDS.attachFailed));
    } finally {
      setIsBusy(false);
    }
  };

  const discard = async () => {
    if (!session || isBusy) return;
    const isConfirmed = await confirm({
      title: LINK_WORDS.discardTitle(session.institutionName),
      message: LINK_WORDS.discardMessage,
      confirmText: LINK_WORDS.discardConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setMessage(null);
    try {
      await discardLink(session.linkId);
      onClose();
    } catch (error) {
      setMessage(getErrorMessage(error, LINK_WORDS.discardFailed));
      setIsBusy(false);
    }
  };

  const answerOffer = async (offer: BalanceOffer, isUsingBanks: boolean) => {
    setMessage(null);
    try {
      if (isUsingBanks) await applyBankBalance(offer.target, offer.bankCents);
      setSettled((current) => ({
        ...current,
        [offer.target.id]: isUsingBanks ? 'used' : 'kept',
      }));
    } catch (error) {
      setMessage(getErrorMessage(error, LINK_WORDS.updateFailed));
    }
  };

  const getBody = () => {
    if (step.kind === 'explain') {
      return (
        <div className='flex flex-1 flex-col'>
          <div className='space-y-4'>
            {startedName && (
              <p className='text-2xl font-semibold break-words'>
                {LINK_WORDS.introFor(startedName)}
              </p>
            )}
            {addTo ? (
              <p className='text-muted-foreground'>
                {LINK_WORDS.addToIntro(
                  addTo.institutionName || LINK_WORDS.yourBank,
                )}
              </p>
            ) : (
              <>
                <div className='border-border bg-card space-y-3 rounded-2xl border p-4'>
                  <p>{LINK_WORDS.intro}</p>
                  <ul className='text-muted-foreground list-disc space-y-1.5 pl-5 text-sm'>
                    {LINK_WORDS.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
                <InlineNotice tone='warning'>
                  {LINK_WORDS.pickEveryAccount}
                </InlineNotice>
                {joinable.length > 0 && (
                  <ul className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
                    {joinable.map((link) => {
                      const bank = link.institutionName || LINK_WORDS.yourBank;
                      return (
                        <li key={link.id}>
                          {link.status === 'needsAttention' ? (
                            <ReconnectRow
                              isGrouped
                              busyId={busyId}
                              isDisabled={isBusy}
                              onReconnect={(id, name) =>
                                void reconnect(id, name)
                              }
                              linkId={link.id}
                              bank={bank}
                            />
                          ) : (
                            <ActionRow
                              isGrouped
                              hasChevron
                              icon={<Landmark />}
                              label={LINK_WORDS.addToLinkedRow(bank)}
                              subtitle={LINK_WORDS.addToLinkedHelp}
                              isDisabled={isWorking}
                              onClick={() => void addAccounts(link)}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            {message && (
              <p className='text-muted-foreground text-sm' role='status'>
                {message}
              </p>
            )}
          </div>
          <ModalFooterActions
            rightActions={
              <Button
                type='button'
                loading={isBusy}
                disabled={isWorking}
                onClick={() => void (addTo ? addAccounts(addTo) : signIn())}
              >
                {addTo ? LINK_WORDS.signInAgain : LINK_WORDS.signIn}
              </Button>
            }
          />
        </div>
      );
    }
    if (step.kind === 'match' && session) {
      return (
        <div className='flex flex-1 flex-col'>
          <div className='space-y-4'>
            <div className='space-y-1'>
              <h2 className='text-2xl font-semibold'>
                {LINK_WORDS.matchTitle}
              </h2>
              <p className='text-muted-foreground text-sm'>
                {LINK_WORDS.matchHelp(session.institutionName)}
              </p>
            </div>
            <LinkMatchView
              rows={session.accounts}
              choices={choices}
              startedFrom={startedFrom}
              onChange={(index, choice) =>
                setChoices((current) =>
                  current.map((entry, at) => (at === index ? choice : entry)),
                )
              }
            />
            {message && (
              <p className='text-destructive text-sm' role='alert'>
                {message}
              </p>
            )}
            <Button
              type='button'
              variant='tertiary'
              className={isPartialLink ? 'w-full' : 'text-destructive! w-full'}
              disabled={isBusy}
              onClick={() => (isPartialLink ? requestClose() : void discard())}
            >
              {isPartialLink ? LINK_WORDS.notNow : LINK_WORDS.discard}
            </Button>
          </div>
          <ModalFooterActions
            note={picked === 0 ? LINK_WORDS.nothingPicked : undefined}
            rightActions={
              <Button
                type='button'
                loading={isBusy}
                disabled={isBusy || picked === 0}
                onClick={() => void linkThese()}
              >
                {LINK_WORDS.linkThese}
              </Button>
            }
          />
        </div>
      );
    }
    if (step.kind === 'offers') {
      return (
        <div className='flex flex-1 flex-col'>
          <div className='space-y-4'>
            <div className='space-y-1'>
              <h2 className='text-2xl font-semibold'>
                {LINK_WORDS.useBankTitle}
              </h2>
              <p className='text-muted-foreground text-sm'>
                {LINK_WORDS.useBankHelp}
              </p>
            </div>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {step.offers.map((offer) => (
                <li key={offer.target.id} className='p-3'>
                  {settled[offer.target.id] ? (
                    <p className='text-muted-foreground text-sm' role='status'>
                      {settled[offer.target.id] === 'used'
                        ? LINK_WORDS.updated(offer.name)
                        : LINK_WORDS.kept(offer.name)}
                    </p>
                  ) : (
                    <BankBalanceChoice
                      name={offer.name}
                      yoursCents={offer.yoursCents}
                      bankCents={offer.bankCents}
                      onUseBanks={() => void answerOffer(offer, true)}
                      onKeepMine={() => void answerOffer(offer, false)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {message && (
              <p className='text-destructive text-sm' role='alert'>
                {message}
              </p>
            )}
          </div>
          <ModalFooterActions
            note={
              step.offers.some((offer) => !settled[offer.target.id])
                ? LINK_WORDS.useBankLater
                : undefined
            }
            rightActions={
              <Button
                type='button'
                onClick={() =>
                  setStep({
                    kind: 'done',
                    count: step.count,
                    owedCents: step.owedCents,
                  })
                }
              >
                {LINK_WORDS.finish}
              </Button>
            }
          />
        </div>
      );
    }
    if (step.kind === 'done') {
      return (
        <div className='flex flex-1 flex-col'>
          <div className='space-y-4 text-center'>
            <Landmark
              className='text-primary mx-auto mt-6 size-10'
              aria-hidden='true'
            />
            <p className='text-2xl font-semibold'>{LINK_WORDS.done}</p>
            <p className='text-muted-foreground'>
              {LINK_WORDS.doneCount(step.count)}
            </p>
            {step.owedCents > 0 && (
              <p className='text-muted-foreground'>
                {mask(
                  LINK_WORDS.cardsStartedOwing(formatCents(step.owedCents)),
                )}
              </p>
            )}
            {step.count > 0 && (
              <p className='text-muted-foreground'>{LINK_WORDS.syncing}</p>
            )}
            {isLevelStuck && (
              <p className='text-muted-foreground text-sm' role='status'>
                {LINK_WORDS.levelNotMoved}
              </p>
            )}
          </div>
          <ModalFooterActions
            rightActions={
              <Button type='button' onClick={onClose}>
                {LINK_WORDS.finish}
              </Button>
            }
          />
        </div>
      );
    }
    return null;
  };

  return (
    <Subview
      overlay
      title={LINK_WORDS.title}
      onClose={requestClose}
      headerAction={<ValuesEyeButton />}
    >
      {getBody()}
    </Subview>
  );
}

export default LinkBankScreen;
