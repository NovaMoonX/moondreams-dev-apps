import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, Plus } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import {
  HELM_COPY,
  STYLE_AVOID_MAX,
  STYLE_TRAIT_LIMIT,
  STYLE_TRAIT_MAX,
} from '@apps/helm/constants';
import {
  addStyleTrait,
  editStyleAvoid,
  editStyleTrait,
  GENERAL_STYLE_ID,
  removeStyleAvoid,
  removeStyleTrait,
  type StyleResult,
} from '@apps/helm/queries/styleMutations';

type Target =
  | { kind: 'add' }
  | { kind: 'trait'; key: string; text: string; source: string }
  | { kind: 'avoid'; text: string };

const getTraitSource = (trait: {
  isPersonSet: boolean;
  exampleCount: number;
}) =>
  trait.isPersonSet
    ? trait.exampleCount === 0
      ? HELM_COPY.styleAddedByYou
      : HELM_COPY.styleEditedByYou
    : HELM_COPY.styleBasedOn(trait.exampleCount);

interface NoteSheetProps {
  target: Target | null;
  onClose: () => void;
}

function NoteSheet({ target, onClose }: NoteSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [isEditing, setIsEditing] = useState(target?.kind === 'add');
  const [text, setText] = useState(
    target?.kind === 'add' ? '' : (target?.text ?? ''),
  );
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isAvoid = target?.kind === 'avoid';
  const isMissing = text.trim() === '';

  const report = (result: StyleResult, doneTitle: string) => {
    if (result.kind === 'done') {
      const { undo } = result;
      onClose();
      addToast({
        title: doneTitle,
        type: 'success',
        action: undo
          ? {
              label: HELM_COPY.undo,
              onClick: () =>
                void undo()
                  .then((undone) => {
                    if (undone.kind !== 'done') {
                      addToast({
                        title: HELM_COPY.styleUndoneFailed,
                        type: 'info',
                      });
                    }
                  })
                  .catch((error: unknown) => {
                    console.error('Helm writing note was not put back', error);
                    addToast({ title: HELM_COPY.editFailed, type: 'error' });
                  }),
            }
          : undefined,
      });
      return;
    }
    setIsSaving(false);
    addToast({
      title:
        result.kind === 'full'
          ? HELM_COPY.styleFull(STYLE_TRAIT_LIMIT)
          : result.kind === 'gone'
            ? HELM_COPY.styleGone
            : HELM_COPY.factNeedsConnection,
      type: 'info',
    });
  };

  const run = async (
    act: (uid: string) => Promise<StyleResult>,
    doneTitle: string,
  ) => {
    if (!user || isSaving) return;
    setIsSaving(true);
    try {
      report(await act(user.uid), doneTitle);
    } catch (error) {
      console.error('Helm writing note was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
      setIsSaving(false);
    }
  };

  const save = () => {
    if (!target) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    if (target.kind === 'add') {
      void run((uid) => addStyleTrait(uid, text), HELM_COPY.styleAdded);
      return;
    }
    if (target.kind === 'trait') {
      void run(
        (uid) => editStyleTrait(uid, target.key, text),
        HELM_COPY.styleSaved,
      );
      return;
    }
    void run(
      (uid) => editStyleAvoid(uid, target.text, text),
      HELM_COPY.styleSaved,
    );
  };

  const remove = () => {
    if (!target || target.kind === 'add') return;
    void run(
      (uid) =>
        target.kind === 'trait'
          ? removeStyleTrait(uid, target.key)
          : removeStyleAvoid(uid, target.text),
      HELM_COPY.styleRemoved,
    );
  };

  return (
    <DetailSheet
      isOpen={target !== null}
      onClose={onClose}
      title={
        target?.kind === 'add'
          ? HELM_COPY.styleAddTitle
          : HELM_COPY.styleSheetTitle
      }
      footer={
        <div className='px-6 pt-2 pb-3'>
          <ModalFooterActions
            note={isTouched && isMissing ? HELM_COPY.styleMissing : null}
            cancelAction={
              <Button
                type='button'
                variant='tertiary'
                onClick={
                  isEditing && target?.kind !== 'add'
                    ? () => setIsEditing(false)
                    : onClose
                }
                disabled={isSaving}
              >
                {HELM_COPY.editCancel}
              </Button>
            }
            rightActions={
              isEditing ? (
                <Button type='button' loading={isSaving} onClick={save}>
                  {HELM_COPY.editSave}
                </Button>
              ) : (
                <>
                  <Button
                    type='button'
                    variant='secondary'
                    disabled={isSaving}
                    onClick={remove}
                  >
                    {HELM_COPY.styleRemove}
                  </Button>
                  <Button type='button' onClick={() => setIsEditing(true)}>
                    {HELM_COPY.styleEdit}
                  </Button>
                </>
              )
            }
          />
        </div>
      }
    >
      {isEditing ? (
        <div className='space-y-1.5'>
          <label htmlFor={fieldId} className='text-sm font-medium'>
            {HELM_COPY.styleField}
          </label>
          <Input
            id={fieldId}
            value={text}
            maxLength={isAvoid ? STYLE_AVOID_MAX : STYLE_TRAIT_MAX}
            placeholder={HELM_COPY.stylePlaceholder}
            autoFocus
            onChange={(event) => setText(event.target.value)}
          />
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.styleHelp}
          </p>
        </div>
      ) : (
        target &&
        target.kind !== 'add' && (
          <div className='space-y-1'>
            <p className='text-[15px] break-words'>
              {target.kind === 'avoid'
                ? HELM_COPY.styleAvoidLine(target.text)
                : target.text}
            </p>
            <p className='text-muted-foreground text-[13px]'>
              {target.kind === 'avoid'
                ? HELM_COPY.styleAvoidSource
                : target.source}
            </p>
          </div>
        )
      )}
    </DetailSheet>
  );
}

