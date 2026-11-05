import { useState } from 'react';
import { Landmark } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import SensitiveValue from '@/components/SensitiveValue';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { LINK_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  matchLinkRows,
  type LinkChoice,
  type MatchTargetKind,
} from '@apps/runway/engine/linkMatch';
import { openBankLink } from '@apps/runway/lib/bankLink';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { setAccountBalance } from '@apps/runway/store/actions/accountActions';
import {
  createLinkSession,
  exchangeLink,
  linkChosenAccounts,
  type LinkSession,
} from '@apps/runway/store/actions/linkActions';
import { moveToLink } from '@apps/runway/store/actions/planActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import LinkMatchView from '@apps/runway/screens/link/LinkMatchView';
import type { OpenLink } from '@apps/runway/types';

interface LinkBankScreenProps {
  onClose: () => void;
  /** The card or account the person started from; preset on the first row of its kind. */
  startedFrom?: { target: MatchTargetKind; id: string } | null;
  /** A link whose accounts were never matched: opens straight on the match step. */
  resume?: OpenLink | null;
}

interface BalanceOffer {
  accountId: string;
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

/** Choosing Link: the explainer, the bank's own window, "Is this one of yours?", the bank's balances offered one by one, and a Linked end. */
function LinkBankScreen({
  onClose,
  startedFrom = null,
  resume = null,
}: LinkBankScreenProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const [session, setSession] = useState<LinkSession | null>(() =>
    resume ? toResumedSession(resume) : null,
  );
  const [choices, setChoices] = useState<LinkChoice[]>(() =>
    resume ? presetChoices(toResumedSession(resume), startedFrom) : [],
  );
  const [step, setStep] = useState<Step>(
    resume ? { kind: 'match' } : { kind: 'explain' },
  );
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isLevelStuck, setIsLevelStuck] = useState(false);
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());

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
      setSession(next);
      setChoices(presetChoices(next, startedFrom));
      setStep({ kind: 'match' });
    } catch (error) {
      setMessage(getErrorMessage(error, LINK_WORDS.sessionFailed));
    } finally {
      setIsBusy(false);
    }
  };

  const countOf = (kind: LinkChoice['kind']) =>
    choices.filter((choice) => choice.kind === kind).length;
  const picked = choices.length - countOf('skip');

  const linkThese = async () => {
    if (!user || !session || isBusy || picked === 0) return;
    const isConfirmed = await confirm({
      title: LINK_WORDS.linkThese,
      message: [
        `${countOf('existing')} of yours`,
        countOf('new') > 0 ? `${countOf('new')} added new` : null,
        countOf('skip') > 0 ? `${countOf('skip')} left out` : null,
      ]
        .filter(Boolean)
        .join(', '),
      confirmText: LINK_WORDS.linkThese,
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
            accountId: balance.targetId,
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

  const acceptBanks = async (offer: BalanceOffer) => {
    if (!user) return;
    setMessage(null);
    try {
      await setAccountBalance(
        user.uid,
        await getRunwayEncryption(user.uid),
        offer.accountId,
        offer.bankCents,
        todayAsUtcDate(),
      );
      setSettled((current) => new Set([...current, offer.accountId]));
    } catch (error) {
      setMessage(getErrorMessage(error, LINK_WORDS.updateFailed));
    }
  };

  const keepMine = (offer: BalanceOffer) =>
    setSettled((current) => new Set([...current, offer.accountId]));

  const getBody = () => {
    if (step.kind === 'explain') {
      return (
        <div className='space-y-4'>
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
          <Button
            type='button'
            className='w-full'
            loading={isBusy}
            disabled={isBusy}
            onClick={() => void signIn()}
          >
            {LINK_WORDS.signIn}
          </Button>
        </div>
      );
    }
    if (step.kind === 'match' && session) {
      return (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            {LINK_WORDS.matchHelp(session.institutionName)}
          </p>
          <LinkMatchView
            rows={session.accounts}
            choices={choices}
            isBusy={isBusy}
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
          {picked === 0 && (
            <p className='text-muted-foreground text-sm'>
              {LINK_WORDS.nothingPicked}
            </p>
          )}
          <Button
            type='button'
            className='w-full'
            loading={isBusy}
            disabled={isBusy || picked === 0}
            onClick={() => void linkThese()}
          >
            {LINK_WORDS.linkThese}
          </Button>
        </div>
      );
    }
    if (step.kind === 'offers') {
      return (
        <div className='space-y-4'>
          <div className='space-y-1'>
            <p className='text-2xl font-semibold'>{LINK_WORDS.useBankTitle}</p>
            <p className='text-muted-foreground text-sm'>
              {LINK_WORDS.useBankHelp}
            </p>
          </div>
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {step.offers.map((offer) => (
              <li key={offer.accountId} className='space-y-2 p-3'>
                <p className='font-medium break-words'>{offer.name}</p>
                <p className='text-muted-foreground text-sm'>
                  {LINK_WORDS.yours}:{' '}
                  {offer.yoursCents === null ? (
                    LINK_WORDS.noneTyped
                  ) : (
                    <SensitiveValue>
                      {formatCents(offer.yoursCents)}
                    </SensitiveValue>
                  )}
                  {' · '}
                  {LINK_WORDS.bank}:{' '}
                  <SensitiveValue>
                    {formatCents(offer.bankCents)}
                  </SensitiveValue>
                </p>
                {settled.has(offer.accountId) ? (
                  <p className='text-muted-foreground text-sm' role='status'>
                    {LINK_WORDS.updated(offer.name)}
                  </p>
                ) : (
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      onClick={() => void acceptBanks(offer)}
                    >
                      {LINK_WORDS.useBanks}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='secondary'
                      onClick={() => keepMine(offer)}
                    >
                      {LINK_WORDS.keepMine}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {message && (
            <p className='text-destructive text-sm' role='alert'>
              {message}
            </p>
          )}
          <Button
            type='button'
            className='w-full'
            onClick={() => setStep({ kind: 'done', count: step.count })}
          >
            {LINK_WORDS.finish}
          </Button>
        </div>
      );
    }
    if (step.kind === 'done') {
      return (
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
          <Button type='button' className='w-full' onClick={onClose}>
            {LINK_WORDS.finish}
          </Button>
        </div>
      );
    }
    return null;
  };

  return (
    <Subview
      overlay
      title={LINK_WORDS.title}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      {getBody()}
    </Subview>
  );
}

export default LinkBankScreen;
