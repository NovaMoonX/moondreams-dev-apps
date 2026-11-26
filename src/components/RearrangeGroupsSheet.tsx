import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import ReorderList from '@/components/ReorderList';

export interface RearrangeGroup {
  id: string;
  label: string;
  detail: string;
}

interface RearrangeGroupsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  groups: RearrangeGroup[];
  /** Called with the group's index among `groups` once it has left its old spot. */
  onMove: (groupId: string, toIndex: number) => void;
  note?: string;
  handleLabel?: string;
}

/** Whole groups of a list rearranged in their own sheet, one row per group with a grip, so the list itself keeps grips on its items only. */
function RearrangeGroupsSheet({
  isOpen,
  onClose,
  title,
  groups,
  onMove,
  note,
  handleLabel = 'Move',
}: RearrangeGroupsSheetProps) {
  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className='px-4 pb-4'>
          <Button type='button' className='w-full' onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>
          {note
            ? `Drag to change the order. ${note}`
            : 'Drag to change the order.'}
        </p>
        <ReorderList
          groups={[
            { id: 'groups', label: null, items: groups, isOrdered: true },
          ]}
          handleSide='end'
          handleLabel={handleLabel}
          getItemLabel={(group) => group.label}
          renderRow={(group) => (
            <span className='block min-w-0'>
              <span className='block text-sm font-medium wrap-break-word'>
                {group.label}
              </span>
              <span className='text-muted-foreground block text-xs'>
                {group.detail}
              </span>
            </span>
          )}
          onMove={({ itemId, toIndex }) => onMove(itemId, toIndex)}
        />
      </div>
    </DetailSheet>
  );
}

export default RearrangeGroupsSheet;
