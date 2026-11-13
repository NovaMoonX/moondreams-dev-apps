import { useState, type ReactNode } from 'react';
import { CalendarClock, Landmark, Receipt } from 'lucide-react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FeatureOffer from '@/components/FeatureOffer';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useAppSelector } from '@/store';
import { formatList } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import ItemRow from '@apps/runway/components/ItemRow';
import { CARD_WORDS, LINK_WORDS } from '@apps/runway/constants';
import { getStatementMinimum } from '@apps/runway/engine/cards';
import { useCanLinkBank } from '@apps/runway/hooks/useCanLinkBank';
import { agreeToCardDetails } from '@apps/runway/store/actions/linkActions';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type {
  DateOnly,
  OpenCard,
  OpenCardStatement,
  OpenLink,
} from '@apps/runway/types';
import {
  dayOf,
  describeStatementIssued,
  getCardName,
} from '@apps/runway/utils/cardText';

interface CardStatementSectionProps {
  card: OpenCard;
  link: OpenLink | null;
  statement: OpenCardStatement | null;
  today: DateOnly;
}

const OFFER_HIDDEN_PREFIX = 'runway-card-details-offer-hidden';
const parseHidden = (stored: unknown) =>
  typeof stored === 'boolean' ? stored : null;

function StatementIcon({ icon }: { icon: ReactNode }) {
  return (
    <span
      className='bg-accent text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full [&>svg]:size-4'
      aria-hidden='true'
    >
      {icon}
    </span>
  );
}

/** The bank's minimum row in every state it can be in, so a card whose bank answered never shows nothing. */
function MinimumRow({
  statement,
  today,
}: {
  statement: OpenCardStatement;
  today: DateOnly;
}) {
  const minimum = getStatementMinimum(statement);
  const icon = <StatementIcon icon={<CalendarClock />} />;
  if (minimum.kind === 'paid') {
    return (
      <ItemRow
        name={CARD_WORDS.minimumDue}
        leading={icon}
        detail={CARD_WORDS.minimumPaidDetail(
          formatCents(minimum.paidCents),
          dayOf(minimum.paidOn),
        )}
        figure={CARD_WORDS.minimumPaid}
        isFigureMuted
      />
    );
  }
  if (minimum.kind === 'none') {
    return (
      <ItemRow
        name={CARD_WORDS.minimumDue}
        leading={icon}
        detail={CARD_WORDS.minimumNone}
        figure={formatCents(0)}
      />
    );
  }
  if (minimum.kind === 'notShared') return null;
  const { dueOn } = minimum;
  return (
    <ItemRow
      name={CARD_WORDS.minimumDue}
      leading={icon}
      detail={
        dueOn === null
          ? null
          : dueOn < today
            ? CARD_WORDS.minimumWasDue(dayOf(dueOn))
            : CARD_WORDS.minimumDueOn(dayOf(dueOn))
      }
      figure={formatCents(minimum.cents)}
    />
  );
}

/** What a linked card's bank says on its statement: the minimum (owed, paid, nothing or not shared) and the statement balance; or, while the bank waits for the person's agreement, a new-feature offer that names the sign-in it covers. Nothing for a card typed by hand or a link not asked yet. */
function CardStatementSection({
  card,
  link,
  statement,
  today,
}: CardStatementSectionProps) {
  const { addToast } = useToast();
  const canLink = useCanLinkBank();
  const cards = useAppSelector(selectAllCards);
  const links = useAppSelector((state) => state.runway.links);
  const [isBusy, setIsBusy] = useState(false);
  const [isOfferHidden, setIsOfferHidden] = useLocalStorageState(
    `${OFFER_HIDDEN_PREFIX}:${link?.id ?? 'none'}`,
    false,
    parseHidden,
  );
  if (link === null || link.status !== 'active') return null;
  const bank = link.institutionName || LINK_WORDS.fallbackBank;

  if (link.cardDetails === 'needsConsent') {
    if (!canLink) return null;
    const agree = async () => {
      if (isBusy) return;
      setIsBusy(true);
      try {
        const result = await agreeToCardDetails(link.id);
        if (result === null) return;
        addToast({
          title:
            result.state === 'ok'
              ? CARD_WORDS.offerDone(bank)
              : LINK_WORDS.reconnectStillStuck(bank),
          type: result.state === 'ok' ? 'success' : 'info',
        });
      } catch (error) {
        addToast({
          title: getErrorMessage(error, CARD_WORDS.offerFailed(bank)),
          type: 'error',
        });
      } finally {
        setIsBusy(false);
      }
    };
    const others = cards.filter(
      (other) =>
        other.id !== card.id &&
        other.archivedAt === null &&
        other.linkId === link.id,
    );
    const isSeparateSignIn = links.some(
      (other) =>
        other.id !== link.id &&
        other.status === 'active' &&
        link.institutionName !== '' &&
        other.institutionName === link.institutionName,
    );
    const scope =
      others.length > 0
        ? CARD_WORDS.offerCovers(
            formatList(
              others.map(
                (other) => other.name?.trim() || getCardName(other, cards),
              ),
            ),
          )
        : isSeparateSignIn
          ? CARD_WORDS.offerSeparate(bank)
          : null;
    return (
      <FeatureOffer
        title={CARD_WORDS.offerTitle}
        body={CARD_WORDS.offerBody(bank)}
        scope={scope}
        badge={CARD_WORDS.offerBadge}
        actionLabel={
          isBusy ? LINK_WORDS.refreshing : CARD_WORDS.offerAction(bank)
        }
        laterLabel={CARD_WORDS.offerLater}
        isBusy={isBusy}
        onAction={() => void agree()}
        onLater={() => setIsOfferHidden(true)}
        folded={{
          isFolded: isOfferHidden,
          icon: <Landmark />,
          label: isBusy ? LINK_WORDS.refreshing : CARD_WORDS.offerRow(bank),
          subtitle: CARD_WORDS.offerRowHelp,
        }}
      />
    );
  }

  const isAnswered =
    link.cardDetails === 'shared' || link.cardDetails === 'unsupported';
  if (!isAnswered && statement === null) return null;
  const minimum = statement === null ? null : getStatementMinimum(statement);
  return (
    <ActionSection caption={CARD_WORDS.statementCaption(bank)}>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {statement !== null && (
          <MinimumRow statement={statement} today={today} />
        )}
        {statement !== null && statement.statementCents !== null && (
          <ItemRow
            name={CARD_WORDS.statementBalance}
            leading={<StatementIcon icon={<Receipt />} />}
            detail={describeStatementIssued(statement.statementOn)}
            figure={formatCents(statement.statementCents)}
          />
        )}
        {(minimum === null || minimum.kind === 'notShared') && (
          <li className='text-muted-foreground px-4 py-3 text-sm'>
            {CARD_WORDS.minimumNotShared(bank)}
          </li>
        )}
      </ul>
    </ActionSection>
  );
}

export default CardStatementSection;
