import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ChoiceCards from '@apps/runway/components/ChoiceCards';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { CHANGE_WORDS, FORM_FLOW_WORDS } from '@apps/runway/constants';
import type { ChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { getFromWhenOptions } from '@apps/runway/utils/fromWhen';

interface ChangeWhenProps {
  flow: ChangeFlow;
  onClose: () => void;
}

/** Asked after the form when it was opened from an income day's screen, since that edit may be meant for that day rather than from now on; nothing is chosen for the person. */
function ChangeWhen({ flow, onClose }: ChangeWhenProps) {
  const day = flow.presetDay;
  if (day === null) return null;
  const dayText = formatDateOrdinalUTC(day.on);
  const meanings = {
    fromDay: CHANGE_WORDS.fromDayMeaning(dayText),
    dayOnly: CHANGE_WORDS.dayOnlyMeaning(dayText),
    now: CHANGE_WORDS.fromNowMeaning(dayText),
  } as const;
  const options = getFromWhenOptions({
    kind: flow.kind,
    days: flow.days,
    presetDayKey: flow.presetDayKey,
    today: flow.today,
    isPlanning: false,
  }).flatMap(({ value, label }) =>
    value === 'fromDay' || value === 'dayOnly' || value === 'now'
      ? [{ value, title: label, body: meanings[value] }]
      : [],
  );
  const chosen =
    flow.hasPickedWhen &&
    options.some((option) => option.value === flow.from.choice)
      ? (flow.from.choice as (typeof options)[number]['value'])
      : null;

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto [@media(max-height:419px)]:gap-2.5'>
      <BackLink onBack={() => flow.setStep('form')} />
      <div className='space-y-1'>
        <ActionTitle>{CHANGE_WORDS.whenHeading}</ActionTitle>
        <p className='text-muted-foreground text-sm'>
          {CHANGE_WORDS.whenOpenedFrom(dayText)}
        </p>
      </div>
      <ChoiceCards options={options} value={chosen} onChange={flow.pickWhen} />
      {chosen !== null && flow.whenBlocker === null && (
        <EffectPreview
          isCompact
          changeJson={flow.changeJson}
          holds={flow.holds}
        />
      )}
      <ModalFooterActions
        note={flow.whenBlocker}
        cancelAction={
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={flow.whenBlocker !== null}
            onClick={() => flow.setStep('reason')}
          >
            {FORM_FLOW_WORDS.next}
          </Button>
        }
      />
    </div>
  );
}

export default ChangeWhen;
