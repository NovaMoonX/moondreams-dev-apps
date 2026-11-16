import { useEffect, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import InlineNotice from '@/components/InlineNotice';
import NotchedSlider from '@/components/NotchedSlider';
import { MultiPillGroup } from '@/components/PillGroup';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import RadioRows from '@apps/helm/components/scheduled/RadioRows';
import { HELM_COPY } from '@apps/helm/constants';
import {
  fixedSampleFor,
  findOpenClashes,
  findTraitClashes,
  HONESTY_LABELS,
  HONESTY_LEVELS,
  KEEP_BOTH_LINES,
  MAX_TRAITS,
  PERSONALITY_TRAITS,
  personalityHash,
  PREVIEW_PROMPTS,
  TRAIT_LABELS,
  type Personality,
  type PersonalityTrait,
} from '@apps/helm/engine/personality';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useAssistantPersonality } from '@apps/helm/hooks/useAssistantPersonality';
import {
  askPersonalityPreview,
  setPersonality,
} from '@apps/helm/store/actions/personalityActions';

const PREVIEW_DELAY_MS = 1_500;

const TRAIT_OPTIONS = PERSONALITY_TRAITS.map((trait) => ({
  value: trait,
  label: TRAIT_LABELS[trait],
}));

const HONESTY_OPTIONS = HONESTY_LEVELS.map((level) => ({
  value: level,
  label: '',
  ariaLabel: HONESTY_LABELS[level],
}));

const LABEL_ALIGN = ['text-left', 'text-center', 'text-right'];

interface PersonalityScreenProps {
  onClose: () => void;
}

interface AskedPreview {
  hash: string;
  replies: string[];
}

function ClashChoices({
  assistant,
  personality,
  onChange,
}: {
  assistant: string;
  personality: Personality;
  onChange: (next: Personality) => void;
}) {
  const clash = findOpenClashes(personality)[0];
  if (!clash) return null;
  const left = TRAIT_LABELS[clash.left];
  const right = TRAIT_LABELS[clash.right];
  const drop = (trait: PersonalityTrait) =>
    onChange({
      ...personality,
      traits: personality.traits.filter((entry) => entry !== trait),
    });
  const choose = (value: string) =>
    value === 'keep'
      ? onChange({
          ...personality,
          keptClashes: [...personality.keptClashes, clash.key],
        })
      : drop(value === clash.left ? clash.left : clash.right);

  return (
    <InlineNotice
      tone='info'
      title={HELM_COPY.personalityClashTitle(left, right)}
    >
      <div className='space-y-2.5'>
        <p>{HELM_COPY.personalityClashLabel(assistant)}</p>
        <RadioRows
          value=''
          onChange={choose}
          rows={[
            {
              value: 'keep',
              label: HELM_COPY.personalityKeepBoth,
              subtitle: KEEP_BOTH_LINES[clash.key],
            },
            { value: clash.left, label: HELM_COPY.personalityDrop(left) },
            { value: clash.right, label: HELM_COPY.personalityDrop(right) },
          ]}
        />
      </div>
    </InlineNotice>
  );
}

function SampleTurn({
  prompt,
  reply,
  isWorking = false,
}: {
  prompt: string;
  reply: string;
  isWorking?: boolean;
}) {
  return (
    <div className='space-y-2'>
      <p className='bg-primary text-primary-foreground ml-auto w-fit max-w-[84%] rounded-[18px_18px_4px_18px] px-3.5 py-2.5 text-[15px] leading-[21px] break-words'>
        {prompt}
      </p>
      <AssistantLine isWorking={isWorking} isQuiet={isWorking}>
        {reply}
      </AssistantLine>
    </div>
  );
}

