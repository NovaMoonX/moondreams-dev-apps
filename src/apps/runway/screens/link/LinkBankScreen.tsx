import { useState } from 'react';
import { Landmark } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ModalFooterActions from '@/components/ModalFooterActions';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { store } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import BankBalanceChoice from '@apps/runway/components/BankBalanceChoice';
import { LINK_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  matchLinkRows,
  type LinkChoice,
  type MatchTargetKind,
} from '@apps/runway/engine/linkMatch';
import { openBankLink } from '@apps/runway/lib/bankLink';
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
  type LinkSession,
} from '@apps/runway/store/actions/linkActions';
import { moveToLink } from '@apps/runway/store/actions/planActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import LinkMatchView from '@apps/runway/screens/link/LinkMatchView';
import type { OpenLink } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

interface LinkBankScreenProps {
  onClose: () => void;
  /** The card or account the person started from; preset on the first row of its kind. */
  startedFrom?: { target: MatchTargetKind; id: string } | null;
  /** A link whose accounts were never matched: opens straight on the match step. */
  resume?: OpenLink | null;
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
  | { kind: 'offers'; offers: BalanceOffer[]; count: number }
  | { kind: 'done'; count: number };

const toResumedSession = (link: OpenLink): LinkSession => ({
  linkId: link.id,
  institutionName: link.institutionName,
  accounts: link.providerAccounts.map((entry) => ({
    providerAccountId: entry.providerAccountId,
    name: entry.name,
    kind: entry.kind,
    subtype: null,
    mask: entry.mask,
    balanceCents: null,
  })),
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
}: LinkBankScreenProps) {
  const { user } = useAuth();
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
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isLevelStuck, setIsLevelStuck] = useState(false);
  const [settled, setSettled] = useState<
    Readonly<Record<string, 'used' | 'kept'>>
  >({});
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

  const picked = choices.filter((choice) => choice.kind !== 'skip').length;

  const getConfirmLines = (linking: LinkSession) => {
    const { cards, accounts } = store.getState().runway;
    return linking.accounts.map((row, index) => {
      const choice = choices[index] ?? { kind: 'skip' };
      if (choice.kind === 'skip') return LINK_WORDS.confirmSkip(row.name);
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
    setIsBusy(true);
    setMessage(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const result = await linkChosenAccounts(
        user.uid,
        encryption,
        session,
        choices,
        (index, created) =>
          setChoices((current) =>
            current.map((choice, at) => (at === index ? created : choice)),
          ),
      );
      if (result.attached > 0 && selectLevel(store.getState()) === 'track') {
        await moveToLink(user.uid, encryption, todayAsUtcDate()).catch(() =>
          setIsLevelStuck(true),
        );
      }
      const { accounts } = store.getState().runway;
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
          ? { kind: 'offers', offers, count: result.attached }
          : { kind: 'done', count: result.attached },
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
        <>
          <div className='space-y-4'>
            {startedName && (
              <p className='text-2xl font-semibold break-words'>
                {LINK_WORDS.introFor(startedName)}
              </p>
            )}
            <div className='border-border bg-card space-y-3 rounded-2xl border p-4'>
              <p>{LINK_WORDS.intro}</p>
              <ul className='text-muted-foreground list-disc space-y-1.5 pl-5 text-sm'>
                {LINK_WORDS.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
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
                disabled={isBusy}
                onClick={() => void signIn()}
              >
                {LINK_WORDS.signIn}
              </Button>
            }
          />
        </>
      );
    }
    if (step.kind === 'match' && session) {
      return (
        <>
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
              className='text-destructive! w-full'
              disabled={isBusy}
              onClick={() => void discard()}
            >
              {LINK_WORDS.discard}
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
        </>
      );
    }
    if (step.kind === 'offers') {
      return (
        <>
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
                onClick={() => setStep({ kind: 'done', count: step.count })}
              >
                {LINK_WORDS.finish}
              </Button>
            }
          />
        </>
      );
    }
    if (step.kind === 'done') {
      return (
        <>
          <div className='space-y-4 text-center'>
            <Landmark
              className='text-primary mx-auto mt-6 size-10'
              aria-hidden='true'
            />
            <p className='text-2xl font-semibold'>{LINK_WORDS.done}</p>
            <p className='text-muted-foreground'>
              {LINK_WORDS.doneCount(step.count)}
            </p>
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
        </>
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
