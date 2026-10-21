import { useEffect, useRef, useState, type ClipboardEvent } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import Field, { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import RevealChip from '@/components/RevealChip';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { toWebLink } from '@/utils/urlUtils';
import {
  MAX_LINK_LABEL_LENGTH,
  MAX_LINK_URL_LENGTH,
  MAX_RECIPE_LINKS,
  RECIPE_LINK_KIND_OPTIONS,
  RECIPE_LINK_LABELS,
} from '@apps/pinch/constants';
import {
  canAddLink,
  countLinkSlots,
  getBlankLinkDraft,
  getLinksSummary,
  getLinkHost,
  getLinkUrlProblem,
  hasLinksProblem,
  isOverLinkCap,
  type LinkDraft,
  type LinksText,
} from '@apps/pinch/utils/recipeLinks';

const KIND_PILLS = RECIPE_LINK_KIND_OPTIONS.map((option) => ({
  value: option.value as string,
  label: option.label,
}));

const pasteAsOneLink = (
  event: ClipboardEvent<HTMLInputElement>,
  set: (url: string) => void,
) => {
  const pasted = event.clipboardData.getData('text');
  if (!/\s/.test(pasted.trim())) return;
  event.preventDefault();
  set(toWebLink(pasted) ?? pasted.trim().replace(/\s+/g, ' '));
};

interface AddressFieldProps {
  label: string;
  /** The caption is already on screen (a section heading): the field keeps the label for screen readers only. */
  isLabelHidden?: boolean;
  value: string;
  placeholder: string;
  shouldFocus?: boolean;
  onChange: (url: string) => void;
}

function AddressField({
  label,
  isLabelHidden = false,
  value,
  placeholder,
  shouldFocus = false,
  onChange,
}: AddressFieldProps) {
  const problem = getLinkUrlProblem(value);
  const input = (
    <Input
      variant='outline'
      inputMode='url'
      aria-label={isLabelHidden ? label : undefined}
      autoFocus={shouldFocus}
      className={COMPACT_INPUT_CLASS}
      placeholder={placeholder}
      maxLength={MAX_LINK_URL_LENGTH}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onPaste={(event) => pasteAsOneLink(event, onChange)}
    />
  );

  return (
    <div className='space-y-1'>
      {isLabelHidden ? (
        input
      ) : (
        <Field label={label} isCompact>
          {() => input}
        </Field>
      )}
      {problem && (
        <p className='text-destructive text-xs' role='alert'>
          {problem}
        </p>
      )}
    </div>
  );
}

const getDraftLabel = (draft: LinkDraft) =>
  draft.isCustom && draft.label.trim() !== ''
    ? draft.label.trim()
    : RECIPE_LINK_LABELS[draft.kind];

const getRowDetail = (draft: LinkDraft) => {
  if (draft.url.trim() === '') return { text: 'Add the address', isBad: false };
  if (getLinkUrlProblem(draft.url) !== null) {
    return { text: 'Not a web address', isBad: true };
  }
  return { text: getLinkHost(draft.url), isBad: false };
};

interface LinkRowProps {
  draft: LinkDraft;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (draft: LinkDraft) => void;
  onRemove: () => void;
}

function LinkRow({
  draft,
  isOpen,
  onToggle,
  onChange,
  onRemove,
}: LinkRowProps) {
  const label = getDraftLabel(draft);
  const detail = getRowDetail(draft);
  const choice = draft.isCustom
    ? NEW_CHOICE
    : draft.kind === 'OTHER'
      ? ''
      : draft.kind;

  const setLabel = (picked: string, typed: string) => {
    if (picked === NEW_CHOICE) {
      onChange({ ...draft, isCustom: true, label: typed });
      return;
    }
    const kind = KIND_PILLS.find((pill) => pill.value === picked);
    onChange({
      ...draft,
      isCustom: false,
      label: '',
      kind: kind ? (kind.value as LinkDraft['kind']) : 'OTHER',
    });
  };

  return (
    <li>
      <div className='flex items-start gap-1'>
        <Button
          type='button'
          variant='tertiary'
          aria-expanded={isOpen}
          aria-label={`${label}, ${detail.text}`}
          onClick={onToggle}
          className='h-auto min-h-12 min-w-0 flex-1 items-start justify-start gap-2 px-0! py-3 text-left font-normal'
        >
          <span className='min-w-0 flex-1 truncate'>
            <span className='font-medium'>{label}</span>
            <span
              className={join(
                detail.isBad ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {` · ${detail.text}`}
            </span>
          </span>
          <ChevronRight
            className={join(
              'text-muted-foreground mt-0.5 h-5 w-5 shrink-0',
              isOpen && 'rotate-90',
            )}
            aria-hidden='true'
          />
        </Button>
      </div>
      {isOpen && (
        <div className='space-y-3 pb-4'>
          <AddressField
            label='Address'
            value={draft.url}
            placeholder='Paste the link'
            shouldFocus={draft.url === ''}
            onChange={(url) => onChange({ ...draft, url })}
          />
          <PickOrCreate
            label='Label'
            options={KIND_PILLS}
            showAll
            choice={choice}
            newText={draft.label}
            newPillLabel='Your own label'
            newPlaceholder="Mom's blog"
            maxLength={MAX_LINK_LABEL_LENGTH}
            isFocusedOnOpen={false}
            clearLabel='Use plain “Link”'
            onChange={setLabel}
          />
          <ActionChips
            label='This link'
            actions={[
              {
                key: 'remove',
                icon: <Trash2 className='h-4 w-4' />,
                label: 'Remove',
                description: `Remove ${label}`,
                isDestructive: true,
                onClick: onRemove,
              },
            ]}
          />
        </div>
      )}
    </li>
  );
}

interface LinksEditorProps {
  value: LinksText;
  onChange: (value: LinksText) => void;
  onRemoved: (message: string, restore: () => void) => void;
}

function LinksEditor({ value, onChange, onRemoved }: LinksEditorProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  const { howTo, others } = value;

  const setOther = (draft: LinkDraft) =>
    onChange({
      ...value,
      others: others.map((other) => (other.id === draft.id ? draft : other)),
    });

  const addLink = () => {
    const draft = getBlankLinkDraft();
    onChange({ ...value, others: [...others, draft] });
    setOpenId(draft.id);
  };

  const removeLink = (draft: LinkDraft) => {
    const index = others.findIndex((other) => other.id === draft.id);
    onChange({
      ...value,
      others: others.filter((other) => other.id !== draft.id),
    });
    setOpenId((current) => (current === draft.id ? null : current));
    if (draft.url.trim() === '') return;
    onRemoved(`Removed ${getDraftLabel(draft)}`, () => {
      const { value: current, onChange: restore } = latest.current;
      restore({
        ...current,
        others: [
          ...current.others.slice(0, index),
          draft,
          ...current.others.slice(index),
        ],
      });
    });
  };

  const isFull = countLinkSlots(value) >= MAX_RECIPE_LINKS;

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          How-to video
        </h3>
        <AddressField
          label='How-to video'
          isLabelHidden
          value={howTo.url}
          placeholder='Paste a YouTube or other video link'
          onChange={(url) => onChange({ ...value, howTo: { ...howTo, url } })}
        />
        <p className='text-muted-foreground text-xs'>
          A YouTube or Vimeo link plays at the bottom of the recipe. Any other
          link opens its site.
        </p>
      </div>
      <div className='space-y-2'>
        <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          Other links
        </h3>
        {others.length > 0 && (
          <ul className='border-border divide-border divide-y rounded-2xl border px-3'>
            {others.map((draft) => (
              <LinkRow
                key={draft.id}
                draft={draft}
                isOpen={openId === draft.id}
                onToggle={() =>
                  setOpenId((current) =>
                    current === draft.id ? null : draft.id,
                  )
                }
                onChange={setOther}
                onRemove={() => removeLink(draft)}
              />
            ))}
          </ul>
        )}
        {canAddLink(value) && (
          <RevealChip
            icon={<Plus className='h-4 w-4' aria-hidden='true' />}
            onClick={addLink}
          >
            Add a link
          </RevealChip>
        )}
        {isFull && (
          <p className='text-muted-foreground text-xs'>
            A recipe holds up to {MAX_RECIPE_LINKS} links.
          </p>
        )}
      </div>
    </div>
  );
}

interface RecipeLinksFieldProps {
  value: LinksText;
  onChange: (value: LinksText) => void;
  position: SummaryGroupPosition;
}

function RecipeLinksField({
  value,
  onChange,
  position,
}: RecipeLinksFieldProps) {
  const { pending, showUndo, undo } = useUndoRemoval();
  const summary = getLinksSummary(value);
  const isOver = isOverLinkCap(value);

  return (
    <>
      <SummaryEditor
        label='Links'
        groupPosition={position}
        icon='🔗'
        title='Links'
        summary={summary}
        placeholder='Add a how-to video or a link'
        problem={
          hasLinksProblem(value)
            ? 'Check the link addresses'
            : isOver
              ? `Keep it to ${MAX_RECIPE_LINKS} links`
              : null
        }
        shouldFocus={summary === ''}
      >
        <LinksEditor value={value} onChange={onChange} onRemoved={showUndo} />
      </SummaryEditor>
      <UndoSnackbar pending={pending} onUndo={undo} isOverSheet />
    </>
  );
}

export default RecipeLinksField;
