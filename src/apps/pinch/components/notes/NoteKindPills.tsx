import { PillGroup } from '@/components/PillGroup';
import {
  NOTE_KIND_EMOJIS,
  NOTE_KIND_HINTS,
  NOTE_KIND_LABELS,
  WRITTEN_NOTE_KINDS,
} from '@apps/pinch/constants';

export type WrittenNoteKind = (typeof WRITTEN_NOTE_KINDS)[number];

const OPTIONS = WRITTEN_NOTE_KINDS.map((kind) => ({
  value: kind,
  label: NOTE_KIND_LABELS[kind],
  emoji: NOTE_KIND_EMOJIS[kind],
}));

interface NoteKindPillsProps {
  value: WrittenNoteKind;
  onChange: (kind: WrittenNoteKind) => void;
}

/** What an entry is, as three answers with one line under them saying what the chosen kind is for. */
function NoteKindPills({ value, onChange }: NoteKindPillsProps) {
  return (
    <div className='space-y-1.5'>
      <PillGroup
        label='What you are adding'
        options={OPTIONS}
        value={value}
        onChange={onChange}
      />
      <p className='text-muted-foreground text-xs'>{NOTE_KIND_HINTS[value]}</p>
    </div>
  );
}

export default NoteKindPills;
