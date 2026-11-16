import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, ListOrdered } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import { useImportanceToday } from '@apps/helm/hooks/useImportancePlace';
import { useAppSelector } from '@/store';
import {
  selectImportanceGroups,
  selectImportanceItems,
} from '@apps/helm/store/selectors/importanceSelectors';
import { readListedApartIds } from '@apps/helm/utils/importanceWords';

/** The thin door under Projects' title: what comes first, in a few words, and a way into the whole order. Absent until two things could be placed. */
function ImportanceDoor({ onOpen }: { onOpen: () => void }) {
  const today = useImportanceToday();
  const groups = useAppSelector((state) =>
    selectImportanceGroups(state, today),
  );
  const items = useAppSelector(selectImportanceItems);
  const apart = readListedApartIds(items);
  const listed = (rows: typeof groups.inOrder) =>
    rows.filter((row) => !apart.has(row.id));
  const inOrder = listed(groups.inOrder);
  const count =
    inOrder.length +
    listed(groups.notSaid).length +
    listed(groups.canWait).length;
  if (count < 2) return null;
  const first = inOrder.filter((row) => row.position === 1);
  return (
    <Button
      type='button'
      variant='tertiary'
      className='helm-card flex h-auto min-h-10 w-full min-w-0 items-center gap-3 px-4 py-2 text-left font-normal'
      onClick={onOpen}
    >
      <ListOrdered
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1 break-words'>
        <span className='text-foreground text-[15px] leading-[21px]'>
          {HELM_COPY.importanceTitle}
        </span>
        <span className='text-muted-foreground text-[13px]'>
          {` \u00b7 ${
            first.length === 0
              ? HELM_COPY.importanceDoorNone
              : HELM_COPY.importanceDoorFirst(first.map((row) => row.name))
          }`}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default ImportanceDoor;