/** The writing notes learned from what the person types, each opening a small sheet to edit or remove it, and a way to add one. */
function StyleNotes() {
  const style = useAppSelector((state) =>
    state.helm.style.items.find(
      (entry) => entry.id === GENERAL_STYLE_ID && !entry.isUnreadable,
    ),
  );
  const isLoaded = useAppSelector((state) => state.helm.style.isLoaded);
  const [target, setTarget] = useState<Target | null>(null);
  const traits = Object.entries(style?.traits ?? {}).sort(
    ([, a], [, b]) =>
      Number(b.isPersonSet) - Number(a.isPersonSet) ||
      b.exampleCount - a.exampleCount,
  );
  const avoid = style?.avoid ?? [];
  const isEmpty = traits.length === 0 && avoid.length === 0;

  if (!isLoaded) return null;

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.styleTitle} />
      {isEmpty ? (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {HELM_COPY.styleEmpty}
        </p>
      ) : (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {traits.map(([key, trait]) => (
            <li key={key}>
              <NoteRow
                text={trait.text}
                detail={getTraitSource(trait)}
                onOpen={() =>
                  setTarget({
                    kind: 'trait',
                    key,
                    text: trait.text,
                    source: getTraitSource(trait),
                  })
                }
              />
            </li>
          ))}
          {avoid.map((line) => (
            <li key={`avoid-${line}`}>
              <NoteRow
                text={HELM_COPY.styleAvoidLine(line)}
                onOpen={() => setTarget({ kind: 'avoid', text: line })}
              />
            </li>
          ))}
        </ul>
      )}
      <div className='flex flex-wrap gap-2'>
        <RevealChip
          icon={<Plus className='size-4' aria-hidden='true' />}
          onClick={() => setTarget({ kind: 'add' })}
        >
          {HELM_COPY.styleAdd}
        </RevealChip>
      </div>
      <NoteSheet
        key={target ? JSON.stringify(target) : 'none'}
        target={target}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

interface NoteRowProps {
  text: string;
  detail?: string;
  onOpen: () => void;
}

function NoteRow({ text, detail, onOpen }: NoteRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-start gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={onOpen}
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-3 text-[15px] leading-[21px] text-pretty break-words'>
          {text}
        </span>
        {detail && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {detail}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground mt-1 size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default StyleNotes;
