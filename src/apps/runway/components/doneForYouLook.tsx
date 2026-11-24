import type { ReactNode } from 'react';

import {
  ArrowLeftRight,
  CircleCheck,
  Clock,
  Flag,
  History,
  Link2,
  PackageX,
  Wand2,
  Undo2,
} from 'lucide-react';

import { DONE_FOR_YOU_WORDS, STORE_ORDER_WORDS } from '@apps/runway/constants';
import DoneForYouHero from '@apps/runway/components/DoneForYouHero';
import ItemBadge from '@apps/runway/components/ItemBadge';
import PurchaseMark from '@apps/runway/components/PurchaseMark';
import type { DoneForYouKind, DoneForYouSubject } from '@apps/runway/types';

const KIND_LOOKS = {
  rule: { icon: <Wand2 />, label: DONE_FOR_YOU_WORDS.kindRule },
  merge: { icon: <Link2 />, label: DONE_FOR_YOU_WORDS.kindMerge },
  charge: { icon: <Link2 />, label: DONE_FOR_YOU_WORDS.kindCharge },
  deposit: { icon: <ArrowLeftRight />, label: DONE_FOR_YOU_WORDS.kindDeposit },
  pair: { icon: <ArrowLeftRight />, label: DONE_FOR_YOU_WORDS.kindPair },
  autoMark: { icon: <CircleCheck />, label: DONE_FOR_YOU_WORDS.kindAutoMark },
  ended: { icon: <Flag />, label: DONE_FOR_YOU_WORDS.kindEnded },
  history: { icon: <History />, label: DONE_FOR_YOU_WORDS.kindHistory },
  released: { icon: <Clock />, label: DONE_FOR_YOU_WORDS.kindReleased },
  storeRefund: { icon: <Undo2 />, label: STORE_ORDER_WORDS.outcomeRefund },
  storeCancel: { icon: <PackageX />, label: STORE_ORDER_WORDS.outcomeCancel },
} satisfies Record<DoneForYouKind, { icon: ReactNode; label: string }>;

const hasLogo = (subject: DoneForYouSubject) =>
  subject.merchantLogo?.startsWith('https://') === true;

/** The leading picture, the corner glyph and the detail card for an entry: the store's logo, else the destination's emoji, else nothing (the sheet then draws the kind's icon). */
export function getDoneForYouLook(
  kind: DoneForYouKind,
  subject: DoneForYouSubject | null,
) {
  const { icon, label } = KIND_LOOKS[kind];
  const getMark = () => {
    if (subject === null) return null;
    if (hasLogo(subject)) {
      return (
        <PurchaseMark
          logo={subject.merchantLogo}
          name={subject.merchant ?? subject.toName ?? ''}
          emoji={subject.toEmoji}
        />
      );
    }
    return subject.toEmoji === null ? null : (
      <ItemBadge name={subject.toName ?? ''} emoji={subject.toEmoji} />
    );
  };
  return {
    mark: getMark(),
    kindIcon: icon,
    kindLabel: label,
    hero:
      subject === null ? undefined : (
        <DoneForYouHero kind={kind} subject={subject} />
      ),
  };
}