/** How the assistant talks: traits, how honest, and a sample of how replies will read. Each change writes at once and touches nothing else. */
function PersonalityScreen({ onClose }: PersonalityScreenProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const personality = useAssistantPersonality();
  const storedPreview = useAppSelector(
    (state) => state.helm.profile?.personalityPreview,
  );
  const isOffline = useNetworkStatus() === 'offline';
  const [isFull, setIsFull] = useState(false);
  const [asked, setAsked] = useState<AskedPreview | null>(null);
  const [failedHash, setFailedHash] = useState<string | null>(null);
  const hash = personalityHash(personality);
  const isKnown = storedPreview?.hash === hash || asked?.hash === hash;

  useEffect(() => {
    if (isKnown || isOffline) return;
    let isCancelled = false;
    const timer = window.setTimeout(() => {
      askPersonalityPreview(personality)
        .then((result) => {
          if (!isCancelled) setAsked({ hash, replies: result.replies });
        })
        .catch((error: unknown) => {
          console.error('Helm personality preview was not made', error);
          if (!isCancelled) setFailedHash(hash);
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [hash, isKnown, isOffline, personality]);

  const replies = isKnown
    ? ((storedPreview?.hash === hash
        ? storedPreview.replies
        : asked?.replies) ?? [])
    : [];
  const isWaiting = !isKnown && !isOffline && failedHash !== hash;
  const firstReply = replies[0] ?? fixedSampleFor(personality);
  const secondReply = replies[1];

  const save = (next: Personality) => {
    if (!user) return;
    const pairs = findTraitClashes(next.traits).map((clash) => clash.key);
    setPersonality(user.uid, {
      ...next,
      keptClashes: next.keptClashes.filter((key) => pairs.includes(key)),
    }).catch((error: unknown) => {
      console.error('Helm personality was not saved', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
  };

  const changeTraits = (traits: PersonalityTrait[]) => {
    const isTooMany =
      traits.length > MAX_TRAITS && traits.length > personality.traits.length;
    setIsFull(isTooMany);
    if (!isTooMany) save({ ...personality, traits });
  };

  return (
    <Subview
      overlay
      title={HELM_COPY.personalityRow(assistant)}
      onClose={onClose}
    >
      <div className='space-y-4'>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.personalityLead(assistant)}
        </p>
        <SectionHeader
          title={HELM_COPY.personalityTraitsHeader(
            personality.traits.length,
            MAX_TRAITS,
          )}
        />
        <div className='space-y-3'>
          <MultiPillGroup
            label={HELM_COPY.personalityTraitsLabel}
            options={TRAIT_OPTIONS}
            values={personality.traits}
            onChange={changeTraits}
            showAll
          />
          {isFull && (
            <p
              role='status'
              className='text-muted-foreground text-[13px] text-pretty'
            >
              {HELM_COPY.personalityTooMany}
            </p>
          )}
          <ClashChoices
            assistant={assistant}
            personality={personality}
            onChange={(next) => {
              setIsFull(false);
              save(next);
            }}
          />
        </div>
        <SectionHeader title={HELM_COPY.personalityHonestHeader} />
        <div className='space-y-1'>
          <NotchedSlider
            label={HELM_COPY.personalityHonestHeader}
            options={HONESTY_OPTIONS}
            value={personality.honesty}
            onChange={(honesty) => save({ ...personality, honesty })}
            className='w-full'
          />
          <div className='grid grid-cols-3 gap-2 text-[13px] text-pretty'>
            {HONESTY_OPTIONS.map((option, index) => (
              <span
                key={option.value}
                className={join(
                  LABEL_ALIGN[index],
                  option.value === personality.honesty
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {option.ariaLabel}
              </span>
            ))}
          </div>
        </div>
        <SectionHeader title={HELM_COPY.personalityPreviewHeader} />
        <div className='bg-muted space-y-4 rounded-[14px] p-3'>
          <SampleTurn
            prompt={PREVIEW_PROMPTS[0]}
            reply={isWaiting ? HELM_COPY.personalityPreviewWaiting : firstReply}
            isWorking={isWaiting}
          />
          {secondReply !== undefined && (
            <SampleTurn prompt={PREVIEW_PROMPTS[1]} reply={secondReply} />
          )}
        </div>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.personalityCareNote}
        </p>
      </div>
    </Subview>
  );
}

export default PersonalityScreen;
