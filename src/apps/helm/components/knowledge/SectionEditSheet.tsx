import { useId, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import {
  HELM_COPY,
  SECTION_HEADING_MAX,
  SECTION_MARKDOWN_MAX,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  removeTopicSection,
  saveTopicSection,
  type DocumentChange,
} from '@apps/helm/store/actions/topicActions';
import type { TopicSection } from '@apps/helm/types';

interface SectionEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  /** The topic's version now; the editor keeps the one it opened on and refuses to overwrite a newer one. */
  version: number;
  /** The part being changed; null adds a new one at the end. */
  section: TopicSection | null;
}

interface SectionFormProps extends Omit<SectionEditSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const refusalLine = (kind: Exclude<DocumentChange, 'saved'>) =>
  kind === 'offline'
    ? HELM_COPY.editNeedsConnection
    : kind === 'tooMany'
      ? HELM_COPY.sectionFull
      : kind === 'tooLong'
        ? HELM_COPY.sectionTooLong
        : kind === 'busy'
          ? HELM_COPY.sectionBusy
          : kind === 'unreadable'
            ? HELM_COPY.topicUnreadable
            : kind === 'missing'
              ? HELM_COPY.sectionGone
              : HELM_COPY.topicChanged;

function SectionForm({
  topicId,
  version,
  section,
  onClose,
  requestClose,
  onDirtyChange,
}: SectionFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [seenVersion] = useState(version);
  const [isChanged, setIsChanged] = useState(false);
  const fieldId = useId();
  const [heading, setHeading] = useState(section?.heading ?? '');
  const [markdown, setMarkdown] = useState(section?.markdown ?? '');
  const [isTouched, setIsTouched] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const isMissing = markdown.trim() === '';

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      onDirtyChange(true);
    };

  const save = async () => {
    if (!user || isBusy) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsBusy(true);
    try {
      const result = await saveTopicSection(
        user.uid,
        await getHelmEncryption(user.uid),
        topicId,
        section?.id ?? null,
        { heading: heading || null, level: section?.level ?? 2, markdown },
        section ? seenVersion : null,
      );
      if (result === 'saved') {
        addToast({
          title: section ? HELM_COPY.sectionSaved : HELM_COPY.sectionAdded,
          type: 'success',
        });
        onClose();
        return;
      }
      if (result === 'changed') setIsChanged(true);
      else addToast({ title: refusalLine(result), type: 'info' });
    } catch (error) {
      console.error('Helm topic part was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  const remove = async () => {
    if (!user || !section || isBusy) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.sectionRemoveTitle,
      message: HELM_COPY.sectionRemoveConfirm,
      confirmText: HELM_COPY.sectionRemoveAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    try {
      const result = await removeTopicSection(
        user.uid,
        await getHelmEncryption(user.uid),
        topicId,
        section.id,
        seenVersion,
      );
      if (result === 'saved') {
        addToast({ title: HELM_COPY.sectionRemoved, type: 'success' });
        onClose();
        return;
      }
      if (result === 'changed') setIsChanged(true);
      else addToast({ title: refusalLine(result), type: 'info' });
    } catch (error) {
      console.error('Helm topic part was not removed', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-heading`} className='text-sm font-medium'>
          {HELM_COPY.sectionHeadingField}
        </label>
        <Input
          id={`${fieldId}-heading`}
          value={heading}
          maxLength={SECTION_HEADING_MAX}
          placeholder={HELM_COPY.sectionHeadingPlaceholder}
          autoFocus={canFocusFieldOnOpen()}
          onChange={(event) => edit(setHeading)(event.target.value)}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-words`} className='text-sm font-medium'>
          {HELM_COPY.sectionWordsField}
        </label>
        <Textarea
          id={`${fieldId}-words`}
          variant='outline'
          rows={6}
          autoExpand
          value={markdown}
          maxLength={SECTION_MARKDOWN_MAX}
          placeholder={HELM_COPY.sectionWordsPlaceholder}
          onChange={(event) => edit(setMarkdown)(event.target.value)}
        />
        <p className='text-muted-foreground text-xs'>
          {HELM_COPY.sectionWordsHint}
        </p>
      </div>
      <ModalFooterActions
        note={
          isChanged
            ? HELM_COPY.sectionChangedSince
            : isTouched && isMissing
              ? HELM_COPY.sectionWordsMissing
              : null
        }
        leftActions={
          section ? (
            <DeleteIconButton
              label={HELM_COPY.sectionRemoveAria}
              disabled={isBusy}
              onClick={() => void remove()}
            />
          ) : undefined
        }
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isBusy}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isBusy} onClick={() => void save()}>
            {HELM_COPY.editSave}
          </Button>
        }
      />
    </div>
  );
}

/** Edit one part of a topic's document by hand, or add a part at its end. A part saved here stays the person's own. */
function SectionEditSheet({
  isOpen,
  onClose,
  topicId,
  version,
  section,
}: SectionEditSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const close = () => {
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={section ? HELM_COPY.sectionEditTitle : HELM_COPY.sectionAddTitle}
    >
      {isOpen && (
        <SectionForm
          topicId={topicId}
          version={version}
          section={section}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default SectionEditSheet;
