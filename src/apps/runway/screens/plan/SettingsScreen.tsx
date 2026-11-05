import { useState, type ReactNode } from 'react';
import InlineNotice from '@/components/InlineNotice';
import {
  Activity,
  ChevronRight,
  Gauge,
  Landmark,
  Link2,
  Trash2,
} from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import GatesClosedNote from '@/components/GatesClosedNote';
import { PillGroup } from '@/components/PillGroup';
import Subview from '@/components/Subview';
import SummaryEditor from '@/components/SummaryEditor';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  DELETE_PLAN_WORDS,
  LINK_WORDS,
  SETTINGS_GROUP_WORDS,
  STANCE_HELP,
  STANCE_LABELS,
  STANCES,
  TRACKING_WORDS,
} from '@apps/runway/constants';
import { ActionSection } from '@apps/runway/components/ActionSection';
import { getOpenPeriod } from '@apps/runway/engine/level';
import { useCanLinkBank } from '@apps/runway/hooks/useCanLinkBank';
import LinkBankScreen from '@apps/runway/screens/link/LinkBankScreen';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { setStance } from '@apps/runway/store/actions/planActions';
import { selectStance } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenLink, Stance } from '@apps/runway/types';
import {
  describeUnfinishedLink,
  isUnfinishedLink,
} from '@apps/runway/utils/linkText';

const stanceOptions = STANCES.map((value) => ({
  value,
  label: STANCE_LABELS[value],
}));

interface SettingsRowProps {
  icon: ReactNode;
  label: string;
  value: string;
  isDestructive?: boolean;
  /** The last row of a frame that holds several: the frame draws the border. */
  isGrouped?: boolean;
  /** A row inside a frame with more rows under it. */
  isMiddle?: boolean;
  onOpen: () => void;
}

/** A row that opens a settings view, drawn like the stance's summary row so the screen has one anatomy. */
function SettingsRow({
  icon,
  label,
  value,
  isDestructive = false,
  isGrouped = false,
  isMiddle = false,
  onOpen,
}: SettingsRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        'hover:bg-muted text-foreground! h-auto min-h-16 w-full items-start justify-start gap-3 px-3! py-2 text-left font-normal whitespace-normal',
        isMiddle
          ? 'rounded-none'
          : isGrouped
            ? 'rounded-none rounded-b-2xl'
            : 'border-border rounded-2xl border',
      )}
      onClick={onOpen}
    >
      <span
        className={join(
          'mt-0.5 grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5',
          isDestructive
            ? 'bg-destructive/10 text-destructive'
            : 'bg-accent text-accent-foreground',
        )}
        aria-hidden='true'
      >
        {icon}
      </span>
      <span className='flex min-h-11 min-w-0 flex-1 flex-col justify-center'>
        <span
          className={join(
            'block text-base',
            isDestructive && 'text-destructive',
          )}
        >
          {label}
        </span>
        <span className='text-muted-foreground block text-sm'>{value}</span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-3 -ml-1 size-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

interface SettingsScreenProps {
  onClose: () => void;
}

/** How the whole plan reads a range of pay or a bill; one pay line or bill can plan at its own end instead. */
function SettingsScreen({ onClose }: SettingsScreenProps) {
  const { user } = useAuth();
  const stance = useAppSelector(selectStance);
  const periods = useAppSelector(
    (state) => state.runway.plan?.trackingPeriods ?? [],
  );
  const { openSettingsView } = useRunwayUrlState();
  const open = getOpenPeriod(periods);
  const [error, setError] = useState<string | null>(null);
  const canLink = useCanLinkBank();
  const links = useAppSelector((state) => state.runway.links);
  const unfinished = links.filter(isUnfinishedLink);
  const [linking, setLinking] = useState<{ resume: OpenLink | null } | null>(
    null,
  );

  const choose = async (next: Stance) => {
    if (!user) return;
    setError(null);
    try {
      await setStance(user.uid, next);
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'The stance did not save. Nothing was changed.',
        ),
      );
    }
  };

  return (
    <Subview title='Settings' onClose={onClose}>
      <div className='space-y-6'>
        <ActionSection caption={SETTINGS_GROUP_WORDS.planning}>
          <div className='border-border divide-border divide-y rounded-2xl border'>
            <SummaryEditor
              label='Planning stance'
              summary={STANCE_LABELS[stance]}
              placeholder=''
              title='Planning stance'
              icon={<Gauge />}
              groupPosition='first'
              shouldFocus={false}
            >
              <PillGroup
                label='Planning stance'
                options={stanceOptions}
                value={stance}
                onChange={(next) => void choose(next)}
              />
              <InlineNotice tone='info'>{STANCE_HELP[stance]}</InlineNotice>
              <p className='text-muted-foreground text-sm'>
                {SETTINGS_GROUP_WORDS.rangeNote}
              </p>
              {error && (
                <p className='text-destructive text-sm' role='alert'>
                  {error}
                </p>
              )}
            </SummaryEditor>
            <SettingsRow
              isGrouped
              icon={<Activity />}
              label={TRACKING_WORDS.rowLabel}
              value={
                open === null
                  ? 'Plan only'
                  : `${open.linkedFrom ? 'Link' : 'Track'}, since ${formatDateOrdinalUTC(open.from)}`
              }
              onOpen={() => openSettingsView('tracking')}
            />
          </div>
        </ActionSection>
        {canLink && (
          <ActionSection caption={LINK_WORDS.yourBank}>
            <div className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
              {unfinished.map((link) => (
                <SettingsRow
                  key={link.id}
                  isMiddle
                  icon={<Link2 />}
                  label={LINK_WORDS.unfinishedRow(link.institutionName)}
                  value={describeUnfinishedLink(link)}
                  onOpen={() => setLinking({ resume: link })}
                />
              ))}
              <SettingsRow
                isMiddle
                icon={<Landmark />}
                label={LINK_WORDS.settingsRow}
                value={LINK_WORDS.settingsRowHelp}
                onOpen={() => setLinking({ resume: null })}
              />
            </div>
          </ActionSection>
        )}
        <ActionSection caption={SETTINGS_GROUP_WORDS.plan}>
          <SettingsRow
            icon={<Trash2 />}
            label={DELETE_PLAN_WORDS.rowLabel}
            value={DELETE_PLAN_WORDS.rowHelp}
            isDestructive
            onOpen={() => openSettingsView('delete')}
          />
        </ActionSection>
        <GatesClosedNote appId='runway' />
      </div>
      {linking && (
        <LinkBankScreen
          resume={linking.resume}
          onClose={() => setLinking(null)}
        />
      )}
    </Subview>
  );
}

export default SettingsScreen;
