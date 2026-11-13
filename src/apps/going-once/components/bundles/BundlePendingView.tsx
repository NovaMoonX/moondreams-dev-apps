import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus, X } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import { PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { MAX_BUYER_NAME_LENGTH } from '@apps/going-once/constants';
import { useStatusWrite } from '@apps/going-once/hooks/useStatusWrite';
import { changeBundleStatus } from '@apps/going-once/store/actions/bundleActions';
import type { Bundle, Inquiry } from '@apps/going-once/types';
import { getAskerPills } from '@apps/going-once/utils/inquiries';
import {
  getDayOptions,
  OTHER_DAY,
  type HoldDraft,
} from '@apps/going-once/utils/statusDrafts';

const ASKERS_SHOWN = 6;

interface BundlePendingViewProps {
  bundle: Bundle;
  /** Inquiries about the things in the deal, offered as who it is for. */
  inquiries: Inquiry[];
  uid: string;
  now: number;
  draft: HoldDraft;
  onDraft: (next: HoldDraft) => void;
  footerNode: HTMLElement | null;
  onBack: () => void;
  onLeave: () => void;
  onDone: () => void;
}

/** Who is picking the whole bundle up, and when; both are optional, so Mark pending is on from the start. */
function BundlePendingView({
  bundle,
  inquiries,
  uid,
  now,
  draft,
  onDraft,
  footerNode,
  onBack,
  onLeave,
  onDone,
}: BundlePendingViewProps) {
  const { isBusy, refusal, write } = useStatusWrite();
  const dayOptions = [
    ...getDayOptions(now),
    { value: OTHER_DAY, label: 'Other day' },
  ];
  const today = toLocalDateInputValue(now);
  const pickedDay = draft.isOtherDay ? OTHER_DAY : draft.day;
  const pills = getAskerPills(inquiries, now).slice(0, ASKERS_SHOWN);
  const typedName = draft.name.trim().toLowerCase();
  const picked =
    pills.find((pill) =>
      draft.inquiryId === null
        ? typedName !== '' && pill.name.toLowerCase() === typedName
        : pill.inquiryIds.includes(draft.inquiryId),
    ) ?? null;

  const save = async () => {
    const buyerName = draft.name.trim() === '' ? null : draft.name.trim();
    const pickupOn = draft.isDayShown
      ? (fromDateInputValue(draft.day) ?? null)
      : null;
    const isSaved = await write(() =>
      changeBundleStatus(bundle.saleId, bundle.id, uid, {
        kind: 'MARK_PENDING',
        inquiryId: draft.inquiryId,
        buyerName,
        pickupOn,
      }),
    );
    if (isSaved) onDone();
  };

  const pickAsker = (id: string) => {
    if (pills.find((pill) => pill.id === id) === picked) return;
    onDraft({
      ...draft,
      inquiryId: id,
      name: inquiries.find((inquiry) => inquiry.id === id)?.name ?? draft.name,
    });
  };

  const pickDay = (value: string) => {
    if (value === OTHER_DAY) {
      onDraft({ ...draft, isOtherDay: true });
      return;
    }
    onDraft({ ...draft, isOtherDay: false, day: value });
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <BackLink onBack={onBack} label={bundle.name} />
        <p className='text-lg font-semibold'>Who&apos;s picking it up?</p>
      </div>
      {pills.length > 0 && (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>Someone who asked</p>
          <PillGroup
            label='Someone who asked'
            options={pills.map((pill) => ({
              value: pill.id,
              label: pill.label,
            }))}
            value={picked?.id ?? null}
            onChange={pickAsker}
          />
        </div>
      )}
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>Their name (optional)</p>
        <Input
          aria-label='Their name'
          placeholder='Their name'
          value={draft.name}
          maxLength={MAX_BUYER_NAME_LENGTH}
          autoComplete='off'
          disabled={refusal !== null}
          onChange={(event) =>
            onDraft({ ...draft, inquiryId: null, name: event.target.value })
          }
        />
      </div>
      {draft.isDayShown ? (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>Pickup day (optional)</p>
          <PillGroup
            label='Pickup day'
            options={dayOptions}
            value={pickedDay === '' ? null : pickedDay}
            onChange={pickDay}
          />
          {draft.isOtherDay && (
            <DateInput
              variant='outline'
              aria-label='Pickup day'
              min={today}
              value={draft.day}
              onChange={(event) =>
                onDraft({ ...draft, day: event.target.value })
              }
            />
          )}
          <RevealChip
            icon={<X className='size-4' aria-hidden='true' />}
            onClick={() =>
              onDraft({
                ...draft,
                isDayShown: false,
                isOtherDay: false,
                day: '',
              })
            }
          >
            No pickup day
          </RevealChip>
        </div>
      ) : (
        <RevealChip
          icon={<Plus className='size-4' aria-hidden='true' />}
          onClick={() => onDraft({ ...draft, isDayShown: true })}
        >
          Add a pickup day
        </RevealChip>
      )}
      <p className='text-muted-foreground text-sm'>
        Buyers still see the bundle, marked Pending.
      </p>
      <StatusViewFooter
        footerNode={footerNode}
        note={
          draft.isDayShown && draft.day === ''
            ? 'No day picked, so it saves without one'
            : null
        }
        lockedNote={refusal}
        onDone={onLeave}
      >
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          disabled={isBusy}
          onClick={() => void save()}
        >
          Mark pending
        </Button>
      </StatusViewFooter>
    </div>
  );
}

export default BundlePendingView;
