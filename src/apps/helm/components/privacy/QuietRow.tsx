import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { VolumeX } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import AppToggle from '@/components/AppToggle';
import DateInput from '@/components/DateInput';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import { type QuietKind } from '@apps/helm/store/actions/privacyActions';
import { useQuietWrite } from '@apps/helm/components/privacy/useQuietWrite';
import { selectParentIndex } from '@apps/helm/store/selectors/privacySelectors';
import {
  isQuietOn,
  readPrivacyFacts,
  readQuietFrom,
} from '@apps/helm/utils/privacy';
import { parentsOf, type PrivacyRecord } from '@apps/helm/utils/privacyParents';
import { readQuietUntilLine } from '@apps/helm/utils/quietDisplay';

interface QuietRowProps {
  kind: QuietKind;
  record: PrivacyRecord;
  title: string;
  /** Opens the project, person or place an inherited quiet comes from; left out, the row opens its page. */
  onOpenParent?: (parentId: string) => void;
}

const linkButton =
  'relative shrink-0 after:absolute after:-inset-2 after:content-[""]';

/** The Keep it quiet switch under Private: shown on screen, never said aloud, with when it ends and where an inherited quiet comes from. */
function QuietRow({ kind, record, title, onOpenParent }: QuietRowProps) {
  const name = useAssistantName();
  const today = useTodayKey();
  const index = useAppSelector(selectParentIndex);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isPicking, setIsPicking] = useState(false);
  const [day, setDay] = useState('');
  const facts = readPrivacyFacts(record);
  const inherited = readQuietFrom(parentsOf(kind, record, index), today);
  const isOwn = isQuietOn(facts, today);
  const isOn = isOwn || inherited !== null;

  const openParent = (parentId: string) => {
    if (onOpenParent) return onOpenParent(parentId);
    const view = index.project.has(parentId)
      ? 'project'
      : index.who.has(parentId)
        ? 'who'
        : 'place';
    afterBackLayersClose(() =>
      navigate(`${pathname}?view=${view}&item=${encodeURIComponent(parentId)}`),
    );
  };

  const { write } = useQuietWrite(kind, record.id, inherited?.name ?? null);

  const saveDay = (until: string | null) => {
    setIsPicking(false);
    void write(
      true,
      until,
      until === null
        ? HELM_COPY.quietNoEndToast(title)
        : HELM_COPY.quietUntilToast(
            title,
            formatDateShortUTC(Date.parse(until)),
          ),
    );
  };

  const onChange = (isQuiet: boolean) => {
    setIsPicking(false);
    void write(
      isQuiet,
      null,
      isQuiet ? HELM_COPY.quietOnToast(title) : HELM_COPY.quietOffToast(title),
    );
  };

  const isDayUsable = day !== '' && day >= today;
  return (
    <div className='mt-3'>
      <div className='flex items-center gap-3'>
        <VolumeX
          className='text-muted-foreground size-[18px] shrink-0'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='text-foreground text-[15px] leading-[21px]'>
            {HELM_COPY.quietRowTitle}
          </p>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.quietRowSubtitle}
          </p>
        </div>
        <AppToggle
          checked={isOn}
          onCheckedChange={onChange}
          aria-label={HELM_COPY.quietRowTitle}
        />
      </div>
      {isOwn && (
        <div className='text-muted-foreground mt-2 flex flex-col gap-2 pl-[30px] text-[13px]'>
          {facts.quietMark === 'guessed' && (
            <p className='text-pretty'>{HELM_COPY.quietGuessed(name)}</p>
          )}
          <div className='flex items-center gap-2'>
            <p className='min-w-0 flex-1'>
              {readQuietUntilLine(facts.quietUntil ?? null, today)}
            </p>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className={linkButton}
              onClick={() => {
                setDay(facts.quietUntil ?? '');
                setIsPicking((was) => !was);
              }}
            >
              {HELM_COPY.privateChange}
            </Button>
          </div>
          {isPicking && (
            <div className='flex flex-col gap-2'>
              <DateInput
                variant='outline'
                aria-label={HELM_COPY.quietDayLabel}
                className='helm-field'
                min={today}
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  disabled={!isDayUsable}
                  onClick={() => saveDay(day)}
                >
                  {HELM_COPY.quietSetDay}
                </Button>
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  onClick={() => saveDay(null)}
                >
                  {HELM_COPY.quietNoEnd}
                </Button>
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  onClick={() => setIsPicking(false)}
                >
                  {HELM_COPY.quietCancel}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {!isOwn && inherited !== null && (
        <div className='text-muted-foreground mt-2 flex items-center gap-2 pl-[30px] text-[13px]'>
          <p className='min-w-0 flex-1'>
            {HELM_COPY.quietFromParent(inherited.name)}
          </p>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className={linkButton}
            onClick={() => openParent(inherited.id)}
          >
            {HELM_COPY.privateOpenParent}
          </Button>
        </div>
      )}
    </div>
  );
}

export default QuietRow;
