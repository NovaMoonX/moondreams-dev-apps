import CopyPanel from '@/components/CopyPanel';
import DetailSheet from '@/components/DetailSheet';

interface CopySheetProps {
  title: string;
  text: string;
  note: string;
  onClose: () => void;
}

/** A sheet holding one `CopyPanel`, for a copy that starts from a screen with no drawer of its own. */
function CopySheet({ title, text, note, onClose }: CopySheetProps) {
  return (
    <DetailSheet isOpen onClose={onClose} title={title}>
      <CopyPanel text={text} note={note} />
    </DetailSheet>
  );
}

export default CopySheet;
