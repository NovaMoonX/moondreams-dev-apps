import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import HelpTip from '@/components/HelpTip';
import ShowMoreButton from '@/components/ShowMoreButton';
import {
  readTidyOffer,
  readWhySource,
} from '@apps/helm/components/projects/goalWhyView';
import { useGoalWhyChoice } from '@apps/helm/components/projects/useGoalWhyChoice';
import WhyTidyOffer from '@apps/helm/components/projects/WhyTidyOffer';
import SourceRing from '@apps/helm/components/who/SourceRing';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import type { OpenProject } from '@apps/helm/types';
import { readShownWhy } from '@apps/helm/utils/goalWhy';

interface WhySheetProps {
  isOpen: boolean;
  onClose: () => void;
  project: OpenProject;
  /** Closes this sheet and opens the goal's edit at the why. */
  onChange: () => void;
}

/** Why the goal matters: the shown words and where they came from, the original behind a fold when a tidied one is shown, and the one-line summary. */
function WhySheet({ isOpen, onClose, project, onChange }: WhySheetProps) {
  const assistantName = useAssistantName();
  const { choose, isBusy } = useGoalWhyChoice(project.id);
  const [isOriginalOpen, setIsOriginalOpen] = useState(false);
  const why = project.why;
  const shown = readShownWhy(why);
  const tidyOffer = readTidyOffer(why);
  const isSaid = why?.captureId !== null;

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.goalWhySheetTitle}
      footer={
        <Button type='button' variant='secondary' onClick={onChange}>
          {HELM_COPY.goalWhyChange}
        </Button>
      }
    >
      {why && shown && (
        <div className='space-y-4'>
          <div className='space-y-2'>
            <p className='text-foreground text-[15px] break-words'>
              {`“${shown.text}”`}
            </p>
            <p className='text-muted-foreground flex items-center gap-2 text-[13px]'>
              <SourceRing isConfirmed label={HELM_COPY.goalWhyRingLabel} />
              {readWhySource(why, shown.isTidied)}
            </p>
          </div>
          {shown.isTidied && (
            <div className='space-y-2'>
              <ShowMoreButton
                isOpen={isOriginalOpen}
                onClick={() => setIsOriginalOpen((isOpen) => !isOpen)}
              >
                {isOriginalOpen
                  ? HELM_COPY.goalWhyHideOriginal
                  : isSaid
                    ? HELM_COPY.goalWhySeeSaid
                    : HELM_COPY.goalWhySeeWrote}
              </ShowMoreButton>
              {isOriginalOpen && (
                <div className='space-y-2'>
                  <blockquote className='bg-muted/40 text-muted-foreground rounded-[10px] p-3 text-[15px] break-words'>
                    {why.verbatim}
                  </blockquote>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    disabled={isBusy}
                    onClick={() => void choose('declined')}
                  >
                    {HELM_COPY.goalWhyShowMine}
                  </Button>
                </div>
              )}
            </div>
          )}
          {tidyOffer && (
            <WhyTidyOffer
              tidied={tidyOffer}
              isBusy={isBusy}
              onKeep={() => void choose('declined')}
              onUse={() => void choose('accepted')}
            />
          )}
          {why.summary && (
            <section className='border-border space-y-1 border-t pt-4'>
              <div className='flex items-center gap-2'>
                <h3 className='text-sm font-medium'>
                  {HELM_COPY.goalWhyInShort}
                </h3>
                <HelpTip title={HELM_COPY.goalWhyInShort}>
                  {HELM_COPY.goalWhySummaryHelp(assistantName)}
                </HelpTip>
              </div>
              <p className='text-muted-foreground text-[15px] break-words'>
                {why.summary}
              </p>
            </section>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default WhySheet;
