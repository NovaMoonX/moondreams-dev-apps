import { Trash2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import NoteTextField from '@/components/NoteTextField';
import NoteKindPills from '@apps/pinch/components/notes/NoteKindPills';
import NoteReasonField from '@apps/pinch/components/notes/NoteReasonField';
import NoteStepPicker from '@apps/pinch/components/notes/NoteStepPicker';
import {
  MAX_RECIPE_NOTE_LENGTH,
  NOTE_KIND_LABELS,
  NOTE_TEXT_COPY,
} from '@apps/pinch/constants';
import type { CookCapture } from '@apps/pinch/hooks/useCookCapture';

interface CookCaptureViewProps {
  capture: CookCapture;
  /** The steps of the recipe the entry is for. */
  steps: string[];
  /** The recipe's name over the view when the screen cooks several. */
  caption: string | null;
  backLabel: string;
  onBack: () => void;
  onDelete: () => void;
}

/** Writing a tip, a note or a change for a step, in place of the step: the kind, the words, why (for a change) and which step it belongs to. It saves as it is written, and the review on the last panel lists what was added. */
function CookCaptureView({
  capture,
  steps,
  caption,
  backLabel,
  onBack,
  onDelete,
}: CookCaptureViewProps) {
  const { draft } = capture;
  if (draft === null) return null;

  const isEditing = draft.noteId !== null;
  const copy = NOTE_TEXT_COPY[draft.kind];

  return (
    <div className='mx-auto w-full max-w-md space-y-4'>
      <div className='space-y-1'>
        <BackLink label={backLabel} onBack={onBack} />
        {caption && (
          <p className='text-muted-foreground text-xs wrap-break-word'>
            {caption}
          </p>
        )}
      </div>
      {isEditing ? (
        <p className='text-muted-foreground text-xs'>
          Changing your {NOTE_KIND_LABELS[draft.kind].toLowerCase()}
        </p>
      ) : (
        <NoteKindPills value={draft.kind} onChange={capture.setKind} />
      )}
      <NoteTextField
        label={copy.label}
        placeholder={copy.placeholder}
        maxLength={MAX_RECIPE_NOTE_LENGTH}
        value={draft.text}
        onChange={capture.setText}
        rows={4}
        shouldFocus
      />
      {draft.kind === 'CHANGE' && (
        <NoteReasonField
          value={draft.reason}
          onChange={capture.setReason}
          rows={2}
        />
      )}
      {steps.length > 0 && (
        <NoteStepPicker
          steps={steps}
          value={draft.stepIndex}
          onChange={capture.setStepIndex}
        />
      )}
      {capture.error && (
        <p className='text-destructive text-sm' role='alert'>
          {capture.error}
        </p>
      )}
      {isEditing && (
        <ActionRow
          isDestructive
          icon={<Trash2 className='h-4 w-4' />}
          label={`Delete this ${NOTE_KIND_LABELS[draft.kind].toLowerCase()}`}
          isDisabled={capture.isSaving}
          onClick={onDelete}
        />
      )}
    </div>
  );
}

export default CookCaptureView;
